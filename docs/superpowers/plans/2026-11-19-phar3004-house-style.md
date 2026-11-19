# PHAR3004 House Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PharmCanvas's Canvas-page house style with the PHAR3004 template (palette, intro panel, button tabs, accordions, flow/formula/key-point components, app-built Study materials tab, Revision check, editable spacing) and add saved course profiles that give the AI course context.

**Architecture:** The AI still returns typed page JSON (never HTML); the backend gains new block types (accordion with one level of nested blocks, flow, formula, key_point), page fields (intro_figure, study_activities, revision points/flow) and a `course_context` input. The frontend renderer is rewritten to the new templates and inserts spacer paragraphs itself; the Study materials tab is built from user-entered links stored on the page. Course profiles live in IndexedDB.

**Tech Stack:** FastAPI + Pydantic + google-genai (backend, pytest); React 19 + TypeScript + Vite + Tailwind 4 + idb + DOMPurify (frontend, Vitest with jsdom where a DOM is needed).

**Spec:** `docs/superpowers/specs/2026-11-19-phar3004-house-style-design.md` — §4 (exact HTML) and §5 (spacing) are authoritative for every template string.

## Global Constraints

- Work on branch `main` in `A:\PharmCanvasBeautifier`; **commit locally only — never push** (the user decides when to push).
- End each commit message with the Co-Authored-By trailer your own system instructions specify.
- Backend tests: from `backend/` run `venv/Scripts/python -m pytest -q` (must stay green, pristine output). Frontend: from `frontend/` run `npm test` and `npm run build`.
- Palette (exact): deep purple `#140f50`; lavender fill/border `#f4f2fb`/`#ddd8ef`; violet `#836bff`; blue `#1448ff`, pale `#eff4ff`, border `#b8caff`, dark `#1039cc`; dark amber `#b45309`; amber `#d97706`; pale amber `#fff7ed`; body text `#1f2937`; table borders `#cbd5e1`; muted `#64748b`; red exception `#b91c1c`/`#fef2f2`/`#991b1b`. Never white text on `#d97706`.
- Spacer paragraph is exactly `<p>&nbsp;</p>`; inserted only by the renderer (spec §5).
- The AI never produces URLs for the Study materials tab; only user-entered `http(s)://` URLs are rendered as links.
- Takeaways are no longer generated but must still render (legacy pages).
- Australian English; sentence case UI copy.

## Review Focus

1. **Accordion nested inside an accordion in AI output** → the inner accordion is dropped, the rest of the panel kept, no 500 (test in Task 2).
2. **Preview with accordions inside tabs** → clicking a tab heading activates the right tab; clicking an accordion heading toggles only that panel; `is-active` never lands on an accordion group (test in Task 8).
3. **Study-materials links that aren't http(s)** (`javascript:alert(1)`, `www.example.com`, `" onclick=` in a label) → treated as missing (placeholder), labels escaped (test in Task 6).
4. **"~" meaning "approximately"** (`~30 mL/min and ~5 days`) → stays literal, not subscript (test in Task 4).
5. **Old saved pages** (no intro_figure/study/revision points, with `takeaways`, revision.include true with no points) → render without throwing and include the Study materials placeholders (test in Task 6); **IndexedDB upgrade v1→v2 keeps existing pages** (test in Task 9).

---

### Task 1: Backend schema — new blocks and page fields

**Files:**
- Modify: `backend/app/ai/schema.py`
- Test: `backend/tests/test_schema.py`

**Interfaces:**
- Produces (typed): `KeyPoint(lead: str|None, text: str)`, `FlowStep(label: str, sub: str|None, style: Literal["solid","outline","amber"]="outline")`, `Flow(steps: list[FlowStep])`, `Formula(expression: str, note: str|None)`, `Panel(title: str, blocks: list[InnerBlock])`, `Accordion(panels: list[Panel])`, `StudyActivity(task: str, purpose: str)`; `Table.variant: Literal["primary","secondary"]|None`, `Table.row_headers: bool|None`; `Revision.points: list[str]|None`, `Revision.flow_title: str|None`, `Revision.flow: Flow|None`; `Page.intro_figure: Figure|None`, `Page.study_activities: list[StudyActivity]|None`; unions `InnerBlock` (every block except accordion) and `Block` (InnerBlock members + Accordion).
- Produces (wire): `WireFlowStep`, `WireFlow(steps)`, `WireBlockBase`, `WireInnerBlock(WireBlockBase)` (type: `InnerBlockType`), `WirePanel(title, blocks: list[WireInnerBlock])`, `WireBlock(WireBlockBase)` (type: `BlockType`, `panels`), `WireActivity(task, purpose)`, `WireFigureRef(ref, alt, caption)`, `WireRevision.points/flow_title/flow`, `WirePage.intro_figure/study_activities`.

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_schema.py`:

```python
from app.ai.schema import (
    Accordion, Flow, Formula, KeyPoint, Page, WireBlock, WireInnerBlock, WirePage,
)


def test_wire_page_accepts_accordion_flow_formula_and_page_fields():
    wire = WirePage.model_validate({
        "title": "T", "intro": ["i"],
        "intro_figure": {"ref": "IMG-01", "alt": "Map"},
        "study_activities": [{"task": "Watch part 1", "purpose": "Framework"}],
        "revision": {"include": False, "points": ["A", "B"], "flow_title": "Direction",
                     "flow": {"steps": [{"label": "CL"}, {"label": "k", "style": "amber"}]}},
        "tabs": [{"title": "One", "blocks": [
            {"type": "key_point", "lead": "Distribution is reversible.", "text": "Drug moves back."},
            {"type": "flow", "steps": [{"label": "Dose", "style": "solid"}, {"label": "Effect", "sub": "PD"}]},
            {"type": "formula", "expression": "CL = Q × E", "note": "Q = blood flow"},
            {"type": "table", "headers": ["A", "B"], "rows": [["1", "2"]], "variant": "secondary", "row_headers": False},
            {"type": "accordion", "panels": [{"title": "Worked example", "blocks": [
                {"type": "paragraph", "text": "Step 1"},
            ]}]},
        ]}],
    })
    assert wire.tabs[0].blocks[4].panels[0].blocks[0].text == "Step 1"
    assert wire.revision.flow.steps[1].style == "amber"
    assert wire.intro_figure.ref == "IMG-01"


def test_inner_block_type_excludes_accordion():
    import pydantic, pytest
    with pytest.raises(pydantic.ValidationError):
        WireInnerBlock.model_validate({"type": "accordion"})
    WireBlock.model_validate({"type": "accordion", "panels": []})


