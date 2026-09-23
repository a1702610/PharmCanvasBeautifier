# PharmCanvasBeautifier: Design Spec

**Date:** 2026-09-23
**Status:** Draft, awaiting review

## 1. Purpose

A web app for University of Adelaide pharmacy lecturers. They upload teaching material (Word, PowerPoint, PDF, or pasted HTML from an old Canvas page). An AI restructures it, and the app produces HTML that can be pasted straight into the Canvas HTML editor. Every pharmacy course page then shares one consistent house style.

**Core principle:** the AI decides *content and structure*. Code decides *appearance*. The AI outputs structured JSON using a fixed set of block types, and a renderer turns each block into a fixed HTML template. The AI never writes HTML, CSS or image URLs.

## 2. Scope

### In scope (v1)
- Upload of several sources per page: `.docx`, `.pptx`, `.pdf`, and pasted Canvas page HTML.
- Extraction of text (including PowerPoint speaker notes) and images, with position markers.
- AI generation of one Canvas page (introduction + 3–8 DesignPLUS vertical tabs + optional revision block).
- Preview, HTML view, Copy HTML, and a zip download of the page's images.
- Per-tab regeneration with a free-text instruction, plus undo.
- A "Lecturer notes" panel: image placeholders, flagged content, incomplete citations, unplaced content.
- Pages saved in the browser (IndexedDB), with a "My pages" list and JSON export/import.
- Each user's own Gemini API key, stored in the browser.

### Out of scope (v1)
- OCR of scanned PDFs or images (scanned pages are flagged instead).
- Canvas API integration (no Canvas login; the user copies and pastes).
- Direct Rx-H5P-Generator integration (the revision block has a slot for an embed).
- Inline visual editing of text or dragging blocks around.
- Institutions without DesignPLUS (Adelaide only; the `dp-` classes are allowed).
- Brand palette for the Canvas *output* (the output keeps the house style in §5; the brand palette is for the app UI only).
- Server-side accounts or storage.

## 3. Architecture

```
Browser (React + Vite + Tailwind, Vercel)            Backend (FastAPI, Render, Docker)
────────────────────────────────────────             ─────────────────────────────────
Create page ── POST /api/extract (multipart) ──────► extractors → text stream + images + embeds
            ◄────────────────────────────────────── ExtractResult
            ── POST /api/generate ──────────────────► Gemini (response_schema = Page)
            ◄────────────────────────────────────── Page JSON (validated + sanitised)
Renderer (TS): Page JSON → Canvas HTML  (runs in the browser)
Editor: Preview | HTML | Copy | Images.zip | Notes
            ── POST /api/regenerate-tab ────────────► Gemini (response_schema = Tab)
            ◄────────────────────────────────────── Tab JSON (validated + sanitised)
IndexedDB: saved pages (page JSON, source text, images, embeds, undo history)
```

- **The backend is stateless.** It has no database and no disk storage. Uploads are processed in memory or temp files and discarded. Render's non-persistent free-tier filesystem is therefore not a problem.
- **The Gemini key** is sent on every AI request in the `X-Gemini-Key` header. It is never stored or logged on the server.
- **Rendering happens in the browser**, so saved pages reopen and re-render without a server call. The component templates live in a single TypeScript module, which is the house style's single source of truth.
- The stack mirrors `A:\Rx-H5P-Generator` (FastAPI, `google-genai`, python-docx, python-pptx, pdfplumber; React 19, Vite, Tailwind 4, axios, react-router, react-hot-toast). The new UI is designed from scratch (see §9).

### Repository layout

```
backend/
  app/
    main.py                 FastAPI app, CORS, /health
    config.py               settings (model name, limits, allowed origin)
    routers/
      extract.py            POST /api/extract
      generate.py           POST /api/generate, POST /api/regenerate-tab
    extractors/
      docx.py  pptx.py  pdf.py  canvas_html.py
      images.py             dedupe, size filter, thumbnail
      stream.py             assemble multi-source text stream
    ai/
      gemini.py             client wrapper, structured output, one retry
      schema.py             Pydantic models: Page, Tab, Block union, Note
      validate.py           ref/link/sanitisation checks → notes
    prompts/
      system.md             generation prompt (content + block-usage rules)
      regenerate_tab.md     tab regeneration prompt
  tests/
  Dockerfile  requirements.txt
frontend/
  src/
    render/
      templates.ts          one function per block type → HTML string
      inline.ts             markdown subset → HTML + entity encoding
      renderPage.ts         Page → full Canvas HTML
      preview.css           DesignPLUS vertical-pill imitation (preview only)
    storage/                IndexedDB (saved pages), export/import
    api/  pages/  components/  types/
prompts/system-prompt-v1.md  standalone prompt that outputs HTML directly (reference; golden source for the templates)
docs/superpowers/specs/
```

