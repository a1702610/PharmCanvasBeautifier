import asyncio
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.config import settings

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
ATTEMPTS = 2
# Seconds to wait before each retry when Gemini reports it is overloaded (503).
# These retries don't count towards ATTEMPTS.
BUSY_DELAYS = (3, 8, 15)

KEY_MESSAGE = "Your Gemini key was rejected. Check it under Insert API Key."
RATE_MESSAGE = "Gemini's free limit was reached. Wait a minute and try again."
BUSY_MESSAGE = "Gemini is very busy right now (high demand on Google's side). Please try again in a minute or two."
FAILED_MESSAGE = "Generation failed, please try again."


class GeminiError(Exception):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class ImagePart:
    label: str
    data: bytes
    mime: str = "image/jpeg"


def _build_client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


def _classify(exc: Exception) -> str | None:
    code = getattr(exc, "code", None)
    message = str(exc).lower()
    if code in (401, 403) or "api key not valid" in message or "api_key_invalid" in message:
        return "key"
    if code == 429 or "resource_exhausted" in message or "quota" in message:
        return "rate"
    if code in (503, 504) or "unavailable" in message or "overloaded" in message:
        return "busy"
    return None


def build_contents(prompt: str, images: list[ImagePart]) -> list[types.Content]:
    parts = [types.Part.from_text(text=prompt)]
    for image in images:
        parts.append(types.Part.from_text(text=image.label))
        parts.append(types.Part.from_bytes(data=image.data, mime_type=image.mime))
    return [types.Content(role="user", parts=parts)]


async def generate_structured(
    *,
    api_key: str,
    system_prompt: str,
    prompt: str,
    images: list[ImagePart],
    schema: type[T],
    client_factory: Callable[[str], object] = _build_client,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> T:
    client = client_factory(api_key)
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=1.0,
        max_output_tokens=65536,
        thinking_config=types.ThinkingConfig(thinking_level="low"),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    contents = build_contents(prompt, images)
    last_error: Exception | None = None
    attempt = 0
    busy_retries = 0
    while attempt < ATTEMPTS:
        try:
            response = await client.aio.models.generate_content(
                model=settings.GEMINI_MODEL, contents=contents, config=config,
            )
        except Exception as exc:
            kind = _classify(exc)
            if kind == "key":
                raise GeminiError(KEY_MESSAGE, 401) from exc
            if kind == "rate":
                raise GeminiError(RATE_MESSAGE, 429) from exc
            last_error = exc
            logger.warning(
                "Gemini call failed: %s: %s", type(exc).__name__, str(exc)[:300],
            )
            if kind == "busy":
                if busy_retries == len(BUSY_DELAYS):
                    raise GeminiError(BUSY_MESSAGE, 503) from exc
                await sleep(BUSY_DELAYS[busy_retries])
                busy_retries += 1
                continue
            attempt += 1
            continue
        try:
            return schema.model_validate_json(response.text or "")
        except (ValidationError, ValueError) as exc:
            last_error = exc
            attempt += 1
            logger.warning("Gemini returned invalid JSON (attempt %d)", attempt)
    raise GeminiError(FAILED_MESSAGE, 502) from last_error
