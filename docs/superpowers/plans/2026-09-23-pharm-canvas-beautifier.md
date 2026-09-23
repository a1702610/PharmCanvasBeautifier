# PharmCanvas Beautifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app that turns pharmacy lecturers' Word/PowerPoint/PDF/old-Canvas material into paste-ready, house-styled Canvas HTML via Gemini.

**Architecture:** A stateless FastAPI backend (Render) extracts text + images from uploads and calls Gemini with a JSON schema. Gemini returns *page JSON* (typed blocks, never HTML); the backend validates and sanitises it. A React frontend (Vercel) renders the JSON into Canvas HTML with fixed templates, previews it, regenerates single tabs, and stores pages in IndexedDB.

**Tech Stack:** Python 3.13, FastAPI, google-genai, python-docx, python-pptx, pdfplumber, PyMuPDF, BeautifulSoup4, Pillow, pytest · React 19, TypeScript 5.9, Vite 7, Tailwind 4, axios, react-router 7, react-hot-toast, idb, jszip, Vitest 3, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-23-pharm-canvas-beautifier-design.md` (golden component HTML: `prompts/system-prompt-v1.md` §3; reference project: `A:\Rx-H5P-Generator`).

## Global Constraints

- Canvas output HTML must reproduce the components in `prompts/system-prompt-v1.md` §3 exactly — same inline styles, colours, `dp-` class names, 4-space indentation.
- The AI never produces HTML. Text fields allow only `**bold**`, `*italic*`, `[text](https://url)`; the renderer escapes everything else and encodes non-ASCII as HTML entities.
- Backend is stateless: no database, no files written, never log API keys or document contents.
- API key: sent as header `X-Gemini-Key`; stored in browser `localStorage` under `pharm_canvas_gemini_key`.
- API paths: `GET /api/health`, `POST /api/extract`, `POST /api/generate`, `POST /api/regenerate-tab` (the spec's `/health` is served at `/api/health`).
- Limits: ≤5 sources per page; ≤25 MB per file; ≤20 image thumbnails to Gemini; thumbnails ≤512 px JPEG; images <80 px on either side or <3 KB skipped; images whose hash appears >2 times skipped; size warning above 150,000 approx tokens (chars/4).
- Gemini: model setting `GEMINI_MODEL` default `gemini-3.6-flash`; `thinking_level="low"`; one retry on invalid output.
- Image refs `IMG-01`, `IMG-02`…; embed refs `EMBED-01`…; tab ids `t1`, `t2`….
- App UI (not Canvas output): White + Dark Blue `#140F50` dominant, Limestone `#F8EFE0` secondary surfaces, North Terrace Purple `#836BFF` accent, Bright Blue `#1448FF` primary actions only; Roboto Serif body, Barlow Condensed display, system sans for controls; no Adelaide University logo; Australian English, sentence case.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend commands run from `backend/` using `venv/Scripts/python` (Windows venv). Frontend commands run from `frontend/`.

## File Structure

```
backend/
  requirements.txt            runtime deps
  requirements-dev.txt        + pytest
  pytest.ini
  .env.example
  Dockerfile
  app/
    __init__.py
    config.py                 Settings (model, origins, limits)
    main.py                   FastAPI app, CORS, routers, /api/health
    ai/
      __init__.py
      schema.py               Wire* (Gemini output) + typed Page models
      validate.py             SourceContext, finalize_page, finalize_tab
      gemini.py               generate_structured(), GeminiError, ImagePart
      prompts.py              load_prompt(), build_generate_prompt(), build_regenerate_prompt()
    prompts/
      system.md               generation rules (block-based)
      regenerate_tab.md       tab regeneration add-on
    extractors/
      __init__.py
      common.py               RawImage, SourceExtract, placeholders, table_to_text
      images.py               prepare_image, make_thumbnail, image_hash
      docx.py  pptx.py  pdf.py  canvas_html.py
      models.py               SourceStatus, ImageInfo, EmbedInfo, ExtractResult
      stream.py               assemble() → combined text + refs
    routers/
      __init__.py
      extract.py              POST /api/extract
      generate.py             POST /api/generate, /api/regenerate-tab
  tests/
    __init__.py
    helpers.py                noise_png, make_docx, make_pptx, make_pdf
    test_*.py
frontend/
  package.json  index.html  vite.config.ts  tsconfig*.json  vercel.json  .env.example
  src/
    main.tsx  App.tsx  index.css  config.ts
    types/page.ts  types/api.ts
    api/client.ts  api/endpoints.ts
    hooks/useApiKey.ts
    render/inline.ts  render/templates.ts  render/renderPage.ts  render/preview.css
    storage/db.ts  storage/exchange.ts  storage/pageOps.ts
    utils/downloads.ts  utils/format.ts
    components/ui/Button.tsx  IconButton.tsx  Modal.tsx  Spinner.tsx
    components/layout/Layout.tsx  Header.tsx  ApiKeyModal.tsx  ServerStatusBanner.tsx
    components/create/Dropzone.tsx  SourceList.tsx  PasteCanvasModal.tsx  GenerateProgress.tsx
    components/editor/CanvasPreview.tsx  TabRail.tsx  NotesPanel.tsx  RegenerateDialog.tsx
    pages/CreatePage.tsx  EditorPage.tsx  MyPagesPage.tsx
setup.bat  start.bat  render.yaml  README.md
```

---

### Task 1: Backend scaffold and health endpoint

**Files:**
- Create: `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pytest.ini`, `backend/.env.example`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`, `backend/tests/__init__.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.config.settings` with `GEMINI_MODEL: str`, `ALLOWED_ORIGINS: str`, `MAX_SOURCES: int = 5`, `MAX_FILE_MB: int = 25`, `MAX_IMAGES_TO_AI: int = 20`, `TOKEN_WARN_LIMIT: int = 150000`, properties `allowed_origins_list: list[str]`, `max_file_bytes: int`. `app.main.app` (FastAPI).

- [ ] **Step 1: Create dependency and config files**

`backend/requirements.txt`:
```
fastapi[standard]>=0.115.0
uvicorn[standard]>=0.30.0
google-genai>=1.68.0
python-docx>=1.2.0
python-pptx>=1.0.0
pdfplumber>=0.11.0
pymupdf>=1.28.0
beautifulsoup4>=4.12.0
Pillow>=10.0.0
python-multipart>=0.0.9
pydantic>=2.0.0
pydantic-settings>=2.0.0
```

`backend/requirements-dev.txt`:
```
-r requirements.txt
pytest>=8.0.0
httpx>=0.27.0
```

`backend/pytest.ini`:
```ini
[pytest]
pythonpath = .
testpaths = tests
```

`backend/.env.example`:
```
GEMINI_MODEL=gemini-3.6-flash
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`.

- [ ] **Step 2: Create the venv and install**

Run: `cd backend && python -m venv venv && venv/Scripts/python -m pip install -r requirements-dev.txt`
Expected: installs without errors.

- [ ] **Step 3: Write the failing test**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_health_returns_ok():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_settings_defaults():
    assert settings.MAX_SOURCES == 5
    assert settings.max_file_bytes == 25 * 1024 * 1024
    assert "http://localhost:5173" in settings.allowed_origins_list
```

- [ ] **Step 4: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_health.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 5: Implement config and app**

`backend/app/config.py`:
```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GEMINI_MODEL: str = "gemini-3.6-flash"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    MAX_SOURCES: int = 5
    MAX_FILE_MB: int = 25
    MAX_IMAGES_TO_AI: int = 20
    TOKEN_WARN_LIMIT: int = 150_000

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def max_file_bytes(self) -> int:
        return self.MAX_FILE_MB * 1024 * 1024


settings = Settings()
```

`backend/app/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(title="PharmCanvas Beautifier", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_health.py -v`
Expected: 2 passed

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(backend): scaffold FastAPI app with health endpoint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Page JSON models

**Files:**
- Create: `backend/app/ai/__init__.py`, `backend/app/ai/schema.py`
- Test: `backend/tests/test_schema.py`

**Interfaces:**
- Produces (all in `app.ai.schema`):
  - `Note(kind: Literal["image","flag","citation","unplaced"], text: str)`
  - Wire models (Gemini output, flat, optional fields): `WireChild`, `WireBlock`, `WireTab(title, blocks)`, `WireRevision(include=False, embed_ref=None)`, `WirePage(title, intro, tabs, revision, notes)`
  - Typed blocks: `Heading`, `Paragraph`, `ListBlock(ordered=False, items)`, `Table(headers, col_widths=None, rows)`, `ContrastTable(left_header, right_header, rows)`, `Clinical(body)`, `Caution(title, body=None, items=None)`, `Evidence(title, children)`, `Citation(text)`, `Link(lead_in="", url, link_text)`, `Figure(ref, alt, caption=None)`, `References(items)`; unions `Block`, `EvidenceChild` (discriminated on `type`)
  - `Tab(id, title, blocks)`, `Revision(include=False, embed_ref=None)`, `Page(title, intro, tabs, revision, notes)`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_schema.py`:
```python
from app.ai.schema import Evidence, Figure, Page, Table, WirePage


def test_wire_page_accepts_flat_blocks_with_nulls():
    wire = WirePage.model_validate({
        "title": "Chronic pain",
        "intro": ["Intro."],
        "tabs": [{
            "title": "Overview",
            "blocks": [
                {"type": "paragraph", "text": "Body.", "items": None, "ref": None},
                {"type": "evidence", "title": "Paracetamol", "children": [
                    {"type": "paragraph", "text": "Little benefit."},
                    {"type": "citation", "text": "Ennis 2016"},
                ]},
            ],
        }],
    })
    assert wire.tabs[0].blocks[1].children[1].type == "citation"
    assert wire.revision.include is False
    assert wire.notes == []


def test_typed_page_parses_discriminated_blocks():
    page = Page.model_validate({
        "title": "T",
        "intro": [],
        "tabs": [{"id": "t1", "title": "A", "blocks": [
            {"type": "table", "headers": ["A", "B"], "rows": [["1", "2"]]},
            {"type": "figure", "ref": "IMG-01", "alt": "Chart"},
            {"type": "evidence", "title": "E", "children": [
                {"type": "references", "items": ["Ref 1"]},
            ]},
        ]}],
        "revision": {"include": False},
        "notes": [],
    })
    blocks = page.tabs[0].blocks
    assert isinstance(blocks[0], Table)
    assert isinstance(blocks[1], Figure)
    assert isinstance(blocks[2], Evidence)
    dumped = page.model_dump(exclude_none=True)
    assert "caption" not in dumped["tabs"][0]["blocks"][1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_schema.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.ai'`

- [ ] **Step 3: Implement the models**

Create empty `backend/app/ai/__init__.py`.

`backend/app/ai/schema.py`:
```python
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
]
ChildType = Literal["paragraph", "list", "figure", "citation", "references"]


class WireChild(BaseModel):
    type: ChildType
    text: str | None = None
    items: list[str] | None = None
    ref: str | None = None
    alt: str | None = None
    caption: str | None = None


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
          Caution, Evidence, Citation, Link, Figure],
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_schema.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/ai backend/tests/test_schema.py
git commit -m "feat(backend): add wire and typed page JSON models" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Page validation and sanitising

**Files:**
- Create: `backend/app/ai/validate.py`
- Test: `backend/tests/test_validate.py`

**Interfaces:**
- Consumes: models from Task 2.
- Produces:
  - `SourceContext.from_text(text: str) -> SourceContext` (fields `urls: set[str]`, `image_refs: set[str]`, `embed_refs: set[str]`)
  - `finalize_page(wire: WirePage, ctx: SourceContext, include_revision: bool) -> Page`
  - `finalize_tab(wire: WireTab, ctx: SourceContext, tab_id: str) -> tuple[Tab, list[Note]]` — raises `ValueError` if the tab has no usable blocks.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_validate.py`:
```python
import pytest

from app.ai.schema import Figure, Link, Paragraph, WirePage, WireTab
from app.ai.validate import SourceContext, finalize_page, finalize_tab

SOURCE = (
    "=== SOURCE 1: a.pptx ===\n\n--- Slide 1 ---\n"
    "See https://www.tga.gov.au/guidance.\n[IMG-01: slide 1]\n[EMBED-01]"
)
CTX = SourceContext.from_text(SOURCE)
P = {"type": "paragraph", "text": "Body."}


def tab(title, *blocks):
    return {"title": title, "blocks": list(blocks)}


def wire(tabs, **extra):
    return WirePage.model_validate({"title": "Chronic pain", "intro": ["Intro."], "tabs": tabs, **extra})


def test_source_context_collects_urls_and_refs():
    assert CTX.urls == {"https://www.tga.gov.au/guidance"}
    assert CTX.image_refs == {"IMG-01"}
    assert CTX.embed_refs == {"EMBED-01"}


def test_assigns_tab_ids_and_keeps_valid_content():
    page = finalize_page(wire([tab("A", P), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert [t.id for t in page.tabs] == ["t1", "t2", "t3"]
    assert page.notes == []


def test_removes_invented_inline_links_and_notes_them():
    w = wire([tab("A", P), tab("B", P), tab("C", P)])
    w.intro = ["Read [TGA](https://www.tga.gov.au/guidance) and [fake](https://fake.example.com)."]
    page = finalize_page(w, CTX, include_revision=False)
    assert page.intro == ["Read [TGA](https://www.tga.gov.au/guidance) and fake."]
    assert any("fake.example.com" in n.text and n.kind == "flag" for n in page.notes)


def test_drops_unknown_figures():
    blocks = [
        {"type": "figure", "ref": "IMG-01", "alt": "Chart"},
        {"type": "figure", "ref": "IMG-09", "alt": "Invented"},
    ]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert page.tabs[0].blocks == [Figure(ref="IMG-01", alt="Chart")]
    assert any("IMG-09" in n.text for n in page.notes)


def test_link_block_with_unknown_url_becomes_paragraph():
    blocks = [
        {"type": "link", "lead_in": "Guidance", "url": "https://www.tga.gov.au/guidance/", "link_text": "TGA"},
        {"type": "link", "lead_in": "Report", "url": "https://made.up/report", "link_text": "2025 Report"},
    ]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert isinstance(page.tabs[0].blocks[0], Link)
    assert page.tabs[0].blocks[1] == Paragraph(text="Report 2025 Report")


def test_table_rows_are_padded_and_bad_widths_dropped():
    block = {"type": "table", "headers": ["Class", "Agents"], "col_widths": [30], "rows": [["TCA"], ["SNRI", "duloxetine", "extra"]]}
    page = finalize_page(wire([tab("A", block), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    table = page.tabs[0].blocks[0]
    assert table.rows == [["TCA", ""], ["SNRI", "duloxetine"]]
    assert table.col_widths is None


def test_empty_blocks_and_tabs_removed_with_tab_count_note():
    empty = {"type": "paragraph", "text": "   "}
    page = finalize_page(wire([tab("A", empty), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert [t.title for t in page.tabs] == ["B", "C"]
    assert [t.id for t in page.tabs] == ["t1", "t2"]
    assert any("2 tabs" in n.text for n in page.notes)


def test_revision_embed_ref_kept_when_known():
    tabs = [tab("A", P), tab("B", P), tab("C", P)]
    page = finalize_page(wire(tabs, revision={"include": False, "embed_ref": "EMBED-01"}), CTX, include_revision=False)
    assert page.revision.include is True
    assert page.revision.embed_ref == "EMBED-01"


def test_revision_unknown_embed_cleared():
    tabs = [tab("A", P), tab("B", P), tab("C", P)]
    page = finalize_page(wire(tabs, revision={"include": False, "embed_ref": "EMBED-07"}), CTX, include_revision=False)
    assert page.revision.include is False
    assert page.revision.embed_ref is None
    assert any("EMBED-07" in n.text for n in page.notes)


def test_include_revision_request_forces_block():
    page = finalize_page(wire([tab("A", P), tab("B", P), tab("C", P)]), CTX, include_revision=True)
    assert page.revision.include is True


def test_finalize_tab_keeps_id_and_raises_when_empty():
    t, notes = finalize_tab(WireTab.model_validate(tab("A", P)), CTX, "t4")
    assert t.id == "t4" and notes == []
    with pytest.raises(ValueError):
        finalize_tab(WireTab.model_validate(tab("A", {"type": "list", "items": []})), CTX, "t4")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_validate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.ai.validate'`

- [ ] **Step 3: Implement validation**

`backend/app/ai/validate.py`:
```python
"""Turn Gemini's wire output into a validated, sanitised Page.

Drops empty blocks, removes links whose URL isn't in the source material,
removes figures/embeds with unknown refs, and records each change as a note.
"""
import re
from dataclasses import dataclass

from app.ai.schema import (
    Block, Caution, Citation, Clinical, ContrastTable, Evidence, EvidenceChild,
    Figure, Heading, Link, ListBlock, Note, Page, Paragraph, References,
    Revision, Tab, Table, WireBlock, WireChild, WirePage, WireTab,
)

URL_RE = re.compile(r"https?://[^\s<>\"'\])]+")
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
IMG_REF_RE = re.compile(r"\[(IMG-\d+)")
EMBED_REF_RE = re.compile(r"\[(EMBED-\d+)\]")


def _norm_url(url: str) -> str:
    return url.strip().rstrip("/.,;:")


@dataclass
class SourceContext:
    urls: set[str]
    image_refs: set[str]
    embed_refs: set[str]

    @classmethod
    def from_text(cls, text: str) -> "SourceContext":
        return cls(
            urls={_norm_url(u) for u in URL_RE.findall(text)},
            image_refs=set(IMG_REF_RE.findall(text)),
            embed_refs=set(EMBED_REF_RE.findall(text)),
        )


class _Finalizer:
    def __init__(self, ctx: SourceContext):
        self.ctx = ctx
        self.notes: list[Note] = []

    def note(self, text: str) -> None:
        self.notes.append(Note(kind="flag", text=text))

    def text(self, value: str | None) -> str:
        def replace(match: re.Match) -> str:
            label, url = match.group(1), match.group(2)
            if _norm_url(url) in self.ctx.urls:
                return match.group(0)
            self.note(f"Removed a link that wasn't in the source material: {url}")
            return label

        return MD_LINK_RE.sub(replace, (value or "").strip())

    def texts(self, values: list[str] | None) -> list[str]:
        return [t for t in (self.text(v) for v in values or []) if t]

    def figure(self, ref: str | None, alt: str | None, caption: str | None) -> Figure | None:
        ref = (ref or "").strip()
        if ref not in self.ctx.image_refs:
            self.note(f"Removed a figure with an unknown image reference: {ref or '(none)'}")
            return None
        return Figure(ref=ref, alt=self.text(alt) or "Figure", caption=self.text(caption) or None)

    def _row(self, row: list[str], width: int) -> list[str]:
        cells = [self.text(c) for c in row][:width]
        return cells + [""] * (width - len(cells))

    def _table(self, b: WireBlock) -> Table | None:
        headers = [self.text(h) for h in b.headers or []]
        if not any(headers):
            return None
        rows = [r for r in (self._row(r, len(headers)) for r in b.rows or []) if any(r)]
        if not rows:
            return None
        widths = b.col_widths if b.col_widths and len(b.col_widths) == len(headers) else None
        return Table(headers=headers, col_widths=widths, rows=rows)

    def _contrast(self, b: WireBlock) -> ContrastTable | None:
        left, right = self.text(b.left_header), self.text(b.right_header)
        rows = [r for r in (self._row(r, 2) for r in b.rows or []) if any(r)]
        if not left or not right or not rows:
            return None
        return ContrastTable(left_header=left, right_header=right, rows=rows)

    def _link(self, b: WireBlock) -> Link | Paragraph | None:
        url = (b.url or "").strip()
        if not url:
            return None
        lead_in = self.text(b.lead_in)
        link_text = self.text(b.link_text) or url
        if _norm_url(url) in self.ctx.urls:
            return Link(lead_in=lead_in, url=url, link_text=link_text)
        self.note(f"Removed a link that wasn't in the source material: {url}")
        text = " ".join(x for x in (lead_in, link_text) if x)
        return Paragraph(text=text) if text else None

    def child(self, c: WireChild) -> EvidenceChild | None:
        if c.type == "paragraph":
            text = self.text(c.text)
            return Paragraph(text=text) if text else None
        if c.type == "citation":
            text = self.text(c.text)
            return Citation(text=text) if text else None
        if c.type == "list":
            items = self.texts(c.items)
            return ListBlock(items=items) if items else None
        if c.type == "references":
            items = self.texts(c.items)
            return References(items=items) if items else None
        if c.type == "figure":
            return self.figure(c.ref, c.alt, c.caption)
        return None

    def block(self, b: WireBlock) -> Block | None:
        t = b.type
        if t in ("heading", "paragraph", "citation"):
            text = self.text(b.text)
            model = {"heading": Heading, "paragraph": Paragraph, "citation": Citation}[t]
            return model(text=text) if text else None
        if t == "list":
            items = self.texts(b.items)
            return ListBlock(ordered=bool(b.ordered), items=items) if items else None
        if t == "table":
            return self._table(b)
        if t == "contrast_table":
            return self._contrast(b)
        if t == "clinical":
            body = self.text(b.body)
            return Clinical(body=body) if body else None
        if t == "caution":
            body = self.text(b.body) or None
            items = self.texts(b.items) or None
            if not body and not items:
                return None
            return Caution(title=self.text(b.title) or "Practice points", body=body, items=items)
        if t == "evidence":
            children = [c for c in (self.child(c) for c in b.children or []) if c is not None]
            if not children:
                return None
            return Evidence(title=self.text(b.title) or "Summary", children=children)
        if t == "link":
            return self._link(b)
        if t == "figure":
            return self.figure(b.ref, b.alt, b.caption)
        return None

    def tab(self, w: WireTab, tab_id: str) -> Tab | None:
        blocks = [b for b in (self.block(b) for b in w.blocks) if b is not None]
        if not blocks:
            return None
        return Tab(id=tab_id, title=self.text(w.title) or "Untitled", blocks=blocks)


def finalize_page(wire: WirePage, ctx: SourceContext, include_revision: bool) -> Page:
    f = _Finalizer(ctx)
    tabs: list[Tab] = []
    for w in wire.tabs:
        t = f.tab(w, f"t{len(tabs) + 1}")
        if t is not None:
            tabs.append(t)
    if not 3 <= len(tabs) <= 8:
        f.note(f"This page has {len(tabs)} tabs; 3–8 is recommended.")

    embed_ref = (wire.revision.embed_ref or "").strip() or None
    if embed_ref and embed_ref not in ctx.embed_refs:
        f.note(f"Removed an unknown embed reference: {embed_ref}")
        embed_ref = None
    revision = Revision(
        include=include_revision or wire.revision.include or embed_ref is not None,
        embed_ref=embed_ref,
    )

    intro = f.texts(wire.intro)
    ai_notes = [Note(kind=n.kind, text=n.text.strip()) for n in wire.notes if n.text.strip()]
    return Page(
        title=wire.title.strip() or "Untitled page",
        intro=intro,
        tabs=tabs,
        revision=revision,
        notes=ai_notes + f.notes,
    )


def finalize_tab(wire: WireTab, ctx: SourceContext, tab_id: str) -> tuple[Tab, list[Note]]:
    f = _Finalizer(ctx)
    t = f.tab(wire, tab_id)
    if t is None:
        raise ValueError("The regenerated tab has no content.")
    return t, f.notes
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_validate.py -v`
Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/ai/validate.py backend/tests/test_validate.py
git commit -m "feat(backend): validate and sanitise AI page output" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Extraction primitives and image preparation

**Files:**
- Create: `backend/app/extractors/__init__.py`, `backend/app/extractors/common.py`, `backend/app/extractors/images.py`, `backend/tests/helpers.py`
- Test: `backend/tests/test_extract_common.py`

**Interfaces:**
- Produces:
  - `common.RawImage(source: str, location: str = "", data: bytes | None = None, canvas_tag: str | None = None)`
  - `common.SourceExtract(text="", images=[], embeds=[], warnings=[])` with `add_image(RawImage) -> str` and `add_embed(html: str) -> str` returning placeholder tokens
  - `common.placeholder(kind: str, index: int) -> str`, `common.PLACEHOLDER_RE` (groups: kind, index), `common.table_to_text(rows: list[list[str]]) -> str`
  - `images.prepare_image(data: bytes) -> PreparedImage(data: bytes, mime: str)`, raises `images.ImageRejected(reason: "small" | "unreadable")`
  - `images.make_thumbnail(data: bytes) -> str` (base64 JPEG), `images.image_hash(data: bytes) -> str`
  - `tests.helpers.noise_png(w=200, h=200) -> bytes`

- [ ] **Step 1: Write the test helper and failing test**

`backend/tests/helpers.py`:
```python
import io
import os

from PIL import Image


def noise_png(w: int = 200, h: int = 200) -> bytes:
    """Random-noise PNG: incompressible, so it passes the 3 KB size filter."""
    img = Image.frombytes("RGB", (w, h), os.urandom(w * h * 3))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def noise_bmp(w: int = 200, h: int = 200) -> bytes:
    img = Image.frombytes("RGB", (w, h), os.urandom(w * h * 3))
    buf = io.BytesIO()
    img.save(buf, "BMP")
    return buf.getvalue()
```

`backend/tests/test_extract_common.py`:
```python
import base64
import io

import pytest
from PIL import Image

from app.extractors.common import PLACEHOLDER_RE, RawImage, SourceExtract, table_to_text
from app.extractors.images import ImageRejected, make_thumbnail, prepare_image
from tests.helpers import noise_bmp, noise_png


def test_source_extract_returns_placeholders():
    ex = SourceExtract()
    token = ex.add_image(RawImage(source="a.docx"))
    embed = ex.add_embed("<iframe></iframe>")
    assert PLACEHOLDER_RE.fullmatch(token).groups() == ("IMG", "0")
    assert PLACEHOLDER_RE.fullmatch(embed).groups() == ("EMBED", "0")


def test_table_to_text_escapes_pipes_and_skips_empty_rows():
    rows = [["Class", "Agents"], ["TCA", "amitriptyline | nortriptyline"], ["", ""]]
    assert table_to_text(rows) == (
        "| Class | Agents |\n|---|---|\n| TCA | amitriptyline \\| nortriptyline |"
    )


def test_table_to_text_empty():
    assert table_to_text([["", ""]]) == ""


def test_prepare_rejects_small_dimensions():
    with pytest.raises(ImageRejected) as err:
        prepare_image(noise_png(60, 300))
    assert err.value.reason == "small"


def test_prepare_rejects_tiny_files():
    with pytest.raises(ImageRejected) as err:
        prepare_image(b"x" * 100)
    assert err.value.reason == "small"


def test_prepare_rejects_unreadable():
    with pytest.raises(ImageRejected) as err:
        prepare_image(b"not an image" * 500)
    assert err.value.reason == "unreadable"


def test_prepare_keeps_png_bytes():
    png = noise_png()
    prepared = prepare_image(png)
    assert prepared.mime == "image/png"
    assert prepared.data == png


def test_prepare_converts_other_formats_to_png():
    prepared = prepare_image(noise_bmp())
    assert prepared.mime == "image/png"
    assert Image.open(io.BytesIO(prepared.data)).format == "PNG"


def test_thumbnail_is_jpeg_max_512():
    thumb = Image.open(io.BytesIO(base64.b64decode(make_thumbnail(noise_png(1200, 600)))))
    assert thumb.format == "JPEG"
    assert max(thumb.size) == 512
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_extract_common.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.extractors'`

- [ ] **Step 3: Implement**

Create empty `backend/app/extractors/__init__.py`.

`backend/app/extractors/common.py`:
```python
"""Shared types for extractors.

Extractors emit text containing placeholder tokens for images and embeds.
stream.assemble() later swaps them for global refs like [IMG-03: slide 7].
"""
import re
from dataclasses import dataclass, field

PLACEHOLDER_RE = re.compile(r"\x00(IMG|EMBED):(\d+)\x00")


def placeholder(kind: str, index: int) -> str:
    return f"\x00{kind}:{index}\x00"


@dataclass
class RawImage:
    source: str
    location: str = ""
    data: bytes | None = None
    canvas_tag: str | None = None


@dataclass
class SourceExtract:
    text: str = ""
    images: list[RawImage] = field(default_factory=list)
    embeds: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_image(self, image: RawImage) -> str:
        self.images.append(image)
        return placeholder("IMG", len(self.images) - 1)

    def add_embed(self, html: str) -> str:
        self.embeds.append(html)
        return placeholder("EMBED", len(self.embeds) - 1)


def _cell(value: str | None) -> str:
    lines = [line.strip() for line in (value or "").splitlines() if line.strip()]
    return " / ".join(lines).replace("|", "\\|")


def table_to_text(rows: list[list[str]]) -> str:
    cleaned = [[_cell(c) for c in row] for row in rows]
    cleaned = [r for r in cleaned if any(r)]
    if not cleaned:
        return ""
    lines = ["| " + " | ".join(cleaned[0]) + " |", "|" + "---|" * len(cleaned[0])]
    lines += ["| " + " | ".join(r) + " |" for r in cleaned[1:]]
    return "\n".join(lines)
```

`backend/app/extractors/images.py`:
```python
import base64
import hashlib
import io
from dataclasses import dataclass

from PIL import Image

MIN_SIDE = 80
MIN_BYTES = 3000
THUMB_SIDE = 512
WEB_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "GIF": "image/gif", "WEBP": "image/webp"}


class ImageRejected(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason  # "small" | "unreadable"


@dataclass
class PreparedImage:
    data: bytes
    mime: str


def image_hash(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def prepare_image(data: bytes) -> PreparedImage:
    """Reject tiny/unreadable images; convert non-web formats to PNG."""
    if len(data) < MIN_BYTES:
        raise ImageRejected("small")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            if min(im.size) < MIN_SIDE:
                raise ImageRejected("small")
            fmt = (im.format or "").upper()
            if fmt in WEB_FORMATS:
                return PreparedImage(data=data, mime=WEB_FORMATS[fmt])
            buf = io.BytesIO()
            im.convert("RGBA").save(buf, "PNG")
            return PreparedImage(data=buf.getvalue(), mime="image/png")
    except ImageRejected:
        raise
    except Exception as exc:
        raise ImageRejected("unreadable") from exc


def make_thumbnail(data: bytes) -> str:
    with Image.open(io.BytesIO(data)) as im:
        rgb = im.convert("RGB")
    rgb.thumbnail((THUMB_SIDE, THUMB_SIDE))
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("ascii")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_extract_common.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/extractors backend/tests/helpers.py backend/tests/test_extract_common.py
git commit -m "feat(backend): add extraction primitives and image preparation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Word (.docx) extractor

**Files:**
- Create: `backend/app/extractors/docx.py`
- Modify: `backend/tests/helpers.py` (add `make_docx`)
- Test: `backend/tests/test_extract_docx.py`

**Interfaces:**
- Consumes: `SourceExtract`, `RawImage`, `table_to_text` (Task 4).
- Produces: `extract_docx(data: bytes, name: str) -> SourceExtract`; `tests.helpers.make_docx(png: bytes) -> bytes`.

- [ ] **Step 1: Add the fixture builder**

Append to `backend/tests/helpers.py`:
```python
def make_docx(png: bytes) -> bytes:
    from docx import Document
    from docx.shared import Inches

    doc = Document()
    doc.add_heading("Overview", level=1)
    doc.add_paragraph("Chronic pain persists beyond 3 months.")
    doc.add_paragraph("Sensitisation", style="List Bullet")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Class"
    table.cell(0, 1).text = "Agents"
    table.cell(1, 0).text = "TCA"
    table.cell(1, 1).text = "amitriptyline"
    doc.add_picture(io.BytesIO(png), width=Inches(2))
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_extract_docx.py`:
```python
from app.extractors.common import PLACEHOLDER_RE
from app.extractors.docx import extract_docx
from tests.helpers import make_docx, noise_png


def test_docx_text_structure_and_images():
    png = noise_png()
    ex = extract_docx(make_docx(png), "notes.docx")
    lines = ex.text.split("\n\n")
    assert "# Overview" in lines
    assert "Chronic pain persists beyond 3 months." in lines
    assert "- Sensitisation" in lines
    assert "| Class | Agents |\n|---|---|\n| TCA | amitriptyline |" in lines
    assert len(ex.images) == 1
    assert ex.images[0].data == png
    assert ex.images[0].source == "notes.docx"
    assert PLACEHOLDER_RE.search(ex.text)
    # order: heading before table before picture
    assert ex.text.index("# Overview") < ex.text.index("| Class") < PLACEHOLDER_RE.search(ex.text).start()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_extract_docx.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.extractors.docx'`

- [ ] **Step 4: Implement**

`backend/app/extractors/docx.py`:
```python
import io

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.extractors.common import RawImage, SourceExtract, table_to_text

BLIP = qn("a:blip")
EMBED_ATTR = qn("r:embed")


def _para_line(p: Paragraph) -> str:
    text = p.text.strip()
    for link in p.hyperlinks:
        if link.url and link.text.strip() and link.text in text:
            text = text.replace(link.text, f"[{link.text}]({link.url})", 1)
    if not text:
        return ""
    style = p.style.name if p.style is not None else ""
    if style == "Title":
        return "# " + text
    if style.startswith("Heading "):
        level = style.removeprefix("Heading ").strip()
        return ("#" * int(level) if level.isdigit() else "#") + " " + text
    ppr = p._p.pPr
    if "List" in style or (ppr is not None and ppr.numPr is not None):
        return "- " + text
    return text


def extract_docx(data: bytes, name: str) -> SourceExtract:
    doc = Document(io.BytesIO(data))
    out = SourceExtract()
    lines: list[str] = []
    for el in doc.element.body.iterchildren():
        if el.tag == qn("w:p"):
            line = _para_line(Paragraph(el, doc))
            for blip in el.iter(BLIP):
                part = doc.part.related_parts.get(blip.get(EMBED_ATTR))
                if part is not None:
                    token = out.add_image(RawImage(source=name, data=part.blob))
                    line = f"{line} {token}".strip()
            if line:
                lines.append(line)
        elif el.tag == qn("w:tbl"):
            rows = [[cell.text for cell in row.cells] for row in Table(el, doc).rows]
            text = table_to_text(rows)
            if text:
                lines.append(text)
    out.text = "\n\n".join(lines)
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_extract_docx.py -v`
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/extractors/docx.py backend/tests/helpers.py backend/tests/test_extract_docx.py
git commit -m "feat(backend): extract text, tables and images from Word files" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: PowerPoint (.pptx) extractor

**Files:**
- Create: `backend/app/extractors/pptx.py`
- Modify: `backend/tests/helpers.py` (add `make_pptx`)
- Test: `backend/tests/test_extract_pptx.py`

**Interfaces:**
- Consumes: Task 4 primitives.
- Produces: `extract_pptx(data: bytes, name: str) -> SourceExtract`; `tests.helpers.make_pptx(png: bytes, logo: bytes | None = None, slides: int = 1) -> bytes` (logo, if given, is added to every slide).

- [ ] **Step 1: Add the fixture builder**

Append to `backend/tests/helpers.py`:
```python
def make_pptx(png: bytes, logo: bytes | None = None, slides: int = 1) -> bytes:
    from pptx import Presentation
    from pptx.util import Inches

    prs = Presentation()
    for n in range(slides):
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        if logo is not None:
            slide.shapes.add_picture(io.BytesIO(logo), Inches(8), Inches(0.2), Inches(1))
        if n > 0:
            slide.shapes.title.text = f"Slide {n + 1}"
            continue
        slide.shapes.title.text = "Opioids"
        body = slide.placeholders[1].text_frame
        body.text = "Start low"
        sub = body.add_paragraph()
        sub.text = "Go slow"
        sub.level = 1
        linked = body.add_paragraph()
        run = linked.add_run()
        run.text = "TGA guidance"
        run.hyperlink.address = "https://www.tga.gov.au"
        slide.notes_slide.notes_text_frame.text = "Explain tolerance"
        slide.shapes.add_picture(io.BytesIO(png), Inches(1), Inches(1))
        table = slide.shapes.add_table(2, 2, Inches(1), Inches(5), Inches(4), Inches(1)).table
        table.cell(0, 0).text = "Class"
        table.cell(0, 1).text = "Agents"
        table.cell(1, 0).text = "Opioid"
        table.cell(1, 1).text = "morphine"
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_extract_pptx.py`:
```python
from app.extractors.pptx import extract_pptx
from tests.helpers import make_pptx, noise_png


def test_pptx_slides_notes_tables_images():
    png = noise_png()
    ex = extract_pptx(make_pptx(png), "week3.pptx")
    lines = ex.text.split("\n")
    assert lines[0] == "--- Slide 1: Opioids ---"
    assert "- Start low" in lines
    assert "  - Go slow" in lines
    assert "- [TGA guidance](https://www.tga.gov.au)" in lines
    assert "Speaker notes: Explain tolerance" in lines
    assert "| Opioid | morphine |" in lines
    assert "Opioids" not in ex.text.replace("--- Slide 1: Opioids ---", "")
    assert len(ex.images) == 1
    assert ex.images[0].data == png
    assert ex.images[0].location == "slide 1"


def test_pptx_multiple_slides_are_separated():
    ex = extract_pptx(make_pptx(noise_png(), slides=2), "deck.pptx")
    assert "\n\n--- Slide 2: Slide 2 ---" in ex.text
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_extract_pptx.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.extractors.pptx'`

- [ ] **Step 4: Implement**

`backend/app/extractors/pptx.py`:
```python
import io

from pptx import Presentation
from pptx.shapes.group import GroupShape
from pptx.shapes.picture import Picture

from app.extractors.common import RawImage, SourceExtract, table_to_text


def _iter_shapes(shapes):
    for shape in shapes:
        if isinstance(shape, GroupShape):
            yield from _iter_shapes(shape.shapes)
        else:
            yield shape


def _para_text(para) -> str:
    pieces = []
    for run in para.runs:
        address = run.hyperlink.address if run.hyperlink is not None else None
        if address and run.text.strip():
            pieces.append(f"[{run.text}]({address})")
        else:
            pieces.append(run.text)
    return "".join(pieces).strip()


def extract_pptx(data: bytes, name: str) -> SourceExtract:
    prs = Presentation(io.BytesIO(data))
    out = SourceExtract()
    slides_text: list[str] = []
    for n, slide in enumerate(prs.slides, start=1):
        title_shape = slide.shapes.title
        title = title_shape.text_frame.text.strip() if title_shape is not None and title_shape.has_text_frame else ""
        lines = [f"--- Slide {n}: {title} ---" if title else f"--- Slide {n} ---"]
        for shape in _iter_shapes(slide.shapes):
            if title_shape is not None and shape.shape_id == title_shape.shape_id:
                continue
            if isinstance(shape, Picture):
                try:
                    blob = shape.image.blob
                except Exception:
                    continue
                lines.append(out.add_image(RawImage(source=name, location=f"slide {n}", data=blob)))
            elif getattr(shape, "has_table", False) and shape.has_table:
                text = table_to_text([[c.text for c in row.cells] for row in shape.table.rows])
                if text:
                    lines.append(text)
            elif shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = _para_text(para)
                    if text:
                        lines.append("  " * para.level + "- " + text)
        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                lines.append("Speaker notes: " + notes)
        slides_text.append("\n".join(lines))
    out.text = "\n\n".join(slides_text)
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_extract_pptx.py -v`
Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/extractors/pptx.py backend/tests/helpers.py backend/tests/test_extract_pptx.py
git commit -m "feat(backend): extract slides, speaker notes and images from PowerPoint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: PDF extractor

**Files:**
- Create: `backend/app/extractors/pdf.py`
- Modify: `backend/tests/helpers.py` (add `make_pdf`)
- Test: `backend/tests/test_extract_pdf.py`

**Interfaces:**
- Consumes: Task 4 primitives.
- Produces: `extract_pdf(data: bytes, name: str) -> SourceExtract`; `tests.helpers.make_pdf(png1: bytes, png2: bytes) -> bytes` (page 1: text + image + link; page 2: image only).

- [ ] **Step 1: Add the fixture builder**

Append to `backend/tests/helpers.py`:
```python
def make_pdf(png1: bytes, png2: bytes) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Paracetamol in chronic pain")
    page.insert_image(pymupdf.Rect(72, 100, 272, 300), stream=png1)
    page.insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(72, 320, 272, 340), "uri": "https://example.org/report"})
    page2 = doc.new_page()
    page2.insert_image(pymupdf.Rect(72, 72, 372, 372), stream=png2)
    return doc.tobytes()
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_extract_pdf.py`:
```python
from app.extractors.pdf import extract_pdf
from tests.helpers import make_pdf, noise_png


def test_pdf_pages_text_links_images_and_scan_warning():
    ex = extract_pdf(make_pdf(noise_png(), noise_png(300, 300)), "handout.pdf")
    assert ex.text.startswith("--- Page 1 ---")
    assert "Paracetamol in chronic pain" in ex.text
    assert "Links: https://example.org/report" in ex.text
    assert "--- Page 2 ---" in ex.text
    assert [img.location for img in ex.images] == ["page 1", "page 2"]
    assert all(img.data for img in ex.images)
    assert ex.warnings == ["Page 2 looks scanned; its text wasn't read."]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_extract_pdf.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.extractors.pdf'`

- [ ] **Step 4: Implement**

`backend/app/extractors/pdf.py`:
```python
import io

import pdfplumber
import pymupdf

from app.extractors.common import RawImage, SourceExtract, table_to_text

SCANNED_TEXT_THRESHOLD = 20


def extract_pdf(data: bytes, name: str) -> SourceExtract:
    out = SourceExtract()
    pages_text: list[str] = []
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for n, page in enumerate(pdf.pages, start=1):
                text = (page.extract_text() or "").strip()
                lines = [f"--- Page {n} ---"]
                if text:
                    lines.append(text)
                for table in page.extract_tables():
                    table_text = table_to_text([[c or "" for c in row] for row in table])
                    if table_text:
                        lines.append(table_text)

                mu_page = doc[n - 1]
                uris = [link["uri"] for link in mu_page.get_links() if link.get("uri")]
                if uris:
                    lines.append("Links: " + ", ".join(dict.fromkeys(uris)))

                image_count = 0
                for info in mu_page.get_images(full=True):
                    extracted = doc.extract_image(info[0])
                    if extracted and extracted.get("image"):
                        lines.append(out.add_image(RawImage(source=name, location=f"page {n}", data=extracted["image"])))
                        image_count += 1
                if image_count and len(text) < SCANNED_TEXT_THRESHOLD:
                    out.warnings.append(f"Page {n} looks scanned; its text wasn't read.")
                pages_text.append("\n\n".join(lines))
    finally:
        doc.close()
    out.text = "\n\n".join(pages_text)
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_extract_pdf.py -v`
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/extractors/pdf.py backend/tests/helpers.py backend/tests/test_extract_pdf.py
git commit -m "feat(backend): extract text, links and images from PDFs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Canvas HTML extractor

**Files:**
- Create: `backend/app/extractors/canvas_html.py`
- Test: `backend/tests/test_extract_canvas.py`

**Interfaces:**
- Consumes: Task 4 primitives.
- Produces: `extract_canvas_html(html: str, name: str) -> SourceExtract`. Images become `RawImage(canvas_tag=<original img html>)`; iframes become embeds.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_extract_canvas.py`:
```python
from app.extractors.canvas_html import extract_canvas_html
from app.extractors.common import PLACEHOLDER_RE

HTML = """<div id="dp-wrapper" class="dp-wrapper"><div class="dp-content-block">
<p class="font-claude-response-body break-words" dir="ltr">Chronic pain is different.</p>
<div class="dp-panels-wrapper dp-tabs-pills-group-vertical"><div class="dp-panel-group">
<h3 class="dp-panel-heading">Overview</h3><div class="dp-panel-content">
<h4 style="color: #1e3a5f;">Why it matters</h4>
<ul><li>Common</li><li>Disabling<ul><li>Costly</li></ul></li></ul>
<table><thead><tr><th>Category</th><th>Risk factors</th></tr></thead>
<tbody><tr><td><strong>Psychological</strong></td><td>Depression</td></tr></tbody></table>
<div style="border-left: 4px solid #0d9488;"><strong>Why this matters clinically</strong><br />Prevention works.</div>
<p style="text-align: center;"><img src="https://learn.adelaide.edu.au/courses/1/files/2/preview" alt="image.png" width="616" height="394" data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2" data-api-returntype="File" /></p>
<p>Read the <a href="https://www.penington.org.au/report.pdf" target="_blank">2025 Report</a>.</p>
</div></div></div></div></div>
<div><iframe src="https://learn.adelaide.edu.au/courses/1/external_tools/retrieve?x=1&amp;y=2" title=""></iframe></div>"""


def test_canvas_structure_is_preserved():
    ex = extract_canvas_html(HTML, "Pasted Canvas page 1")
    lines = ex.text.split("\n")
    assert "Chronic pain is different." in lines
    assert "## Overview" in lines
    assert "#### Why it matters" in lines
    assert "- Common" in lines
    assert "- Disabling" in lines
    assert "  - Costly" in lines
    assert "| Category | Risk factors |" in lines
    assert "| Psychological | Depression |" in lines
    assert "Why this matters clinically Prevention works." in lines
    assert "Read the [2025 Report](https://www.penington.org.au/report.pdf)." in lines
    assert "font-claude" not in ex.text


def test_canvas_images_and_iframes_become_refs():
    ex = extract_canvas_html(HTML, "Pasted Canvas page 1")
    kinds = [m.group(1) for m in PLACEHOLDER_RE.finditer(ex.text)]
    assert kinds == ["IMG", "EMBED"]
    tag = ex.images[0].canvas_tag
    assert ex.images[0].data is None
    assert 'src="https://learn.adelaide.edu.au/courses/1/files/2/preview"' in tag
    assert 'data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2"' in tag
    assert ex.embeds[0].startswith("<iframe")
    assert "external_tools/retrieve" in ex.embeds[0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_extract_canvas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.extractors.canvas_html'`

- [ ] **Step 3: Implement**

`backend/app/extractors/canvas_html.py`:
```python
from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from app.extractors.common import RawImage, SourceExtract, table_to_text

HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BLOCK_TAGS = {"p", "div", "section", "article", "header", "footer", "ul", "ol",
              "table", "blockquote", "figure"} | HEADINGS
SKIP_TAGS = {"script", "style", "noscript"}


def _collapse(text: str) -> str:
    return " ".join(text.split())


class _CanvasParser:
    def __init__(self, name: str):
        self.name = name
        self.out = SourceExtract()
        self.lines: list[str] = []

    def parse(self, html: str) -> SourceExtract:
        self._blocks(BeautifulSoup(html, "html.parser"))
        self.out.text = "\n".join(self.lines)
        return self.out

    def _emit(self, text: str) -> None:
        text = _collapse(text)
        if text:
            self.lines.append(text)

    def _blocks(self, node) -> None:
        buffer: list[str] = []
        for child in node.children:
            if isinstance(child, Tag) and child.name in BLOCK_TAGS:
                self._emit("".join(buffer))
                buffer.clear()
                self._block(child)
            else:
                buffer.append(self._inline(child))
        self._emit("".join(buffer))

    def _block(self, tag: Tag) -> None:
        if tag.name in HEADINGS:
            text = _collapse(self._inline(tag))
            if text:
                level = 2 if "dp-panel-heading" in (tag.get("class") or []) else int(tag.name[1])
                self.lines.append("#" * level + " " + text)
        elif tag.name == "p":
            self._emit(self._inline(tag))
        elif tag.name in ("ul", "ol"):
            self._list(tag, 0)
        elif tag.name == "table":
            rows = [
                [_collapse(self._inline(cell)) for cell in tr.find_all(["th", "td"], recursive=False)]
                for tr in tag.find_all("tr")
            ]
            text = table_to_text(rows)
            if text:
                self.lines.append(text)
        else:
            self._blocks(tag)

    def _list(self, tag: Tag, depth: int) -> None:
        for li in tag.find_all("li", recursive=False):
            text = _collapse(self._inline(li, skip_lists=True))
            if text:
                self.lines.append("  " * depth + "- " + text)
            for sub in li.find_all(["ul", "ol"], recursive=False):
                self._list(sub, depth + 1)

    def _inline(self, node, skip_lists: bool = False) -> str:
        if isinstance(node, Comment):
            return ""
        if isinstance(node, NavigableString):
            return str(node)
        if not isinstance(node, Tag) or node.name in SKIP_TAGS:
            return ""
        if node.name == "img":
            return " " + self.out.add_image(RawImage(source=self.name, canvas_tag=str(node))) + " "
        if node.name == "iframe":
            return " " + self.out.add_embed(str(node)) + " "
        if node.name == "br":
            return " "
        if node.name in ("ul", "ol"):
            if skip_lists:
                return ""
            items = [_collapse(self._inline(li, skip_lists=True)) for li in node.find_all("li")]
            return " " + "; ".join(i for i in items if i) + " "
        inner = "".join(self._inline(c, skip_lists) for c in node.children)
        if node.name == "a":
            href = (node.get("href") or "").strip()
            label = _collapse(inner)
            if label and href.startswith(("http://", "https://")):
                return f"[{label}]({href})"
            return inner
        if node.name in BLOCK_TAGS or node.name in ("td", "th", "li"):
            return " " + inner + " "
        return inner


def extract_canvas_html(html: str, name: str) -> SourceExtract:
    return _CanvasParser(name).parse(html)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_extract_canvas.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/extractors/canvas_html.py backend/tests/test_extract_canvas.py
git commit -m "feat(backend): parse pasted Canvas page HTML into structured text" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Stream assembly and `/api/extract`

**Files:**
- Create: `backend/app/extractors/models.py`, `backend/app/extractors/stream.py`, `backend/app/routers/__init__.py`, `backend/app/routers/extract.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_stream.py`, `backend/tests/test_extract_route.py`

**Interfaces:**
- Consumes: all extractors (Tasks 5–8), `prepare_image`, `make_thumbnail`, `image_hash`.
- Produces:
  - `models.SourceStatus(name, kind: "docx"|"pptx"|"pdf"|"canvas"|None, ok, error=None, warnings=[])`, `models.ImageInfo(ref, source, location="", mime=None, data_b64=None, thumb_b64=None, canvas_tag=None)`, `models.EmbedInfo(ref, html)`, `models.ExtractResult(sources, text, images, embeds, approx_tokens, token_limit)`
  - `stream.assemble(sources: list[tuple[str, SourceExtract]], max_ai_images: int) -> Assembled(text: str, images: list[ImageInfo], embeds: list[EmbedInfo], warnings: list[list[str]])` (warnings index-aligned with `sources`)
  - HTTP `POST /api/extract` (multipart: `files[]`, `canvas_html[]`, `order[]` of `"file:i"` / `"canvas:i"`) → `ExtractResult` JSON (nulls excluded); statuses are in `order` order.

- [ ] **Step 1: Write the failing stream test**

`backend/tests/test_stream.py`:
```python
from app.extractors.common import RawImage, SourceExtract
from app.extractors.stream import assemble
from tests.helpers import noise_png


def extract_with(name, *images, prefix="Intro"):
    ex = SourceExtract()
    tokens = [ex.add_image(RawImage(source=name, **img)) for img in images]
    ex.text = prefix + "\n\n" + "\n\n".join(tokens) + "\n\nEnd"
    return ex


def test_numbers_images_and_adds_source_headers():
    png = noise_png()
    out = assemble([("a.pptx", extract_with("a.pptx", {"location": "slide 2", "data": png}))], max_ai_images=20)
    assert out.text == "=== SOURCE 1: a.pptx ===\n\nIntro\n\n[IMG-01: slide 2]\n\nEnd"
    image = out.images[0]
    assert (image.ref, image.mime, image.source) == ("IMG-01", "image/png", "a.pptx")
    assert image.data_b64 and image.thumb_b64


def test_logo_repeated_more_than_twice_is_skipped():
    logo = noise_png()
    ex = extract_with("deck.pptx", *[{"data": logo, "location": f"slide {i}"} for i in (1, 2, 3)])
    out = assemble([("deck.pptx", ex)], max_ai_images=20)
    assert out.images == []
    assert "IMG" not in out.text
    assert out.text == "=== SOURCE 1: deck.pptx ===\n\nIntro\n\nEnd"


def test_image_used_twice_shares_one_ref():
    png = noise_png()
    ex = extract_with("a.docx", {"data": png}, {"data": png})
    out = assemble([("a.docx", ex)], max_ai_images=20)
    assert len(out.images) == 1
    assert out.text.count("[IMG-01]") == 2


def test_small_skipped_silently_and_unreadable_warned():
    ex = extract_with("a.docx", {"data": noise_png(40, 40)}, {"data": b"junk" * 1000})
    out = assemble([("a.docx", ex)], max_ai_images=20)
    assert out.images == []
    assert out.warnings == [["1 image(s) couldn't be read (unsupported format) and were skipped."]]


def test_canvas_images_and_embeds_get_refs():
    ex = SourceExtract()
    img = ex.add_image(RawImage(source="Pasted Canvas page 1", canvas_tag='<img src="x">'))
    emb = ex.add_embed("<iframe></iframe>")
    ex.text = f"{img}\n{emb}"
    out = assemble([("Pasted Canvas page 1", ex)], max_ai_images=20)
    assert out.text.endswith("[IMG-01]\n[EMBED-01]")
    assert out.images[0].canvas_tag == '<img src="x">'
    assert out.images[0].thumb_b64 is None
    assert out.embeds[0].ref == "EMBED-01"


def test_only_first_n_images_get_thumbnails_and_numbering_spans_sources():
    a = extract_with("a.docx", {"data": noise_png()})
    b = extract_with("b.docx", {"data": noise_png()})
    out = assemble([("a.docx", a), ("b.docx", b)], max_ai_images=1)
    assert [i.ref for i in out.images] == ["IMG-01", "IMG-02"]
    assert out.images[0].thumb_b64 and out.images[1].thumb_b64 is None
    assert "=== SOURCE 2: b.docx ===\n\nIntro\n\n[IMG-02]" in out.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_stream.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.extractors.stream'`

- [ ] **Step 3: Implement models and stream**

`backend/app/extractors/models.py`:
```python
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
```

`backend/app/extractors/stream.py`:
```python
"""Combine per-source extracts into one text stream with global refs."""
import base64
import re
from collections import Counter
from dataclasses import dataclass

from app.extractors.common import PLACEHOLDER_RE, SourceExtract
from app.extractors.images import ImageRejected, image_hash, make_thumbnail, prepare_image
from app.extractors.models import EmbedInfo, ImageInfo

MAX_REPEATS = 2


@dataclass
class Assembled:
    text: str
    images: list[ImageInfo]
    embeds: list[EmbedInfo]
    warnings: list[list[str]]


def _marker(info: ImageInfo) -> str:
    return f"[{info.ref}: {info.location}]" if info.location else f"[{info.ref}]"


def assemble(sources: list[tuple[str, SourceExtract]], max_ai_images: int) -> Assembled:
    counts = Counter(
        image_hash(img.data) for _, ex in sources for img in ex.images if img.data is not None
    )
    images: list[ImageInfo] = []
    embeds: list[EmbedInfo] = []
    raw_bytes: dict[str, bytes] = {}
    by_hash: dict[str, ImageInfo | None] = {}
    parts: list[str] = []
    warnings: list[list[str]] = []

    for k, (name, ex) in enumerate(sources, start=1):
        unreadable = 0

        def replace(match: re.Match) -> str:
            nonlocal unreadable
            kind, index = match.group(1), int(match.group(2))
            if kind == "EMBED":
                ref = f"EMBED-{len(embeds) + 1:02d}"
                embeds.append(EmbedInfo(ref=ref, html=ex.embeds[index]))
                return f"[{ref}]"
            raw = ex.images[index]
            if raw.canvas_tag is not None:
                info = ImageInfo(ref=f"IMG-{len(images) + 1:02d}", source=name,
                                 location=raw.location, canvas_tag=raw.canvas_tag)
                images.append(info)
                return _marker(info)
            digest = image_hash(raw.data)
            if counts[digest] > MAX_REPEATS:
                return ""
            if digest in by_hash:
                known = by_hash[digest]
                return _marker(known) if known else ""
            try:
                prepared = prepare_image(raw.data)
            except ImageRejected as exc:
                by_hash[digest] = None
                if exc.reason == "unreadable":
                    unreadable += 1
                return ""
            info = ImageInfo(ref=f"IMG-{len(images) + 1:02d}", source=name, location=raw.location,
                             mime=prepared.mime, data_b64=base64.b64encode(prepared.data).decode("ascii"))
            images.append(info)
            raw_bytes[info.ref] = prepared.data
            by_hash[digest] = info
            return _marker(info)

        body = PLACEHOLDER_RE.sub(replace, ex.text)
        body = re.sub(r"[ \t]+\n", "\n", body)
        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        parts.append(f"=== SOURCE {k}: {name} ===\n\n{body}")
        warnings.append(
            [f"{unreadable} image(s) couldn't be read (unsupported format) and were skipped."]
            if unreadable else []
        )

    for info in [i for i in images if i.ref in raw_bytes][:max_ai_images]:
        info.thumb_b64 = make_thumbnail(raw_bytes[info.ref])

    return Assembled(text="\n\n".join(parts), images=images, embeds=embeds, warnings=warnings)
```

- [ ] **Step 4: Run stream test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/test_stream.py -v`
Expected: 6 passed

- [ ] **Step 5: Write the failing route test**

`backend/tests/test_extract_route.py`:
```python
from fastapi.testclient import TestClient

from app.main import app
from tests.helpers import make_docx, noise_png

client = TestClient(app)
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_extract_mixed_sources_in_order():
    files = [
        ("files", ("notes.docx", make_docx(noise_png()), DOCX)),
        ("files", ("readme.txt", b"hello", "text/plain")),
    ]
    data = {"canvas_html": ["<p>Old page</p>"], "order": ["canvas:0", "file:0", "file:1"]}
    response = client.post("/api/extract", files=files, data=data)
    assert response.status_code == 200
    body = response.json()
    assert [s["ok"] for s in body["sources"]] == [True, True, False]
    assert body["sources"][0] == {"name": "Pasted Canvas page 1", "kind": "canvas", "ok": True, "warnings": []}
    assert "Unsupported file type" in body["sources"][2]["error"]
    assert body["text"].startswith("=== SOURCE 1: Pasted Canvas page 1 ===\n\nOld page")
    assert "=== SOURCE 2: notes.docx ===" in body["text"]
    assert body["images"][0]["ref"] == "IMG-01"
    assert "canvas_tag" not in body["images"][0]
    assert body["token_limit"] == 150000
    assert body["approx_tokens"] == len(body["text"]) // 4


def test_extract_default_order_files_then_pastes():
    data = {"canvas_html": ["<p>A</p>", "<p>B</p>"]}
    body = client.post("/api/extract", data=data).json()
    assert [s["name"] for s in body["sources"]] == ["Pasted Canvas page 1", "Pasted Canvas page 2"]


def test_extract_requires_a_source():
    response = client.post("/api/extract", data={})
    assert response.status_code == 400


def test_extract_rejects_too_many_sources():
    response = client.post("/api/extract", data={"canvas_html": ["<p>x</p>"] * 6})
    assert response.status_code == 400
    assert "Up to 5" in response.json()["detail"]


def test_extract_rejects_bad_order():
    response = client.post("/api/extract", data={"canvas_html": ["<p>x</p>"], "order": ["file:0"]})
    assert response.status_code == 400
```

- [ ] **Step 6: Run route test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_extract_route.py -v`
Expected: FAIL with 404 status assertions (route missing).

- [ ] **Step 7: Implement the router and register it**

Create empty `backend/app/routers/__init__.py`.

`backend/app/routers/extract.py`:
```python
import logging
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.extractors.canvas_html import extract_canvas_html
from app.extractors.common import SourceExtract
from app.extractors.docx import extract_docx
from app.extractors.models import ExtractResult, SourceStatus
from app.extractors.pdf import extract_pdf
from app.extractors.pptx import extract_pptx
from app.extractors.stream import assemble

logger = logging.getLogger(__name__)
router = APIRouter()

EXTRACTORS = {".docx": ("docx", extract_docx), ".pptx": ("pptx", extract_pptx), ".pdf": ("pdf", extract_pdf)}
READ_ERROR = "This file couldn't be read. It may be corrupt or password-protected."


async def _run(name: str, kind: str, fn, payload) -> tuple[SourceStatus, SourceExtract | None]:
    try:
        extract = await run_in_threadpool(fn, payload, name)
    except Exception:
        logger.exception("Extraction failed (%s)", kind)
        return SourceStatus(name=name, kind=kind, ok=False, error=READ_ERROR), None
    return SourceStatus(name=name, kind=kind, ok=True, warnings=list(extract.warnings)), extract


def _resolve_order(order: list[str], n_files: int, n_canvas: int) -> list[tuple[str, int]]:
    expected = [("file", i) for i in range(n_files)] + [("canvas", i) for i in range(n_canvas)]
    if not order:
        return expected
    keys = []
    for item in order:
        kind, _, index = item.partition(":")
        if kind not in ("file", "canvas") or not index.isdigit():
            raise HTTPException(400, f"Invalid source order entry: {item}")
        keys.append((kind, int(index)))
    if sorted(keys) != sorted(expected):
        raise HTTPException(400, "Source order doesn't match the uploaded sources.")
    return keys


@router.post("/extract", response_model=ExtractResult, response_model_exclude_none=True)
async def extract(
    files: list[UploadFile] = File(default=[]),
    canvas_html: list[str] = Form(default=[]),
    order: list[str] = Form(default=[]),
):
    keys = _resolve_order(order, len(files), len(canvas_html))
    if not keys:
        raise HTTPException(400, "Add at least one file or pasted Canvas page.")
    if len(keys) > settings.MAX_SOURCES:
        raise HTTPException(400, f"Up to {settings.MAX_SOURCES} sources per page.")

    statuses: list[SourceStatus] = []
    good: list[tuple[int, str, SourceExtract]] = []
    for kind, index in keys:
        if kind == "canvas":
            name = f"Pasted Canvas page {index + 1}"
            status, ex = await _run(name, "canvas", extract_canvas_html, canvas_html[index])
        else:
            upload = files[index]
            name = upload.filename or f"File {index + 1}"
            ext = Path(name).suffix.lower()
            if ext not in EXTRACTORS:
                status, ex = SourceStatus(
                    name=name, ok=False,
                    error="Unsupported file type. Use Word (.docx), PowerPoint (.pptx) or PDF.",
                ), None
            else:
                data = await upload.read()
                file_kind, fn = EXTRACTORS[ext]
                if len(data) > settings.max_file_bytes:
                    status, ex = SourceStatus(
                        name=name, kind=file_kind, ok=False,
                        error=f"File is larger than {settings.MAX_FILE_MB} MB.",
                    ), None
                else:
                    status, ex = await _run(name, file_kind, fn, data)
        statuses.append(status)
        if ex is not None:
            good.append((len(statuses) - 1, name, ex))

    assembled = await run_in_threadpool(assemble, [(n, e) for _, n, e in good], settings.MAX_IMAGES_TO_AI)
    for (status_index, _, _), extra in zip(good, assembled.warnings):
        statuses[status_index].warnings.extend(extra)

    return ExtractResult(
        sources=statuses,
        text=assembled.text,
        images=assembled.images,
        embeds=assembled.embeds,
        approx_tokens=len(assembled.text) // 4,
        token_limit=settings.TOKEN_WARN_LIMIT,
    )
```

Modify `backend/app/main.py` — add the import and include after the CORS middleware:
```python
from app.routers import extract
```
```python
app.include_router(extract.router, prefix="/api")
```

- [ ] **Step 8: Run all backend tests**

Run: `venv/Scripts/python -m pytest -v`
Expected: all pass (health, schema, validate, common, docx, pptx, pdf, canvas, stream, extract route).

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(backend): add /api/extract with multi-source stream assembly" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Prompts and Gemini wrapper

**Files:**
- Create: `backend/app/prompts/system.md`, `backend/app/prompts/regenerate_tab.md`, `backend/app/ai/prompts.py`, `backend/app/ai/gemini.py`
- Test: `backend/tests/test_gemini.py`, `backend/tests/test_prompts.py`

**Interfaces:**
- Produces:
  - `prompts.load_prompt(name: str) -> str` (reads `app/prompts/{name}.md`)
  - `gemini.ImagePart(label: str, data: bytes, mime: str = "image/jpeg")`
  - `gemini.GeminiError(message: str, status_code: int)` with `.message`, `.status_code`
  - `async gemini.generate_structured(*, api_key: str, system_prompt: str, prompt: str, images: list[ImagePart], schema: type[T], client_factory=_build_client) -> T`
  - Messages: `KEY_MESSAGE`, `RATE_MESSAGE`, `FAILED_MESSAGE`

- [ ] **Step 1: Write the system prompt**

`backend/app/prompts/system.md`:
````markdown
You are an instructional designer for the University of Adelaide pharmacy program. You turn lecturers' raw teaching material (Word documents, PowerPoint slides, PDFs, old Canvas pages) into the content of one Canvas LMS page.

You do not write HTML. You return JSON matching the provided schema: a title, an introduction, and a list of tabs, each holding a list of typed blocks. The app turns each block type into a fixed house-style component so every pharmacy course looks the same. Your job is to choose the right block for each piece of content and to write that content well.

# 1. Content rules (most important)

- **Never add facts.** Every clinical claim, number, dose, statistic, study and reference must come from the source material. Do not add drug doses, NNTs, guideline recommendations or citations that are not in the source, even if you are confident they are correct.
- **Never drop content.** All substantive teaching content in the source must appear on the page. You may reorder, merge duplicates, tighten wording, and convert prose into tables or lists.
- **Keep references verbatim.** Reproduce citations, URLs and DOIs exactly as given. If a citation is incomplete, keep it as-is and add a `citation` note.
- **Fix only obvious errors.** Correct clear typos and grammar. If something looks clinically wrong or out of date, do NOT change it; keep the original and add a `flag` note quoting it.
- **Australian context and spelling.** Use Australian English (sensitisation, haemoglobin, behaviour, paediatric) and Australian references (TGA, PBS, AMH, Therapeutic Guidelines, ARTG) where the source uses them.
- **Voice.** Clear, direct, collegial, written for pharmacy students. Use "we" and "as pharmacists" to connect content to practice. Short paragraphs (2–4 sentences). No emojis, no exclamation marks, no marketing language.
- **Slide decks.** Slide bullets are fragments. Expand them into full sentences only as far as the slide text and speaker notes support. Do not pad them with content that isn't there.
- **Skip scaffolding.** Slide numbers, "this lecture will cover…", title slides and acknowledgements are not page content (learning objectives may go in the introduction if the source has them).

# 2. Page structure

- `title`: a short page title in sentence case.
- `intro`: 1–2 paragraphs framing the topic and why it matters clinically.
- `tabs`: 3–8 tabs, one per major topic, in logical teaching order (typically overview/definitions → mechanism/pathophysiology → prevention/assessment → management → special topics). Tab titles are short (2–5 words), sentence case, unnumbered.
- `revision`: set `include` to true only if the request asks for it or the source contains revision questions or a quiz/H5P embed. If the source contains an `[EMBED-nn]` marker for a quiz or H5P embed, set `embed_ref` to that id (e.g. "EMBED-01").

Within a tab, use `heading` blocks to break content into sections. Rarely go more than about five headings without a table or callout.

# 3. Text formatting

Every text field supports only:
- `**bold**` — a key term the first time it appears, or the lead-in of a list item. Never bold whole sentences.
- `*italic*` — journal names in citations, and emphasis.
- `[link text](https://url)` — only URLs that appear in the source material, copied exactly.

No HTML and no other markdown (no `#`, no bullet characters, no tables inside text). Write special characters directly (—, –, →, ≠, ≤, ≥, µ); the app encodes them.

# 4. Block types — when to use each

Set every field that the block type doesn't use to null.

- **heading** (`text`): a subheading within a tab.
- **paragraph** (`text`): prose, 2–4 sentences.
- **list** (`ordered`, `items`): parallel points. Use `ordered: true` only for sequences or steps.
- **table** (`headers`, `rows`, optional `col_widths`): 3 or more items that share the same attributes (drug classes and agents, risk factors by category, features and what they mean, strategies and key points). Prefer a table over a long list when each item has a label plus an explanation. The first column is the label column (the app bolds it). Every row has exactly as many cells as `headers`. A cell may hold several points separated by a blank line (`\n\n`). Give `col_widths` (percentages, one per column) only when the defaults would look wrong.
- **contrast_table** (`left_header`, `right_header`, `rows` of exactly 2 cells): ONLY when the source directly contrasts two opposing concepts (acute vs chronic, benefits vs harms, do vs don't). The left column is shown in green and the right in red, so put the favourable/first concept on the left.
- **clinical** (`body`): links the preceding content to pharmacy practice. The title "Why this matters clinically" is added automatically. At most one per tab, placed at the end of the section it relates to. Base it on the source; if the source doesn't state the relevance, you may make an explicit link using only facts already on the page.
- **caution** (`title`, `items` or `body`): safety warnings, "if you do X, consider…" checklists, monitoring requirements, red flags, contraindications. Use `items` for a checklist (each usually starting with a **bold lead-in** followed by " - " and the detail) or `body` for a single statement.
- **evidence** (`title`, `children`): when the source summarises a study, systematic review or regulatory review. The prefix "Evidence: " is added automatically, so don't include it. One box per evidence topic. For each study, in order: a `paragraph` summary in plain language, its `figure` if the source has one, then its `citation`. Use a `references` child for a list of several references at the end of the box. Children may also be a `list` of findings.
- **citation** (`text`): a small centred reference line, e.g. under a figure outside an evidence box.
- **link** (`lead_in`, `url`, `link_text`): an external resource, report or guideline students are pointed to.
- **figure** (`ref`, `alt`, optional `caption`): see section 5.

# 5. Images and embeds

The source contains markers:
- `[IMG-nn]` or `[IMG-nn: slide 7]`: an image at that position. Thumbnails of most images are attached after the source text, each labelled with its id. Images from pasted Canvas pages have no thumbnail; judge them from the surrounding text.
- `[EMBED-nn]`: an existing embed (e.g. an H5P activity) from an old Canvas page.

For each image, decide whether it carries teaching content (a diagram, chart, table image, or figure from a study). If it does, add a `figure` block where it belongs, with `ref` set to its id, `alt` a concise description of what it shows (never a file name), and `caption` the source or citation if known. Skip decorative images (stock photos, logos, backgrounds, icons). Never invent image ids or URLs.

# 6. Notes for the lecturer

Use `notes` to report things the lecturer must check. Each note has a `kind`:
- `image`: one per figure whose image came from a Word, PowerPoint or PDF source (not a pasted Canvas page): the image id, where it came from, and which tab it is in, so the lecturer can upload it to Canvas.
- `flag`: anything possibly incorrect, outdated or inconsistent (quote the original text).
- `citation`: incomplete citations (quote them).
- `unplaced`: source content you could not place confidently.

Leave `notes` empty if there is nothing to report.
````

`backend/app/prompts/regenerate_tab.md`:
````markdown
# Regenerating one tab

You are now revising a single tab of an existing page, not writing a whole page.

- Return one tab object: `title` and `blocks`, following all the block rules above.
- Keep the tab's title unless the lecturer's instruction asks you to change it.
- Follow the lecturer's instruction. It overrides stylistic defaults but never the content rules: still no facts, doses, citations or links that aren't in the source material.
- Stay within this tab's topic. The outline lists the other tabs; don't repeat their content.
- Keep figures already in the tab, with the same ref ids, unless the instruction says otherwise.
````

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_prompts.py`:
```python
from app.ai.prompts import load_prompt


def test_prompts_load():
    assert "You do not write HTML" in load_prompt("system")
    assert "Regenerating one tab" in load_prompt("regenerate_tab")
```

`backend/tests/test_gemini.py`:
```python
import asyncio
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from app.ai import gemini


class Small(BaseModel):
    title: str


class FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome)


class ApiError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def run(models, images=()):
    client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return asyncio.run(gemini.generate_structured(
        api_key="k", system_prompt="sys", prompt="p", images=list(images),
        schema=Small, client_factory=lambda key: client,
    ))


def test_success_first_try():
    models = FakeModels(['{"title": "Pain"}'])
    assert run(models) == Small(title="Pain")
    assert len(models.calls) == 1
    assert models.calls[0]["config"].response_schema is Small


def test_retries_once_on_invalid_json():
    models = FakeModels(["{oops", '{"title": "Pain"}'])
    assert run(models).title == "Pain"
    assert len(models.calls) == 2


def test_fails_after_two_invalid_responses():
    with pytest.raises(gemini.GeminiError) as err:
        run(FakeModels(["{oops", '{"wrong": 1}']))
    assert err.value.status_code == 502
    assert err.value.message == gemini.FAILED_MESSAGE


def test_invalid_key_is_not_retried():
    models = FakeModels([ApiError(400, "API key not valid. Please pass a valid API key.")])
    with pytest.raises(gemini.GeminiError) as err:
        run(models)
    assert err.value.status_code == 401
    assert len(models.calls) == 1


def test_rate_limit_maps_to_429():
    with pytest.raises(gemini.GeminiError) as err:
        run(FakeModels([ApiError(429, "RESOURCE_EXHAUSTED")]))
    assert err.value.status_code == 429
    assert err.value.message == gemini.RATE_MESSAGE


def test_images_are_labelled_parts():
    models = FakeModels(['{"title": "Pain"}'])
    run(models, images=[gemini.ImagePart(label="Image IMG-01 (slide 2):", data=b"jpeg")])
    parts = models.calls[0]["contents"][0].parts
    assert parts[0].text == "p"
    assert parts[1].text == "Image IMG-01 (slide 2):"
    assert parts[2].inline_data.mime_type == "image/jpeg"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `venv/Scripts/python -m pytest tests/test_prompts.py tests/test_gemini.py -v`
Expected: FAIL with `ImportError` / `ModuleNotFoundError` for `app.ai.prompts` and `app.ai.gemini`.

- [ ] **Step 4: Implement**

`backend/app/ai/prompts.py`:
```python
from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache
def load_prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")
```

`backend/app/ai/gemini.py`:
```python
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
            logger.warning("Gemini call failed (attempt %d): %s", attempt, type(exc).__name__)
            continue
        try:
            return schema.model_validate_json(response.text or "")
        except (ValidationError, ValueError):
            logger.warning("Gemini returned invalid JSON (attempt %d)", attempt)
    raise GeminiError(FAILED_MESSAGE, 502)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `venv/Scripts/python -m pytest tests/test_prompts.py tests/test_gemini.py -v`
Expected: 7 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/prompts backend/app/ai/prompts.py backend/app/ai/gemini.py backend/tests/test_prompts.py backend/tests/test_gemini.py
git commit -m "feat(backend): add generation prompts and Gemini structured-output wrapper" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `/api/generate` and `/api/regenerate-tab`

**Files:**
- Create: `backend/app/routers/generate.py`
- Modify: `backend/app/ai/prompts.py` (add prompt builders), `backend/app/main.py` (include router)
- Test: `backend/tests/test_generate_route.py`

**Interfaces:**
- Consumes: `gemini.generate_structured`, `GeminiError`, `ImagePart`, `load_prompt`, `finalize_page`, `finalize_tab`, `SourceContext`, schema models.
- Produces:
  - `POST /api/generate` body `{text, images: [{ref, location, thumb_b64}], instructions, include_revision, title}` → `{page: Page}`
  - `POST /api/regenerate-tab` body `{text, images, outline: {intro, tab_titles}, tab: Tab, instruction}` → `{tab: Tab, notes: Note[]}`
  - Both require header `X-Gemini-Key` (401 otherwise). Responses exclude nulls.
  - `prompts.build_generate_prompt(title: str, include_revision: bool, instructions: str, text: str) -> str`
  - `prompts.build_regenerate_prompt(tab_json: str, other_titles: list[str], intro: list[str], instruction: str, text: str) -> str`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_generate_route.py`:
```python
import base64

import pytest
from fastapi.testclient import TestClient

from app.ai import gemini
from app.ai.schema import WirePage, WireTab
from app.main import app

client = TestClient(app)
HEADERS = {"X-Gemini-Key": "test-key"}
TEXT = "=== SOURCE 1: a.pptx ===\n\n--- Slide 1 ---\nSee https://www.tga.gov.au\n[IMG-01: slide 1]"
IMAGES = [{"ref": "IMG-01", "location": "slide 1", "thumb_b64": base64.b64encode(b"jpeg").decode()}]
P = {"type": "paragraph", "text": "Body."}


def wire_page():
    tabs = [{"title": t, "blocks": [P]} for t in ("Overview", "Mechanism", "Management")]
    tabs[0]["blocks"].append({"type": "figure", "ref": "IMG-01", "alt": "Pain pathway"})
    return WirePage.model_validate({"title": "AI title", "intro": ["Intro."], "tabs": tabs})


class Recorded(list):
    """List of captured kwargs, plus .outcome: the value (or exception) the fake returns."""


@pytest.fixture
def calls(monkeypatch):
    recorded = Recorded()
    recorded.outcome = {"value": None}

    async def fake(**kwargs):
        recorded.append(kwargs)
        value = recorded.outcome["value"]
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr(gemini, "generate_structured", fake)
    return recorded


def test_generate_returns_finalized_page(calls):
    calls.outcome["value"] = wire_page()
    body = {"text": TEXT, "images": IMAGES, "instructions": "Focus on counselling", "include_revision": True, "title": "Chronic pain"}
    response = client.post("/api/generate", json=body, headers=HEADERS)
    assert response.status_code == 200
    page = response.json()["page"]
    assert page["title"] == "Chronic pain"
    assert [t["id"] for t in page["tabs"]] == ["t1", "t2", "t3"]
    assert page["tabs"][0]["blocks"][1] == {"type": "figure", "ref": "IMG-01", "alt": "Pain pathway"}
    assert page["revision"] == {"include": True}
    kwargs = calls[0]
    assert kwargs["api_key"] == "test-key"
    assert kwargs["schema"] is WirePage
    assert "Focus on counselling" in kwargs["prompt"]
    assert "SOURCE MATERIAL" in kwargs["prompt"]
    assert kwargs["images"][0].label == "Image IMG-01 (slide 1):"
    assert kwargs["images"][0].data == b"jpeg"


def test_generate_requires_key(calls):
    response = client.post("/api/generate", json={"text": TEXT})
    assert response.status_code == 401


def test_generate_maps_gemini_errors(calls):
    calls.outcome["value"] = gemini.GeminiError(gemini.RATE_MESSAGE, 429)
    response = client.post("/api/generate", json={"text": TEXT}, headers=HEADERS)
    assert response.status_code == 429
    assert response.json()["detail"] == gemini.RATE_MESSAGE


def test_regenerate_tab_keeps_id_and_passes_instruction(calls):
    calls.outcome["value"] = WireTab.model_validate({"title": "Management", "blocks": [P, P]})
    body = {
        "text": TEXT,
        "images": IMAGES,
        "outline": {"intro": ["Intro."], "tab_titles": ["Overview", "Management"]},
        "tab": {"id": "t2", "title": "Management", "blocks": [P]},
        "instruction": "Make it shorter",
    }
    response = client.post("/api/regenerate-tab", json=body, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["tab"]["id"] == "t2"
    assert len(data["tab"]["blocks"]) == 2
    assert data["notes"] == []
    kwargs = calls[0]
    assert kwargs["schema"] is WireTab
    assert "Make it shorter" in kwargs["prompt"]
    assert "Overview" in kwargs["prompt"]
    assert "Regenerating one tab" in kwargs["system_prompt"]


def test_regenerate_tab_empty_result_is_502(calls):
    calls.outcome["value"] = WireTab.model_validate({"title": "X", "blocks": []})
    body = {"text": TEXT, "outline": {}, "tab": {"id": "t1", "title": "X", "blocks": [P]}, "instruction": "Shorter"}
    response = client.post("/api/regenerate-tab", json=body, headers=HEADERS)
    assert response.status_code == 502
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/test_generate_route.py -v`
Expected: FAIL with 404 status assertions (routes missing).

- [ ] **Step 3: Add prompt builders**

Append to `backend/app/ai/prompts.py`:
```python
def build_generate_prompt(title: str, include_revision: bool, instructions: str, text: str) -> str:
    lines = []
    if title.strip():
        lines.append(f"Page title chosen by the lecturer: {title.strip()}")
    lines.append(
        "Include revision block: "
        + ("yes" if include_revision else "only if the source contains revision questions or a quiz/H5P embed")
    )
    if instructions.strip():
        lines.append(
            "Lecturer's instructions (follow them unless they conflict with the content rules):\n"
            + instructions.strip()
        )
    lines.append("SOURCE MATERIAL:\n<<<\n" + text + "\n>>>")
    return "\n\n".join(lines)


def build_regenerate_prompt(tab_json: str, other_titles: list[str], intro: list[str], instruction: str, text: str) -> str:
    lines = [
        "Page introduction:\n" + ("\n".join(intro) if intro else "(none)"),
        "Other tabs on this page (do not repeat their content): "
        + (", ".join(other_titles) if other_titles else "(none)"),
        "Current tab JSON:\n" + tab_json,
        "Lecturer's instruction for this tab:\n" + instruction.strip(),
        "SOURCE MATERIAL:\n<<<\n" + text + "\n>>>",
    ]
    return "\n\n".join(lines)
```

- [ ] **Step 4: Implement the router and register it**

`backend/app/routers/generate.py`:
```python
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
```

Modify `backend/app/main.py`: change the router import to `from app.routers import extract, generate` and add `app.include_router(generate.router, prefix="/api")` below the extract include.

- [ ] **Step 5: Run all backend tests**

Run: `venv/Scripts/python -m pytest -v`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(backend): add page generation and single-tab regeneration endpoints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Frontend scaffold, theme, API client and app shell

**Files:**
- Create: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`, `frontend/.env.example`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`, `frontend/src/config.ts`, `frontend/src/types/page.ts`, `frontend/src/types/api.ts`, `frontend/src/api/client.ts`, `frontend/src/api/endpoints.ts`, `frontend/src/hooks/useApiKey.ts`, `frontend/src/utils/format.ts`, `frontend/src/components/ui/{Button,IconButton,Modal,Spinner}.tsx`, `frontend/src/components/layout/{Layout,Header,ApiKeyModal,ServerStatusBanner}.tsx`, `frontend/src/pages/CreatePage.tsx` (temporary heading, replaced in Task 17)
- Test: `frontend/src/config.test.ts`

**Interfaces:**
- Produces:
  - `config.ts`: `MAX_SOURCES = 5`, `MAX_FILE_MB = 25`, `ACCEPTED_EXTENSIONS`, `checkFile(file: File, currentCount: number): string | null`
  - `types/page.ts`: `Note`, `NoteKind`, `Block`, `EvidenceChild`, `Tab`, `Page`
  - `types/api.ts`: `SourceStatus`, `ImageInfo`, `EmbedInfo`, `ExtractResult`, `ImageForAI`, `GenerateRequest`, `RegenerateTabRequest`, `SourceInput`
  - `api/client.ts`: `api` (axios), `getApiKey()`, `setApiKey(k)`, `clearApiKey()`, `getApiErrorMessage(err, fallback)`
  - `api/endpoints.ts`: `checkHealth()`, `extractSources(sources: SourceInput[]): Promise<ExtractResult>`, `generatePage(req): Promise<{page: Page}>`, `regenerateTab(req): Promise<{tab: Tab; notes: Note[]}>`
  - `hooks/useApiKey.ts`: `useApiKey(): [key, save, clear]`
  - `utils/format.ts`: `formatSize(bytes)`, `formatDate(ts)`
  - UI: `Button` (variants primary/secondary/ghost/danger), `IconButton`, `Modal`, `Spinner`, `Layout`

- [ ] **Step 1: Create project config files**

`frontend/package.json`:
```json
{
  "name": "pharm-canvas-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.1.18",
    "axios": "^1.13.4",
    "idb": "^8.0.3",
    "jszip": "^3.10.1",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-hot-toast": "^2.6.0",
    "react-router-dom": "^7.13.0",
    "tailwindcss": "^4.1.18"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "fake-indexeddb": "^6.2.5",
    "typescript": "~5.9.3",
    "vite": "^7.2.4",
    "vitest": "^3.2.4"
  }
}
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PharmCanvas</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  test: { environment: "node" },
});
```

`frontend/tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

`frontend/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "types": ["node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

`frontend/.env.example`:
```
# Leave empty for local dev (Vite proxies /api to localhost:8000).
# On Vercel, set to the Render backend URL, e.g. https://pharm-canvas-backend.onrender.com
VITE_API_BASE_URL=
```

- [ ] **Step 2: Install**

Run: `cd frontend && npm install`
Expected: installs without errors.

- [ ] **Step 3: Write the failing test**

`frontend/src/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { checkFile, MAX_SOURCES } from "./config";

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

describe("checkFile", () => {
  it("accepts supported types", () => {
    expect(checkFile(file("Week 3.PPTX"), 0)).toBeNull();
    expect(checkFile(file("notes.docx"), 0)).toBeNull();
    expect(checkFile(file("handout.pdf"), 0)).toBeNull();
  });
  it("rejects unsupported types", () => {
    expect(checkFile(file("notes.txt"), 0)).toMatch(/only Word/);
  });
  it("rejects large files", () => {
    expect(checkFile(file("big.pdf", 26 * 1024 * 1024), 0)).toMatch(/larger than 25 MB/);
  });
  it("rejects when the source limit is reached", () => {
    expect(checkFile(file("a.pdf"), MAX_SOURCES)).toMatch(/up to 5 sources/);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- src/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 5: Implement config, types, API, hooks, utils**

`frontend/src/config.ts`:
```ts
export const MAX_SOURCES = 5;
export const MAX_FILE_MB = 25;
export const ACCEPTED_EXTENSIONS = [".docx", ".pptx", ".pdf"];

export function checkFile(file: File, currentCount: number): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `${file.name}: only Word (.docx), PowerPoint (.pptx) and PDF files are supported.`;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `${file.name} is larger than ${MAX_FILE_MB} MB.`;
  }
  if (currentCount >= MAX_SOURCES) {
    return `You can add up to ${MAX_SOURCES} sources per page.`;
  }
  return null;
}
```

`frontend/src/types/page.ts`:
```ts
export type NoteKind = "image" | "flag" | "citation" | "unplaced";

export interface Note {
  kind: NoteKind;
  text: string;
}

export interface FigureBlock {
  type: "figure";
  ref: string;
  alt: string;
  caption?: string;
}

export type EvidenceChild =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | FigureBlock
  | { type: "citation"; text: string }
  | { type: "references"; items: string[] };

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; col_widths?: number[]; rows: string[][] }
  | { type: "contrast_table"; left_header: string; right_header: string; rows: string[][] }
  | { type: "clinical"; body: string }
  | { type: "caution"; title: string; body?: string; items?: string[] }
  | { type: "evidence"; title: string; children: EvidenceChild[] }
  | { type: "citation"; text: string }
  | { type: "link"; lead_in: string; url: string; link_text: string }
  | FigureBlock;

export interface Tab {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Page {
  title: string;
  intro: string[];
  tabs: Tab[];
  revision: { include: boolean; embed_ref?: string };
  notes: Note[];
}
```

`frontend/src/types/api.ts`:
```ts
import type { Tab } from "./page";

export type SourceKind = "docx" | "pptx" | "pdf" | "canvas";

export interface SourceStatus {
  name: string;
  kind?: SourceKind;
  ok: boolean;
  error?: string;
  warnings: string[];
}

export interface ImageInfo {
  ref: string;
  source: string;
  location: string;
  mime?: string;
  data_b64?: string;
  thumb_b64?: string;
  canvas_tag?: string;
}

export interface EmbedInfo {
  ref: string;
  html: string;
}

export interface ExtractResult {
  sources: SourceStatus[];
  text: string;
  images: ImageInfo[];
  embeds: EmbedInfo[];
  approx_tokens: number;
  token_limit: number;
}

export interface ImageForAI {
  ref: string;
  location: string;
  thumb_b64: string;
}

export interface GenerateRequest {
  text: string;
  images: ImageForAI[];
  instructions: string;
  include_revision: boolean;
  title: string;
}

export interface RegenerateTabRequest {
  text: string;
  images: ImageForAI[];
  outline: { intro: string[]; tab_titles: string[] };
  tab: Tab;
  instruction: string;
}

export type SourceInput =
  | { id: string; kind: "file"; file: File }
  | { id: string; kind: "canvas"; html: string; label: string };
```

`frontend/src/api/client.ts`:
```ts
import axios from "axios";

export const API_KEY_STORAGE = "pharm_canvas_gemini_key";

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
  } catch {
    // storage unavailable (private mode); key lives only for this session's requests
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // ignore
  }
}

const baseURL = import.meta.env.VITE_API_BASE_URL
  ? `${String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, "")}/api`
  : "/api";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const key = getApiKey();
  if (key) config.headers["X-Gemini-Key"] = key;
  return config;
});

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
    return err.response.data.detail;
  }
  return fallback;
}
```

`frontend/src/api/endpoints.ts`:
```ts
import { api } from "./client";
import type { ExtractResult, GenerateRequest, RegenerateTabRequest, SourceInput } from "../types/api";
import type { Note, Page, Tab } from "../types/page";

