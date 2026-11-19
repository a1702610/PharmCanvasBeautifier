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

InnerBlockType = Literal[
    "heading", "paragraph", "list", "table", "contrast_table", "clinical",
    "caution", "evidence", "citation", "link", "figure",
    "takeaways", "self_check", "counselling", "tip", "critical",
    "key_point", "flow", "formula",
]
BlockType = Literal[
    "heading", "paragraph", "list", "table", "contrast_table", "clinical",
    "caution", "evidence", "citation", "link", "figure",
    "takeaways", "self_check", "counselling", "tip", "critical",
    "key_point", "flow", "formula", "accordion",
]
ChildType = Literal["paragraph", "list", "figure", "citation", "references"]
FlowStyle = Literal["solid", "outline", "amber"]
TableVariant = Literal["primary", "secondary"]


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


class WireFlowStep(BaseModel):
    label: str | None = None
    sub: str | None = None
    style: FlowStyle | None = None


class WireFlow(BaseModel):
    steps: list[WireFlowStep] | None = None


class WireBlockBase(BaseModel):
    text: str | None = None
    ordered: bool | None = None
    items: list[str] | None = None
    headers: list[str] | None = None
    col_widths: list[float] | None = None
    rows: list[list[str]] | None = None
    variant: TableVariant | None = None
    row_headers: bool | None = None
    left_header: str | None = None
    right_header: str | None = None
    body: str | None = None
    title: str | None = None
    lead: str | None = None
    children: list[WireChild] | None = None
    lead_in: str | None = None
    url: str | None = None
    link_text: str | None = None
    ref: str | None = None
    alt: str | None = None
    caption: str | None = None
    questions: list[WireQuestion] | None = None
    steps: list[WireFlowStep] | None = None
    expression: str | None = None
    note: str | None = None


class WireInnerBlock(WireBlockBase):
    type: InnerBlockType


class WirePanel(BaseModel):
    title: str | None = None
    blocks: list[WireInnerBlock] = Field(default_factory=list)


class WireBlock(WireBlockBase):
    type: BlockType
    panels: list[WirePanel] | None = None


class WireTab(BaseModel):
    title: str
    blocks: list[WireBlock]


class WireRevision(BaseModel):
    include: bool = False
    embed_ref: str | None = None
    points: list[str] | None = None
    flow_title: str | None = None
    flow: WireFlow | None = None


class WireActivity(BaseModel):
    task: str | None = None
    purpose: str | None = None


class WireFigureRef(BaseModel):
    ref: str | None = None
    alt: str | None = None
    caption: str | None = None


class WirePage(BaseModel):
    title: str
    intro: list[str]
    intro_figure: WireFigureRef | None = None
    tabs: list[WireTab]
    revision: WireRevision = Field(default_factory=WireRevision)
    study_activities: list[WireActivity] | None = None
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
    variant: Literal["primary", "secondary"] | None = None
    row_headers: bool | None = None


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


class KeyPoint(BaseModel):
    type: Literal["key_point"] = "key_point"
    lead: str | None = None
    text: str


class FlowStep(BaseModel):
    label: str
    sub: str | None = None
    style: Literal["solid", "outline", "amber"] = "outline"


class Flow(BaseModel):
    type: Literal["flow"] = "flow"
    steps: list[FlowStep]


class Formula(BaseModel):
    type: Literal["formula"] = "formula"
    expression: str
    note: str | None = None


EvidenceChild = Annotated[
    Union[Paragraph, ListBlock, Figure, Citation, References],
    Field(discriminator="type"),
]


class Evidence(BaseModel):
    type: Literal["evidence"] = "evidence"
    title: str
    children: list[EvidenceChild]


InnerBlock = Annotated[
    Union[Heading, Paragraph, ListBlock, Table, ContrastTable, Clinical,
          Caution, Evidence, Citation, Link, Figure,
          Takeaways, SelfCheck, Counselling, Tip, Critical,
          KeyPoint, Flow, Formula],
    Field(discriminator="type"),
]


class Panel(BaseModel):
    title: str
    blocks: list[InnerBlock]


class Accordion(BaseModel):
    type: Literal["accordion"] = "accordion"
    panels: list[Panel]


Block = Annotated[
    Union[Heading, Paragraph, ListBlock, Table, ContrastTable, Clinical,
          Caution, Evidence, Citation, Link, Figure,
          Takeaways, SelfCheck, Counselling, Tip, Critical,
          KeyPoint, Flow, Formula, Accordion],
    Field(discriminator="type"),
]


class Tab(BaseModel):
    id: str
    title: str
    blocks: list[Block]


class Revision(BaseModel):
    include: bool = False
    embed_ref: str | None = None
    points: list[str] | None = None
    flow_title: str | None = None
    flow: Flow | None = None


class StudyActivity(BaseModel):
    task: str
    purpose: str


class Page(BaseModel):
    title: str
    intro: list[str]
    intro_figure: Figure | None = None
    tabs: list[Tab]
    revision: Revision
    study_activities: list[StudyActivity] | None = None
    notes: list[Note]