def test_typed_page_round_trips_new_blocks():
    page = Page.model_validate({
        "title": "T", "intro": [], "notes": [],
        "revision": {"include": False, "points": ["p"], "flow": {"steps": [{"label": "a"}, {"label": "b"}]}},
        "tabs": [{"id": "t1", "title": "x", "blocks": [
            {"type": "key_point", "text": "t"},
            {"type": "flow", "steps": [{"label": "a", "style": "solid"}, {"label": "b"}]},
            {"type": "formula", "expression": "e"},
            {"type": "accordion", "panels": [{"title": "p", "blocks": [{"type": "formula", "expression": "f"}]}]},
        ]}],
    })
    b = page.tabs[0].blocks
    assert isinstance(b[0], KeyPoint) and isinstance(b[1], Flow) and isinstance(b[2], Formula) and isinstance(b[3], Accordion)
    assert isinstance(b[3].panels[0].blocks[0], Formula)
    assert b[1].steps[1].style == "outline"
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python -m pytest -q tests/test_schema.py`
Expected: FAIL (ImportError for KeyPoint/Accordion/WireInnerBlock).

- [ ] **Step 3: Implement** — in `backend/app/ai/schema.py`:

Replace the wire section from `BlockType = Literal[` through the end of `WirePage` with:

```python
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
```

In the typed section: change `Table` to add `variant: Literal["primary", "secondary"] | None = None` and `row_headers: bool | None = None`; add after `Critical`:

```python
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
```

Replace the `Block` union and `Revision`/`Page` with:

```python
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
```

- [ ] **Step 4: Run tests** — `venv/Scripts/python -m pytest -q` → all pass (existing tests unaffected).

- [ ] **Step 5: Commit** — `git add backend/app/ai/schema.py backend/tests/test_schema.py && git commit -m "feat(backend): schema for accordion, flow, formula, key point and page study/revision fields"`

---

### Task 2: Backend validation for the new blocks and fields

**Files:**
- Modify: `backend/app/ai/validate.py`
- Test: `backend/tests/test_validate.py`

**Interfaces:**
- Consumes: Task 1 models.
- Produces: `finalize_page` returns `Page` with `intro_figure`, `study_activities`, `revision.points/flow_title/flow`; tab titles never start with a number prefix; nested accordions dropped; clinical-callout check counts clinical blocks inside accordion panels.

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_validate.py` (it already defines `CTX` from a source text containing `https://www.tga.gov.au/guidance`, `[IMG-01: slide 1]` and `[EMBED-01]`, plus helpers `tab(title, *blocks)` and `wire(tabs, **kw)`; reuse them):

```python
from app.ai.schema import Accordion, Flow, Formula, KeyPoint, Paragraph, Table

CLIN = {"type": "clinical", "body": "Matters."}


def test_key_point_flow_formula_validated():
    blocks = [
        {"type": "key_point", "lead": "Lead.", "text": "Text [x](https://fake.example)"},
        {"type": "key_point", "text": "  "},
        {"type": "flow", "steps": [{"label": "Dose", "style": "solid"}, {"label": "  "}, {"label": "Effect", "style": None}]},
        {"type": "flow", "steps": [{"label": "Only one"}]},
        {"type": "formula", "expression": "CL = Q × E", "note": ""},
        {"type": "formula", "expression": ""},
        CLIN,
    ]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    b = page.tabs[0].blocks
    assert b[0] == KeyPoint(lead="Lead.", text="Text x")
    assert isinstance(b[1], Flow) and [s.label for s in b[1].steps] == ["Dose", "Effect"]
    assert b[1].steps[1].style == "outline"
    assert b[2] == Formula(expression="CL = Q × E")
    assert len(b) == 4  # empty key point, 1-step flow and empty formula dropped
    assert any("fewer than two steps" in n.text for n in page.notes)


def test_accordion_validated_recursively_and_nesting_dropped():
    acc = {"type": "accordion", "panels": [
        {"title": "Worked example", "blocks": [
            {"type": "paragraph", "text": "See [fake](https://fake.example)"},
            {"type": "figure", "ref": "IMG-09", "alt": "x"},
            {"type": "clinical", "body": "Inside."},
        ]},
        {"title": "Empty", "blocks": [{"type": "paragraph", "text": " "}]},
    ]}
    page = finalize_page(wire([tab("A", acc), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    accordion = page.tabs[0].blocks[0]
    assert isinstance(accordion, Accordion)
    assert [p.title for p in accordion.panels] == ["Worked example"]
    assert accordion.panels[0].blocks[0] == Paragraph(text="See fake")
    assert len(accordion.panels[0].blocks) == 2  # unknown figure removed
    # clinical inside the accordion satisfies the per-tab check
    assert not any("Tab 'A'" in n.text for n in page.notes)


def test_inner_accordion_type_is_rejected_by_wire_schema_or_dropped():
    # WireInnerBlock cannot be "accordion", so a nested accordion fails validation at the wire level;
    # finalize must still drop a panel whose blocks end up empty.
    acc = {"type": "accordion", "panels": [{"title": "T", "blocks": []}]}
    page = finalize_page(wire([tab("A", acc, P, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    assert all(not isinstance(b, Accordion) for b in page.tabs[0].blocks)


def test_table_variant_and_row_headers_pass_through():
    t = {"type": "table", "headers": ["A", "B"], "rows": [["1", "2"]], "variant": "secondary", "row_headers": False}
    page = finalize_page(wire([tab("A", t, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    table = page.tabs[0].blocks[0]
    assert isinstance(table, Table) and table.variant == "secondary" and table.row_headers is False


def test_tab_title_number_prefix_stripped():
    page = finalize_page(wire([tab("1. Overview", P, CLIN), tab("2) Next", P, CLIN), tab("Three", P, CLIN)]), CTX, include_revision=False)
    assert [t.title for t in page.tabs] == ["Overview", "Next", "Three"]


def test_page_fields_revision_points_flow_activities_intro_figure():
    w = wire([tab("A", P, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)])
    from app.ai.schema import WireFigureRef, WireActivity, WireRevision, WireFlow, WireFlowStep
    w.intro_figure = WireFigureRef(ref="IMG-01", alt="Course map")
    w.study_activities = [WireActivity(task="Watch part 1", purpose="Framework"), WireActivity(task="", purpose="x")]
    w.revision = WireRevision(points=["One", " ", "Two"] + [f"P{i}" for i in range(10)], flow_title="Direction",
                              flow=WireFlow(steps=[WireFlowStep(label="CL"), WireFlowStep(label="k", style="amber")]))
    page = finalize_page(w, CTX, include_revision=False)
    assert page.intro_figure.ref == "IMG-01" and page.intro_figure.alt == "Course map"
    assert [(a.task, a.purpose) for a in page.study_activities] == [("Watch part 1", "Framework")]
    assert page.revision.points[:2] == ["One", "Two"] and len(page.revision.points) == 8
    assert page.revision.flow_title == "Direction" and [s.label for s in page.revision.flow.steps] == ["CL", "k"]


def test_unknown_intro_figure_dropped_silently():
    from app.ai.schema import WireFigureRef
    w = wire([tab("A", P, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)])
    w.intro_figure = WireFigureRef(ref="IMG-77", alt="x")
    page = finalize_page(w, CTX, include_revision=False)
    assert page.intro_figure is None
    assert not any("IMG-77" in n.text for n in page.notes)
```

- [ ] **Step 2: Run to verify failure** — `venv/Scripts/python -m pytest -q tests/test_validate.py` → new tests FAIL.

- [ ] **Step 3: Implement** — in `backend/app/ai/validate.py`:

Import additions: `Accordion, Flow, FlowStep, Formula, KeyPoint, Panel, StudyActivity, WireFlowStep, WireInnerBlock` from `app.ai.schema`.

Add module constant: `TAB_NUMBER_RE = re.compile(r"^\s*\d+\s*[.)]\s+")`.

In `_Finalizer`, change `_table` to pass through variant/row_headers:

```python
        variant = "secondary" if b.variant == "secondary" else None
        row_headers = False if b.row_headers is False else None
        return Table(headers=headers, col_widths=widths, rows=rows, variant=variant, row_headers=row_headers)
```

Add methods:

```python
    def flow(self, steps: list[WireFlowStep] | None) -> Flow | None:
        out = []
        for s in steps or []:
            label = self.text(s.label)
            if label:
                out.append(FlowStep(label=label, sub=self.text(s.sub) or None, style=s.style or "outline"))
        if len(out) < 2:
            if steps:
                self.note("Removed a flow diagram with fewer than two steps.")
            return None
        return Flow(steps=out[:6])
```

Change the signature of `block` to `def block(self, b: WireBlock | WireInnerBlock, allow_accordion: bool = True) -> Block | None:` and add before `return None`:

```python
        if t == "key_point":
            text = self.text(b.text)
            return KeyPoint(lead=self.text(b.lead) or None, text=text) if text else None
        if t == "flow":
            return self.flow(b.steps)
        if t == "formula":
            expression = self.text(b.expression)
            return Formula(expression=expression, note=self.text(b.note) or None) if expression else None
        if t == "accordion":
            if not allow_accordion:
                return None
            panels = []
            for p in getattr(b, "panels", None) or []:
                inner = [x for x in (self.block(ib, allow_accordion=False) for ib in p.blocks) if x is not None]
                if inner:
                    panels.append(Panel(title=self.text(p.title) or "More detail", blocks=inner))
            return Accordion(panels=panels) if panels else None
```

Change `tab` to strip number prefixes: `title = TAB_NUMBER_RE.sub("", self.text(w.title)) or "Untitled"` and use `title`.

Add module helper and use it in both clinical checks (replace `any(isinstance(b, Clinical) for b in t.blocks)`):

```python
def _has_clinical(blocks) -> bool:
    for b in blocks:
        if isinstance(b, Clinical):
            return True
        if isinstance(b, Accordion) and any(_has_clinical(p.blocks) for p in b.panels):
            return True
    return False
```

In `finalize_page`, after `intro = f.texts(wire.intro)`:

```python
    intro_figure = None
    if wire.intro_figure and (wire.intro_figure.ref or "").strip() in ctx.image_refs:
        intro_figure = f.figure(wire.intro_figure.ref, wire.intro_figure.alt, wire.intro_figure.caption)
    activities = []
    for a in wire.study_activities or []:
        task, purpose = f.text(a.task), f.text(a.purpose)
        if task and purpose:
            activities.append(StudyActivity(task=task, purpose=purpose))
    points = f.texts(wire.revision.points)[:8]
    rev_flow = f.flow(wire.revision.flow.steps) if wire.revision.flow else None
```

and build `Revision(include=..., embed_ref=embed_ref, points=points or None, flow_title=f.text(wire.revision.flow_title) or None, flow=rev_flow)` and pass `intro_figure=intro_figure, study_activities=activities or None` to `Page(...)`.

- [ ] **Step 4: Run tests** — `venv/Scripts/python -m pytest -q` → all pass.

- [ ] **Step 5: Commit** — `git commit -am "feat(backend): validate accordions, flows, formulas, key points and page study/revision fields"`

---

### Task 3: Course context input and rewritten AI instructions

**Files:**
- Modify: `backend/app/routers/generate.py`, `backend/app/ai/prompts.py`, `backend/app/prompts/system.md`, `backend/app/prompts/regenerate_tab.md`
- Test: `backend/tests/test_generate_route.py`, `backend/tests/test_prompts.py`

**Interfaces:**
- Produces: `GenerateRequest.course_context: str` and `RegenerateTabRequest.course_context: str` (trimmed, cut to 12,000 chars); `build_generate_prompt(title, include_revision, instructions, text, course_context="")`, `build_regenerate_prompt(tab_json, other_titles, intro, instruction, text, course_context="")`.

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_prompts.py`:

```python
from app.ai.prompts import build_generate_prompt, build_regenerate_prompt, load_prompt


def test_course_context_included_in_prompts():
    p = build_generate_prompt("", False, "", "SRC", course_context="Course: PHAR3004")
    assert "COURSE CONTEXT" in p and "Course: PHAR3004" in p
    assert p.index("COURSE CONTEXT") < p.index("SOURCE MATERIAL")
    assert "COURSE CONTEXT" not in build_generate_prompt("", False, "", "SRC")
    r = build_regenerate_prompt("{}", [], [], "shorter", "SRC", course_context="CTX")
    assert "COURSE CONTEXT" in r and "CTX" in r


def test_system_prompt_describes_new_blocks_and_rules():
    s = load_prompt("system")
    for word in ["key_point", "flow", "formula", "accordion", "revision", "points", "study_activities", "intro_figure", "~", "^"]:
        assert word in s
    assert "takeaways" not in s
    assert "At least one per tab" in s
    assert "copyright" in s.lower()
    assert "accordion" in load_prompt("regenerate_tab")
```

Append to `backend/tests/test_generate_route.py` (reuse its existing fixtures `client`, `calls`/fake generate pattern used for `/api/generate` tests — copy the setup of the nearest existing generate test):

```python
def test_generate_passes_course_context_truncated(calls, client):
    long_ctx = "x" * 13000
    r = client.post("/api/generate", json={"text": "SRC", "course_context": "  " + long_ctx + "  "}, headers={"X-Gemini-Key": "k"})
    assert r.status_code == 200
    prompt = calls[-1]["prompt"]
    assert "COURSE CONTEXT" in prompt
    assert "x" * 12000 in prompt and "x" * 12001 not in prompt
```

(If the existing route tests use different fixture names, adapt the names only — keep the assertions.)

- [ ] **Step 2: Run to verify failure** — `venv/Scripts/python -m pytest -q tests/test_prompts.py tests/test_generate_route.py` → FAIL.

- [ ] **Step 3: Implement**

`backend/app/ai/prompts.py` — add a shared helper and parameters:

```python
COURSE_CONTEXT_HEADER = "COURSE CONTEXT (use to pitch the level and connect content; do not reproduce it on the page):"


def _course_section(course_context: str) -> list[str]:
    ctx = course_context.strip()
    return [COURSE_CONTEXT_HEADER + "\n<<<\n" + ctx + "\n>>>"] if ctx else []
```

In `build_generate_prompt(..., course_context: str = "")` insert `lines.extend(_course_section(course_context))` immediately before the `SOURCE MATERIAL` line. In `build_regenerate_prompt(..., course_context: str = "")` insert `*_course_section(course_context),` before the `SOURCE MATERIAL` element.

`backend/app/routers/generate.py` — add to both request models:

```python
    course_context: str = ""

    @field_validator("course_context")
    @classmethod
    def _cap_course_context(cls, v: str) -> str:
        return v.strip()[:12000]
```

(import `field_validator` from pydantic) and pass `course_context=req.course_context` to both prompt builders.

`backend/app/prompts/regenerate_tab.md` — add the bullet: `- Accordions are allowed inside this tab (one level only: no accordion inside an accordion).`

`backend/app/prompts/system.md` — replace the whole file with:

````markdown
You are an instructional designer for University of Adelaide pharmacy courses. You turn lecturers' raw teaching material (Word documents, PowerPoint slides and speaker notes, PDFs, transcripts, old Canvas pages) into the content of one Canvas LMS page that students can scan.

You do not write HTML. You return JSON matching the provided schema. The app turns each block into a fixed house-style component (the shared pharmacy template), numbers the tabs, adds a "Study materials" tab and inserts editing space. Your job is to restructure the content and choose the right block for each piece — not to retype the document.

# 1. Content rules (most important)

- **Never add facts.** Every clinical claim, number, dose, statistic, study and reference must come from the source material, even if you are confident it is correct.
- **Never drop content.** All substantive teaching content must appear. Preserve terminology, equations, worked examples and teaching depth. You may reorder, merge duplicates across sources, tighten wording, and convert prose into tables, flows or lists. If you deliberately leave something out, add an `unplaced` note saying what and why.
- **Keep references verbatim.** Reproduce citations, URLs and DOIs exactly. Incomplete citation → keep it and add a `citation` note.
- **Fix only obvious errors.** Correct clear typos and grammar. If something looks clinically wrong, outdated, or two sources disagree, keep the original and add a `flag` note quoting it. If the source is thin somewhere, leave it thin and flag the gap — never fill it.
- **Copyright.** Never reproduce figures, tables or extended text from textbooks or journals beyond what the lecturer's material already contains; describe the figure needed (in a figure's `alt`) and add a `flag` note.
- **Australian context and spelling** (sensitisation, haemoglobin, behaviour, paediatric; TGA, PBS, AMH, Therapeutic Guidelines) where the source uses them. Keep the author's voice.
- **Voice.** Clear, direct, collegial, for pharmacy students. Use "we" and "as pharmacists". Short paragraphs (2–4 sentences), often opening with a **bold lead phrase**. No emojis, exclamation marks or marketing language.
- **Slides.** Expand slide fragments into sentences only as far as the slide text and speaker notes support.
- **Skip scaffolding** (slide numbers, "this lecture will cover…", title slides, acknowledgements).

# 2. How to restructure

- Prose that compares 2+ items across the same dimensions → a `table` (one row per item, one column per dimension). This is the single most valuable transformation.
- A sequential process (dose → effect, ADME, a pathway) → a `flow`.
- The one sentence that carries a section ("the so-what") → a `key_point`.
- More than about six flat bullets → a table or grouped sub-headings; find the implicit structure.
- Worked calculations, case studies, extra detail and answers → an `accordion` so students can attempt before revealing.
- Typically no more than one or two callouts per section besides the required ones.

# 3. Page structure

- `title`: short, sentence case.
- `intro`: 2–3 short paragraphs saying what the page covers and why it matters.
- `intro_figure` (optional): an image id from the source that orients the topic (e.g. a course map); otherwise leave it null.
- `tabs`: 3–8 teaching tabs, one per major concept, in teaching order. Titles 2–6 words, sentence case, **not numbered** (the app numbers them). Do not create a "Study materials" tab — the app adds it.
- `revision.points`: 4–6 statements a student should be able to explain (not just recall), using only facts on the page. `revision.flow_title` and `revision.flow` (optional): one key relationship shown as a short flow (e.g. "Keep the direction of these relationships clear").
- `revision.include`: true only if the request asks for it or the source contains a quiz/H5P embed; set `revision.embed_ref` to an `[EMBED-nn]` id when one exists.
- `study_activities` (optional): rows of `task` / `purpose` ONLY when the source describes activities (e.g. watching recordings, a tutorial). Never invent tasks or assessment requirements.

Within each tab use `heading` blocks to break up sections. Every tab must contain **at least one** `clinical` block and must **end with a `self_check`** block.

# 4. Text formatting

Every text field supports only: `**bold**`, `*italic*`, `[link text](https://url)` (only URLs that appear in the source, copied exactly), `~subscript~` and `^superscript^` (no spaces inside, e.g. t~1/2~, C~max~, e^−kt^). No HTML, no other markdown. Write special characters directly (—, –, →, ≠, ≤, ≥, µ, ×).

# 5. Block types

Omit fields a block type doesn't use.

- **heading** (`text`): sub-heading within a tab or accordion panel.
- **paragraph** (`text`).
- **list** (`ordered`, `items`).
- **table** (`headers`, `rows`, optional `col_widths`, `variant`, `row_headers`): first column is a row label unless `row_headers` is false (use false when the first column is data, e.g. time/concentration pairs). `variant: "secondary"` gives an amber header — use it mainly inside accordions. Every row has as many cells as `headers`; `\n\n` splits a cell into paragraphs.
- **contrast_table** (`left_header`, `right_header`, `rows` of 2 cells): only for two directly opposed concepts.
- **flow** (`steps`: 2–6 of `label`, optional `sub`, `style`): a left-to-right sequence. `style`: `solid` for start/end points or key outcomes, `outline` for intermediate concepts, `amber` for processes or derived quantities.
- **formula** (`expression`, optional `note`): one equation, e.g. `CL = Q × E` with note "Q = blood flow through the eliminating organ". Use subscript/superscript codes.
- **key_point** (optional `lead`, `text`): the central idea of a section, e.g. lead "Distribution is reversible." text "Drug can move between plasma and tissues as concentrations change."
- **clinical** (`body`): "Why this matters clinically" — connects the section to what a pharmacist does. **At least one per tab**, at the end of the section it relates to. Only say something specific and true; use only facts on the page.
- **caution** (`title`, `items` or `body`): practice points, monitoring, red flags, contraindications.
- **critical** (optional `title`, `body` or `items`): ONLY for serious harm — boxed warnings, dangerous interactions, absolute contraindications, overdose/toxicity.
- **tip** (`body`): a practical pharmacy-practice tip, only where the source supports it.
- **counselling** (optional `title`, `items`): plain-language points to tell the patient, only where the source covers counselling.
- **evidence** (`title` without "Evidence:", `children`): a study or review summary — `paragraph`, `figure`, `citation`, `references`, `list` children.
- **citation** (`text`), **link** (`lead_in`, `url`, `link_text`), **figure** (`ref`, `alt`, optional `caption`).
- **self_check** (`questions`: 2–3 of `question`/`answer`): the **last block of every tab**; answers 1–2 sentences using only facts on the page.
- **accordion** (`panels`: `title` + `blocks`): collapsible detail inside a tab. Panels may contain any block except another accordion.

# 6. Images and embeds

Markers in the source: `[IMG-nn]` / `[IMG-nn: slide 7]` (thumbnails of most images are attached, labelled with their id; pasted Canvas images have no thumbnail) and `[EMBED-nn]`. For images with teaching content add a `figure` (`ref` = id, concise `alt` describing what it shows, `caption` = source if known). Skip decorative images. Never invent ids or URLs.

# 7. Course context

If a COURSE CONTEXT section is provided, use it to pitch the level and to connect content to the course's aims and learning outcomes (for example in clinical callouts). Do not reproduce course details on the page.

# 8. Notes for the lecturer

`notes` with `kind`: `image` (one per figure from a Word/PowerPoint/PDF source: id, where it came from, which tab), `flag` (possible errors, outdated content, inconsistencies between sources, gaps, copyright concerns — quote the original), `citation` (incomplete citations), `unplaced` (content you could not place or deliberately omitted). Leave empty if nothing to report.
````

- [ ] **Step 4: Run tests** — `venv/Scripts/python -m pytest -q` → all pass. Update any existing assertion in `tests/test_prompts.py` that required the old wording (e.g. "takeaways" or "At most one") to match the new file — do not weaken unrelated assertions.

- [ ] **Step 5: Commit** — `git commit -am "feat(backend): course context input and PHAR3004 restructuring instructions"`

---

### Task 4: Frontend types and inline sub/superscript

**Files:**
- Modify: `frontend/src/types/page.ts`, `frontend/src/types/api.ts`, `frontend/src/render/inline.ts`, `frontend/src/render/editing.ts`
- Test: `frontend/src/render/inline.test.ts`, `frontend/src/render/editing.test.ts`

**Interfaces:**
- Produces (types/page.ts): `FlowStep {label: string; sub?: string; style: "solid"|"outline"|"amber"}`, `FlowBlock {type:"flow"; steps: FlowStep[]}`, `InnerBlock` (all non-accordion blocks), `AccordionBlock {type:"accordion"; panels:{title:string; blocks: InnerBlock[]}[]}`, `Block = InnerBlock | AccordionBlock`, table gains `variant?: "primary"|"secondary"; row_headers?: boolean`; `StudyMaterials {handout?: {label?: string; url?: string}; recordings: {part?: string; title?: string; recording_url?: string; transcript_url?: string}[]; resources: {title: string; url?: string}[]}`; `Page` gains `intro_figure?: FigureBlock; study_activities?: {task: string; purpose: string}[]; study?: StudyMaterials`, `revision` gains `points?: string[]; flow_title?: string; flow?: FlowBlock`.
- Produces (types/api.ts): `GenerateRequest.course_context: string`, `RegenerateTabRequest.course_context: string`.
- Produces: `renderInline` handles `~x~` → `<sub>x</sub>`, `^x^` → `<sup>x</sup>`; `htmlToMarkdown` maps them back.

- [ ] **Step 1: Write the failing tests** — append to `frontend/src/render/inline.test.ts`:

```ts
describe("subscript and superscript", () => {
  it("renders ~x~ and ^x^ without spaces inside", () => {
    expect(renderInline("t~1/2~ and C~max~ = e^−kt^")).toBe("t<sub>1/2</sub> and C<sub>max</sub> = e<sup>&minus;kt</sup>");
  });
  it("leaves approximate-value tildes alone", () => {
    expect(renderInline("~30 mL/min and ~5 days")).toBe("~30 mL/min and ~5 days");
  });
  it("leaves a lone caret alone", () => {
    expect(renderInline("2^ 3")).toBe("2^ 3");
  });
});
```

(`−` U+2212 is not in the NAMED map today; add `"\u2212": "&minus;"` to NAMED as part of Step 3.)

Append to `frontend/src/render/editing.test.ts` (jsdom file; reuse its `el(html)` helper):

```ts
it("maps sub and sup back to ~ and ^", () => {
  expect(htmlToMarkdown(el("t<sub>1/2</sub> = ln(2) &times; V<sub>d</sub> / CL; e<sup>−kt</sup>"))).toBe("t~1/2~ = ln(2) × V~d~ / CL; e^−kt^");
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/render/inline.test.ts src/render/editing.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`inline.ts`: add `"\u2212": "&minus;"` to `NAMED`; add

```ts
const SUB_RE = /~([^~\s]{1,16})~/g;
const SUP_RE = /\^([^^\s]{1,16})\^/g;
```

and chain `.replace(SUB_RE, "<sub>$1</sub>").replace(SUP_RE, "<sup>$1</sup>")` after the italic replace. Update the doc comment to list the five codes.

Note: `~30 mL/min and ~5 days` contains a space between the tildes, so it cannot match. 

`editing.ts`: in `inlineToMarkdown` add cases:

```ts
    case "SUB":
      return wrapMarker("~", childrenInline(el));
    case "SUP":
      return wrapMarker("^", childrenInline(el));
```

`types/page.ts`: restructure `Block` as described in Interfaces — define the existing union members as `InnerBlock` plus `| { type: "key_point"; lead?: string; text: string } | FlowBlock | { type: "formula"; expression: string; note?: string }`, add `AccordionBlock`, `Block = InnerBlock | AccordionBlock`, extend the table member, add `StudyMaterials`, extend `Page`.

`types/api.ts`: add `course_context: string` to `GenerateRequest` and `RegenerateTabRequest`.

- [ ] **Step 4: Run** — `npm test` and `npm run build` → pass (fix only type errors caused by the new union, e.g. exhaustive switches in templates.ts get a temporary `case "key_point": case "flow": case "formula": case "accordion": return [];` — Task 5 replaces them).

- [ ] **Step 5: Commit** — `git commit -am "feat(frontend): page types for new blocks and subscript/superscript inline codes"`

---

### Task 5: Block templates in the PHAR3004 style (with content spacing)

**Files:**
- Rewrite: `frontend/src/render/templates.ts`
- Rewrite: `frontend/src/render/templates.test.ts`

**Interfaces:**
- Consumes: Task 4 types, `renderInline/escapeAttr/escapeText/splitParagraphs`.
- Produces: `RenderContext` (unchanged shape), `indent`, `SPACER = "<p>&nbsp;</p>"`, `PLACEHOLDER_STYLE`, `PALETTE` (object of the constants below), `blockLines(block: Block, ctx, path?)`, `contentLines(blocks: Block[], ctx, basePath?)` (blocks with spacers + trailing spacer), `figureLines(block, ctx, path?)`, `flowRowLines(flow: FlowBlock, ctx, path?)`, `tableLines(...)` helper exported as `simpleTableLines(headers: string[], rows: string[][], opts: {variant?: "primary"|"secondary"; rowHeaders?: boolean})` for the study tab, `withAlt` (unchanged).

- [ ] **Step 1: Write the failing golden tests** — replace `frontend/src/render/templates.test.ts` with tests that assert the exact HTML of spec §4 for: heading; paragraph; list; primary table (row labels as `th scope="row"` with `#f4f2fb`, multi-paragraph cell, given `col_widths`); secondary table; `row_headers: false`; contrast table; flow (three styles, sub line, arrows); formula with and without note; key_point with and without lead; clinical; caution body-only and with items; critical default and custom title; tip; counselling default and custom title; evidence with children; self_check (2 questions); link; legacy takeaways; figure placeholder, canvas figure with alt replacement, caption; accordion with two panels (inner content includes spacers); `contentLines` spacing cases. Use the constants below in the expected strings (`const TD = 'style="padding: 11px; border: 1px solid #cbd5e1;"'` etc.). Example set (write all of these, then add the remaining components following exactly the spec HTML):

```ts
import { describe, expect, it } from "vitest";
import type { Block } from "../types/page";
import { blockLines, contentLines, SPACER, type RenderContext } from "./templates";

const ctx: RenderContext = {
  images: {
    "IMG-01": { ref: "IMG-01", source: "deck.pptx", location: "slide 7", mime: "image/png", data_b64: "AAAA" },
    "IMG-02": { ref: "IMG-02", source: "Pasted Canvas page 1", location: "", canvas_tag: '<img src="https://x/preview" alt="image.png"/>' },
  },
  embeds: {},
};
const r = (b: Block) => blockLines(b, ctx).join("\n");
const HTH = 'style="padding: 11px; text-align: left; border: 1px solid #cbd5e1;" scope="col"';
const TD = 'style="padding: 11px; border: 1px solid #cbd5e1;"';

describe("PHAR3004 templates", () => {
  it("heading", () => {
    expect(r({ type: "heading", text: "Why it matters" })).toBe('<h4 style="color: #140f50;">Why it matters</h4>');
  });

  it("primary table with row labels", () => {
    expect(r({ type: "table", headers: ["Concept", "What it studies"], rows: [["**PK**", "Time course"]] })).toBe(
      [
        '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
        "    <thead>",
        '        <tr style="background: #140f50; color: #ffffff;">',
        `            <th ${HTH}>Concept</th>`,
        `            <th ${HTH}>What it studies</th>`,
        "        </tr>",
        "    </thead>",
        "    <tbody>",
        "        <tr>",
        '            <th style="padding: 11px; background: #f4f2fb; text-align: left; border: 1px solid #cbd5e1;" scope="row">PK</th>',
        `            <td ${TD}>Time course</td>`,
        "        </tr>",
        "    </tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("secondary table uses dark amber header and pale amber labels", () => {
    const html = r({ type: "table", headers: ["Route", "Input"], rows: [["IV", "Direct"]], variant: "secondary" });
    expect(html).toContain('<tr style="background: #b45309; color: #ffffff;">');
    expect(html).toContain('background: #fff7ed; text-align: left;');
  });

  it("row_headers false renders the first column as plain td", () => {
    const html = r({ type: "table", headers: ["Time (h)", "Conc"], rows: [["2", "5.13"]], row_headers: false });
    expect(html).not.toContain('scope="row"');
    expect(html).toContain(`<td ${TD}>2</td>`);
  });

  it("flow", () => {
    expect(
      r({ type: "flow", steps: [{ label: "Dose", style: "solid" }, { label: "Concentration", sub: "PK", style: "outline" }, { label: "Effect", style: "amber" }] }),
    ).toBe(
      [
        '<div style="margin: 24px 0;">',
        '    <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; text-align: center;">',
        '        <div style="padding: 13px 18px; background: #140f50; color: #ffffff; border-radius: 8px;"><strong>Dose</strong></div>',
        '        <div style="font-size: 1.5em; color: #d97706;" aria-hidden="true">&rarr;</div>',
        '        <div style="padding: 13px 18px; background: #f4f2fb; border-radius: 8px; border: 2px solid #140f50;"><strong>Concentration</strong><br /><span style="font-size: 0.9em;">PK</span></div>',
        '        <div style="font-size: 1.5em; color: #d97706;" aria-hidden="true">&rarr;</div>',
        '        <div style="padding: 13px 18px; background: #fff7ed; border-radius: 8px; border: 2px solid #d97706;"><strong>Effect</strong></div>',
        "    </div>",
        "</div>",
      ].join("\n"),
    );
  });

  it("formula with note", () => {
    expect(r({ type: "formula", expression: "CL = Q × E", note: "Q = blood flow" })).toBe(
      [
        '<div style="margin: 18px auto; padding: 16px; max-width: 440px; text-align: center; background: #f4f2fb; border-radius: 8px; border: 1px solid #ddd8ef;">',
        '    <p style="margin: 0; font-size: 1.25em;"><strong>CL = Q &times; E</strong></p>',
        '    <p style="margin: 6px 0 0 0; font-size: 0.9em; color: #64748b;">Q = blood flow</p>',
        "</div>",
      ].join("\n"),
    );
  });

  it("key point and clinical", () => {
    expect(r({ type: "key_point", lead: "Distribution is reversible.", text: "Drug moves back." })).toBe(
      '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #140f50; background: #f4f2fb;"><p style="margin: 0;"><strong>Distribution is reversible.</strong> Drug moves back.</p></div>',
    );
    expect(r({ type: "clinical", body: "Prevention works." })).toBe(
      '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #d97706; background: #fff7ed;"><p style="margin: 0;"><strong>Why this matters clinically:</strong> Prevention works.</p></div>',
    );
  });

  it("caution with items", () => {
    expect(r({ type: "caution", title: "Before starting", items: ["**Check** renal function"] })).toBe(
      [
        '<div style="margin: 20px 0px; padding: 17px 19px; background: #fff7ed; border-radius: 8px; border: 2px solid #d97706;">',
        '    <p style="margin: 0 0 8px 0;"><strong>Before starting</strong></p>',
        '    <ul style="margin: 0; padding-left: 24px;">',
        "        <li><strong>Check</strong> renal function</li>",
        "    </ul>",
        "</div>",
      ].join("\n"),
    );
  });

  it("critical keeps the red exception", () => {
    expect(r({ type: "critical", body: "Do not combine." })).toBe(
      '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #b91c1c; background: #fef2f2;"><p style="margin: 0;"><strong style="color: #991b1b;">Critical safety warning</strong> Do not combine.</p></div>',
    );
  });

  it("self check", () => {
    expect(r({ type: "self_check", questions: [{ question: "Q1?", answer: "A1." }] })).toBe(
      [
        '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #836bff; background: #f4f2fb;">',
        '    <p style="margin: 0 0 8px 0;"><strong style="color: #140f50;">Check your understanding</strong></p>',
        '    <p style="margin: 10px 0 4px 0;"><strong>1.</strong> Q1?</p>',
        "    <details>",
        '        <summary style="cursor: pointer; color: #140f50;">Show answer</summary>',
        '        <p style="margin: 6px 0 0 0;">A1.</p>',
        "    </details>",
        "</div>",
      ].join("\n"),
    );
  });

  it("figure placeholder", () => {
    expect(r({ type: "figure", ref: "IMG-01", alt: "Pathway" })).toBe(
      '<p style="text-align: center; border: 2px dashed #cbd5e1; padding: 20px; color: #64748b;">[ IMAGE IMG-01: Pathway, slide 7 — delete this line and insert from Canvas Files ]</p>'.replace("—", "&mdash;"),
    );
  });

  it("accordion with spaced panel content", () => {
    expect(
      r({ type: "accordion", panels: [{ title: "Worked example", blocks: [{ type: "paragraph", text: "Step 1" }, { type: "formula", expression: "k = CL / V" }] }] }),
    ).toBe(
      [
        '<div class="dp-panels-wrapper dp-accordion-default">',
        '    <div class="dp-panel-group">',
        '        <h4 class="dp-panel-heading">Worked example</h4>',
        '        <div class="dp-panel-content">',
        "            <p>Step 1</p>",
        `            ${SPACER}`,
        '            <div style="margin: 18px auto; padding: 16px; max-width: 440px; text-align: center; background: #f4f2fb; border-radius: 8px; border: 1px solid #ddd8ef;">',
        '                <p style="margin: 0; font-size: 1.25em;"><strong>k = CL / V</strong></p>',
        "            </div>",
        `            ${SPACER}`,
        "        </div>",
        "    </div>",
        "</div>",
      ].join("\n"),
    );
  });
});

describe("contentLines spacing", () => {
  const p = (t: string): Block => ({ type: "paragraph", text: t });
  it("no spacer between prose, spacer around major blocks, one trailing spacer", () => {
    const lines = contentLines([p("a"), p("b"), { type: "clinical", body: "c" }, p("d")], ctx);
    expect(lines.filter((l) => l === SPACER)).toHaveLength(3);
    expect(lines[0]).toBe("<p>a</p>");
    expect(lines[1]).toBe("<p>b</p>");
    expect(lines[2]).toBe(SPACER);
    expect(lines[lines.length - 1]).toBe(SPACER);
    expect(lines.join("\n")).not.toContain(`${SPACER}\n${SPACER}`);
  });
  it("empty content is just one spacer", () => {
    expect(contentLines([], ctx)).toEqual([SPACER]);
  });
});
```

Also add exact-string tests (built from spec §4.8's shapes) for: caution body-only (`<p style="margin: 0;"><strong>TITLE</strong> BODY</p>` in the BOX shape), tip (`<strong style="color: #1039cc;">Pharmacist tip:</strong>` in LR(`#1448ff`,`#eff4ff`)), counselling default title (BOX with `border: 1px solid #ddd8ef`, `background: #f4f2fb`, `<strong style="color: #140f50;">Counselling points</strong>`, list), evidence (BOX(`#b8caff`,`#eff4ff`), `<p style="margin: 0 0 8px 0;"><strong style="color: #1039cc;">Evidence: TITLE</strong></p>`, children), link (BOX(`#b8caff`,`#eff4ff`) containing `<p style="margin: 0;">LEAD: <a href=… target="_blank" rel="noopener">TEXT</a></p>`), legacy takeaways (spec §4.8 card), contrast table (`#140f50` / `#b45309` headers, `width: 50%`), canvas figure (`<p style="text-align: center;"><img src="https://x/preview" alt="Pathway"/></p>`), editable mode emits `data-edit` on flow labels (`tabs.0.blocks.0.steps.1.label`), formula expression (`….expression` on the `<strong>`), key point lead/text spans, accordion inner block paths (`….panels.0.blocks.1.text`).

- [ ] **Step 2: Run** — `npm test -- src/render/templates.test.ts` → FAIL.

- [ ] **Step 3: Implement** — rewrite `frontend/src/render/templates.ts`:

```ts
import type { Block, EvidenceChild, FigureBlock, FlowBlock, FlowStep } from "../types/page";
import type { ImageInfo } from "../types/api";
import { escapeAttr, escapeText, renderInline, splitParagraphs } from "./inline";

export interface RenderContext {
  images: Record<string, ImageInfo>;
  embeds: Record<string, string>;
  /** When true, user-editable text elements get data-edit="PATH" (dot path into the Page JSON). */
  editable?: boolean;
}

export const PALETTE = {
  purple: "#140f50", lavender: "#f4f2fb", lavenderBorder: "#ddd8ef", violet: "#836bff",
  blue: "#1448ff", bluePale: "#eff4ff", blueBorder: "#b8caff", blueDark: "#1039cc",
  amberDark: "#b45309", amber: "#d97706", amberPale: "#fff7ed",
  border: "#cbd5e1", muted: "#64748b", red: "#b91c1c", redPale: "#fef2f2", redDark: "#991b1b",
} as const;
const P = PALETTE;

export const SPACER = "<p>&nbsp;</p>";
export const PLACEHOLDER_STYLE = `text-align: center; border: 2px dashed ${P.border}; padding: 20px; color: ${P.muted};`;
const CITE_SPAN = `font-size: 8pt; color: ${P.muted};`;
const CELL = `padding: 11px; border: 1px solid ${P.border};`;
const ARROW = `<div style="font-size: 1.5em; color: ${P.amber};" aria-hidden="true">&rarr;</div>`;
const LIST_IN_CALLOUT = "margin: 0; padding-left: 24px;";
const lr = (rule: string, fill: string) => `margin: 20px 0; padding: 16px 18px; border-left: 5px solid ${rule}; background: ${fill};`;
const box = (border: string, fill: string, width = 2) =>
  `margin: 20px 0px; padding: 17px 19px; background: ${fill}; border-radius: 8px; border: ${width}px solid ${border};`;
const STEP_STYLE: Record<FlowStep["style"], string> = {
  solid: `padding: 13px 18px; background: ${P.purple}; color: #ffffff; border-radius: 8px;`,
  outline: `padding: 13px 18px; background: ${P.lavender}; border-radius: 8px; border: 2px solid ${P.purple};`,
  amber: `padding: 13px 18px; background: ${P.amberPale}; border-radius: 8px; border: 2px solid ${P.amber};`,
};
const MAJOR = new Set<Block["type"]>([
  "table", "contrast_table", "flow", "formula", "figure", "key_point", "clinical", "caution", "critical",
  "tip", "counselling", "evidence", "self_check", "link", "takeaways", "accordion",
]);

export function indent(lines: string[], level = 1): string[] {
  const pad = "    ".repeat(level);
  return lines.map((line) => pad + line);
}

function editAttr(ctx: RenderContext, path: string | undefined): string {
  return ctx.editable && path ? ` data-edit="${escapeAttr(path)}"` : "";
}

function editSpan(ctx: RenderContext, path: string | undefined, inner: string): string {
  return ctx.editable && path ? `<span data-edit="${escapeAttr(path)}">${inner}</span>` : inner;
}

const join = (base: string | undefined, key: string | number) => (base === undefined ? undefined : `${base}.${key}`);
const pct = (n: number) => `${Number(n.toFixed(2))}%`;
const stripBold = (s: string) => s.replace(/^\*\*([\s\S]*)\*\*$/, "$1");

function cellLines(tag: "td" | "th", style: string, content: string, ctx: RenderContext, path?: string, extra = ""): string[] {
  const paras = splitParagraphs(content);
  const open = `<${tag}${editAttr(ctx, path)} style="${style}"${extra}>`;
  if (paras.length <= 1) return [`${open}${renderInline(paras[0] ?? "")}</${tag}>`];
  return [open, ...indent(paras.map((p) => `<p>${renderInline(p)}</p>`)), `</${tag}>`];
}

/** A table with one header row (primary = deep purple, secondary = dark amber) and optional row labels. */
export function simpleTableLines(
  headers: string[],
  rows: string[][],
  opts: { variant?: "primary" | "secondary"; rowHeaders?: boolean; widths?: (number | undefined)[]; headerPaths?: (string | undefined)[]; cellPath?: (r: number, c: number) => string | undefined; headerWidth?: number },
  ctx: RenderContext,
): string[] {
  const secondary = opts.variant === "secondary";
  const headBg = secondary ? P.amberDark : P.purple;
  const labelBg = secondary ? P.amberPale : P.lavender;
  const rowHeaders = opts.rowHeaders !== false;
  const headerCells = headers.map((h, i) => {
    const w = opts.widths?.[i] === undefined ? "" : ` width: ${pct(opts.widths[i]!)};`;
    return `<th${editAttr(ctx, opts.headerPaths?.[i])} style="padding: 11px; text-align: left;${w} border: 1px solid ${P.border};" scope="col">${renderInline(h)}</th>`;
  });
  return [
    '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
    ...indent([
      "<thead>",
      ...indent([`<tr style="background: ${headBg}; color: #ffffff;">`, ...indent(headerCells), "</tr>"]),
      "</thead>",
      "<tbody>",
      ...indent(
        rows.flatMap((row, r) => [
          "<tr>",
          ...indent(
            row.flatMap((cell, c) =>
              c === 0 && rowHeaders
                ? cellLines("th", `padding: 11px; background: ${labelBg}; text-align: left; border: 1px solid ${P.border};`, stripBold(cell), ctx, opts.cellPath?.(r, c), ' scope="row"')
                : cellLines("td", CELL, cell, ctx, opts.cellPath?.(r, c)),
            ),
          ),
          "</tr>",
        ]),
      ),
      "</tbody>",
    ]),
    "</table>",
  ];
}
```

Note the `scope="row"` attribute order: the golden test expects `style="…" scope="row"` — `cellLines` appends `extra` after the style, which matches.

Continue the file with list/citation/figure/child helpers and the block switch:

```ts
function listLines(items: string[], ordered: boolean, ctx: RenderContext, itemsPath?: string, style?: string): string[] {
  const tag = ordered ? "ol" : "ul";
  return [`<${tag}${style ? ` style="${style}"` : ""}>`, ...indent(items.map((i, idx) => `<li${editAttr(ctx, join(itemsPath, idx))}>${renderInline(i)}</li>`)), `</${tag}>`];
}

function citationLines(text: string, ctx: RenderContext, path?: string): string[] {
  return [`<p style="text-align: center;"><span style="${CITE_SPAN}"${editAttr(ctx, path)}>${renderInline(text)}</span></p>`];
}

export function withAlt(tag: string, alt: string): string {
  const match = tag.match(/\salt="([^"]*)"/);
  const current = (match?.[1] ?? "").trim();
  const replaceable = current === "" || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(current);
  if (!replaceable) return tag;
  const attr = ` alt="${escapeAttr(alt)}"`;
  return match ? tag.replace(match[0], attr) : tag.replace(/^<img/i, `<img${attr}`);
}

export function figureLines(block: FigureBlock, ctx: RenderContext, path?: string): string[] {
  const image = ctx.images[block.ref];
  const lines = image?.canvas_tag
    ? [`<p style="text-align: center;">${withAlt(image.canvas_tag, block.alt)}</p>`]
    : [`<p style="${PLACEHOLDER_STYLE}">[ IMAGE ${escapeText(block.ref)}: ${renderInline(block.alt)}${image?.location ? `, ${escapeText(image.location)}` : ""} &mdash; delete this line and insert from Canvas Files ]</p>`];
  if (block.caption) lines.push(...citationLines(block.caption, ctx, join(path, "caption")));
  return lines;
}

export function flowRowLines(flow: FlowBlock, ctx: RenderContext, path?: string): string[] {
  const items = flow.steps.flatMap((s, i) => {
    const stepPath = join(join(path, "steps"), i);
    const sub = s.sub ? `<br /><span${editAttr(ctx, join(stepPath, "sub"))} style="font-size: 0.9em;">${renderInline(s.sub)}</span>` : "";
    const step = `<div style="${STEP_STYLE[s.style] ?? STEP_STYLE.outline}"><strong${editAttr(ctx, join(stepPath, "label"))}>${renderInline(s.label)}</strong>${sub}</div>`;
    return i === 0 ? [step] : [ARROW, step];
  });
  return ['<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; text-align: center;">', ...indent(items), "</div>"];
}

/** Title-led callout: body-only → single line; with items → title paragraph, optional body paragraph, list. */
function titledCallout(style: string, title: string, titleColor: string | undefined, ctx: RenderContext, path: string | undefined, opts: { titlePath?: string; body?: string; items?: string[] }): string[] {
  const strong = `<strong${editAttr(ctx, opts.titlePath)}${titleColor ? ` style="color: ${titleColor};"` : ""}>${renderInline(title)}</strong>`;
  const bodyHtml = opts.body !== undefined ? editSpan(ctx, join(path, "body"), renderInline(opts.body)) : "";
  if (!opts.items?.length) return [`<div style="${style}"><p style="margin: 0;">${strong}${bodyHtml ? ` ${bodyHtml}` : ""}</p></div>`];
  return [
    `<div style="${style}">`,
    ...indent([
      `<p style="margin: 0 0 8px 0;">${strong}</p>`,
      ...(opts.body ? [`<p style="margin: 0 0 8px 0;">${bodyHtml}</p>`] : []),
      ...listLines(opts.items, false, ctx, join(path, "items"), LIST_IN_CALLOUT),
    ]),
    "</div>",
  ];
}

function childLines(child: EvidenceChild, ctx: RenderContext, path?: string): string[] {
  switch (child.type) {
    case "paragraph":
      return [`<p${editAttr(ctx, join(path, "text"))}>${renderInline(child.text)}</p>`];
    case "list":
      return listLines(child.items, false, ctx, join(path, "items"), LIST_IN_CALLOUT);
    case "figure":
      return figureLines(child, ctx, path);
    case "citation":
      return citationLines(child.text, ctx, join(path, "text"));
    case "references":
      return [
        '<p style="margin-bottom: 4px;"><span style="text-decoration: underline;">References:</span></p>',
        ...child.items.map((i, idx) => `<p style="margin: 4px 0;"><span style="${CITE_SPAN}"${editAttr(ctx, join(join(path, "items"), idx))}>${renderInline(i)}</span></p>`),
      ];
  }
}

/** Blocks for a tab or accordion panel, with spacer paragraphs per spec §5. */
export function contentLines(blocks: Block[], ctx: RenderContext, basePath?: string): string[] {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    if (i > 0 && (MAJOR.has(b.type) || MAJOR.has(blocks[i - 1].type))) out.push(SPACER);
    out.push(...blockLines(b, ctx, join(basePath, i)));
  });
  out.push(SPACER);
  return out;
}