## 4. Page JSON schema

```ts
type Page = {
  title: string;                       // for the "My pages" list; not rendered
  intro: string[];                     // paragraphs (inline markdown subset)
  tabs: Tab[];                         // 3–8
  revision: { include: boolean; embed_ref?: string };  // "EMBED-01"
  notes: Note[];
};

type Tab = { id: string; title: string; blocks: Block[] };  // id assigned by backend: "t1", "t2", …

type Note = { kind: "image" | "flag" | "citation" | "unplaced"; text: string };

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; col_widths?: number[]; rows: string[][] }
  | { type: "contrast_table"; left_header: string; right_header: string; rows: [string, string][] }
  | { type: "clinical"; body: string }
  | { type: "caution"; title: string; body?: string; items?: string[] }
  | { type: "evidence"; title: string; children: EvidenceChild[] }
  | { type: "citation"; text: string }
  | { type: "link"; lead_in: string; url: string; link_text: string }
  | { type: "figure"; ref: string; alt: string; caption?: string };

type EvidenceChild =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "figure"; ref: string; alt: string; caption?: string }
  | { type: "citation"; text: string }
  | { type: "references"; items: string[] };
```

- **Inline text** (every string field except `url`/`ref`) supports only `**bold**`, `*italic*` and `[text](url)`. Everything else is escaped. There is no raw-HTML block type.
- **Table cells** may contain `\n\n` to split into several `<p>` elements.
- Gemini receives this schema as `response_schema` (not recursive: `EvidenceChild` is a separate union).

### Backend validation (`ai/validate.py`)
After parsing with Pydantic:
1. **Tab ids** are (re)assigned in order: `t1…tn`.
2. **Figure refs:** a `figure.ref` that isn't a known `IMG-nn` is dropped, and a `flag` note is added.
3. **Embed ref:** an unknown `revision.embed_ref` is cleared, and a note is added.
4. **Links:** every URL (in `link.url` or inline `[text](url)`) must appear in the source text. Otherwise the link is removed (its text is kept) and a `flag` note is added.
5. **Tab count** outside 3–8 is accepted, with a note (not an error).
6. **Empty blocks** are removed.

## 5. Renderer and house style

`frontend/src/render/templates.ts` emits exactly the component HTML defined in `prompts/system-prompt-v1.md` §3 (the golden reference).

| Block | Output |
|---|---|
| page | `#dp-wrapper.dp-wrapper > .dp-content-block > intro <p>s + .dp-panels-wrapper.dp-tabs-pills-group-vertical.dp-panel-color-dp-gray.dp-panel-active-color-dp-accent.dp-panel-hover-color-dp-secondary > .dp-panel-group(h3.dp-panel-heading + .dp-panel-content)` |
| heading | `<h4 style="color: #1e3a5f;">` |
| table | navy `#1e3a5f` header; every second body row `#f1f5f9`; borders `#cbd5e1`; first column `<strong>`; widths from `col_widths`, else 26% for the first column of a 2-column table and evenly spread otherwise |
| contrast_table | header left `#166534`, right `#b91c1c`, each 50% wide |
| clinical | teal: `border-left 4px #0d9488`, bg `#f0fdfa`, title "Why this matters clinically" `#0f766e` |
| caution | amber: `#f59e0b` / `#fffbeb` / title `#b45309`; `items` → `<ul style="margin: 8px 0 0 0;">`, otherwise `<br />body` |
| evidence | indigo: bg `#eef2ff`, border `#c7d2fe`, title "Evidence: …" `#3730a3` |
| citation | centred `<span style="font-size: 8pt; color: #64748b;">` |
| link | blue: `#2563eb` / `#eff6ff`, `target="_blank" rel="noopener"` |
| figure | Canvas image → original `<img>` tag unchanged (alt replaced only if the original is empty or a filename); extracted image → dashed placeholder `[INSERT IMAGE IMG-nn: description, source location]`; plus a caption line |
| revision | purple `#6d28d9` block after the wrapper; the embed's original iframe HTML, or a `[PASTE H5P EMBED HERE]` placeholder |

