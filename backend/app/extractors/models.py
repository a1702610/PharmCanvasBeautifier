from typing import Literal

from pydantic import BaseModel, Field

SourceKind = Literal["docx", "pptx", "pdf", "canvas"]


class SourceStatus(BaseModel):
    name: str
    kind: SourceKind | None = None
    ok: bool
    error: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ImageInfo(BaseModel):
    ref: str
    source: str
    location: str = ""
    mime: str | None = None
    data_b64: str | None = None
    thumb_b64: str | None = None
    canvas_tag: str | None = None


class EmbedInfo(BaseModel):
    ref: str
    html: str


class ExtractResult(BaseModel):
    sources: list[SourceStatus]
    text: str
    images: list[ImageInfo]
    embeds: list[EmbedInfo]
    approx_tokens: int
    token_limit: int
