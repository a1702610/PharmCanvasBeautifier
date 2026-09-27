"""Page JSON models.

Wire* models describe what Gemini returns: flat blocks where every field is
optional, which keeps the response schema simple for Gemini. The typed models
describe the validated page the API returns to the browser.
"""
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

NoteKind = Literal["image", "flag", "citation", "unplaced"]


class Note(BaseModel):
    kind: NoteKind
    text: str


# ── Wire format (Gemini response schema) ─────────────────────────────────────

BlockType = Literal[
    "heading", "paragraph", "list", "table", "contrast_table", "clinical",
    "caution", "evidence", "citation", "link", "figure",
    "takeaways", "self_check", "counselling", "tip", "critical",
]
ChildType = Literal["paragraph", "list", "figure", "citation", "references"]


class WireChild(BaseModel):
    type: ChildType
    text: str | None = None
    items: list[str] | None = None
    ref: str | None = None
    alt: str | None = None
    caption: str | None = None


class WireQuestion(BaseModel):
    question: str | None = None
    answer: str | None = None


class WireBlock(BaseModel):
    type: BlockType
    text: str | None = None
    ordered: bool | None = None
    items: list[str] | None = None
    headers: list[str] | None = None
    col_widths: list[float] | None = None
    rows: list[list[str]] | None = None
    left_header: str | None = None
    right_header: str | None = None
    body: str | None = None
    title: str | None = None
    children: list[WireChild] | None = None
    lead_in: str | None = None
    url: str | None = None
    link_text: str | None = None
    ref: str | None = None
    alt: str | None = None
    caption: str | None = None
    questions: list[WireQuestion] | None = None


class WireTab(BaseModel):
    title: str
    blocks: list[WireBlock]


class WireRevision(BaseModel):
    include: bool = False
    embed_ref: str | None = None


class WirePage(BaseModel):
    title: str
    intro: list[str]
    tabs: list[WireTab]
    revision: WireRevision = Field(default_factory=WireRevision)
    notes: list[Note] = Field(default_factory=list)


# ── Typed page (API output) ──────────────────────────────────────────────────

class Heading(BaseModel):
    type: Literal["heading"] = "heading"
    text: str


class Paragraph(BaseModel):
    type: Literal["paragraph"] = "paragraph"
    text: str


class ListBlock(BaseModel):
    type: Literal["list"] = "list"
    ordered: bool = False
    items: list[str]


class Table(BaseModel):
    type: Literal["table"] = "table"
    headers: list[str]
    col_widths: list[float] | None = None
    rows: list[list[str]]


class ContrastTable(BaseModel):
    type: Literal["contrast_table"] = "contrast_table"
    left_header: str
    right_header: str
    rows: list[list[str]]


class Clinical(BaseModel):
    type: Literal["clinical"] = "clinical"
    body: str


class Caution(BaseModel):
    type: Literal["caution"] = "caution"
    title: str
    body: str | None = None
    items: list[str] | None = None


class Citation(BaseModel):
    type: Literal["citation"] = "citation"
    text: str


class Link(BaseModel):
    type: Literal["link"] = "link"
    lead_in: str = ""
    url: str
    link_text: str


class Figure(BaseModel):
    type: Literal["figure"] = "figure"
    ref: str
    alt: str
    caption: str | None = None


class References(BaseModel):
    type: Literal["references"] = "references"
    items: list[str]


class Takeaways(BaseModel):
    type: Literal["takeaways"] = "takeaways"
    items: list[str]


class Question(BaseModel):
    question: str
    answer: str


class SelfCheck(BaseModel):
    type: Literal["self_check"] = "self_check"
    questions: list[Question]


class Counselling(BaseModel):
    type: Literal["counselling"] = "counselling"
    title: str | None = None
    items: list[str]


class Tip(BaseModel):
    type: Literal["tip"] = "tip"
    body: str


class Critical(BaseModel):
    type: Literal["critical"] = "critical"
    title: str | None = None
    body: str | None = None
    items: list[str] | None = None


EvidenceChild = Annotated[
    Union[Paragraph, ListBlock, Figure, Citation, References],
    Field(discriminator="type"),
]


class Evidence(BaseModel):
    type: Literal["evidence"] = "evidence"
    title: str
    children: list[EvidenceChild]


Block = Annotated[
    Union[Heading, Paragraph, ListBlock, Table, ContrastTable, Clinical,
          Caution, Evidence, Citation, Link, Figure,
          Takeaways, SelfCheck, Counselling, Tip, Critical],
    Field(discriminator="type"),
]


class Tab(BaseModel):
    id: str
    title: str
    blocks: list[Block]


class Revision(BaseModel):
    include: bool = False
    embed_ref: str | None = None


class Page(BaseModel):
    title: str
    intro: list[str]
    tabs: list[Tab]
    revision: Revision
    notes: list[Note]