- The renderer turns non-ASCII characters into HTML entities (`&mdash;`, `&ndash;`, `&rarr;`, `&ne;`, `&le;`, `&ge;`, `&micro;`, accented letters) and indents with 4 spaces.
- `preview.css` imitates DesignPLUS vertical pill tabs (clickable) for the in-app preview only. It is never part of the copied HTML.

## 6. Extraction (`POST /api/extract`)

**Request:** multipart. `files[]` (≤5 files, ≤25 MB each), `canvas_html[]` (pasted strings), `order[]` (the source order).

**Response:**
```ts
type ExtractResult = {
  sources: { name: string; kind: "docx"|"pptx"|"pdf"|"canvas"; ok: boolean; error?: string; warnings: string[] }[];
  text: string;                                  // combined stream with markers
  images: { ref: string; source: string; location: string; mime: string;
            data_b64?: string; thumb_b64?: string;   // extracted images
            canvas_tag?: string }[];                 // Canvas images: original <img> HTML
  embeds: { ref: string; html: string }[];       // original <iframe> HTML
  approx_tokens: number;
};
```

| Source | Text | Images / embeds |
|---|---|---|
| docx | Paragraphs in order, heading levels as `#`/`##`, lists, tables as pipe tables | Inline drawings → `[IMG-nn]` at their position |
| pptx | `--- Slide n: Title ---`, body text, tables, `Speaker notes:` block | Picture shapes → `[IMG-nn: slide n]` |
| pdf | `--- Page n ---`, text and tables (pdfplumber) | Embedded images (PyMuPDF) → `[IMG-nn: page n]`. A page with images but under 20 characters of text → warning "Page n looks scanned" |
| canvas | BeautifulSoup: headings, lists and tables kept as structure; DesignPLUS tab titles become `##`; junk classes dropped | `<img>` → `[IMG-nn]` + `canvas_tag`; `<iframe>` → `[EMBED-nn]` + `html` |

- Sources are joined as `=== SOURCE k: name ===` blocks in the user's order.
- **Image filtering:** images smaller than 80 px on either side, or under 3 KB, are skipped. Images whose hash appears more than twice across sources (logos, template art) are skipped.
- **Thumbnails** (up to 512 px, JPEG) are produced for up to 20 kept images, in order. Images beyond 20 get markers but are not sent to Gemini.
- A failure in one file doesn't stop the others (`ok: false`, `error`).
- **Size guard:** if `approx_tokens` is over the configured limit (default 150k), the UI warns before generating and suggests splitting the material into several pages.

## 7. AI generation

**`POST /api/generate`**: `{ text, images: [{ref, location, thumb_b64}], instructions?, include_revision, title? }` → `{ page: Page }`.
**`POST /api/regenerate-tab`**: `{ text, images, page_outline: {intro, tab_titles}, tab: Tab, instruction }` → `{ tab: Tab }`. The page's source text is stored with it in IndexedDB so regeneration stays grounded in the source.

- `google-genai`, model from config (default `gemini-3.6-flash`), `response_mime_type="application/json"`, `response_schema` = Page or Tab, with thinking set via `thinking_level` (as in Rx-H5P-Generator).
- Image thumbnails are sent as inline image parts, each labelled with its ref.
- **Retry:** if the response fails to parse or validate against the schema, retry once, then return a 502 with a friendly message.
- **Prompts** (`backend/app/prompts/`):
  - `system.md`: §1 (content rules), §2 (page structure) and the "when to use each component" rules from `prompts/system-prompt-v1.md`, rewritten to refer to block types instead of HTML. Also: image-marker handling (skip decorative images, write alt text, use the `IMG-nn` ref), the inline markdown subset, and notes.
  - `regenerate_tab.md`: the same rules, plus "return only this tab; keep the title unless asked; don't repeat content that belongs to other tabs (outline given); follow the instruction".

## 8. Frontend screens

