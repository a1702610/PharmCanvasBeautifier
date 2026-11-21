import base64
import binascii

from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.ai import gemini
from app.ai.prompts import build_generate_prompt, load_prompt
from app.ai.schema import Page, WirePage
from app.ai.validate import SourceContext, finalize_page
from app.config import settings

router = APIRouter()


class ImageForAI(BaseModel):
    ref: str
    location: str = ""
    thumb_b64: str


class PageForAI(BaseModel):
    source_index: int
    source: str = ""
    location: str = ""
    data_b64: str


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1)
    images: list[ImageForAI] = Field(default_factory=list)
    pages: list[PageForAI] = Field(default_factory=list, max_length=settings.MAX_PAGES_TO_AI)
    instructions: str = ""
    include_revision: bool = False
    title: str = ""
    course_context: str = ""
    # "flash" (default, works with a free key) or "pro" (more thorough; needs billing).
    model: Literal["flash", "pro"] = "flash"

    @field_validator("course_context")
    @classmethod
    def _cap_course_context(cls, v: str) -> str:
        return v.strip()[:12000]


class GenerateResponse(BaseModel):
    page: Page



PRO_KEY_MESSAGE = (
    "Gemini Pro needs a key with billing turned on (Google has no free tier for Pro). "
    "Turn on billing in Google AI Studio, or choose Flash and try again."
)


def _require_key(key: str | None) -> str:
    if not key or not key.strip():
        raise HTTPException(401, "Add your Gemini API key first (Insert API Key button).")
    return key.strip()


def _decode(data_b64: str, what: str) -> bytes:
    try:
        return base64.b64decode(data_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, f"{what} is not valid base64.")


def _page_parts(pages: list[PageForAI]) -> list[gemini.ImagePart]:
    """Whole pages/slides, labelled so the AI can match them to the --- Page n --- markers."""
    return [
        gemini.ImagePart(label=f"Full image of SOURCE {p.source_index} ({p.source}), {p.location}:", data=_decode(p.data_b64, f"Page image {p.location}"))
        for p in pages
    ]


def _image_parts(images: list[ImageForAI]) -> list[gemini.ImagePart]:
    parts = []
    for image in images[: settings.MAX_IMAGES_TO_AI]:
        try:
            data = base64.b64decode(image.thumb_b64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(400, f"Image {image.ref} is not valid base64.")
        label = f"Image {image.ref}" + (f" ({image.location})" if image.location else "") + ":"
        parts.append(gemini.ImagePart(label=label, data=data))
    return parts


@router.post("/generate", response_model=GenerateResponse, response_model_exclude_none=True)
async def generate(req: GenerateRequest, x_gemini_key: str | None = Header(default=None)):
    key = _require_key(x_gemini_key)
    try:
        wire = await gemini.generate_structured(
            api_key=key,
            system_prompt=load_prompt("system"),
            prompt=build_generate_prompt(req.title, req.include_revision, req.instructions, req.text, course_context=req.course_context),
            images=_page_parts(req.pages) + _image_parts(req.images),
            schema=WirePage,
            model=settings.GEMINI_PRO_MODEL if req.model == "pro" else settings.GEMINI_MODEL,
        )
    except gemini.GeminiError as exc:
        # A free key asking for Pro comes back as a quota (429) error.
        if req.model == "pro" and exc.status_code == 429:
            raise HTTPException(429, PRO_KEY_MESSAGE)
        raise HTTPException(exc.status_code, exc.message)
    page = finalize_page(wire, SourceContext.from_text(req.text), include_revision=req.include_revision)
    if not page.tabs:
        raise HTTPException(502, "The AI returned an empty page. Please try again.")
    if req.title.strip():
        page.title = req.title.strip()
    return GenerateResponse(page=page)

