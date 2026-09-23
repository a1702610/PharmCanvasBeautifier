import logging
from dataclasses import dataclass
from typing import Callable, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.config import settings

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
ATTEMPTS = 2

KEY_MESSAGE = "Your Gemini key was rejected. Check it under Insert API Key."
RATE_MESSAGE = "Gemini's free limit was reached. Wait a minute and try again."
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
) -> T:
    client = client_factory(api_key)
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=0.4,
        max_output_tokens=65536,
        thinking_config=types.ThinkingConfig(thinking_level="low"),
    )
    contents = build_contents(prompt, images)
    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
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
                "Gemini call failed (attempt %d): %s: %s",
                attempt, type(exc).__name__, str(exc)[:300],
            )
            continue
        try:
            return schema.model_validate_json(response.text or "")
        except (ValidationError, ValueError) as exc:
            last_error = exc
            logger.warning("Gemini returned invalid JSON (attempt %d)", attempt)
    raise GeminiError(FAILED_MESSAGE, 502) from last_error