export function blockLines(block: Block, ctx: RenderContext, path?: string): string[] {
  switch (block.type) {
    case "heading":
      return [`<h4${editAttr(ctx, join(path, "text"))} style="color: ${P.purple};">${renderInline(block.text)}</h4>`];
    case "paragraph":
      return [`<p${editAttr(ctx, join(path, "text"))}>${renderInline(block.text)}</p>`];
    case "list":
      return listLines(block.items, block.ordered, ctx, join(path, "items"));
    case "table": {
      const widths = block.col_widths && block.col_widths.length === block.headers.length ? block.col_widths : undefined;
      return simpleTableLines(block.headers, block.rows, {
        variant: block.variant,
        rowHeaders: block.row_headers,
        widths,
        headerPaths: block.headers.map((_, i) => join(join(path, "headers"), i)),
        cellPath: (r, c) => join(join(join(path, "rows"), r), c),
      }, ctx);
    }
    case "contrast_table": {
      const head = (text: string, bg: string, key: string) =>
        `<th${editAttr(ctx, join(path, key))} style="padding: 11px; text-align: left; width: 50%; background: ${bg}; color: #ffffff; border: 1px solid ${P.border};" scope="col">${renderInline(text)}</th>`;
      return [
        '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
        ...indent([
          "<thead>",
          ...indent(["<tr>", ...indent([head(block.left_header, P.purple, "left_header"), head(block.right_header, P.amberDark, "right_header")]), "</tr>"]),
          "</thead>",
          "<tbody>",
          ...indent(block.rows.flatMap((row, r) => ["<tr>", ...indent(row.flatMap((cell, c) => cellLines("td", CELL, cell, ctx, join(join(join(path, "rows"), r), c)))), "</tr>"])),
          "</tbody>",
        ]),
        "</table>",
      ];
    }
    case "flow":
      return ['<div style="margin: 24px 0;">', ...indent(flowRowLines(block, ctx, path)), "</div>"];
    case "formula":
      return [
        `<div style="margin: 18px auto; padding: 16px; max-width: 440px; text-align: center; background: ${P.lavender}; border-radius: 8px; border: 1px solid ${P.lavenderBorder};">`,
        ...indent([
          `<p style="margin: 0; font-size: 1.25em;"><strong${editAttr(ctx, join(path, "expression"))}>${renderInline(block.expression)}</strong></p>`,
          ...(block.note ? [`<p${editAttr(ctx, join(path, "note"))} style="margin: 6px 0 0 0; font-size: 0.9em; color: ${P.muted};">${renderInline(block.note)}</p>`] : []),
        ]),
        "</div>",
      ];
    case "key_point": {
      const lead = block.lead !== undefined ? `<strong>${editSpan(ctx, join(path, "lead"), renderInline(block.lead))}</strong> ` : "";
      return [`<div style="${lr(P.purple, P.lavender)}"><p style="margin: 0;">${lead}${editSpan(ctx, join(path, "text"), renderInline(block.text))}</p></div>`];
    }
    case "clinical":
      return titledCallout(lr(P.amber, P.amberPale), "Why this matters clinically:", undefined, ctx, path, { body: block.body });
    case "caution":
      return titledCallout(box(P.amber, P.amberPale), block.title, undefined, ctx, path, { titlePath: join(path, "title"), body: block.body, items: block.items });
    case "critical":
      return titledCallout(lr(P.red, P.redPale), block.title ?? "Critical safety warning", P.redDark, ctx, path, {
        titlePath: block.title !== undefined ? join(path, "title") : undefined, body: block.body, items: block.items,
      });
    case "tip":
      return titledCallout(lr(P.blue, P.bluePale), "Pharmacist tip:", P.blueDark, ctx, path, { body: block.body });
    case "counselling":
      return titledCallout(box(P.lavenderBorder, P.lavender, 1), block.title ?? "Counselling points", P.purple, ctx, path, {
        titlePath: block.title !== undefined ? join(path, "title") : undefined, items: block.items,
      });
    case "evidence": {
      const title = block.title.replace(/^evidence:\s*/i, "");
      return [
        `<div style="${box(P.blueBorder, P.bluePale)}">`,
        ...indent([
          `<p style="margin: 0 0 8px 0;"><strong style="color: ${P.blueDark};">Evidence: ${editSpan(ctx, join(path, "title"), renderInline(title))}</strong></p>`,
          ...block.children.flatMap((c, i) => childLines(c, ctx, join(join(path, "children"), i))),
        ]),
        "</div>",
      ];
    }
    case "citation":
      return citationLines(block.text, ctx, join(path, "text"));
    case "link": {
      const lead = block.lead_in.trim();
      const prefix = lead ? `${editSpan(ctx, join(path, "lead_in"), renderInline(lead))}${lead.endsWith(":") ? " " : ": "}` : "";
      const textPath = join(path, "link_text");
      const body = /^https?:\/\//.test(block.url)
        ? `<a href="${escapeAttr(block.url)}"${editAttr(ctx, textPath)} target="_blank" rel="noopener">${renderInline(block.link_text)}</a>`
        : editSpan(ctx, textPath, renderInline(block.link_text));
      return [`<div style="${box(P.blueBorder, P.bluePale)}"><p style="margin: 0;">${prefix}${body}</p></div>`];
    }
    case "figure":
      return figureLines(block, ctx, path);
    case "takeaways":
      return [
        `<div style="border: 1px solid ${P.lavenderBorder}; border-radius: 8px; margin: 16px 0; overflow: hidden;">`,
        ...indent([
          `<div style="background: ${P.purple}; color: #ffffff; padding: 8px 16px; font-weight: bold;">Key takeaways</div>`,
          ...listLines(block.items, false, ctx, join(path, "items"), "margin: 12px 16px 12px 0; padding-left: 40px;"),
        ]),
        "</div>",
      ];
    case "self_check":
      return [
        `<div style="${lr(P.violet, P.lavender)}">`,
        ...indent([
          `<p style="margin: 0 0 8px 0;"><strong style="color: ${P.purple};">Check your understanding</strong></p>`,
          ...block.questions.flatMap((q, i) => [
            `<p style="margin: 10px 0 4px 0;"><strong>${i + 1}.</strong> ${editSpan(ctx, join(join(join(path, "questions"), i), "question"), renderInline(q.question))}</p>`,
            "<details>",
            ...indent([
              `<summary style="cursor: pointer; color: ${P.purple};">Show answer</summary>`,
              `<p${editAttr(ctx, join(join(join(path, "questions"), i), "answer"))} style="margin: 6px 0 0 0;">${renderInline(q.answer)}</p>`,
            ]),
            "</details>",
          ]),
        ]),
        "</div>",
      ];
    case "accordion":
      return [
        '<div class="dp-panels-wrapper dp-accordion-default">',
        ...indent(
          block.panels.flatMap((panel, i) => [
            '<div class="dp-panel-group">',
            ...indent([
              `<h4 class="dp-panel-heading">${renderInline(panel.title)}</h4>`,
              '<div class="dp-panel-content">',
              ...indent(contentLines(panel.blocks, ctx, join(join(join(path, "panels"), i), "blocks"))),
              "</div>",
            ]),
            "</div>",
          ]),
        ),
        "</div>",
      ];
  }
}
```

(The figure golden test above builds its expected string with `&mdash;`; adjust that test literal to contain `&mdash;` directly instead of the `.replace(...)` if preferred.)

- [ ] **Step 4: Run** — `npm test` (renderPage/editing tests that depend on old output will fail until Tasks 6–7; it is acceptable for `renderPage.test.ts` and `editingContract.test.ts` to fail at this point — note them in the report) and `npm run build` (must pass).

- [ ] **Step 5: Commit** — `git commit -am "feat(frontend): PHAR3004 block templates with flow, formula, key point, accordion and spacing"`

---

### Task 6: Page renderer — intro panel, numbered tabs, Study materials tab, Revision check

**Files:**
- Rewrite: `frontend/src/render/renderPage.ts`
- Create: `frontend/src/render/studyMaterials.ts`
- Rewrite: `frontend/src/render/renderPage.test.ts`
- Create: `frontend/src/render/studyMaterials.test.ts`

**Interfaces:**
- Consumes: Task 5 exports.
- Produces: `TABS_CLASS = "dp-panels-wrapper dp-tabs-buttons-vertical"`, `buildContext(images, embeds, editable=false)` (unchanged), `renderPage(page: Page, ctx): string`; `studyMaterialsContentLines(page: Page, ctx): string[]` (content including spacers), `safeUrl(url?: string): string | undefined`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/render/studyMaterials.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { buildContext } from "./renderPage";
import { safeUrl, studyMaterialsContentLines } from "./studyMaterials";

const base: Page = { title: "T", intro: [], tabs: [], revision: { include: false }, notes: [] };
const ctx = buildContext([], []);
const html = (p: Partial<Page>) => studyMaterialsContentLines({ ...base, ...p }, ctx).join("\n");

describe("safeUrl", () => {
  it("accepts http(s) only", () => {
    expect(safeUrl(" https://x.org/a ")).toBe("https://x.org/a");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("www.example.com")).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});

describe("study materials tab", () => {
  it("all placeholders when nothing supplied", () => {
    const h = html({});
    expect(h).toContain(">Handout</h4>");
    expect(h).toContain("[Add handout link]");
    expect(h).toContain(">Recordings</h4>");
    expect(h).toContain('<tr style="background: #b45309; color: #ffffff;">');
    expect(h).toContain(">Part 1</th>");
    expect(h).toContain("[Add recording link]");
    expect(h).toContain("[Add transcript link]");
    expect(h).toContain('<h4 class="dp-panel-heading">Additional resources</h4>');
    expect(h).toContain("[Add additional resources]");
    expect(h).not.toContain("What to do");
    expect(h.trimEnd().endsWith("<p>&nbsp;</p>")).toBe(true);
  });

  it("handout button, label-only placeholder and recordings with links", () => {
    const withUrl = html({ study: { handout: { label: "PK handout", url: "https://learn/x?wrap=1" }, recordings: [], resources: [] } });
    expect(withUrl).toContain('<a href="https://learn/x?wrap=1" target="_blank" rel="noopener" style="display: inline-block; padding: 10px 16px; background: #140f50; color: #ffffff; text-decoration: none; border-radius: 999px;">PK handout</a>');
    const labelOnly = html({ study: { handout: { label: 'Bad" onclick="x', url: "javascript:1" }, recordings: [], resources: [] } });
    expect(labelOnly).toContain("[Handout: Bad&quot; onclick=&quot;x &mdash; insert the Canvas file link]");
    expect(labelOnly).not.toContain("javascript:");
    const rec = html({ study: { recordings: [{ title: "General concepts", recording_url: "https://panopto/1" }, { title: "First-order", transcript_url: "https://learn/t2" }], resources: [] } });
    expect(rec).toContain('<a href="https://panopto/1" target="_blank" rel="noopener">General concepts</a>');
    expect(rec).toContain("First-order [Add recording link]");
    expect(rec).toContain('<a href="https://learn/t2" target="_blank" rel="noopener">Part 2 transcript</a>');
  });

  it("activities table only when supplied, resources as links", () => {
    const h = html({ study_activities: [{ task: "Watch the recordings", purpose: "Framework" }], study: { recordings: [], resources: [{ title: "ICP", url: "http://www.icp.org.nz/" }, { title: "No link" }] } });
    expect(h).toContain(">What to do</th>");
    expect(h).toContain("<strong>Watch the recordings</strong>");
    expect(h).toContain('<p><a href="http://www.icp.org.nz/" target="_blank" rel="noopener">ICP</a></p>');
    expect(h).toContain("<p>No link</p>");
  });
});
```