export async function checkHealth(): Promise<void> {
  await api.get("/health", { timeout: 10_000 });
}

export async function extractSources(sources: SourceInput[]): Promise<ExtractResult> {
  const form = new FormData();
  let files = 0;
  let pastes = 0;
  for (const source of sources) {
    if (source.kind === "file") {
      form.append("files", source.file);
      form.append("order", `file:${files++}`);
    } else {
      form.append("canvas_html", source.html);
      form.append("order", `canvas:${pastes++}`);
    }
  }
  const { data } = await api.post<ExtractResult>("/extract", form);
  return data;
}

export async function generatePage(req: GenerateRequest): Promise<{ page: Page }> {
  const { data } = await api.post<{ page: Page }>("/generate", req);
  return data;
}

export async function regenerateTab(req: RegenerateTabRequest): Promise<{ tab: Tab; notes: Note[] }> {
  const { data } = await api.post<{ tab: Tab; notes: Note[] }>("/regenerate-tab", req);
  return data;
}
```

`frontend/src/hooks/useApiKey.ts`:
```ts
import { useCallback, useEffect, useState } from "react";
import { clearApiKey, getApiKey, setApiKey } from "../api/client";

const EVENT = "pharm-canvas-api-key";

export function useApiKey(): [string, (key: string) => void, () => void] {
  const [key, setKey] = useState(getApiKey);

  useEffect(() => {
    const sync = () => setKey(getApiKey());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const save = useCallback((next: string) => {
    setApiKey(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const clear = useCallback(() => {
    clearApiKey();
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [key, save, clear];
}
```

`frontend/src/utils/format.ts`:
```ts
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(ts);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/config.test.ts`
Expected: 4 passed

- [ ] **Step 7: Create theme CSS and UI primitives**

`frontend/src/index.css`:
```css
@import url("https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Lato:wght@400;700&family=Roboto+Serif:opsz,wght@8..144,400;8..144,600&display=swap");
@import "tailwindcss";

@theme {
  --color-navy: #140f50;
  --color-purple: #836bff;
  --color-purple-soft: #f1eeff;
  --color-brightblue: #1448ff;
  --color-brightblue-dark: #0f3ae0;
  --color-limestone: #f8efe0;
  --color-limestone-soft: #fcf8f1;
  --color-ink-muted: #5b587a;
  --color-line: #e7e3f3;

  --font-serif: "Roboto Serif", Georgia, serif;
  --font-display: "Barlow Condensed", "Arial Narrow", Arial, sans-serif;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
}

body {
  @apply bg-white font-sans text-navy antialiased;
}

::selection {
  background: #836bff33;
}
```

`frontend/src/components/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brightblue text-white shadow-sm hover:bg-brightblue-dark disabled:bg-[#b9c6ff]",
  secondary: "border border-line bg-white text-navy hover:border-purple disabled:text-ink-muted/60",
  ghost: "text-navy hover:bg-purple-soft disabled:text-ink-muted/50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}
```

`frontend/src/components/ui/IconButton.tsx`:
```tsx
import type { ButtonHTMLAttributes } from "react";

export function IconButton({ label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm text-ink-muted transition-colors hover:bg-purple-soft hover:text-navy focus-visible:outline-2 focus-visible:outline-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${className}`}
    />
  );
}
```

`frontend/src/components/ui/Spinner.tsx`:
```tsx
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-purple/30 border-t-purple ${className}`}
    />
  );
}
```

`frontend/src/components/ui/Modal.tsx`:
```tsx
import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, onClose, children, footer, wide = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl bg-white p-6 shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl font-semibold text-navy">{title}</h2>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create layout components**

`frontend/src/components/layout/ApiKeyModal.tsx`:
```tsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useApiKey } from "../../hooks/useApiKey";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function ApiKeyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, save, clear] = useApiKey();
  const [value, setValue] = useState(key);

  useEffect(() => {
    if (open) setValue(key);
  }, [open, key]);

  return (
    <Modal
      open={open}
      title="Gemini API key"
      onClose={onClose}
      footer={
        <>
          {key && (
            <Button variant="ghost" onClick={() => { clear(); toast.success("Key removed"); onClose(); }}>
              Remove key
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!value.trim()}
            onClick={() => { save(value.trim()); toast.success("Key saved in this browser"); onClose(); }}
          >
            Save key
          </Button>
        </>
      }
    >
      <p className="font-serif text-sm leading-relaxed text-ink-muted">
        PharmCanvas uses your own Gemini key. It's saved only in this browser and sent with each request. It's never stored on the server.
      </p>
      <label className="mt-4 block text-sm font-medium">
        API key
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AIza…"
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-mono text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
        />
      </label>
      <p className="mt-3 text-sm text-ink-muted">
        No key yet? Create one free at{" "}
        <a className="text-brightblue underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
          aistudio.google.com/apikey
        </a>
        .
      </p>
    </Modal>
  );
}
```

`frontend/src/components/layout/Header.tsx`:
```tsx
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useApiKey } from "../../hooks/useApiKey";
import { Button } from "../ui/Button";
import { ApiKeyModal } from "./ApiKeyModal";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive ? "bg-purple-soft text-navy" : "text-ink-muted hover:text-navy"}`;

export function Header() {
  const [key] = useApiKey();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-bold tracking-tight text-navy">PharmCanvas</span>
          <span className="hidden text-sm text-ink-muted md:inline">Canvas pages for pharmacy, in one house style</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          <NavLink to="/" end className={navClass}>Create</NavLink>
          <NavLink to="/pages" className={navClass}>My pages</NavLink>
        </nav>
        <Button variant={key ? "secondary" : "primary"} onClick={() => setOpen(true)}>
          {key ? "API key saved" : "Insert API Key"}
        </Button>
      </div>
      <ApiKeyModal open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
```

`frontend/src/components/layout/ServerStatusBanner.tsx`:
```tsx
import { useEffect, useState } from "react";
import { checkHealth } from "../../api/endpoints";
import { Spinner } from "../ui/Spinner";

type State = "checking" | "slow" | "ok" | "down";
const GIVE_UP_MS = 90_000;

export function ServerStatusBanner() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let done = false;
    const started = Date.now();
    const slowTimer = setTimeout(() => { if (!done) setState("slow"); }, 1500);
    (async () => {
      while (!done) {
        try {
          await checkHealth();
          done = true;
          setState("ok");
        } catch {
          if (Date.now() - started > GIVE_UP_MS) {
            done = true;
            setState("down");
          } else {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
    })();
    return () => { done = true; clearTimeout(slowTimer); };
  }, []);

  if (state === "slow") {
    return (
      <div className="flex items-center justify-center gap-3 bg-limestone px-6 py-2 text-sm text-navy">
        <Spinner /> Waking up the server (up to a minute)…
      </div>
    );
  }
  if (state === "down") {
    return (
      <div className="bg-red-50 px-6 py-2 text-center text-sm text-red-800">
        Can't reach the server. Try refreshing the page in a minute.
      </div>
    );
  }
  return null;
}
```

`frontend/src/components/layout/Layout.tsx`:
```tsx
import { Toaster } from "react-hot-toast";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { ServerStatusBanner } from "./ServerStatusBanner";

export function Layout() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <ServerStatusBanner />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>
      <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: "14px", color: "#140f50" } }} />
    </div>
  );
}
```

`frontend/src/pages/CreatePage.tsx` (temporary; replaced in Task 17):
```tsx
export default function CreatePage() {
  return <h1 className="font-display text-4xl font-bold">Create a page</h1>;
}
```

`frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import CreatePage from "./pages/CreatePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CreatePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

`frontend/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Verify build**

Run: `npm run build && npm test`
Expected: build succeeds; tests pass.

- [ ] **Step 10: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold app shell with brand theme, API client and key modal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Inline text renderer

**Files:**
- Create: `frontend/src/render/inline.ts`
- Test: `frontend/src/render/inline.test.ts`

**Interfaces:**
- Produces: `escapeText(s): string`, `escapeAttr(s): string`, `renderInline(s): string`, `splitParagraphs(s): string[]`.

- [ ] **Step 1: Write the failing test**

`frontend/src/render/inline.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { escapeText, renderInline, splitParagraphs } from "./inline";

describe("renderInline", () => {
  it("escapes HTML", () => {
    expect(renderInline('Use <b>care</b> & "dose"')).toBe("Use &lt;b&gt;care&lt;/b&gt; &amp; &quot;dose&quot;");
  });
  it("renders bold and italic", () => {
    expect(renderInline("**Start low** - then *go slow*")).toBe("<strong>Start low</strong> - then <em>go slow</em>");
  });
  it("leaves lone asterisks alone", () => {
    expect(renderInline("2 * 3 * 4")).toBe("2 * 3 * 4");
  });
  it("renders http(s) links", () => {
    expect(renderInline("See [TGA](https://www.tga.gov.au/a?b=1&c=2)")).toBe(
      'See <a href="https://www.tga.gov.au/a?b=1&amp;c=2" target="_blank" rel="noopener">TGA</a>',
    );
  });
  it("does not link other schemes", () => {
    expect(renderInline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });
  it("encodes special characters as entities", () => {
    expect(renderInline("4 g/day — max ≥ 2 µg, Vægter")).toBe("4 g/day &mdash; max &ge; 2 &micro;g, V&#230;gter");
  });
});

describe("escapeText", () => {
  it("encodes non-BMP characters as one entity", () => {
    expect(escapeText("💊")).toBe("&#128138;");
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines and trims", () => {
    expect(splitParagraphs("A\n\n  B  \n \nC")).toEqual(["A", "B", "C"]);
    expect(splitParagraphs("single")).toEqual(["single"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/render/inline.test.ts`
Expected: FAIL — cannot resolve `./inline`.

- [ ] **Step 3: Implement**

`frontend/src/render/inline.ts`:
```ts
const NAMED: Record<string, string> = {
  "—": "&mdash;", "–": "&ndash;", "→": "&rarr;", "←": "&larr;", "≠": "&ne;", "≤": "&le;", "≥": "&ge;",
  "µ": "&micro;", "μ": "&micro;", "°": "&deg;", "±": "&plusmn;", "×": "&times;", "…": "&hellip;",
  "‘": "&lsquo;", "’": "&rsquo;", "“": "&ldquo;", "”": "&rdquo;", "\u00a0": "&nbsp;",
};

export function escapeText(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else {
      const cp = ch.codePointAt(0)!;
      out += cp < 128 ? ch : NAMED[ch] ?? `&#${cp};`;
    }
  }
  return out;
}

export const escapeAttr = escapeText;

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g;

/** Render the allowed markdown subset (**bold**, *italic*, [text](https://url)) to safe HTML. */
export function renderInline(src: string): string {
  return escapeText(src)
    .replace(LINK_RE, (_m, text: string, url: string) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`)
    .replace(BOLD_RE, "<strong>$1</strong>")
    .replace(ITALIC_RE, "$1<em>$2</em>");
}

export function splitParagraphs(s: string): string[] {
  return s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/render/inline.test.ts`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/render
git commit -m "feat(frontend): add safe inline markdown renderer with entity encoding" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Block templates (house style)

**Files:**
- Create: `frontend/src/render/templates.ts`
- Test: `frontend/src/render/templates.test.ts`

**Interfaces:**
- Consumes: `renderInline`, `escapeAttr`, `escapeText`, `splitParagraphs` (Task 13); `Block`, `EvidenceChild`, `FigureBlock` (Task 12); `ImageInfo`.
- Produces: `RenderContext { images: Record<string, ImageInfo>; embeds: Record<string, string> }`, `indent(lines, level=1): string[]`, `blockLines(block, ctx): string[]`, `figureLines(block, ctx): string[]`, `withAlt(tag, alt): string`.

- [ ] **Step 1: Write the failing golden tests**

`frontend/src/render/templates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Block } from "../types/page";
import { blockLines, type RenderContext, withAlt } from "./templates";

const TD = 'style="padding: 10px 12px; vertical-align: top; border: 1px solid #cbd5e1;"';
const ctx: RenderContext = {
  images: {
    "IMG-01": { ref: "IMG-01", source: "deck.pptx", location: "slide 7", mime: "image/png", data_b64: "AAAA" },
    "IMG-02": {
      ref: "IMG-02",
      source: "Pasted Canvas page 1",
      location: "",
      canvas_tag: '<img src="https://learn.adelaide.edu.au/courses/1/files/2/preview" alt="image.png" width="616" height="394" data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2" data-api-returntype="File"/>',
    },
  },
  embeds: {},
};
const render = (b: Block) => blockLines(b, ctx).join("\n");

describe("block templates", () => {
  it("heading", () => {
    expect(render({ type: "heading", text: "Why it matters" })).toBe('<h4 style="color: #1e3a5f;">Why it matters</h4>');
  });

  it("paragraph and list", () => {
    expect(render({ type: "paragraph", text: "Body" })).toBe("<p>Body</p>");
    expect(render({ type: "list", ordered: false, items: ["A", "B"] })).toBe("<ul>\n    <li>A</li>\n    <li>B</li>\n</ul>");
    expect(render({ type: "list", ordered: true, items: ["A"] })).toBe("<ol>\n    <li>A</li>\n</ol>");
  });

  it("standard table: default widths, bold label column, zebra rows, multi-paragraph cells", () => {
    const html = render({
      type: "table",
      headers: ["Category", "Risk factors"],
      rows: [
        ["**Pain-related**", "Severe acute pain"],
        ["Psychological", "Depression\n\nAnxiety"],
      ],
    });
    expect(html).toBe(
      [
        '<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">',
        "    <thead>",
        "        <tr>",
        '            <th style="background-color: #1e3a5f; color: #ffffff; padding: 10px 12px; text-align: left; width: 26%; border: 1px solid #1e3a5f;">Category</th>',
        '            <th style="background-color: #1e3a5f; color: #ffffff; padding: 10px 12px; text-align: left; border: 1px solid #1e3a5f;">Risk factors</th>',
        "        </tr>",
        "    </thead>",
        "    <tbody>",
        "        <tr>",
        `            <td ${TD}><strong>Pain-related</strong></td>`,
        `            <td ${TD}>Severe acute pain</td>`,
        "        </tr>",
        '        <tr style="background-color: #f1f5f9;">',
        `            <td ${TD}><strong>Psychological</strong></td>`,
        `            <td ${TD}>`,
        "                <p>Depression</p>",
        "                <p>Anxiety</p>",
        "            </td>",
        "        </tr>",
        "    </tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("table with three columns spreads widths evenly unless given", () => {
    const even = render({ type: "table", headers: ["A", "B", "C"], rows: [["1", "2", "3"]] });
    expect(even.match(/width: 33\.33%;/g)).toHaveLength(3);
    const given = render({ type: "table", headers: ["A", "B", "C"], col_widths: [6.70732, 16.17, 77.12], rows: [["1", "2", "3"]] });
    expect(given).toContain("width: 6.71%;");
    expect(given).toContain("width: 77.12%;");
  });

  it("contrast table", () => {
    expect(render({ type: "contrast_table", left_header: "Acute pain", right_header: "Chronic pain", rows: [["Symptom", "Disease"]] })).toBe(
      [
        '<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">',
        "    <thead>",
        "        <tr>",
        '            <th style="background-color: #166534; color: #ffffff; padding: 10px 12px; text-align: left; width: 50%; border: 1px solid #166534;">Acute pain</th>',
        '            <th style="background-color: #b91c1c; color: #ffffff; padding: 10px 12px; text-align: left; width: 50%; border: 1px solid #b91c1c;">Chronic pain</th>',
        "        </tr>",
        "    </thead>",
        "    <tbody>",
        "        <tr>",
        `            <td ${TD}>Symptom</td>`,
        `            <td ${TD}>Disease</td>`,
        "        </tr>",
        "    </tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("clinical callout", () => {
    expect(render({ type: "clinical", body: "Prevention works." })).toBe(
      '<div style="border-left: 4px solid #0d9488; background-color: #f0fdfa; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;"><strong style="color: #0f766e;">Why this matters clinically</strong><br />Prevention works.</div>',
    );
  });

  it("caution callout with items and with body", () => {
    expect(render({ type: "caution", title: "If using an opioid, consider:", items: ["**Start low** - go slow"] })).toBe(
      [
        '<div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;"><strong style="color: #b45309;">If using an opioid, consider:</strong>',
        '    <ul style="margin: 8px 0 0 0;">',
        "        <li><strong>Start low</strong> - go slow</li>",
        "    </ul>",
        "</div>",
      ].join("\n"),
    );
    expect(render({ type: "caution", title: "Red flag", body: "Refer urgently." })).toBe(
      '<div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;"><strong style="color: #b45309;">Red flag</strong><br />Refer urgently.</div>',
    );
  });

  it("evidence box with summary, figure, citation and references", () => {
    expect(
      render({
        type: "evidence",
        title: "Evidence: Paracetamol in chronic pain",
        children: [
          { type: "paragraph", text: "Little efficacy." },
          { type: "figure", ref: "IMG-01", alt: "Forest plot" },
          { type: "citation", text: "Ennis ZN. *Basic Clin Pharmacol Toxicol*. 2016." },
          { type: "list", items: ["Finding"] },
          { type: "references", items: ["Ref A"] },
        ],
      }),
    ).toBe(
      [
        '<div style="background-color: #eef2ff; padding: 16px 18px; margin: 16px 0px; border-radius: 6px; border: 1px solid #c7d2fe;">',
        '    <p style="margin-top: 0;"><strong style="color: #3730a3;">Evidence: Paracetamol in chronic pain</strong></p>',
        "    <p>Little efficacy.</p>",
        '    <p style="text-align: center; border: 2px dashed #94a3b8; padding: 24px; color: #64748b;">[INSERT IMAGE IMG-01: Forest plot, slide 7]</p>',
        '    <p style="text-align: center;"><span style="font-size: 8pt; color: #64748b;">Ennis ZN. <em>Basic Clin Pharmacol Toxicol</em>. 2016.</span></p>',
        '    <ul style="margin: 0;">',
        "        <li>Finding</li>",
        "    </ul>",
        '    <p style="margin-bottom: 4px;"><span style="text-decoration: underline;">References:</span></p>',
        '    <p style="margin: 4px 0;"><span style="font-size: 8pt; color: #64748b;">Ref A</span></p>',
        "</div>",
      ].join("\n"),
    );
  });

  it("link callout", () => {
    expect(render({ type: "link", lead_in: "To read more on the report:", url: "https://x.org/a.pdf", link_text: "2025 Report" })).toBe(
      '<div style="border-left: 4px solid #2563eb; background-color: #eff6ff; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;">To read more on the report: <a href="https://x.org/a.pdf" target="_blank" rel="noopener">2025 Report</a></div>',
    );
    expect(render({ type: "link", lead_in: "Guidance", url: "https://x.org", link_text: "TGA" })).toContain(">Guidance: <a ");
  });

  it("figure placeholder and caption", () => {
    expect(render({ type: "figure", ref: "IMG-01", alt: "Opioid ladder", caption: "AMH Online" })).toBe(
      [
        '<p style="text-align: center; border: 2px dashed #94a3b8; padding: 24px; color: #64748b;">[INSERT IMAGE IMG-01: Opioid ladder, slide 7]</p>',
        '<p style="text-align: center;"><span style="font-size: 8pt; color: #64748b;">AMH Online</span></p>',
      ].join("\n"),
    );
  });

  it("canvas figure keeps the original tag, replacing a filename alt", () => {
    expect(render({ type: "figure", ref: "IMG-02", alt: "Opioid ladder" })).toBe(
      '<p style="text-align: center;"><img src="https://learn.adelaide.edu.au/courses/1/files/2/preview" alt="Opioid ladder" width="616" height="394" data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2" data-api-returntype="File"/></p>',
    );
  });
});

describe("withAlt", () => {
  it("keeps a meaningful alt", () => {
    const tag = '<img alt="WHO ladder" src="x"/>';
    expect(withAlt(tag, "Other")).toBe(tag);
  });
  it("adds alt when missing", () => {
    expect(withAlt('<img src="x"/>', "Chart")).toBe('<img alt="Chart" src="x"/>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/render/templates.test.ts`
Expected: FAIL — cannot resolve `./templates`.

- [ ] **Step 3: Implement**

`frontend/src/render/templates.ts`:
```ts
import type { Block, EvidenceChild, FigureBlock } from "../types/page";
import type { ImageInfo } from "../types/api";
import { escapeAttr, escapeText, renderInline, splitParagraphs } from "./inline";

export interface RenderContext {
  images: Record<string, ImageInfo>;
  embeds: Record<string, string>;
}

const NAVY = "#1e3a5f";
const TABLE = "border-collapse: collapse; width: 100%; margin: 16px 0;";
const TD = "padding: 10px 12px; vertical-align: top; border: 1px solid #cbd5e1;";
const ZEBRA_ROW = '<tr style="background-color: #f1f5f9;">';
const CITE_SPAN = "font-size: 8pt; color: #64748b;";
const EVIDENCE_BOX = "background-color: #eef2ff; padding: 16px 18px; margin: 16px 0px; border-radius: 6px; border: 1px solid #c7d2fe;";
const PLACEHOLDER = "text-align: center; border: 2px dashed #94a3b8; padding: 24px; color: #64748b;";

const callout = (border: string, bg: string) =>
  `border-left: 4px solid ${border}; background-color: ${bg}; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;`;

export function indent(lines: string[], level = 1): string[] {
  const pad = "    ".repeat(level);
  return lines.map((line) => pad + line);
}

function pct(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

function th(text: string, bg: string, width?: number): string {
  const w = width === undefined ? "" : ` width: ${pct(width)};`;
  return `<th style="background-color: ${bg}; color: #ffffff; padding: 10px 12px; text-align: left;${w} border: 1px solid ${bg};">${renderInline(text)}</th>`;
}

function td(content: string, bold = false): string[] {
  const paras = splitParagraphs(content);
  if (paras.length <= 1) {
    const inner = renderInline(paras[0] ?? "");
    return [`<td style="${TD}">${bold ? `<strong>${inner}</strong>` : inner}</td>`];
  }
  return [`<td style="${TD}">`, ...indent(paras.map((p) => `<p>${renderInline(p)}</p>`)), "</td>"];
}

function columnWidths(count: number, given?: number[]): (number | undefined)[] {
  if (given && given.length === count) return given;
  if (count === 2) return [26, undefined];
  return Array.from({ length: count }, () => 100 / count);
}

const stripBold = (s: string) => s.replace(/^\*\*([\s\S]*)\*\*$/, "$1");

function tableLines(headerCells: string[], bodyRows: string[][], zebra: boolean): string[] {
  return [
    `<table style="${TABLE}">`,
    ...indent([
      "<thead>",
      ...indent(["<tr>", ...indent(headerCells), "</tr>"]),
      "</thead>",
      "<tbody>",
      ...indent(bodyRows.flatMap((cells, r) => [zebra && r % 2 === 1 ? ZEBRA_ROW : "<tr>", ...indent(cells), "</tr>"])),
      "</tbody>",
    ]),
    "</table>",
  ];
}

function listLines(items: string[], ordered: boolean, style?: string): string[] {
  const tag = ordered ? "ol" : "ul";
  return [`<${tag}${style ? ` style="${style}"` : ""}>`, ...indent(items.map((i) => `<li>${renderInline(i)}</li>`)), `</${tag}>`];
}

function citationLines(text: string): string[] {
  return [`<p style="text-align: center;"><span style="${CITE_SPAN}">${renderInline(text)}</span></p>`];
}

export function withAlt(tag: string, alt: string): string {
  const match = tag.match(/\salt="([^"]*)"/);
  const current = (match?.[1] ?? "").trim();
  const replaceable = current === "" || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(current);
  if (!replaceable) return tag;
  const attr = ` alt="${escapeAttr(alt)}"`;
  return match ? tag.replace(match[0], attr) : tag.replace(/^<img/i, `<img${attr}`);
}

export function figureLines(block: FigureBlock, ctx: RenderContext): string[] {
  const image = ctx.images[block.ref];
  const lines = image?.canvas_tag
    ? [`<p style="text-align: center;">${withAlt(image.canvas_tag, block.alt)}</p>`]
    : [
        `<p style="${PLACEHOLDER}">[INSERT IMAGE ${escapeText(block.ref)}: ${renderInline(block.alt)}${
          image?.location ? `, ${escapeText(image.location)}` : ""
        }]</p>`,
      ];
  if (block.caption) lines.push(...citationLines(block.caption));
  return lines;
}

function childLines(child: EvidenceChild, ctx: RenderContext): string[] {
  switch (child.type) {
    case "paragraph":
      return [`<p>${renderInline(child.text)}</p>`];
    case "list":
      return listLines(child.items, false, "margin: 0;");
    case "figure":
      return figureLines(child, ctx);
    case "citation":
      return citationLines(child.text);
    case "references":
      return [
        '<p style="margin-bottom: 4px;"><span style="text-decoration: underline;">References:</span></p>',
        ...child.items.map((i) => `<p style="margin: 4px 0;"><span style="${CITE_SPAN}">${renderInline(i)}</span></p>`),
      ];
  }
}

export function blockLines(block: Block, ctx: RenderContext): string[] {
  switch (block.type) {
    case "heading":
      return [`<h4 style="color: ${NAVY};">${renderInline(block.text)}</h4>`];
    case "paragraph":
      return [`<p>${renderInline(block.text)}</p>`];
    case "list":
      return listLines(block.items, block.ordered);
    case "table": {
      const widths = columnWidths(block.headers.length, block.col_widths);
      return tableLines(
        block.headers.map((h, i) => th(h, NAVY, widths[i])),
        block.rows.map((row) => row.flatMap((cell, c) => (c === 0 ? td(stripBold(cell), true) : td(cell)))),
        true,
      );
    }
    case "contrast_table":
      return tableLines(
        [th(block.left_header, "#166534", 50), th(block.right_header, "#b91c1c", 50)],
        block.rows.map((row) => row.flatMap((cell) => td(cell))),
        false,
      );
    case "clinical":
      return [`<div style="${callout("#0d9488", "#f0fdfa")}"><strong style="color: #0f766e;">Why this matters clinically</strong><br />${renderInline(block.body)}</div>`];
    case "caution": {
      const open = `<div style="${callout("#f59e0b", "#fffbeb")}"><strong style="color: #b45309;">${renderInline(block.title)}</strong>`;
      if (!block.items?.length) return [`${open}<br />${renderInline(block.body ?? "")}</div>`];
      const head = block.body ? `${open}<br />${renderInline(block.body)}` : open;
      return [head, ...indent(listLines(block.items, false, "margin: 8px 0 0 0;")), "</div>"];
    }
    case "evidence":
      return [
        `<div style="${EVIDENCE_BOX}">`,
        ...indent([
          `<p style="margin-top: 0;"><strong style="color: #3730a3;">Evidence: ${renderInline(block.title.replace(/^evidence:\s*/i, ""))}</strong></p>`,
          ...block.children.flatMap((c) => childLines(c, ctx)),
        ]),
        "</div>",
      ];
    case "citation":
      return citationLines(block.text);
    case "link": {
      const lead = block.lead_in.trim();
      const prefix = lead ? `${renderInline(lead)}${lead.endsWith(":") ? " " : ": "}` : "";
      const anchor = `<a href="${escapeAttr(block.url)}" target="_blank" rel="noopener">${renderInline(block.link_text)}</a>`;
      return [`<div style="${callout("#2563eb", "#eff6ff")}">${prefix}${anchor}</div>`];
    }
    case "figure":
      return figureLines(block, ctx);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/render/templates.test.ts`
Expected: 13 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/render
git commit -m "feat(frontend): add house-style block templates with golden tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Page renderer

**Files:**
- Create: `frontend/src/render/renderPage.ts`
- Test: `frontend/src/render/renderPage.test.ts`

**Interfaces:**
- Consumes: `blockLines`, `indent`, `RenderContext` (Task 14); `renderInline`.
- Produces: `buildContext(images: ImageInfo[], embeds: EmbedInfo[]): RenderContext`, `renderPage(page: Page, ctx: RenderContext): string`, `PANELS_CLASS`.

- [ ] **Step 1: Write the failing test**

`frontend/src/render/renderPage.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { buildContext, renderPage } from "./renderPage";

const page: Page = {
  title: "Chronic pain",
  intro: ["Chronic pain is **different**."],
  tabs: [
    { id: "t1", title: "Overview", blocks: [{ type: "paragraph", text: "Body one." }] },
    { id: "t2", title: "Management", blocks: [{ type: "heading", text: "Opioids" }] },
  ],
  revision: { include: true, embed_ref: "EMBED-01" },
  notes: [],
};
const ctx = buildContext([], [{ ref: "EMBED-01", html: '<iframe src="https://h5p.example/1"></iframe>' }]);

describe("renderPage", () => {
  it("wraps intro and tabs in the DesignPLUS structure", () => {
    const lines = renderPage(page, ctx).split("\n");
    expect(lines.slice(0, 5)).toEqual([
      '<div id="dp-wrapper" class="dp-wrapper">',
      '    <div class="dp-content-block">',
      "        <p>Chronic pain is <strong>different</strong>.</p>",
      '        <div class="dp-panels-wrapper dp-tabs-pills-group-vertical dp-panel-color-dp-gray dp-panel-active-color-dp-accent dp-panel-hover-color-dp-secondary">',
      '            <div class="dp-panel-group">',
    ]);
    expect(lines).toContain('                <h3 class="dp-panel-heading">Overview</h3>');
    expect(lines).toContain('                <div class="dp-panel-content">');
    expect(lines).toContain("                    <p>Body one.</p>");
    expect(lines).toContain('                    <h4 style="color: #1e3a5f;">Opioids</h4>');
  });

  it("appends the revision block with the original embed", () => {
    const html = renderPage(page, ctx);
    expect(html).toContain('<span style="padding: 0 16px; color: #6d28d9; font-size: 26px;">Revision</span>');
    expect(html).toContain('<p style="margin: 0; color: #94a3b8;"><iframe src="https://h5p.example/1"></iframe></p>');
    expect(html.endsWith("</div>\n")).toBe(true);
  });

  it("uses a placeholder when there is no embed, and omits revision when not included", () => {
    const noEmbed = renderPage({ ...page, revision: { include: true } }, ctx);
    expect(noEmbed).toContain("[PASTE H5P EMBED HERE]");
    const none = renderPage({ ...page, revision: { include: false } }, ctx);
    expect(none).not.toContain("Revision");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/render/renderPage.test.ts`
Expected: FAIL — cannot resolve `./renderPage`.

- [ ] **Step 3: Implement**

`frontend/src/render/renderPage.ts`:
```ts
import type { EmbedInfo, ImageInfo } from "../types/api";
import type { Page, Tab } from "../types/page";
import { renderInline } from "./inline";
import { blockLines, indent, type RenderContext } from "./templates";

export const PANELS_CLASS =
  "dp-panels-wrapper dp-tabs-pills-group-vertical dp-panel-color-dp-gray dp-panel-active-color-dp-accent dp-panel-hover-color-dp-secondary";

export function buildContext(images: ImageInfo[], embeds: EmbedInfo[]): RenderContext {
  return {
    images: Object.fromEntries(images.map((i) => [i.ref, i])),
    embeds: Object.fromEntries(embeds.map((e) => [e.ref, e.html])),
  };
}

function tabLines(tab: Tab, ctx: RenderContext): string[] {
  return [
    '<div class="dp-panel-group">',
    ...indent([
      `<h3 class="dp-panel-heading">${renderInline(tab.title)}</h3>`,
      '<div class="dp-panel-content">',
      ...indent(tab.blocks.flatMap((b) => blockLines(b, ctx))),
      "</div>",
    ]),
    "</div>",
  ];
}

function revisionLines(embed?: string): string[] {
  return [
    '<div style="display: flex; align-items: center; text-align: center; margin: 36px 0 8px 0;"><span style="padding: 0 16px; color: #6d28d9; font-size: 26px;">Revision</span></div>',
    '<div style="border-radius: 10px; margin: 28px 0px 8px; overflow: hidden; background-color: #faf5ff; border: 2px solid #6d28d9;">',
    ...indent([
      '<div style="background-color: #6d28d9; color: #ffffff; padding: 10px 16px; font-size: 16px;">Check your understanding &mdash; revision questions</div>',
      '<div style="padding: 18px;">',
      ...indent([
        '<p style="margin-top: 0; color: #6b21a8;">Work through the interactive questions below to test yourself on this module.</p>',
        '<div style="border-radius: 8px; padding: 28px; text-align: center; background-color: #ffffff; border: 2px dashed #c4b5fd;">',
        ...indent([`<p style="margin: 0; color: #94a3b8;">${embed ?? "[PASTE H5P EMBED HERE]"}</p>`]),
        "</div>",
      ]),
      "</div>",
    ]),
    "</div>",
  ];
}

export function renderPage(page: Page, ctx: RenderContext): string {
  const lines = [
    '<div id="dp-wrapper" class="dp-wrapper">',
    ...indent([
      '<div class="dp-content-block">',
      ...indent([
        ...page.intro.map((p) => `<p>${renderInline(p)}</p>`),
        `<div class="${PANELS_CLASS}">`,
        ...indent(page.tabs.flatMap((t) => tabLines(t, ctx))),
        "</div>",
      ]),
      "</div>",
    ]),
    "</div>",
  ];
  if (page.revision.include) {
    const embed = page.revision.embed_ref ? ctx.embeds[page.revision.embed_ref] : undefined;
    lines.push(...revisionLines(embed));
  }
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/render/renderPage.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/render
git commit -m "feat(frontend): render full Canvas page with DesignPLUS tabs and revision block" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Browser storage, page operations and downloads

**Files:**
- Create: `frontend/src/storage/db.ts`, `frontend/src/storage/exchange.ts`, `frontend/src/storage/pageOps.ts`, `frontend/src/utils/downloads.ts`
- Test: `frontend/src/storage/db.test.ts`, `frontend/src/storage/pageOps.test.ts`, `frontend/src/utils/downloads.test.ts`

**Interfaces:**
- Produces:
  - `db.ts`: `SavedPage { id; title; createdAt; updatedAt; page: Page; sourceText: string; images: ImageInfo[]; embeds: EmbedInfo[]; history: Record<string, Tab[]> }`, `PageSummary { id; title; updatedAt; tabCount }`, `newSavedPage({page, sourceText, images, embeds}): SavedPage`, `savePage(p): Promise<SavedPage>`, `getPage(id): Promise<SavedPage | undefined>`, `listPages(): Promise<PageSummary[]>`, `deletePage(id)`, `renamePage(id, title)`, `duplicatePage(id): Promise<SavedPage | undefined>`
  - `exchange.ts`: `exportPageJson(p): string`, `parseImportedPage(json): SavedPage` (throws `Error("This file isn't a saved page.")`)
  - `pageOps.ts`: `HISTORY_LIMIT = 5`, `replaceTab(saved, tabId, next, notes?)`, `undoTab(saved, tabId)`, `usedImageRefs(page): string[]`, `imagesForAI(images): ImageForAI[]`
  - `downloads.ts`: `downloadBlob(blob, filename)`, `zipEntries(images, refs): {name: string; base64: string}[]`, `buildImagesZip(images, refs): Promise<Blob | null>`, `safeFilename(s)`

- [ ] **Step 1: Write the failing tests**

`frontend/src/storage/pageOps.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Page, Tab } from "../types/page";
import type { SavedPage } from "./db";
import { HISTORY_LIMIT, imagesForAI, replaceTab, undoTab, usedImageRefs } from "./pageOps";

const tab = (id: string, text: string): Tab => ({ id, title: id, blocks: [{ type: "paragraph", text }] });
const page: Page = {
  title: "P",
  intro: [],
  tabs: [tab("t1", "one"), tab("t2", "two")],
  revision: { include: false },
  notes: [],
};
const saved: SavedPage = { id: "x", title: "P", createdAt: 0, updatedAt: 0, page, sourceText: "", images: [], embeds: [], history: {} };

describe("replaceTab / undoTab", () => {
  it("replaces a tab, keeps its id, records history and appends notes", () => {
    const next = replaceTab(saved, "t2", { ...tab("zz", "new"), title: "New" }, [{ kind: "flag", text: "n" }]);
    expect(next.page.tabs[1]).toEqual({ id: "t2", title: "New", blocks: [{ type: "paragraph", text: "new" }] });
    expect(next.history.t2).toEqual([tab("t2", "two")]);
    expect(next.page.notes).toEqual([{ kind: "flag", text: "n" }]);
    expect(saved.page.tabs[1].blocks[0]).toEqual({ type: "paragraph", text: "two" });
  });

  it("caps history", () => {
    let s = saved;
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) s = replaceTab(s, "t1", tab("t1", `v${i}`));
    expect(s.history.t1).toHaveLength(HISTORY_LIMIT);
  });

  it("undo restores the previous version", () => {
    const changed = replaceTab(saved, "t1", tab("t1", "changed"));
    const undone = undoTab(changed, "t1");
    expect(undone.page.tabs[0]).toEqual(tab("t1", "one"));
    expect(undone.history.t1).toEqual([]);
    expect(undoTab(undone, "t1")).toBe(undone);
  });
});

describe("usedImageRefs", () => {
  it("collects figure refs from blocks and evidence children, in order, unique", () => {
    const p: Page = {
      ...page,
      tabs: [
        { id: "t1", title: "A", blocks: [{ type: "figure", ref: "IMG-02", alt: "a" }] },
        {
          id: "t2",
          title: "B",
          blocks: [
            { type: "evidence", title: "E", children: [{ type: "figure", ref: "IMG-01", alt: "b" }] },
            { type: "figure", ref: "IMG-02", alt: "a" },
          ],
        },
      ],
    };
    expect(usedImageRefs(p)).toEqual(["IMG-02", "IMG-01"]);
  });
});

describe("imagesForAI", () => {
  it("keeps only images with thumbnails", () => {
    expect(
      imagesForAI([
        { ref: "IMG-01", source: "a", location: "slide 1", thumb_b64: "T" },
        { ref: "IMG-02", source: "b", location: "", canvas_tag: "<img>" },
      ]),
    ).toEqual([{ ref: "IMG-01", location: "slide 1", thumb_b64: "T" }]);
  });
});
```

`frontend/src/storage/db.test.ts`:
```ts
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Note: mock Date.now rather than vi.useFakeTimers — fake timers would also freeze
// setImmediate, which fake-indexeddb relies on, and hang the test.
import type { Page } from "../types/page";
import { deletePage, duplicatePage, getPage, listPages, newSavedPage, renamePage, savePage } from "./db";
import { exportPageJson, parseImportedPage } from "./exchange";

const page: Page = { title: "Chronic pain", intro: [], tabs: [{ id: "t1", title: "A", blocks: [] }], revision: { include: false }, notes: [] };

beforeEach(async () => {
  for (const p of await listPages()) await deletePage(p.id);
});
afterEach(() => vi.restoreAllMocks());

describe("page storage", () => {
  it("saves, lists newest first, gets and deletes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const a = await savePage(newSavedPage({ page, sourceText: "src", images: [], embeds: [] }));
    now.mockReturnValue(2000);
    const b = await savePage(newSavedPage({ page: { ...page, title: "Opioids" }, sourceText: "src", images: [], embeds: [] }));
    const list = await listPages();
    expect(list.map((p) => p.title)).toEqual(["Opioids", "Chronic pain"]);
    expect(list[0]).toEqual({ id: b.id, title: "Opioids", updatedAt: 2000, tabCount: 1 });
    expect((await getPage(a.id))?.sourceText).toBe("src");
    await deletePage(a.id);
    expect(await getPage(a.id)).toBeUndefined();
  });

  it("renames and duplicates", async () => {
    const a = await savePage(newSavedPage({ page, sourceText: "", images: [], embeds: [] }));
    await renamePage(a.id, "Renamed");
    expect((await getPage(a.id))?.page.title).toBe("Renamed");
    const copy = await duplicatePage(a.id);
    expect(copy?.id).not.toBe(a.id);
    expect(copy?.title).toBe("Renamed (copy)");
  });

  it("exports and imports with a fresh id", async () => {
    const a = await savePage(newSavedPage({ page, sourceText: "s", images: [], embeds: [] }));
    const imported = parseImportedPage(exportPageJson(a));
    expect(imported.id).not.toBe(a.id);
    expect(imported.page).toEqual(a.page);
    expect(() => parseImportedPage('{"format":"other"}')).toThrow("This file isn't a saved page.");
    expect(() => parseImportedPage("not json")).toThrow("This file isn't a saved page.");
  });
});
```

`frontend/src/utils/downloads.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { safeFilename, zipEntries } from "./downloads";

describe("zipEntries", () => {
  it("includes only used extracted images, named by ref", () => {
    const images = [
      { ref: "IMG-01", source: "a", location: "", mime: "image/jpeg", data_b64: "AAA" },
      { ref: "IMG-02", source: "b", location: "", canvas_tag: "<img>" },
      { ref: "IMG-03", source: "a", location: "", mime: "image/png", data_b64: "BBB" },
    ];
    expect(zipEntries(images, ["IMG-03", "IMG-02", "IMG-01"])).toEqual([
      { name: "IMG-03.png", base64: "BBB" },
      { name: "IMG-01.jpg", base64: "AAA" },
    ]);
  });
});

describe("safeFilename", () => {
  it("strips unsafe characters", () => {
    expect(safeFilename("Chronic pain: week 3/4")).toBe("Chronic-pain-week-34");
    expect(safeFilename("???")).toBe("page");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/storage src/utils`
Expected: FAIL — cannot resolve `./pageOps`, `./db`, `./downloads`.

- [ ] **Step 3: Implement**

`frontend/src/storage/db.ts`:
```ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EmbedInfo, ImageInfo } from "../types/api";
import type { Page, Tab } from "../types/page";

export interface SavedPage {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  page: Page;
  sourceText: string;
  images: ImageInfo[];
  embeds: EmbedInfo[];
  history: Record<string, Tab[]>;
}

export interface PageSummary {
  id: string;
  title: string;
  updatedAt: number;
  tabCount: number;
}

interface Schema extends DBSchema {
  pages: { key: string; value: SavedPage };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>("pharm-canvas", 1, {
    upgrade(database) {
      database.createObjectStore("pages", { keyPath: "id" });
    },
  });
  return dbPromise;
}

export function newSavedPage(args: { page: Page; sourceText: string; images: ImageInfo[]; embeds: EmbedInfo[] }): SavedPage {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: args.page.title, createdAt: now, updatedAt: now, history: {}, ...args };
}

export async function savePage(p: SavedPage): Promise<SavedPage> {
  const next = { ...p, updatedAt: Date.now() };
  await (await db()).put("pages", next);
  return next;
}

export async function getPage(id: string): Promise<SavedPage | undefined> {
  return (await db()).get("pages", id);
}

export async function listPages(): Promise<PageSummary[]> {
  const all = await (await db()).getAll("pages");
  return all
    .map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt, tabCount: p.page.tabs.length }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deletePage(id: string): Promise<void> {
  await (await db()).delete("pages", id);
}

export async function renamePage(id: string, title: string): Promise<void> {
  const p = await getPage(id);
  if (!p) return;
  await savePage({ ...p, title, page: { ...p.page, title } });
}

export async function duplicatePage(id: string): Promise<SavedPage | undefined> {
  const p = await getPage(id);
  if (!p) return undefined;
  const title = `${p.title} (copy)`;
  const copy: SavedPage = { ...structuredClone(p), id: crypto.randomUUID(), title, createdAt: Date.now() };
  copy.page.title = title;
  return savePage(copy);
}
```

`frontend/src/storage/exchange.ts`:
```ts
import type { SavedPage } from "./db";

const FORMAT = "pharm-canvas-page";
const VERSION = 1;
const INVALID = "This file isn't a saved page.";

export function exportPageJson(p: SavedPage): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, page: p });
}

export function parseImportedPage(json: string): SavedPage {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(INVALID);
  }
  const record = data as { format?: string; version?: number; page?: SavedPage };
  if (record?.format !== FORMAT || record.version !== VERSION || !Array.isArray(record.page?.page?.tabs)) {
    throw new Error(INVALID);
  }
  const now = Date.now();
  return { ...record.page, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}
```

`frontend/src/storage/pageOps.ts`:
```ts
import type { ImageForAI, ImageInfo } from "../types/api";
import type { Note, Page, Tab } from "../types/page";
import type { SavedPage } from "./db";

export const HISTORY_LIMIT = 5;

export function replaceTab(saved: SavedPage, tabId: string, next: Tab, notes: Note[] = []): SavedPage {
  const current = saved.page.tabs.find((t) => t.id === tabId);
  if (!current) throw new Error(`Unknown tab ${tabId}`);
  const history = [...(saved.history[tabId] ?? []), current].slice(-HISTORY_LIMIT);
  return {
    ...saved,
    history: { ...saved.history, [tabId]: history },
    page: {
      ...saved.page,
      tabs: saved.page.tabs.map((t) => (t.id === tabId ? { ...next, id: tabId } : t)),
      notes: [...saved.page.notes, ...notes],
    },
  };
}

export function undoTab(saved: SavedPage, tabId: string): SavedPage {
  const history = saved.history[tabId] ?? [];
  if (!history.length) return saved;
  const previous = history[history.length - 1];
  return {
    ...saved,
    history: { ...saved.history, [tabId]: history.slice(0, -1) },
    page: { ...saved.page, tabs: saved.page.tabs.map((t) => (t.id === tabId ? previous : t)) },
  };
}

export function usedImageRefs(page: Page): string[] {
  const refs: string[] = [];
  const add = (ref: string) => {
    if (!refs.includes(ref)) refs.push(ref);
  };
  for (const tab of page.tabs) {
    for (const block of tab.blocks) {
      if (block.type === "figure") add(block.ref);
      if (block.type === "evidence") {
        for (const child of block.children) if (child.type === "figure") add(child.ref);
      }
    }
  }
  return refs;
}

export function imagesForAI(images: ImageInfo[]): ImageForAI[] {
  return images
    .filter((i) => i.thumb_b64)
    .map((i) => ({ ref: i.ref, location: i.location, thumb_b64: i.thumb_b64! }));
}
```

`frontend/src/utils/downloads.ts`:
```ts
import type { ImageInfo } from "../types/api";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function zipEntries(images: ImageInfo[], refs: string[]): { name: string; base64: string }[] {
  const entries = [];
  for (const ref of refs) {
    const image = images.find((i) => i.ref === ref);
    if (!image?.data_b64) continue;
    entries.push({ name: `${ref}.${EXT[image.mime ?? ""] ?? "png"}`, base64: image.data_b64 });
  }
  return entries;
}

export async function buildImagesZip(images: ImageInfo[], refs: string[]): Promise<Blob | null> {
  const entries = zipEntries(images, refs);
  if (!entries.length) return null;
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.name, entry.base64, { base64: true });
  return zip.generateAsync({ type: "blob" });
}

export function safeFilename(s: string): string {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "page";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/storage src/utils`
Expected: all pass (pageOps 5, db 3, downloads 2).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/storage frontend/src/utils
git commit -m "feat(frontend): add IndexedDB page storage, tab history and image zip helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Create page

**Files:**
- Create: `frontend/src/components/create/Dropzone.tsx`, `SourceList.tsx`, `PasteCanvasModal.tsx`, `GenerateProgress.tsx`
- Modify: `frontend/src/pages/CreatePage.tsx` (replace temporary content), `frontend/src/App.tsx` (no change needed)

**Interfaces:**
- Consumes: `extractSources`, `generatePage`, `getApiErrorMessage`, `checkFile`, `MAX_SOURCES`, `MAX_FILE_MB`, `ACCEPTED_EXTENSIONS`, `newSavedPage`, `savePage`, `imagesForAI`, `useApiKey`, UI primitives.
- Produces: `Stage` type (`"idle" | "reading" | "structuring" | "building"`) from `GenerateProgress.tsx`. Navigates to `/pages/:id` after saving (route added in Task 18).

- [ ] **Step 1: Create the components**

`frontend/src/components/create/Dropzone.tsx`:
```tsx
import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, MAX_FILE_MB, MAX_SOURCES } from "../../config";
import { Button } from "../ui/Button";

export function Dropzone({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${over ? "border-purple bg-purple-soft" : "border-line bg-limestone-soft"}`}
    >
      <p className="font-display text-2xl font-semibold">Drop your teaching material here</p>
      <p className="mt-1 font-serif text-sm text-ink-muted">
        Word, PowerPoint or PDF · up to {MAX_FILE_MB} MB each · {MAX_SOURCES} sources per page
      </p>
      <Button className="mt-4" disabled={disabled} onClick={() => input.current?.click()}>
        Choose files
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

`frontend/src/components/create/SourceList.tsx`:
```tsx
import type { SourceInput, SourceStatus } from "../../types/api";
import { formatSize } from "../../utils/format";
import { IconButton } from "../ui/IconButton";

const KIND_LABEL = { docx: "Word", pptx: "PowerPoint", pdf: "PDF", canvas: "Canvas" } as const;

function kindOf(source: SourceInput): keyof typeof KIND_LABEL {
  if (source.kind === "canvas") return "canvas";
  const ext = source.file.name.split(".").pop()?.toLowerCase();
  return ext === "docx" || ext === "pptx" ? ext : "pdf";
}

interface Props {
  sources: SourceInput[];
  statuses: Record<string, SourceStatus>;
  disabled: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}

export function SourceList({ sources, statuses, disabled, onMove, onRemove }: Props) {
  if (!sources.length) return null;
  return (
    <ol className="mt-5 space-y-2">
      {sources.map((source, i) => {
        const status = statuses[source.id];
        return (
          <li key={source.id} className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <span className="mt-0.5 w-5 text-sm font-semibold text-ink-muted">{i + 1}</span>
            <span className="mt-0.5 rounded-md bg-limestone px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
              {KIND_LABEL[kindOf(source)]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{source.kind === "file" ? source.file.name : source.label}</p>
              <p className="text-xs text-ink-muted">
                {source.kind === "file" ? formatSize(source.file.size) : `${source.html.length.toLocaleString()} characters of HTML`}
              </p>
              {status && !status.ok && <p className="mt-1 text-xs text-red-700">✕ {status.error}</p>}
              {status?.ok && status.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-700">{w}</p>)}
            </div>
            {status?.ok && <span className="mt-0.5 text-sm text-emerald-700" aria-label="Read successfully">✓</span>}
            <div className="flex items-center">
              <IconButton label="Move up" disabled={disabled || i === 0} onClick={() => onMove(i, -1)}>↑</IconButton>
              <IconButton label="Move down" disabled={disabled || i === sources.length - 1} onClick={() => onMove(i, 1)}>↓</IconButton>
              <IconButton label="Remove" disabled={disabled} onClick={() => onRemove(source.id)}>✕</IconButton>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

`frontend/src/components/create/PasteCanvasModal.tsx`:
```tsx
import { useState } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function PasteCanvasModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (html: string) => void }) {
  const [html, setHtml] = useState("");
  return (
    <Modal
      open={open}
      wide
      title="Paste a Canvas page"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!html.trim()} onClick={() => { onAdd(html); setHtml(""); onClose(); }}>
            Add page
          </Button>
        </>
      }
    >
      <p className="font-serif text-sm leading-relaxed text-ink-muted">
        In Canvas, open the page, click <strong>Edit</strong>, then the <code>&lt;/&gt;</code> button (HTML editor). Select all, copy, and paste here.
      </p>
      <textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={12}
        spellCheck={false}
        placeholder="<div>…</div>"
        className="mt-4 w-full rounded-xl border border-line p-3 font-mono text-xs focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
      />
    </Modal>
  );
}
```

`frontend/src/components/create/GenerateProgress.tsx`:
```tsx
import { Spinner } from "../ui/Spinner";

export type Stage = "idle" | "reading" | "structuring" | "building";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "reading", label: "Reading files" },
  { stage: "structuring", label: "Structuring content" },
  { stage: "building", label: "Building page" },
];

export function GenerateProgress({ stage }: { stage: Stage }) {
  const current = STEPS.findIndex((s) => s.stage === stage);
  return (
    <ol className="mt-5 space-y-2" aria-live="polite">
      {STEPS.map((step, i) => (
        <li
          key={step.stage}
          className={`flex items-center gap-3 text-sm ${i < current ? "text-emerald-700" : i === current ? "font-semibold text-navy" : "text-ink-muted"}`}
        >
          {i < current ? <span className="w-4 text-center">✓</span> : i === current ? <Spinner /> : <span className="h-4 w-4 rounded-full border border-line" />}
          {step.label}
          {i === current && step.stage === "structuring" && <span className="font-normal text-ink-muted">(this can take a minute)</span>}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Replace the Create page**

`frontend/src/pages/CreatePage.tsx`:
```tsx
import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/client";
import { extractSources, generatePage } from "../api/endpoints";
import { Dropzone } from "../components/create/Dropzone";
import { GenerateProgress, type Stage } from "../components/create/GenerateProgress";
import { PasteCanvasModal } from "../components/create/PasteCanvasModal";
import { SourceList } from "../components/create/SourceList";
import { Button } from "../components/ui/Button";
import { checkFile, MAX_SOURCES } from "../config";
import { useApiKey } from "../hooks/useApiKey";
import { newSavedPage, savePage } from "../storage/db";
import { imagesForAI } from "../storage/pageOps";
import type { ExtractResult, SourceInput, SourceStatus } from "../types/api";

export default function CreatePage() {
  const navigate = useNavigate();
  const [apiKey] = useApiKey();
  const [sources, setSources] = useState<SourceInput[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({});
  const [title, setTitle] = useState("");
  const [includeRevision, setIncludeRevision] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [largeExtract, setLargeExtract] = useState<ExtractResult | null>(null);
  const busy = stage !== "idle";

  function addFiles(files: File[]) {
    const next = [...sources];
    for (const file of files) {
      const error = checkFile(file, next.length);
      if (error) {
        toast.error(error);
        continue;
      }
      next.push({ id: crypto.randomUUID(), kind: "file", file });
    }
    setSources(next);
    setLargeExtract(null);
  }

  function addCanvas(html: string) {
    if (sources.length >= MAX_SOURCES) {
      toast.error(`You can add up to ${MAX_SOURCES} sources per page.`);
      return;
    }
    const n = sources.filter((s) => s.kind === "canvas").length + 1;
    setSources([...sources, { id: crypto.randomUUID(), kind: "canvas", html, label: `Pasted Canvas page ${n}` }]);
    setLargeExtract(null);
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...sources];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setSources(next);
    setLargeExtract(null);
  }

  function remove(id: string) {
    setSources(sources.filter((s) => s.id !== id));
    setLargeExtract(null);
  }

  async function generate(existing?: ExtractResult) {
    try {
      let result = existing;
      if (!result) {
        setStage("reading");
        setStatuses({});
        const extracted = await extractSources(sources);
        setStatuses(Object.fromEntries(sources.map((s, i) => [s.id, extracted.sources[i]])));
        if (!extracted.sources.some((s) => s.ok)) {
          toast.error("None of the sources could be read.");
          setStage("idle");
          return;
        }
        if (extracted.approx_tokens > extracted.token_limit) {
          setLargeExtract(extracted);
          setStage("idle");
          return;
        }
        result = extracted;
      }
      setLargeExtract(null);
      setStage("structuring");
      const { page } = await generatePage({
        text: result.text,
        images: imagesForAI(result.images),
        instructions,
        include_revision: includeRevision,
        title,
      });
      setStage("building");
      const saved = await savePage(newSavedPage({ page, sourceText: result.text, images: result.images, embeds: result.embeds }));
      navigate(`/pages/${saved.id}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Something went wrong. Please try again."));
      setStage("idle");
    }
  }

  return (
    <div>
      <h1 className="font-display text-5xl font-bold tracking-tight">Create a Canvas page</h1>
      <p className="mt-2 max-w-2xl font-serif text-ink-muted">
        Add your lecture material, and PharmCanvas will restructure it into the pharmacy house style, ready to paste into Canvas.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="sources-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="sources-heading" className="font-display text-2xl font-semibold">Sources</h2>
            <Button variant="ghost" disabled={busy} onClick={() => setPasteOpen(true)}>+ Paste Canvas page HTML</Button>
          </div>
          <div className="mt-3">
            <Dropzone onFiles={addFiles} disabled={busy} />
          </div>
          <SourceList sources={sources} statuses={statuses} disabled={busy} onMove={move} onRemove={remove} />
        </section>

        <aside className="h-fit rounded-2xl bg-limestone p-6" aria-labelledby="options-heading">
          <h2 id="options-heading" className="font-display text-2xl font-semibold">Page options</h2>
          <label className="mt-4 block text-sm font-medium">
            Page title <span className="font-normal text-ink-muted">(optional)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="e.g. Chronic non-cancer pain"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
            />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={includeRevision} onChange={(e) => setIncludeRevision(e.target.checked)} disabled={busy} className="h-4 w-4 accent-purple" />
            Include revision block
          </label>
          <label className="mt-4 block text-sm font-medium">
            Instructions <span className="font-normal text-ink-muted">(optional)</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={busy}
              rows={4}
              placeholder="e.g. Focus on counselling points"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-serif text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
            />
          </label>

          {largeExtract ? (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="font-semibold text-amber-900">This is a lot of material</p>
              <p className="mt-1 text-amber-900">
                About {largeExtract.approx_tokens.toLocaleString()} tokens, over the recommended {largeExtract.token_limit.toLocaleString()}. Splitting it into several pages usually gives better results.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" onClick={() => generate(largeExtract)}>Generate anyway</Button>
                <Button variant="ghost" onClick={() => setLargeExtract(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" className="mt-6 w-full py-3 text-base" disabled={!sources.length || !apiKey || busy} onClick={() => generate()}>
              {busy ? "Working…" : "Generate page"}
            </Button>
          )}
          {!apiKey && <p className="mt-2 text-xs text-ink-muted">Add your Gemini key with Insert API Key (top right) first.</p>}
          {busy && <GenerateProgress stage={stage} />}
        </aside>
      </div>

      <PasteCanvasModal open={pasteOpen} onClose={() => setPasteOpen(false)} onAdd={addCanvas} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual check**

Run backend (`cd backend && venv/Scripts/python -m uvicorn app.main:app --port 8000`) and frontend (`cd frontend && npm run dev`). Open http://localhost:5173 and confirm: dropping a `.txt` shows a toast; adding a `.docx` and a pasted Canvas snippet lists both with working ↑ ↓ ✕; Generate is disabled until an API key is saved. (The Generate flow is verified end-to-end in Task 20.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add Create page with sources, options and staged generation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Page editor

**Files:**
- Create: `frontend/src/render/preview.css`, `frontend/src/components/editor/CanvasPreview.tsx`, `TabRail.tsx`, `NotesPanel.tsx`, `RegenerateDialog.tsx`, `frontend/src/pages/EditorPage.tsx`
- Modify: `frontend/src/App.tsx` (add `pages/:id` route)

**Interfaces:**
- Consumes: `getPage`, `savePage`, `SavedPage`, `replaceTab`, `undoTab`, `usedImageRefs`, `imagesForAI`, `buildContext`, `renderPage`, `regenerateTab`, `buildImagesZip`, `downloadBlob`, `safeFilename`, `exportPageJson`, `formatDate`.
- Produces: route `/pages/:id`.

- [ ] **Step 1: Create the preview stylesheet**

`frontend/src/render/preview.css`:
```css
/* Approximates Canvas + DesignPLUS vertical pill tabs for the in-app preview only.
   Never part of the copied HTML. */
.canvas-preview {
  font-family: "Lato", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: #2d3b45;
}
.canvas-preview p { margin: 12px 0; }
.canvas-preview h4 { font-size: 1.15rem; font-weight: 700; margin: 24px 0 8px; }
.canvas-preview ul { list-style: disc; padding-left: 28px; margin: 12px 0; }
.canvas-preview ol { list-style: decimal; padding-left: 28px; margin: 12px 0; }
.canvas-preview li { margin: 4px 0; }
.canvas-preview a { color: #0374b5; text-decoration: underline; }
.canvas-preview img { display: inline-block; max-width: 100%; height: auto; }
.canvas-preview iframe { max-width: 100%; }
.canvas-preview strong { font-weight: 700; }
.canvas-preview em { font-style: italic; }

.canvas-preview .dp-panels-wrapper {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  grid-auto-rows: min-content;
  column-gap: 24px;
  margin-top: 24px;
}
.canvas-preview .dp-panel-group { display: contents; }
.canvas-preview .dp-panel-heading {
  grid-column: 1;
  margin: 0 0 8px;
  padding: 10px 16px;
  border-radius: 999px;
  background: #e8eaec;
  color: #2d3b45;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}
.canvas-preview .dp-panel-heading:hover { background: #d7dade; }
.canvas-preview .is-active > .dp-panel-heading { background: #0374b5; color: #ffffff; }
.canvas-preview .dp-panel-content { display: none; }
.canvas-preview .is-active > .dp-panel-content { display: block; grid-column: 2; grid-row: 1 / span 50; }

@media (max-width: 720px) {
  .canvas-preview .dp-panels-wrapper { grid-template-columns: 1fr; }
  .canvas-preview .is-active > .dp-panel-content { grid-column: 1; grid-row: auto; }
}
```

- [ ] **Step 2: Create editor components**

`frontend/src/components/editor/CanvasPreview.tsx`:
```tsx
import { useEffect, useRef, type MouseEvent } from "react";
import "../../render/preview.css";

interface Props {
  html: string;
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function CanvasPreview({ html, activeIndex, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const groups = ref.current?.querySelectorAll<HTMLElement>(".dp-panel-group") ?? [];
    groups.forEach((group, i) => group.classList.toggle("is-active", i === activeIndex));
  }, [html, activeIndex]);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const heading = (e.target as HTMLElement).closest(".dp-panel-heading");
    if (!heading || !ref.current) return;
    const groups = Array.from(ref.current.querySelectorAll(".dp-panel-group"));
    const index = groups.indexOf(heading.parentElement as Element);
    if (index >= 0) onSelect(index);
  }

  return <div ref={ref} className="canvas-preview" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
```

`frontend/src/components/editor/TabRail.tsx`:
```tsx
import type { Tab } from "../../types/page";
import { IconButton } from "../ui/IconButton";

interface Props {
  tabs: Tab[];
  activeIndex: number;
  historyCounts: Record<string, number>;
  onSelect: (index: number) => void;
  onRegenerate: (tab: Tab) => void;
  onUndo: (tab: Tab) => void;
}

export function TabRail({ tabs, activeIndex, historyCounts, onSelect, onRegenerate, onUndo }: Props) {
  return (
    <nav aria-label="Page sections">
      <h2 className="px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Tabs</h2>
      <ul className="mt-2 space-y-1">
        {tabs.map((tab, i) => (
          <li
            key={tab.id}
            className={`group flex items-center gap-1 rounded-xl pl-3 pr-1 ${i === activeIndex ? "bg-purple-soft" : "hover:bg-limestone-soft"}`}
          >
            <button type="button" className="min-w-0 flex-1 truncate py-2 text-left text-sm font-medium" onClick={() => onSelect(i)}>
              {tab.title}
            </button>
            <IconButton label={`Undo last change to ${tab.title}`} disabled={!historyCounts[tab.id]} onClick={() => onUndo(tab)}>↶</IconButton>
            <IconButton label={`Regenerate ${tab.title}`} onClick={() => onRegenerate(tab)}>⟳</IconButton>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`frontend/src/components/editor/NotesPanel.tsx`:
```tsx
import type { Note, NoteKind } from "../../types/page";

const LABEL: Record<NoteKind, { text: string; className: string }> = {
  image: { text: "Image", className: "bg-purple-soft text-navy" },
  flag: { text: "Check", className: "bg-amber-100 text-amber-900" },
  citation: { text: "Citation", className: "bg-sky-100 text-sky-900" },
  unplaced: { text: "Unplaced", className: "bg-rose-100 text-rose-900" },
};

export function NotesPanel({ notes }: { notes: Note[] }) {
  return (
    <section aria-labelledby="notes-heading" className="rounded-2xl bg-limestone-soft p-4">
      <h2 id="notes-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Notes for you
        <span className="rounded-full bg-navy px-2 py-0.5 text-[11px] text-white">{notes.length}</span>
      </h2>
      {notes.length === 0 ? (
        <p className="mt-3 font-serif text-sm text-ink-muted">No issues found.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((note, i) => (
            <li key={i} className="font-serif text-sm leading-snug">
              <span className={`mr-2 rounded-md px-1.5 py-0.5 font-sans text-[11px] font-semibold ${LABEL[note.kind].className}`}>
                {LABEL[note.kind].text}
              </span>
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`frontend/src/components/editor/RegenerateDialog.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { Tab } from "../../types/page";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

const SUGGESTIONS = [
  "Make this tab shorter",
  "Turn lists into tables where it fits",
  "Add a 'Why this matters clinically' callout",
  "Simplify the language",
];

interface Props {
  tab: Tab | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (instruction: string) => void;
}

export function RegenerateDialog({ tab, busy, onClose, onSubmit }: Props) {
  const [instruction, setInstruction] = useState("");
  useEffect(() => {
    if (tab) setInstruction("");
  }, [tab]);

  return (
    <Modal
      open={tab !== null}
      title={`Regenerate "${tab?.title ?? ""}"`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !instruction.trim()} onClick={() => onSubmit(instruction.trim())}>
            {busy ? <><Spinner className="border-white/40 border-t-white" /> Regenerating…</> : "Regenerate"}
          </Button>
        </>
      }
    >
      <label className="block text-sm font-medium">
        What should change?
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          disabled={busy}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-serif text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setInstruction(s)}
            className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted hover:border-purple hover:text-navy"
          >
            {s}
          </button>
        ))}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Create the Editor page**

`frontend/src/pages/EditorPage.tsx`:
```tsx
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../api/client";
import { regenerateTab } from "../api/endpoints";
import { CanvasPreview } from "../components/editor/CanvasPreview";
import { NotesPanel } from "../components/editor/NotesPanel";
import { RegenerateDialog } from "../components/editor/RegenerateDialog";
import { TabRail } from "../components/editor/TabRail";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { buildContext, renderPage } from "../render/renderPage";
import { getPage, savePage, type SavedPage } from "../storage/db";
import { exportPageJson } from "../storage/exchange";
import { imagesForAI, replaceTab, undoTab, usedImageRefs } from "../storage/pageOps";
import type { Tab } from "../types/page";
import { buildImagesZip, downloadBlob, safeFilename } from "../utils/downloads";
import { formatDate } from "../utils/format";

const COPY_TIP_KEY = "pharm_canvas_copy_tip_seen";

export default function EditorPage() {
  const { id } = useParams();
  const [saved, setSaved] = useState<SavedPage | null | undefined>(undefined);
  const [view, setView] = useState<"preview" | "html">("preview");
  const [activeIndex, setActiveIndex] = useState(0);
  const [regenTarget, setRegenTarget] = useState<Tab | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    if (id) getPage(id).then((p) => setSaved(p ?? null));
  }, [id]);

  const html = useMemo(
    () => (saved ? renderPage(saved.page, buildContext(saved.images, saved.embeds)) : ""),
    [saved],
  );
  const downloadableRefs = useMemo(
    () => (saved ? usedImageRefs(saved.page).filter((ref) => saved.images.some((i) => i.ref === ref && i.data_b64)) : []),
    [saved],
  );

  if (saved === undefined) return <p className="text-ink-muted">Loading…</p>;
  if (saved === null) {
    return (
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Page not found</h1>
        <p className="mt-2 font-serif text-ink-muted">This page isn't saved in this browser.</p>
        <Link to="/pages" className="mt-4 inline-block text-brightblue underline">Go to My pages</Link>
      </div>
    );
  }
  const current = saved;

  async function persist(next: SavedPage) {
    setSaved(await savePage(next));
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      toast.error("Couldn't copy. Switch to the HTML view and copy it manually.");
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem(COPY_TIP_KEY) === "1";
      localStorage.setItem(COPY_TIP_KEY, "1");
    } catch {
      // storage unavailable: show the tip every time
    }
    if (seen) toast.success("HTML copied");
    else setTipOpen(true);
  }

  async function downloadImages() {
    const blob = await buildImagesZip(current.images, downloadableRefs);
    if (blob) downloadBlob(blob, `${safeFilename(current.title)}-images.zip`);
  }

  function exportPage() {
    downloadBlob(new Blob([exportPageJson(current)], { type: "application/json" }), `${safeFilename(current.title)}.json`);
  }

  async function submitRegenerate(instruction: string) {
    if (!regenTarget) return;
    setRegenBusy(true);
    try {
      const result = await regenerateTab({
        text: current.sourceText,
        images: imagesForAI(current.images),
        outline: { intro: current.page.intro, tab_titles: current.page.tabs.map((t) => t.title) },
        tab: regenTarget,
        instruction,
      });
      await persist(replaceTab(current, regenTarget.id, result.tab, result.notes));
      setRegenTarget(null);
      toast.success("Tab regenerated");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Regeneration failed. Please try again."));
    } finally {
      setRegenBusy(false);
    }
  }

  const historyCounts = Object.fromEntries(Object.entries(current.history).map(([k, v]) => [k, v.length]));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{current.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">Saved in this browser · {formatDate(current.updatedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {downloadableRefs.length > 0 && <Button onClick={downloadImages}>Images ⤓</Button>}
          <Button onClick={exportPage}>Export</Button>
          <Button variant="primary" onClick={copyHtml}>Copy HTML</Button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="space-y-6">
          <TabRail
            tabs={current.page.tabs}
            activeIndex={activeIndex}
            historyCounts={historyCounts}
            onSelect={(i) => { setActiveIndex(i); setView("preview"); }}
            onRegenerate={setRegenTarget}
            onUndo={(tab) => persist(undoTab(current, tab.id))}
          />
          <NotesPanel notes={current.page.notes} />
        </div>

        <div className="min-w-0">
          <div role="tablist" aria-label="View" className="inline-flex rounded-full border border-line p-1">
            {(["preview", "html"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${view === v ? "bg-navy text-white" : "text-ink-muted hover:text-navy"}`}
              >
                {v === "preview" ? "Preview" : "HTML"}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
            {view === "preview" ? (
              <CanvasPreview html={html} activeIndex={activeIndex} onSelect={setActiveIndex} />
            ) : (
              <pre className="max-h-[70vh] overflow-auto rounded-xl bg-limestone-soft p-5 font-mono text-xs leading-relaxed text-navy">
                <code>{html}</code>
              </pre>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            The preview approximates Canvas. The tabs use DesignPLUS, which only renders fully inside Canvas.
          </p>
        </div>
      </div>

      <RegenerateDialog tab={regenTarget} busy={regenBusy} onClose={() => setRegenTarget(null)} onSubmit={submitRegenerate} />
      <Modal open={tipOpen} title="HTML copied" onClose={() => setTipOpen(false)} footer={<Button variant="primary" onClick={() => setTipOpen(false)}>Got it</Button>}>
        <ol className="list-decimal space-y-1 pl-5 font-serif text-sm leading-relaxed">
          <li>In Canvas, open the page and click <strong>Edit</strong>.</li>
          <li>Click the <code>&lt;/&gt;</code> button to open the HTML editor.</li>
          <li>Paste, then click <strong>Save</strong>.</li>
        </ol>
        <p className="mt-3 text-sm text-ink-muted">Pasting into the normal visual editor can mangle the layout.</p>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Register the route**

Modify `frontend/src/App.tsx`: add `import EditorPage from "./pages/EditorPage";` and inside the layout route add `<Route path="pages/:id" element={<EditorPage />} />`.

- [ ] **Step 5: Verify build and tests**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add page editor with preview, HTML view, tab regeneration and undo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: My pages

**Files:**
- Create: `frontend/src/pages/MyPagesPage.tsx`
- Modify: `frontend/src/App.tsx` (add `pages` route)

**Interfaces:**
- Consumes: `listPages`, `getPage`, `savePage`, `deletePage`, `renamePage`, `duplicatePage`, `PageSummary`, `exportPageJson`, `parseImportedPage`, `downloadBlob`, `safeFilename`, `formatDate`.
- Produces: route `/pages`.

- [ ] **Step 1: Create the page**

`frontend/src/pages/MyPagesPage.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { deletePage, duplicatePage, getPage, listPages, renamePage, savePage, type PageSummary } from "../storage/db";
import { exportPageJson, parseImportedPage } from "../storage/exchange";
import { downloadBlob, safeFilename } from "../utils/downloads";
import { formatDate } from "../utils/format";

export default function MyPagesPage() {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setPages(await listPages()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submitRename(id: string) {
    if (draft.trim()) await renamePage(id, draft.trim());
    setRenaming(null);
    await refresh();
  }

  async function exportOne(id: string) {
    const page = await getPage(id);
    if (page) downloadBlob(new Blob([exportPageJson(page)], { type: "application/json" }), `${safeFilename(page.title)}.json`);
  }

  async function importFile(file: File) {
    try {
      await savePage(parseImportedPage(await file.text()));
      toast.success("Page imported");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-bold tracking-tight">My pages</h1>
          <p className="mt-2 font-serif text-ink-muted">Pages are saved in this browser. Export a page to back it up or share it with a colleague.</p>
        </div>
        <Button onClick={() => fileInput.current?.click()}>Import page</Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {pages === null ? (
        <p className="mt-10 text-ink-muted">Loading…</p>
      ) : pages.length === 0 ? (
        <div className="mt-10 rounded-2xl bg-limestone-soft p-10 text-center">
          <p className="font-display text-2xl font-semibold">No pages yet</p>
          <Link to="/" className="mt-3 inline-block text-brightblue underline">Create your first page</Link>
        </div>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <li key={p.id} className="flex flex-col rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md">
              {renaming === p.id ? (
                <form onSubmit={(e) => { e.preventDefault(); void submitRename(p.id); }} className="flex gap-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-line px-3 py-1.5 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
                  />
                  <Button type="submit" variant="primary">Save</Button>
                </form>
              ) : (
                <Link to={`/pages/${p.id}`} className="font-display text-2xl font-semibold leading-tight hover:text-brightblue">
                  {p.title}
                </Link>
              )}
              <p className="mt-1 text-xs text-ink-muted">{p.tabCount} tabs · Updated {formatDate(p.updatedAt)}</p>
              <div className="mt-auto flex flex-wrap gap-1 pt-4">
                <Button variant="ghost" onClick={() => { setRenaming(p.id); setDraft(p.title); }}>Rename</Button>
                <Button variant="ghost" onClick={async () => { await duplicatePage(p.id); await refresh(); }}>Duplicate</Button>
                <Button variant="ghost" onClick={() => exportOne(p.id)}>Export</Button>
                {confirmDelete === p.id ? (
                  <Button variant="danger" onClick={async () => { await deletePage(p.id); setConfirmDelete(null); await refresh(); }}>
                    Confirm delete
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirmDelete(p.id)}>Delete</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the route**

Modify `frontend/src/App.tsx`: add `import MyPagesPage from "./pages/MyPagesPage";` and inside the layout route, above the editor route, add `<Route path="pages" element={<MyPagesPage />} />`.

- [ ] **Step 3: Verify build and tests**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add My pages with rename, duplicate, export, import and delete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Deployment config, scripts, README and end-to-end check

**Files:**
- Create: `backend/Dockerfile`, `render.yaml`, `frontend/vercel.json`, `setup.bat`, `start.bat`, `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: deployable repo; verified end-to-end run.

- [ ] **Step 1: Create deployment files**

`backend/Dockerfile`:
```dockerfile
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 10001 app
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

USER app
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

`render.yaml`:
```yaml
services:
  - type: web
    name: pharm-canvas-backend
    runtime: docker
    rootDir: backend
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /api/health
    envVars:
      - key: GEMINI_MODEL
        value: gemini-3.6-flash
      - key: ALLOWED_ORIGINS
        sync: false
```

`frontend/vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`setup.bat`:
```bat
@echo off
title PharmCanvas Setup
echo ============================================
echo   Setting up PharmCanvas...
echo ============================================
echo.
echo Setting up backend...
cd /d "%~dp0backend"
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements-dev.txt
if not exist ".env" copy ".env.example" ".env"
echo Backend setup complete.
echo.
echo Setting up frontend...
cd /d "%~dp0frontend"
call npm install
echo Frontend setup complete.
echo.
echo ============================================
echo   Setup complete! Run start.bat to launch.
echo ============================================
pause
```

`start.bat`:
```bat
@echo off
title PharmCanvas
echo Starting PharmCanvas...
cd /d "%~dp0backend"
start "PharmCanvas Backend" cmd /k "call venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
cd /d "%~dp0frontend"
start "PharmCanvas Frontend" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173
echo.
echo PharmCanvas is running at http://localhost:5173
echo Press any key to stop both servers.
pause >nul
taskkill /fi "windowtitle eq PharmCanvas Backend*" /t /f >nul 2>&1
taskkill /fi "windowtitle eq PharmCanvas Frontend*" /t /f >nul 2>&1
echo Servers stopped.
```

`README.md`:
````markdown
# PharmCanvas

Turns pharmacy lecture material (Word, PowerPoint, PDF, or an old Canvas page) into a Canvas page in the shared pharmacy house style, ready to paste into Canvas.

## Using the hosted app

1. Open the app link you were given.
2. Click **Insert API Key** (top right) and paste a Gemini API key. Get one free at https://aistudio.google.com/apikey. The key stays in your browser.
3. **Create:** drop in your files, or click **Paste Canvas page HTML** to bring in an old page. Reorder them with the arrows, then click **Generate page**. The first request of the day can take up to a minute while the server wakes up.
4. **Review:** click through the tabs in the preview. Read **Notes for you**: these are things to check, such as images to upload and content the AI flagged.
5. **Adjust:** click ⟳ next to a tab to regenerate just that tab with an instruction (for example "make this shorter"). Click ↶ to undo.
6. **Images:** click **Images ⤓** to download the images the page uses (`IMG-01.png`…). Upload them to Canvas and replace each dashed `[INSERT IMAGE …]` box.
7. **Copy HTML**, then in Canvas: **Edit** → `</>` (HTML editor) → paste → **Save**.

Pages are saved in your browser under **My pages**. Use **Export** to back one up or send it to a colleague, who can **Import** it.

## Running it on your own computer

Install Python 3.13 (tick "Add Python to PATH") and Node.js 24, then:

```
git clone https://github.com/a1702610/PharmCanvasBeautifier.git
cd PharmCanvasBeautifier
```

Double-click `setup.bat` once, then `start.bat` each time. The app opens at http://localhost:5173.

## Deploying (maintainers)

- **Backend (Render):** New → Blueprint → this repo (uses `render.yaml`). Set `ALLOWED_ORIGINS` to the Vercel URL.
- **Frontend (Vercel):** import the repo with root directory `frontend`. Set `VITE_API_BASE_URL` to the Render URL.

## Development

- Backend tests: `cd backend && venv/Scripts/python -m pytest`
- Frontend tests: `cd frontend && npm test`
- House style lives in `frontend/src/render/templates.ts`. The golden reference is `prompts/system-prompt-v1.md` §3.
- AI instructions live in `backend/app/prompts/`.
````

- [ ] **Step 2: Run the full test suites**

Run: `cd backend && venv/Scripts/python -m pytest -v` then `cd frontend && npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 3: Verify the Docker build**

Run: `cd backend && docker build -t pharm-canvas-backend .` (skip if Docker isn't installed; Render builds it on deploy)
Expected: image builds.

- [ ] **Step 4: End-to-end check with a real Gemini key**

Start both servers (`start.bat`, or the two commands from Task 17 Step 3). In the browser:
1. Save a real Gemini key via **Insert API Key**.
2. Create a page from a real lecture `.pptx` plus a pasted old Canvas page that contains an `<img>` and an H5P `<iframe>`; tick **Include revision block**.
3. Confirm: staged progress runs; the editor opens; tabs switch in the preview; Notes list image placeholders; the HTML view shows `dp-wrapper`, navy tables with alternating row shading, the original Canvas `<img>` with its `data-api-endpoint`, and the iframe inside the revision block.
4. Regenerate one tab with "Make this tab shorter"; confirm the tab changes and ↶ restores it.
5. Download images (zip contains `IMG-nn` files matching the placeholders).
6. Export the page, delete it in My pages, import it back.

If Gemini rejects the response schema (a 400 mentioning `response_schema`), switch `generate_structured` to pass `response_json_schema=schema.model_json_schema()` instead of `response_schema=schema`, re-run `pytest`, and retry.

- [ ] **Step 5: Canvas acceptance (lecturer)**

Paste the copied HTML into a Canvas sandbox page via the HTML editor and save. Confirm the DesignPLUS vertical tabs, every component's colours, the Canvas image and the H5P embed all render. Record anything that differs from the example page.

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile render.yaml frontend/vercel.json setup.bat start.bat README.md
git commit -m "chore: add deployment config, setup scripts and README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
