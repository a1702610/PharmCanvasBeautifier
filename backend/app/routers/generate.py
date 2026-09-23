import base64
import binascii

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.ai import gemini
from app.ai.prompts import build_generate_prompt, build_regenerate_prompt, load_prompt
from app.ai.schema import Note, Page, Tab, WirePage, WireTab
from app.ai.validate import SourceContext, finalize_page, finalize_tab
from app.config import settings

router = APIRouter()


class ImageForAI(BaseModel):
    ref: str
    location: str = ""
    thumb_b64: str


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1)
    images: list[ImageForAI] = Field(default_factory=list)
    instructions: str = ""
    include_revision: bool = False
    title: str = ""


class Outline(BaseModel):
    intro: list[str] = Field(default_factory=list)
    tab_titles: list[str] = Field(default_factory=list)


class RegenerateTabRequest(BaseModel):
    text: str = Field(min_length=1)
    images: list[ImageForAI] = Field(default_factory=list)
    outline: Outline
    tab: Tab
    instruction: str = Field(min_length=1)


class GenerateResponse(BaseModel):
    page: Page


class RegenerateTabResponse(BaseModel):
    tab: Tab
    notes: list[Note]


def _require_key(key: str | None) -> str:
    if not key or not key.strip():
        raise HTTPException(401, "Add your Gemini API key first (Insert API Key button).")
    return key.strip()


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
            prompt=build_generate_prompt(req.title, req.include_revision, req.instructions, req.text),
            images=_image_parts(req.images),
            schema=WirePage,
        )
    except gemini.GeminiError as exc:
        raise HTTPException(exc.status_code, exc.message)
    page = finalize_page(wire, SourceContext.from_text(req.text), include_revision=req.include_revision)
    if req.title.strip():
        page.title = req.title.strip()
    return GenerateResponse(page=page)


@router.post("/regenerate-tab", response_model=RegenerateTabResponse, response_model_exclude_none=True)
async def regenerate_tab(req: RegenerateTabRequest, x_gemini_key: str | None = Header(default=None)):
    key = _require_key(x_gemini_key)
    others = [t for t in req.outline.tab_titles if t != req.tab.title]
    prompt = build_regenerate_prompt(
        tab_json=req.tab.model_dump_json(exclude_none=True, exclude={"id"}),
        other_titles=others,
        intro=req.outline.intro,
        instruction=req.instruction,
        text=req.text,
    )
    try:
        wire = await gemini.generate_structured(
            api_key=key,
            system_prompt=load_prompt("system") + "\n\n" + load_prompt("regenerate_tab"),
            prompt=prompt,
            images=_image_parts(req.images),
            schema=WireTab,
        )
    except gemini.GeminiError as exc:
        raise HTTPException(exc.status_code, exc.message)
    try:
        tab, notes = finalize_tab(wire, SourceContext.from_text(req.text), req.tab.id)
    except ValueError:
        raise HTTPException(502, "The AI returned an empty tab. Please try again.")
    return RegenerateTabResponse(tab=tab, notes=notes)