`frontend/src/render/renderPage.test.ts` (replace):

```ts
import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { buildContext, renderPage } from "./renderPage";

const page: Page = {
  title: "Chronic pain",
  intro: ["Para one.", "Para two."],
  tabs: [
    { id: "t1", title: "Overview", blocks: [{ type: "paragraph", text: "Body." }] },
    { id: "t2", title: "Management", blocks: [{ type: "takeaways", items: ["Legacy"] }] },
  ],
  revision: { include: false, points: ["Explain A.", "Explain B."], flow_title: "Direction", flow: { type: "flow", steps: [{ label: "CL", style: "solid" }, { label: "k", style: "amber" }] } },
  notes: [],
};
const ctx = buildContext([], [{ ref: "EMBED-01", html: '<iframe src="https://h5p/1"></iframe>' }]);

describe("renderPage", () => {
  it("skeleton: wrapper, intro panel, spacer, button tabs numbered, study tab last, spacer", () => {
    const lines = renderPage(page, ctx).split("\n");
    expect(lines[0]).toBe('<div id="dp-wrapper" class="dp-wrapper" style="color: #1f2937;">');
    expect(lines[1]).toBe('    <table style="width: 100%; border-collapse: separate; margin: 0px 0px 28px; background: #f4f2fb; border-radius: 12px; border: 1px solid #ddd8ef;" role="presentation">');
    const html = lines.join("\n");
    expect(html).toContain('<h2 style="margin: 0 0 14px 0; color: #140f50;">Chronic pain</h2>');
    expect(html).toContain('<p style="margin: 0 0 12px 0;">Para one.</p>');
    expect(html).toContain('<p style="margin: 0;">Para two.</p>');
    expect(html).toContain("[ IMAGE: placeholder &mdash; delete this line and insert from Canvas Files ]");
    expect(html).toContain('    <div class="dp-panels-wrapper dp-tabs-buttons-vertical">');
    expect(html).toContain('<h3 class="dp-panel-heading">1. Overview</h3>');
    expect(html).toContain('<h3 class="dp-panel-heading">2. Management</h3>');
    expect(html).toContain('<h3 class="dp-panel-heading">3. Study materials</h3>');
    expect(html).toContain("Key takeaways");
    expect(html.indexOf("</table>")).toBeLessThan(html.indexOf("    <p>&nbsp;</p>\n    <div class=\"dp-panels-wrapper"));
  });

  it("revision check with points and flow", () => {
    const html = renderPage(page, ctx);
    expect(html).toContain('<h2 style="margin: 0 0 8px 0; color: #140f50;">Revision check</h2>');
    expect(html).toContain('<td style="width: 44px; padding: 12px; text-align: center; color: #d97706; border: 1px solid #cbd5e1;">1</td>');
    expect(html).toContain("<strong>Direction</strong>");
    expect(html).not.toContain("[PASTE H5P EMBED HERE]");
    expect(html.trimEnd().endsWith("</div>")).toBe(true);
  });

  it("revision slot with embed when requested, no revision when nothing to show", () => {
    const withEmbed = renderPage({ ...page, revision: { include: true, embed_ref: "EMBED-01" } }, ctx);
    expect(withEmbed).toContain('<iframe src="https://h5p/1"></iframe>');
    expect(withEmbed).not.toContain('color: #d97706; border: 1px solid #cbd5e1;">1</td>');
    const none = renderPage({ ...page, revision: { include: false } }, ctx);
    expect(none).not.toContain("Revision check");
    expect(none).not.toContain("<hr");
  });

  it("legacy page without new fields renders", () => {
    const legacy = { title: "Old", intro: ["x"], tabs: [{ id: "t1", title: "A", blocks: [{ type: "takeaways", items: ["y"] }] }], revision: { include: true }, notes: [] } as Page;
    const html = renderPage(legacy, buildContext([], []));
    expect(html).toContain("2. Study materials");
    expect(html).toContain("[PASTE H5P EMBED HERE]");
  });

  it("editable mode marks intro paragraphs and revision points, never spacers", () => {
    const html = renderPage(page, buildContext([], [], true));
    expect(html).toContain('data-edit="intro.0"');
    expect(html).toContain('data-edit="revision.points.1"');
    expect(html).not.toMatch(/<p data-edit="[^"]*">&nbsp;<\/p>/);
  });
});
```