1. **Create:** a sources panel (drag-and-drop files, "Paste Canvas page HTML" modal, reorder ↑↓, remove ✕, per-file status after extraction) and an options panel (page title, "Include revision block" checkbox, instructions box, Generate button). Staged progress: *Reading files → Structuring content → Building page*.
2. **Page editor:**
   - Left rail: Intro plus the tab list (click to jump; ⟳ per tab opens an instruction box → Regenerate; Undo per tab, keeping the last 5 versions).
   - Notes panel with a count badge.
   - Main area: a toggle between Preview and HTML (read-only code view); **Copy HTML** (shows a one-time tip: "In Canvas: Edit → `</>` HTML editor → paste → Save"); **Images ⤓** (JSZip of used extracted images named `IMG-nn.<ext>`, hidden if there are none).
   - Autosaves to IndexedDB.
3. **My pages:** cards with title and updated date, plus open / rename / duplicate / delete / export (`.json` including images as base64) / import.

- **Header:** app name (text only, no university logo, per the brand guide's approval requirement), nav (Create, My pages), and an **Insert API Key** button (a modal; the key is saved in localStorage).
- **Cold start:** on load, the app pings `/health`. While it waits, a banner shows "Waking up the server (up to a minute)…".

## 9. App UI visual design

This applies to the app's own interface only, not the Canvas output. It is a light, spacious, modern design based on the Adelaide University brand guide (July 2025):

- **Colours:** White `#FFFFFF` and Dark Blue `#140F50` are dominant (backgrounds and text). Limestone `#F8EFE0` is used for secondary surfaces and panels. North Terrace Purple `#836BFF` is the accent (active nav or tab, focus rings, selection). Bright Blue `#1448FF` is used sparingly for primary actions only.
- **Type:** Roboto Serif (Google Fonts) for body text and headings. Barlow Condensed (Google Fonts) as the free stand-in for National 2 Condensed, used for large display headings. A clean system sans-serif for small UI controls and labels. Sentence case throughout.
- Generous whitespace, soft borders and rounded corners, minimal shadows, and clear navigation. It is not a copy of Rx-H5P-Generator's layout.
- The Adelaide University logo is not used.

## 10. Errors

| Condition | Response / UI |
|---|---|
| Missing key | Generate is disabled; the Insert API Key button is highlighted |
| Gemini 401/403 | "Your Gemini key was rejected. Check it under Insert API Key." |
| Gemini 429 | "Gemini's free limit was reached. Wait a minute and try again." |
| Invalid JSON after retry | "Generation failed, please try again." |
| File extraction failure | That source is marked ✕ with the reason; the others continue |
| Unsupported type / too large / too many files | Rejected in the browser before upload, and checked again on the server |
| Size guard exceeded | Warning with a "Generate anyway" option |
| Invented link/ref | Removed and added to Notes |

The server logs errors only. Keys and document contents are never logged.

## 11. Hosting

- **Backend:** Render free web service from `backend/Dockerfile`. `ALLOWED_ORIGIN` is set to the Vercel URL. `/health` endpoint.
- **Frontend:** Vercel. `VITE_API_BASE_URL` points at Render.
- **Local dev:** `setup.bat` / `start.bat` as in Rx-H5P-Generator.
- **Repository:** a new public GitHub repository (required for PyMuPDF's AGPL licence). The README is written for non-technical colleagues.

## 12. Testing

- **Renderer (vitest), the highest priority:** a golden test for each block type comparing against the exact HTML in `prompts/system-prompt-v1.md`; whole-page golden test; inline-markdown escaping (HTML in the input can't get through); entity encoding; alternating row shading; Canvas `<img>` passthrough is byte-identical.
- **Backend (pytest):**
  - extractors on small fixture files (generated in the tests) covering markers, speaker notes, image filtering and dedupe, and scanned-page warnings;
  - Canvas HTML parsing (img/iframe refs, junk classes removed);
  - `validate.py` (unknown refs, invented URLs, tab ids);
  - routers with Gemini mocked (success, retry-then-success, retry-then-fail, 401, 429).
- **Manual acceptance:** generate a page from a real lecture deck; paste it into a Canvas sandbox course; confirm the DesignPLUS tabs, all component styles, Canvas image passthrough and H5P iframe passthrough render correctly.