- [ ] **Step 2: Run** — `npm test -- src/render/renderPage.test.ts src/render/studyMaterials.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`frontend/src/render/studyMaterials.ts`:

```ts
import type { Page } from "../types/page";
import { escapeAttr, escapeText, renderInline } from "./inline";
import { indent, PALETTE as P, simpleTableLines, SPACER, type RenderContext } from "./templates";

export function safeUrl(url?: string): string | undefined {
  const u = url?.trim();
  return u && /^https?:\/\//i.test(u) ? u : undefined;
}

const link = (url: string, text: string) => `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${text}</a>`;
const DASHED = `display: inline-block; padding: 10px 16px; border: 2px dashed ${P.lavenderBorder}; color: ${P.purple}; border-radius: 999px;`;

export function studyMaterialsContentLines(page: Page, ctx: RenderContext): string[] {
  const study = page.study ?? { recordings: [], resources: [] };
  const out: string[] = [];

  const activities = page.study_activities ?? [];
  if (activities.length) {
    const edit = (path: string) => (ctx.editable ? ` data-edit="${escapeAttr(path)}"` : "");
    out.push(
      '<table style="width: 100%; border-collapse: collapse; margin: 8px 0 24px 0;">',
      ...indent([
        "<thead>",
        ...indent([`<tr style="background: ${P.purple}; color: #ffffff;">`, ...indent([
          `<th style="padding: 11px; text-align: left; border: 1px solid ${P.border};" scope="col">What to do</th>`,
          `<th style="padding: 11px; text-align: left; border: 1px solid ${P.border};" scope="col">Purpose</th>`,
        ]), "</tr>"]),
        "</thead>",
        "<tbody>",
        ...indent(activities.flatMap((a, i) => ["<tr>", ...indent([
          `<td style="padding: 11px; border: 1px solid ${P.border};"><strong${edit(`study_activities.${i}.task`)}>${renderInline(a.task)}</strong></td>`,
          `<td${edit(`study_activities.${i}.purpose`)} style="padding: 11px; border: 1px solid ${P.border};">${renderInline(a.purpose)}</td>`,
        ]), "</tr>"])),
        "</tbody>",
      ]),
      "</table>",
      SPACER,
    );
  }

  out.push(`<h4 style="color: ${P.purple}; margin-top: 22px;">Handout</h4>`);
  const handoutUrl = safeUrl(study.handout?.url);
  const label = study.handout?.label?.trim();
  if (handoutUrl) {
    out.push(`<p><a href="${escapeAttr(handoutUrl)}" target="_blank" rel="noopener" style="display: inline-block; padding: 10px 16px; background: ${P.purple}; color: #ffffff; text-decoration: none; border-radius: 999px;">${escapeText(label || "Handout")}</a></p>`);
  } else if (label) {
    out.push(`<p style="${DASHED}">[Handout: ${escapeText(label)} &mdash; insert the Canvas file link]</p>`);
  } else {
    out.push(`<p style="${DASHED}">[Add handout link]</p>`);
  }
  out.push(SPACER);

  out.push(`<h4 style="color: ${P.purple}; margin-top: 26px;">Recordings</h4>`);
  const recordings = study.recordings.length ? study.recordings : [{}];
  const rows = recordings.map((r: { part?: string; title?: string; recording_url?: string; transcript_url?: string }, i) => {
    const part = r.part?.trim() || `Part ${i + 1}`;
    const title = r.title?.trim();
    const recUrl = safeUrl(r.recording_url);
    const trUrl = safeUrl(r.transcript_url);
    const recording = recUrl ? link(recUrl, escapeText(title || "Recording")) : `${title ? `${escapeText(title)} ` : ""}[Add recording link]`;
    const transcript = trUrl ? link(trUrl, escapeText(`${part} transcript`)) : "[Add transcript link]";
    return { part: escapeText(part), recording, transcript };
  });
  out.push(
    '<table style="width: 100%; border-collapse: collapse; margin: 10px 0 22px 0;">',
    ...indent([
      "<thead>",
      ...indent([`<tr style="background: ${P.amberDark}; color: #ffffff;">`, ...indent(["Part", "Recording", "Transcript"].map((h) => `<th style="padding: 11px; text-align: left; border: 1px solid ${P.border};" scope="col">${h}</th>`)), "</tr>"]),
      "</thead>",
      "<tbody>",
      ...indent(rows.flatMap((r) => ["<tr>", ...indent([
        `<th style="padding: 11px; background: ${P.lavender}; text-align: left; border: 1px solid ${P.border};" scope="row">${r.part}</th>`,
        `<td style="padding: 11px; border: 1px solid ${P.border};">${r.recording}</td>`,
        `<td style="padding: 11px; border: 1px solid ${P.border};">${r.transcript}</td>`,
      ]), "</tr>"])),
      "</tbody>",
    ]),
    "</table>",
    SPACER,
  );

  const resources = study.resources.length
    ? study.resources.map((res) => {
        const url = safeUrl(res.url);
        return `<p>${url ? link(url, escapeText(res.title)) : escapeText(res.title)}</p>`;
      })
    : ["<p>[Add additional resources]</p>"];
  out.push(
    '<div class="dp-panels-wrapper dp-accordion-default">',
    ...indent(['<div class="dp-panel-group">', ...indent(['<h4 class="dp-panel-heading">Additional resources</h4>', '<div class="dp-panel-content">', ...indent([...resources, SPACER]), "</div>"]), "</div>"]),
    "</div>",
    SPACER,
  );
  void simpleTableLines; // shared helper available for future study tables
  return out;
}
```

(Remove the `void simpleTableLines` line and its import if your linter/tsc flags it unused — it is not needed.)

`frontend/src/render/renderPage.ts`:

```ts
import type { EmbedInfo, ImageInfo } from "../types/api";
import type { Page, Tab } from "../types/page";
import { escapeAttr, renderInline } from "./inline";
import { studyMaterialsContentLines } from "./studyMaterials";
import { contentLines, figureLines, flowRowLines, indent, PALETTE as P, PLACEHOLDER_STYLE, SPACER, type RenderContext } from "./templates";

export const TABS_CLASS = "dp-panels-wrapper dp-tabs-buttons-vertical";

export function buildContext(images: ImageInfo[], embeds: EmbedInfo[], editable = false): RenderContext {
  return { images: Object.fromEntries(images.map((i) => [i.ref, i])), embeds: Object.fromEntries(embeds.map((e) => [e.ref, e.html])), editable };
}

const edit = (ctx: RenderContext, path: string) => (ctx.editable ? ` data-edit="${escapeAttr(path)}"` : "");

function introLines(page: Page, ctx: RenderContext): string[] {
  const paras = page.intro.map((p, i) => {
    const margin = i === page.intro.length - 1 ? "margin: 0;" : "margin: 0 0 12px 0;";
    return `<p${edit(ctx, `intro.${i}`)} style="${margin}">${renderInline(p)}</p>`;
  });
  const figure = page.intro_figure
    ? figureLines(page.intro_figure, ctx, "intro_figure")
    : [`<p style="${PLACEHOLDER_STYLE}">[ IMAGE: placeholder &mdash; delete this line and insert from Canvas Files ]</p>`];
  return [
    `<table style="width: 100%; border-collapse: separate; margin: 0px 0px 28px; background: ${P.lavender}; border-radius: 12px; border: 1px solid ${P.lavenderBorder};" role="presentation">`,
    ...indent(["<tbody>", ...indent(["<tr>", ...indent([
      '<td style="width: 58%; vertical-align: middle; padding: 26px 30px;">',
      ...indent([`<h2 style="margin: 0 0 14px 0; color: ${P.purple};">${renderInline(page.title)}</h2>`, ...paras]),
      "</td>",
      '<td style="width: 42%; vertical-align: middle; text-align: center; padding: 20px;">',
      ...indent(figure),
      "</td>",
    ]), "</tr>"]), "</tbody>"]),
    "</table>",
  ];
}

function groupLines(title: string, content: string[]): string[] {
  return ['<div class="dp-panel-group">', ...indent([`<h3 class="dp-panel-heading">${title}</h3>`, '<div class="dp-panel-content">', ...indent(content), "</div>"]), "</div>"];
}

function tabLines(tab: Tab, ctx: RenderContext, i: number): string[] {
  return groupLines(`${i + 1}. ${renderInline(tab.title)}`, contentLines(tab.blocks, ctx, `tabs.${i}.blocks`));
}

function revisionLines(page: Page, ctx: RenderContext): string[] {
  const rev = page.revision;
  const embed = rev.embed_ref ? ctx.embeds[rev.embed_ref] : undefined;
  const points = rev.points ?? [];
  const inner: string[] = [
    `<h2 style="margin: 0 0 8px 0; color: ${P.purple};">Revision check</h2>`,
    `<p style="margin: 0 0 18px 0;">Before moving on, check that these ideas can be <strong>explained</strong>, rather than simply recalled.</p>`,
  ];
  if (points.length) {
    inner.push(
      '<table style="width: 100%; border-collapse: collapse; background: #ffffff;">',
      ...indent(["<tbody>", ...indent(points.flatMap((pt, i) => ["<tr>", ...indent([
        `<td style="width: 44px; padding: 12px; text-align: center; color: ${P.amber}; border: 1px solid ${P.border};">${i + 1}</td>`,
        `<td${edit(ctx, `revision.points.${i}`)} style="padding: 12px; border: 1px solid ${P.border};">${renderInline(pt)}</td>`,
      ]), "</tr>"])), "</tbody>"]),
      "</table>",
    );
  }
  if (rev.flow && rev.flow.steps.length >= 2) {
    inner.push(
      `<div style="margin: 20px 0px 0px; padding: 16px; background: #ffffff; border-radius: 8px; border: 1px solid ${P.border};">`,
      ...indent([
        ...(rev.flow_title ? [`<p style="margin: 0 0 10px 0;"><strong${edit(ctx, "revision.flow_title")}>${renderInline(rev.flow_title)}</strong></p>`] : []),
        ...flowRowLines(rev.flow, ctx, "revision.flow"),
      ]),
      "</div>",
    );
  }
  if (rev.include || embed) {
    inner.push(
      `<div style="margin: 20px 0px 0px; padding: 16px; background: #ffffff; border-radius: 8px; border: 2px dashed ${P.lavenderBorder}; text-align: center;">`,
      ...indent([`<p style="margin: 0 0 10px 0; color: ${P.purple};"><strong>Interactive questions</strong></p>`, `<p style="margin: 0; color: ${P.muted};">${embed ?? "[PASTE H5P EMBED HERE]"}</p>`]),
      "</div>",
    );
  }
  return [
    `<hr style="border-width: 2px 0px 0px; border-style: solid none none; border-color: ${P.lavenderBorder}; margin: 34px 0px 28px;" />`,
    `<div style="padding: 24px 26px; background: ${P.lavender}; border-top: 5px solid ${P.purple}; border-radius: 10px;">`,
    ...indent(inner),
    "</div>",
    SPACER,
  ];
}

export function renderPage(page: Page, ctx: RenderContext): string {
  const tabs = [
    ...page.tabs.flatMap((t, i) => tabLines(t, ctx, i)),
    ...groupLines(`${page.tabs.length + 1}. Study materials`, studyMaterialsContentLines(page, ctx)),
  ];
  const showRevision = (page.revision.points?.length ?? 0) > 0 || page.revision.include || !!page.revision.embed_ref;
  const lines = [
    '<div id="dp-wrapper" class="dp-wrapper" style="color: #1f2937;">',
    ...indent([...introLines(page, ctx), SPACER, `<div class="${TABS_CLASS}">`, ...indent(tabs), "</div>", SPACER, ...(showRevision ? revisionLines(page, ctx) : [])]),
    "</div>",
  ];
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Run** — `npm test` (only `editingContract.test.ts` may still fail — Task 7) and `npm run build`.

- [ ] **Step 5: Commit** — `git commit -am "feat(frontend): PHAR3004 page skeleton, study materials tab and revision check"`

---

### Task 7: Editing contract and import validation for new fields

**Files:**
- Modify: `frontend/src/render/editingContract.test.ts`, `frontend/src/storage/exchange.ts`, `frontend/src/storage/exchange.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces: `parseImportedPage` keeps `intro_figure`, `study_activities`, `study`, and `revision.points/flow_title/flow` when well-formed.

- [ ] **Step 1: Write the failing tests**

In `editingContract.test.ts`, extend the "every block type" page so its first tab also contains `{type:"key_point", lead:"L", text:"T"}`, a `flow` with 2 steps (one with `sub`), a `formula` with `note`, a secondary table, and an `accordion` with one panel containing a paragraph, a table and a self_check; add `intro_figure` (a canvas image with caption), `study_activities: [{task:"Do", purpose:"Why"}]`, and `revision: {include:false, points:["P1"], flow_title:"Dir", flow:{type:"flow", steps:[{label:"a",style:"solid"},{label:"b",style:"amber"}]}}`. Keep the existing loop that asserts every `data-edit` path resolves via `setAtPath` and round-trips "ZZ" on re-render. Add:

```ts
it("covers the new paths", () => {
  const paths = collectPaths(renderPage(page, buildContext(images, [], true)));  // existing helper in this file
  for (const p of [
    "tabs.0.blocks.0.lead", "tabs.0.blocks.0.text",
    "tabs.0.blocks.1.steps.1.sub", "tabs.0.blocks.2.expression", "tabs.0.blocks.2.note",
    "tabs.0.blocks.4.panels.0.blocks.0.text", "tabs.0.blocks.4.panels.0.blocks.1.rows.0.1",
    "study_activities.0.task", "study_activities.0.purpose", "revision.points.0", "revision.flow_title",
    "revision.flow.steps.1.label", "intro_figure.caption",
  ]) expect(paths).toContain(p);
});
```

(Use the block indices that match the page you build; adjust the literal indices, not the set of fields.)

In `exchange.test.ts` add:

```ts
it("keeps new page fields on import and drops malformed ones", () => {
  const saved = newSavedPage({ page: { title: "T", intro: [], tabs: [], revision: { include: false, points: ["p"], flow_title: "f", flow: { type: "flow", steps: [{ label: "a", style: "solid" }, { label: "b", style: "outline" }] } }, notes: [], intro_figure: { type: "figure", ref: "IMG-01", alt: "x" }, study_activities: [{ task: "t", purpose: "p" }], study: { handout: { label: "H", url: "https://x" }, recordings: [{ title: "R" }], resources: [{ title: "Res" }] } }, sourceText: "", images: [], embeds: [] });
  const back = parseImportedPage(exportPageJson(saved));
  expect(back.page.revision.points).toEqual(["p"]);
  expect(back.page.intro_figure?.ref).toBe("IMG-01");
  expect(back.page.study?.recordings[0].title).toBe("R");
  const broken = JSON.parse(exportPageJson(saved));
  broken.page.page.study = "nope"; broken.page.page.study_activities = [{ task: 1 }]; broken.page.page.intro_figure = { ref: 5 };
  const cleaned = parseImportedPage(JSON.stringify(broken));
  expect(cleaned.page.study).toBeUndefined();
  expect(cleaned.page.study_activities).toBeUndefined();
  expect(cleaned.page.intro_figure).toBeUndefined();
});
```

- [ ] **Step 2: Run** — `npm test -- src/render/editingContract.test.ts src/storage/exchange.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `exchange.ts` `validatePage`, after building `notes`, add:

```ts
  const raw = p as Record<string, unknown>;
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const fig = raw.intro_figure;
  const intro_figure = isObj(fig) && typeof fig.ref === "string" && typeof fig.alt === "string" ? (fig as unknown as Page["intro_figure"]) : undefined;
  const acts = raw.study_activities;
  const study_activities = Array.isArray(acts) && acts.every((a) => isObj(a) && typeof a.task === "string" && typeof a.purpose === "string")
    ? (acts as Page["study_activities"]) : undefined;
  const st = raw.study;
  const study = isObj(st) && Array.isArray(st.recordings) && Array.isArray(st.resources) ? (st as unknown as Page["study"]) : undefined;
```

and return `{ title, intro, tabs, revision, notes, ...(intro_figure && { intro_figure }), ...(study_activities && { study_activities }), ...(study && { study }) }` (keep the existing revision fallback; `revision.points/flow` pass through as part of `revision`).

- [ ] **Step 4: Run** — `npm test` (all green) and `npm run build`.

- [ ] **Step 5: Commit** — `git commit -am "test(frontend): editing contract and import validation for PHAR3004 fields"`

---

### Task 8: Preview — button tabs and accordions

**Files:**
- Modify: `frontend/src/render/preview.css`, `frontend/src/components/editor/CanvasPreview.tsx`
- Test: `frontend/src/components/editor/CanvasPreview.test.tsx`

**Interfaces:**
- Consumes: Task 6 markup (`.dp-tabs-buttons-vertical > .dp-panel-group`, `.dp-accordion-default > .dp-panel-group`).
- Produces: tab activation limited to top-level tab groups; accordion headings toggle class `is-open` on their group; open accordions survive an external re-render (by index among accordion groups).

- [ ] **Step 1: Write the failing test** — add to `CanvasPreview.test.tsx` (reuse its render helpers):

```tsx
it("tabs ignore accordion groups; accordion headings toggle open", async () => {
  const html = `<div id="dp-wrapper"><div class="dp-panels-wrapper dp-tabs-buttons-vertical">
    <div class="dp-panel-group"><h3 class="dp-panel-heading">1. A</h3><div class="dp-panel-content">
      <div class="dp-panels-wrapper dp-accordion-default"><div class="dp-panel-group"><h4 class="dp-panel-heading">More</h4><div class="dp-panel-content"><p>x</p></div></div></div>
    </div></div>
    <div class="dp-panel-group"><h3 class="dp-panel-heading">2. B</h3><div class="dp-panel-content"><p>y</p></div></div>
  </div></div>`;
  const onSelect = vi.fn();
  const { container } = renderPreview({ html, activeIndex: 1, editable: false, onSelect, onEdit: () => true });
  const tabGroups = container.querySelectorAll(".dp-tabs-buttons-vertical > .dp-panel-group");
  expect(tabGroups[1].classList.contains("is-active")).toBe(true);
  expect(container.querySelector(".dp-accordion-default > .dp-panel-group")!.classList.contains("is-active")).toBe(false);
  (container.querySelectorAll("h3.dp-panel-heading")[1] as HTMLElement).click();
  expect(onSelect).toHaveBeenLastCalledWith(1);
  const accHeading = container.querySelector("h4.dp-panel-heading") as HTMLElement;
  accHeading.click();
  expect(accHeading.parentElement!.classList.contains("is-open")).toBe(true);
  expect(onSelect).toHaveBeenCalledTimes(1);
  accHeading.click();
  expect(accHeading.parentElement!.classList.contains("is-open")).toBe(false);
});
```

(`renderPreview` = the existing helper in this file that mounts `CanvasPreview` with `createRoot` + `act`; if it is named differently, use that name.)

- [ ] **Step 2: Run** — `npm test -- src/components/editor/CanvasPreview.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`CanvasPreview.tsx`:
- Replace the `.dp-panel-group` selector in the `is-active` layout effect and `handleClick` with `.dp-tabs-buttons-vertical > .dp-panel-group`.
- In `handleClick`, before the tab logic: 

```ts
    const group = heading.parentElement;
    if (group?.parentElement?.classList.contains("dp-accordion-default")) {
      group.classList.toggle("is-open");
      return;
    }
```

- In the rebuild branch of the main layout effect, before `container.innerHTML = safe`, record `const openIdx = Array.from(container.querySelectorAll(".dp-accordion-default > .dp-panel-group")).flatMap((g, i) => (g.classList.contains("is-open") ? [i] : []));` and after replacing, re-apply: `const accs = container.querySelectorAll(".dp-accordion-default > .dp-panel-group"); openIdx.forEach((i) => accs[i]?.classList.add("is-open"));`.

`preview.css` — replace the tab rules (`.dp-panels-wrapper` … media query) with:

```css
.canvas-preview .dp-tabs-buttons-vertical {
  display: grid;
  grid-template-columns: minmax(190px, 250px) 1fr;
  grid-auto-rows: min-content;
  column-gap: 24px;
  margin-top: 8px;
}
.canvas-preview .dp-tabs-buttons-vertical > .dp-panel-group { display: contents; }
.canvas-preview .dp-tabs-buttons-vertical > .dp-panel-group > .dp-panel-heading {
  grid-column: 1;
  margin: 0 0 8px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #ddd8ef;
  background: #ffffff;
  color: #140f50;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}
.canvas-preview .dp-tabs-buttons-vertical > .dp-panel-group > .dp-panel-heading:hover { background: #f4f2fb; }
.canvas-preview .dp-tabs-buttons-vertical > .dp-panel-group.is-active > .dp-panel-heading { background: #140f50; border-color: #140f50; color: #ffffff; }
.canvas-preview .dp-tabs-buttons-vertical > .dp-panel-group > .dp-panel-content { display: none; }
.canvas-preview .dp-tabs-buttons-vertical > .dp-panel-group.is-active > .dp-panel-content { display: block; grid-column: 2; grid-row: 1 / span 50; }

.canvas-preview .dp-accordion-default { margin: 16px 0; border: 1px solid #ddd8ef; border-radius: 8px; overflow: hidden; }
.canvas-preview .dp-accordion-default > .dp-panel-group + .dp-panel-group { border-top: 1px solid #ddd8ef; }
.canvas-preview .dp-accordion-default > .dp-panel-group > .dp-panel-heading {
  margin: 0; padding: 10px 14px; background: #f4f2fb; color: #140f50; font-size: 1rem; font-weight: 700; cursor: pointer;
}
.canvas-preview .dp-accordion-default > .dp-panel-group > .dp-panel-heading::before { content: "\25B8  "; }
.canvas-preview .dp-accordion-default > .dp-panel-group.is-open > .dp-panel-heading::before { content: "\25BE  "; }
.canvas-preview .dp-accordion-default > .dp-panel-group > .dp-panel-content { display: none; padding: 4px 16px 8px; }
.canvas-preview .dp-accordion-default > .dp-panel-group.is-open > .dp-panel-content { display: block; }

@media (max-width: 720px) {
  .canvas-preview .dp-tabs-buttons-vertical { grid-template-columns: 1fr; }
  .canvas-preview .dp-tabs-buttons-vertical > .dp-panel-group.is-active > .dp-panel-content { grid-column: 1; grid-row: auto; }
}
```

Also change `.canvas-preview { color: #2d3b45; }` to `color: #1f2937;` and add `.canvas-preview h2 { font-size: 1.6rem; font-weight: 700; } .canvas-preview sub, .canvas-preview sup { font-size: 0.75em; }`. Update the file's header comment to mention button tabs and accordions.

- [ ] **Step 4: Run** — `npm test`, `npm run build`.

- [ ] **Step 5: Commit** — `git commit -am "feat(frontend): preview for button tabs and collapsible accordions"`

---

### Task 9: Course profiles — storage, context text, export/import

**Files:**
- Modify: `frontend/src/storage/db.ts`
- Create: `frontend/src/storage/courses.ts`, `frontend/src/storage/courses.test.ts`

**Interfaces:**
- Produces: `interface Course { id: string; code: string; name: string; level: string; aims: string; outcomes: string; notes: string; outline: string; outlineSource?: string; updatedAt: number }`; in `courses.ts`: `newCourse(partial?: Partial<Course>): Course`, `saveCourse(c): Promise<Course>`, `getCourse(id): Promise<Course|undefined>`, `listCourses(): Promise<Course[]>` (sorted by `code` then `name`), `deleteCourse(id)`, `buildCourseContext(c: Course | undefined): string`, `cleanOutlineText(text: string): string`, `exportCourseJson(c): string`, `parseImportedCourse(json): Course` (throws `Error("This file isn't a course profile.")`); `SavedPage.courseId?: string` in db.ts; db.ts exports `db()` for reuse.

- [ ] **Step 1: Write the failing tests** — `frontend/src/storage/courses.test.ts`:

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildCourseContext, cleanOutlineText, deleteCourse, exportCourseJson, getCourse, listCourses, newCourse, parseImportedCourse, saveCourse } from "./courses";
import { getPage, listPages, newSavedPage, savePage } from "./db";

beforeEach(async () => {
  for (const c of await listCourses()) await deleteCourse(c.id);
});

describe("course profiles", () => {
  it("CRUD and sorting", async () => {
    await saveCourse(newCourse({ code: "PHAR3004", name: "PK" }));
    await saveCourse(newCourse({ code: "PHAR2001", name: "Intro" }));
    const list = await listCourses();
    expect(list.map((c) => c.code)).toEqual(["PHAR2001", "PHAR3004"]);
    expect((await getCourse(list[0].id))?.name).toBe("Intro");
  });

  it("pages store still works alongside courses (v1 → v2 upgrade keeps pages)", async () => {
    const p = await savePage(newSavedPage({ page: { title: "Keep", intro: [], tabs: [], revision: { include: false }, notes: [] }, sourceText: "", images: [], embeds: [] }));
    await saveCourse(newCourse({ code: "X" }));
    expect((await getPage(p.id))?.title).toBe("Keep");
    expect((await listPages()).some((s) => s.id === p.id)).toBe(true);
  });

  it("builds course context, omitting empty sections, truncating the outline first at 12,000 chars", () => {
    expect(buildCourseContext(undefined)).toBe("");
    const ctx = buildCourseContext(newCourse({ code: "PHAR3004", name: "PK", level: "Year 3", outcomes: "CLO1 x", outline: "o".repeat(20000) }));
    expect(ctx.startsWith("Course: PHAR3004 — PK\nYear level: Year 3\nLearning outcomes:\nCLO1 x\nCourse outline (extract):\n")).toBe(true);
    expect(ctx.length).toBe(12000);
    expect(ctx).not.toContain("Course aims:");
  });

  it("cleans extracted outline text", () => {
    expect(cleanOutlineText("=== SOURCE 1: outline.docx ===\n\nAims [IMG-01: page 2]\n\n\n\nOutcomes [EMBED-01]")).toBe("Aims\n\nOutcomes");
  });

  it("export/import round trip with a fresh id; rejects other files", () => {
    const c = newCourse({ code: "A", outcomes: "o" });
    const back = parseImportedCourse(exportCourseJson(c));
    expect(back.code).toBe("A");
    expect(back.id).not.toBe(c.id);
    expect(() => parseImportedCourse('{"format":"pharm-canvas-page"}')).toThrow("This file isn't a course profile.");
    expect(() => parseImportedCourse("nope")).toThrow("This file isn't a course profile.");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- src/storage/courses.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`db.ts`: add `courseId?: string` to `SavedPage`; extend the schema and open v2:

```ts
import type { Course } from "./courses";

interface Schema extends DBSchema {
  pages: { key: string; value: SavedPage };
  courses: { key: string; value: Course };
}

export function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>("pharm-canvas", 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore("pages", { keyPath: "id" });
      if (oldVersion < 2) database.createObjectStore("courses", { keyPath: "id" });
    },
  });
  return dbPromise;
}
```

`courses.ts`:

```ts
import { db } from "./db";

export interface Course {
  id: string; code: string; name: string; level: string; aims: string; outcomes: string; notes: string;
  outline: string; outlineSource?: string; updatedAt: number;
}

const FORMAT = "pharm-canvas-course";
const INVALID = "This file isn't a course profile.";
export const COURSE_CONTEXT_LIMIT = 12000;
export const OUTLINE_LIMIT = 50000;
const FIELDS = ["code", "name", "level", "aims", "outcomes", "notes", "outline"] as const;

export function newCourse(partial: Partial<Course> = {}): Course {
  return { id: crypto.randomUUID(), code: "", name: "", level: "", aims: "", outcomes: "", notes: "", outline: "", updatedAt: Date.now(), ...partial };
}

export async function saveCourse(c: Course): Promise<Course> {
  const next = { ...c, outline: c.outline.slice(0, OUTLINE_LIMIT), updatedAt: Date.now() };
  await (await db()).put("courses", next);
  return next;
}
export async function getCourse(id: string) { return (await db()).get("courses", id); }
export async function deleteCourse(id: string) { await (await db()).delete("courses", id); }
export async function listCourses(): Promise<Course[]> {
  const all = await (await db()).getAll("courses");
  return all.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
}

export function buildCourseContext(c: Course | undefined): string {
  if (!c) return "";
  const head = [
    c.code || c.name ? `Course: ${[c.code, c.name].filter(Boolean).join(" — ")}` : "",
    c.level ? `Year level: ${c.level}` : "",
    c.aims ? `Course aims:\n${c.aims}` : "",
    c.outcomes ? `Learning outcomes:\n${c.outcomes}` : "",
    c.notes ? `Notes on this course/topic:\n${c.notes}` : "",
  ].filter(Boolean).join("\n");
  if (!c.outline) return head.slice(0, COURSE_CONTEXT_LIMIT);
  const prefix = `${head}${head ? "\n" : ""}Course outline (extract):\n`;
  return (prefix + c.outline).slice(0, COURSE_CONTEXT_LIMIT);
}

export function cleanOutlineText(text: string): string {
  return text
    .split("\n").filter((l) => !/^=== SOURCE \d+: .* ===$/.test(l.trim())).join("\n")
    .replace(/\s*\[(IMG|EMBED)-\d+[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, OUTLINE_LIMIT);
}

export function exportCourseJson(c: Course): string {
  return JSON.stringify({ format: FORMAT, version: 1, course: c });
}

export function parseImportedCourse(json: string): Course {
  let data: { format?: string; version?: number; course?: Record<string, unknown> };
  try { data = JSON.parse(json); } catch { throw new Error(INVALID); }
  if (data?.format !== FORMAT || data.version !== 1 || !data.course || typeof data.course !== "object") throw new Error(INVALID);
  const out = newCourse();
  for (const f of FIELDS) {
    const v = data.course[f];
    if (v !== undefined && typeof v !== "string") throw new Error(INVALID);
    if (typeof v === "string") out[f] = f === "outline" ? v.slice(0, OUTLINE_LIMIT) : v;
  }
  if (typeof data.course.outlineSource === "string") out.outlineSource = data.course.outlineSource;
  return out;
}
```

Check the length test: the expected 12,000-char result relies on the outline being long enough; `slice` caps it. If `head` alone ever exceeds the limit it is cut too (acceptable).

- [ ] **Step 4: Run** — `npm test`, `npm run build`.

- [ ] **Step 5: Commit** — `git commit -am "feat(frontend): course profiles in IndexedDB with context building and export/import"`

---

### Task 10: UI — Study materials form, course profiles, Create/Editor wiring

**Files:**
- Create: `frontend/src/components/study/StudyMaterialsForm.tsx`, `frontend/src/components/courses/CourseManagerModal.tsx`, `frontend/src/components/courses/CourseForm.tsx`
- Modify: `frontend/src/pages/CreatePage.tsx`, `frontend/src/pages/EditorPage.tsx`, `frontend/src/api/endpoints.ts` (no change expected; `generatePage`/`regenerateTab` pass the new field through)
- Test: `frontend/src/components/study/StudyMaterialsForm.test.tsx`

**Interfaces:**
- Consumes: `StudyMaterials` (Task 4), course store (Task 9), `extractSources` (existing), `Modal`, `Button`, `IconButton` (existing UI).
- Produces: `StudyMaterialsForm({ value, onChange }: { value: StudyMaterials; onChange: (v: StudyMaterials) => void })`, `emptyStudy(): StudyMaterials`; `CourseManagerModal({ open, onClose, onChanged })`; Create page sends `course_context` and stores `page.study` + `courseId`; Editor has a "Study materials" button and passes `course_context` when regenerating.

- [ ] **Step 1: Write the failing test** — `frontend/src/components/study/StudyMaterialsForm.test.tsx` (jsdom docblock; mount with `createRoot` + `act` like `CanvasPreview.test.tsx`):

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { emptyStudy, StudyMaterialsForm } from "./StudyMaterialsForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(onChange = vi.fn()) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  act(() => createRoot(div).render(<StudyMaterialsForm value={emptyStudy()} onChange={onChange} />));
  return { div, onChange };
}

describe("StudyMaterialsForm", () => {
  it("adds a recording row", () => {
    const { div, onChange } = mount();
    const add = Array.from(div.querySelectorAll("button")).find((b) => b.textContent?.includes("Add recording"))!;
    act(() => add.click());
    expect(onChange).toHaveBeenLastCalledWith({ recordings: [{}], resources: [] });
  });

  it("edits the handout link", () => {
    const { div, onChange } = mount();
    const input = div.querySelector('input[aria-label="Handout link"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "https://learn/x");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith({ handout: { url: "https://learn/x" }, recordings: [], resources: [] });
  });

  it("flags non-http links", () => {
    const div = document.createElement("div");
    act(() => createRoot(div).render(<StudyMaterialsForm value={{ handout: { url: "www.x.com" }, recordings: [], resources: [] }} onChange={() => {}} />));
    expect(div.textContent).toContain("Links must start with https://");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- src/components/study` → FAIL.

- [ ] **Step 3: Implement**

`StudyMaterialsForm.tsx` (labelled inputs, `aria-label`s exactly as used in tests; recordings and resources as repeatable rows with remove buttons; a warning line "Links must start with https:// — this one will show as a placeholder." under any non-empty url failing `/^https?:\/\//i`):

```tsx
import type { StudyMaterials } from "../../types/page";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

export function emptyStudy(): StudyMaterials {
  return { recordings: [], resources: [] };
}

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30";
const isBad = (u?: string) => !!u?.trim() && !/^https?:\/\//i.test(u.trim());
const Warn = ({ url }: { url?: string }) => (isBad(url) ? <p className="mt-1 text-xs text-amber-800">Links must start with https:// — this one will show as a placeholder.</p> : null);

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined)) as T;
}

export function StudyMaterialsForm({ value, onChange }: { value: StudyMaterials; onChange: (v: StudyMaterials) => void }) {
  const set = (patch: Partial<StudyMaterials>) => onChange({ ...value, ...patch });
  const setHandout = (patch: { label?: string; url?: string }) => {
    const handout = clean({ ...value.handout, ...patch });
    const { handout: _drop, ...rest } = value;
    void _drop;
    onChange(Object.keys(handout).length ? { ...rest, handout } : rest);
  };
  const setRecording = (i: number, patch: Record<string, string>) =>
    set({ recordings: value.recordings.map((r, idx) => (idx === i ? clean({ ...r, ...patch }) : r)) });
  const setResource = (i: number, patch: Record<string, string>) =>
    set({ resources: value.resources.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-5 text-sm">
      <fieldset>
        <legend className="font-semibold">Handout</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input aria-label="Handout label" placeholder="e.g. Heart failure handout" className={input} value={value.handout?.label ?? ""} onChange={(e) => setHandout({ label: e.target.value })} />
          <input aria-label="Handout link" placeholder="https://… (Canvas file link)" className={input} value={value.handout?.url ?? ""} onChange={(e) => setHandout({ url: e.target.value })} />
        </div>
        <Warn url={value.handout?.url} />
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Recordings</legend>
        {value.recordings.map((r, i) => (
          <div key={i} className="mt-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-muted">Part {i + 1}</span>
              <IconButton label={`Remove part ${i + 1}`} onClick={() => set({ recordings: value.recordings.filter((_, idx) => idx !== i) })}>✕</IconButton>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input aria-label={`Part ${i + 1} title`} placeholder="Title, e.g. General concepts" className={input} value={r.title ?? ""} onChange={(e) => setRecording(i, { title: e.target.value })} />
              <input aria-label={`Part ${i + 1} recording link`} placeholder="Recording link" className={input} value={r.recording_url ?? ""} onChange={(e) => setRecording(i, { recording_url: e.target.value })} />
              <input aria-label={`Part ${i + 1} transcript link`} placeholder="Transcript link" className={input} value={r.transcript_url ?? ""} onChange={(e) => setRecording(i, { transcript_url: e.target.value })} />
            </div>
            <Warn url={r.recording_url} />
            <Warn url={r.transcript_url} />
          </div>
        ))}
        <Button className="mt-2" variant="ghost" onClick={() => set({ recordings: [...value.recordings, {}] })}>+ Add recording</Button>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Additional resources</legend>
        {value.resources.map((r, i) => (
          <div key={i} className="mt-2 grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input aria-label={`Resource ${i + 1} title`} placeholder="Title" className={input} value={r.title} onChange={(e) => setResource(i, { title: e.target.value })} />
            <div>
              <input aria-label={`Resource ${i + 1} link`} placeholder="https://…" className={input} value={r.url ?? ""} onChange={(e) => setResource(i, { url: e.target.value })} />
              <Warn url={r.url} />
            </div>
            <IconButton label={`Remove resource ${i + 1}`} onClick={() => set({ resources: value.resources.filter((_, idx) => idx !== i) })}>✕</IconButton>
          </div>
        ))}
        <Button className="mt-2" variant="ghost" onClick={() => set({ resources: [...value.resources, { title: "" }] })}>+ Add resource</Button>
      </fieldset>
    </div>
  );
}
```

`CourseForm.tsx`: controlled form over a `Course` with inputs Code, Name, Year level, and textareas Aims, Learning outcomes (one per line), Notes, Course outline (rows 8, with "from FILE" caption when `outlineSource`), plus a "Fill from course outline (Word or PDF)" file input that calls `extractSources([{ id: crypto.randomUUID(), kind: "file", file }])`, then `onChange({ ...course, outline: cleanOutlineText(result.text), outlineSource: file.name })`; on `!result.sources[0]?.ok` show `toast.error(result.sources[0]?.error ?? "That file couldn't be read.")`; uses `checkFile` from `config.ts` first (show its message via toast). Disable the button while reading (show `Spinner`).

`CourseManagerModal.tsx`: `Modal` (wide) titled "Course profiles". Lists `listCourses()` (code — name, Edit / Export / Delete-with-confirm buttons), "New course" and "Import" (hidden `.json` file input → `parseImportedCourse` → `saveCourse`, toast on error). Edit/New opens `CourseForm` inside the modal with Save (requires code or name) / Cancel. Exports with `downloadBlob(new Blob([exportCourseJson(c)], {type:"application/json"}), \`${safeFilename(c.code || c.name)}-course.json\`)`. Calls `onChanged()` after save/delete/import. All async actions wrapped in try/catch with `toast.error`.

`CreatePage.tsx`:
- State: `courses: Course[]` (loaded via `listCourses()` in a `useEffect`, reloaded on `onChanged`), `courseId: string` (""), `courseManagerOpen`, `study: StudyMaterials` (`emptyStudy()`), `studyOpen: boolean`.
- In the options panel, above the title input: a labelled `<select aria-label="Course">` with "No course" + `courses` (`code — name`) and a ghost "Manage courses" button opening `CourseManagerModal`.
- Below the sources section: a collapsible card "Study materials (optional)" (button toggles `studyOpen`) containing `<StudyMaterialsForm value={study} onChange={setStudy} />`.
- In `generate`: `const course = courses.find((c) => c.id === courseId); course_context: buildCourseContext(course)` in the `generatePage` request; before saving, set `page.study = study` and pass `courseId: course?.id` into the saved page (`{ ...newSavedPage(...), courseId: course?.id }`).

`EditorPage.tsx`:
- Add a toolbar `Button` "Study materials" opening a `Modal` (wide) with `StudyMaterialsForm` bound to a local draft initialised from `current.page.study ?? emptyStudy()`; Save → `persist({ ...base, page: { ...base.page, study: draft } })` with `base = savedRef.current ?? current`, toast on failure; Cancel closes.
- In `submitRegenerate`: `const course = current.courseId ? await getCourse(current.courseId) : undefined;` and pass `course_context: buildCourseContext(course)` to `regenerateTab`.

- [ ] **Step 4: Run** — `npm test`, `npm run build`. Then a manual smoke check: `npm run dev`, open Create, confirm the Course select, Manage courses modal (add a course, export, import), and the Study materials section render without console errors (no backend needed for these).

- [ ] **Step 5: Commit** — `git commit -am "feat(frontend): study materials form, course profiles UI and wiring"`

---

### Task 11: Reference prompt v2 and docs

**Files:**
- Create: `prompts/system-prompt-v2.md`
- Delete: `prompts/system-prompt-v1.md`
- Modify: `README.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write `prompts/system-prompt-v2.md`** — the standalone copy-paste prompt that makes a chat AI output Canvas HTML directly. Structure: (1) role and output (paste-ready HTML for the Canvas HTML editor, plus a "Notes for the lecturer" list after the code block); (2) content rules — copy §1 of `backend/app/prompts/system.md` verbatim; (3) restructuring rules — copy §2 verbatim; (4) page architecture — spec §3 skeleton with the "Study materials" tab (spec §6 order and placeholder rules, but the AI fills placeholders since there's no app) and the Revision check; (5) components — every HTML snippet from spec §4 (4.1–4.12) copied exactly with CAPITALISED placeholders; (6) editable spacing rules — spec §5 verbatim; (7) technical rules — inline styles only, only `dp-` classes listed, no `<style>/<script>/<h1>`, entities for special characters, never invent Canvas URLs/course IDs/`data-api-endpoint`; (8) images — placeholder text from §4.10; (9) output format. Keep Australian English.

- [ ] **Step 2: Verify** — `grep -c "&nbsp;" prompts/system-prompt-v2.md` ≥ 1; every hex colour in spec §2 appears in the file; `git rm prompts/system-prompt-v1.md`; search the repo for references to `system-prompt-v1` (`grep -rn "system-prompt-v1" --include=*.md --include=*.ts --include=*.py .` excluding `docs/superpowers/` history) and update them to v2.

- [ ] **Step 3: README** — in "Using the hosted app", replace the step about the page structure with: pages follow the shared pharmacy template (intro panel, numbered tabs with collapsible sections, a "Study materials" tab, and a "Revision check"); add steps for **Course profiles** ("Manage courses" on the Create page — type details or *Fill from course outline* with a Word/PDF; export/import to move between computers) and **Study materials** (fill handout/recording/resource links on the Create page or later via the editor's **Study materials** button; missing links show as `[Add … link]` placeholders).

- [ ] **Step 4: Commit** — `git add -A prompts README.md && git commit -m "docs: PHAR3004 reference prompt v2 and README updates"`

---

## Self-review notes (done while writing)

- Spec coverage: §2 palette → Task 5 constants; §3 skeleton → Task 6; §4.1–4.12 → Tasks 5–6; §5 spacing → Task 5 `contentLines` + Task 6 top-level; §6 study tab → Tasks 6 and 10; §7 course profiles → Tasks 3, 9, 10; §8 schema → Tasks 1, 2, 4; §9 sub/sup → Task 4; §10 prompt → Task 3 (+ v2 in Task 11); §11 preview/editing → Tasks 7–8; §12 compatibility → Tasks 6 (legacy render test) and 7 (import); §13 testing → spread across tasks.
- Deviation from spec §6 (deliberate, small): a recording with a title but no link renders "TITLE [Add recording link]" (keeps the part's informative title); `part` defaults to "Part N".
- Type names used consistently: `contentLines`, `flowRowLines`, `figureLines`, `simpleTableLines`, `SPACER`, `PLACEHOLDER_STYLE`, `PALETTE`, `TABS_CLASS`, `studyMaterialsContentLines`, `safeUrl`, `buildCourseContext`, `cleanOutlineText`, `emptyStudy`.
