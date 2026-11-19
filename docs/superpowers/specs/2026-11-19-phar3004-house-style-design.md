# PHAR3004 house style for PharmCanvas — design spec

**Date:** 2026-11-19
**Status:** Draft, awaiting review
**Replaces:** the output styling in `2026-09-23-pharm-canvas-beautifier-design.md` §5 (renderer/house style). Everything else in that spec still applies unless changed here.

## 1. Goal

Replace PharmCanvas's Canvas-page house style with the PHAR3004 template supplied by a colleague: its palette, page architecture (intro panel → button-style vertical tabs → accordions inside tabs → mandatory "Study materials" tab → divider + "Revision check"), components (flow diagrams, formula boxes, key-point callouts, primary/secondary tables) and Canvas-editability spacing. Content rules, the "AI decides content, code decides appearance" principle and all existing safety checks stay.

Decisions made with the user:
- **Replace** the current style (no second theme).
- Callouts use the PHAR3004 palette (purple / violet / blue / amber) with **one red exception** for "Critical safety warning".
- Study-materials links come from **optional Create-page fields** (editable later in the editor); the AI never produces links.
- **Revision check only**: per-tab "Key takeaways" are no longer generated (old pages still render them). "Check your understanding" stays at the end of each tab.
- **Saved course profiles** give the AI course context.
- Changes stay local; the user is asked before any push.

Reference material: the colleague's template (palette tables, rules and a full example page) is quoted in the conversation of 2026-11-19; the HTML below is extracted from it with the updated palette applied. If the user saves the original as `prompts/phar3004-template.txt`, treat it as background only — this spec is authoritative.

## 2. Palette (exact values)

| Role | Value |
|---|---|
| Deep purple (headings, primary table headers, solid boxes, handout button) | `#140f50` |
| Pale lavender fill / light border | `#f4f2fb` / `#ddd8ef` |
| Violet accent (secondary outlines, self-check rule) | `#836bff` |
| Blue accent / pale fill / light border / dark text | `#1448ff` / `#eff4ff` / `#b8caff` / `#1039cc` |
| Dark amber (solid secondary headers, white text) | `#b45309` |
| Amber accent (arrows, outlines, left rules) | `#d97706` |
| Pale amber fill / light border | `#fff7ed` / `#f5c48c` |
| Body text | `#1f2937` |
| Table borders | `#cbd5e1` |
| Muted text (captions, notes, placeholders) | `#64748b` |
| Red exception (critical safety): rule / fill / title | `#b91c1c` / `#fef2f2` / `#991b1b` |

White text only on `#140f50`, `#b45309`, `#1448ff`. Never white text on `#d97706`.

## 3. Page architecture (renderer output, in order)

```html
<div id="dp-wrapper" class="dp-wrapper" style="color: #1f2937;">
    INTRO PANEL (§4.1)
    <p>&nbsp;</p>
    <div class="dp-panels-wrapper dp-tabs-buttons-vertical">
        TAB 1 … TAB n (teaching tabs, AI content)
        TAB n+1 "Study materials" (§6, app-built)
    </div>
    <p>&nbsp;</p>
    DIVIDER + REVISION CHECK (§4.12)   ← only when revision points exist or the revision block is requested
    <p>&nbsp;</p>                      ← only when the revision check is rendered
</div>
```

Tab markup (titles numbered by the renderer, AI titles are unnumbered):
```html
<div class="dp-panel-group">
    <h3 class="dp-panel-heading">1. TITLE</h3>
    <div class="dp-panel-content">
        BLOCKS (with spacers per §5)
    </div>
</div>
```

## 4. Components (exact HTML; 4-space indentation as today; `INLINE` = rendered inline text)

### 4.1 Intro panel
```html
<table style="width: 100%; border-collapse: separate; margin: 0px 0px 28px; background: #f4f2fb; border-radius: 12px; border: 1px solid #ddd8ef;" role="presentation">
    <tbody>
        <tr>
            <td style="width: 58%; vertical-align: middle; padding: 26px 30px;">
                <h2 style="margin: 0 0 14px 0; color: #140f50;">PAGE TITLE</h2>
                <p style="margin: 0 0 12px 0;">INTRO PARAGRAPH</p>   (last paragraph: style="margin: 0;")
            </td>
            <td style="width: 42%; vertical-align: middle; text-align: center; padding: 20px;">
                INTRO FIGURE (§4.10 output for `intro_figure`) or the image placeholder with text "[ IMAGE: placeholder — delete this line and insert from Canvas Files ]"
            </td>
        </tr>
    </tbody>
</table>
```

### 4.2 Sub-heading
`<h4 style="color: #140f50;">TEXT</h4>`

### 4.3 Paragraphs and lists
Plain `<p>`, `<ul>`, `<ol>` (unchanged).

### 4.4 Tables
Primary (default):
```html
<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">
    <thead>
        <tr style="background: #140f50; color: #ffffff;">
            <th style="padding: 11px; text-align: left; border: 1px solid #cbd5e1;" scope="col">HEADER</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <th style="padding: 11px; background: #f4f2fb; text-align: left; border: 1px solid #cbd5e1;" scope="row">ROW LABEL</th>
            <td style="padding: 11px; border: 1px solid #cbd5e1;">CELL</td>
        </tr>
    </tbody>
</table>
```
- `variant: "secondary"` → header row `background: #b45309`, row-label cells `background: #fff7ed`.
- `row_headers: false` → first column rendered as a normal `<td>` (no lavender/amber fill, not bold).
- `col_widths` (optional, percentages) → ` width: N%;` inserted after `text-align: left;` on each header `th` (same formatting rules as today).
- Multi-paragraph cells (`\n\n`) → nested `<p>` lines as today. No zebra rows.

### 4.5 Contrast table
Two columns, header cells each `width: 50%`: left `background: #140f50`, right `background: #b45309`, white text, borders `#cbd5e1`; body cells plain `td` with the primary `td` style.

### 4.6 Flow diagram (new)
```html
<div style="margin: 24px 0;">
    <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; text-align: center;">
        <div style="padding: 13px 18px; background: #140f50; color: #ffffff; border-radius: 8px;"><strong>LABEL</strong><br /><span style="font-size: 0.9em;">SUB</span></div>
        <div style="font-size: 1.5em; color: #d97706;" aria-hidden="true">&rarr;</div>
        …
    </div>
</div>
```
Step styles: `solid` (above), `outline` → `background: #f4f2fb; border-radius: 8px; border: 2px solid #140f50;` (no white text), `amber` → `background: #fff7ed; border-radius: 8px; border: 2px solid #d97706;`. `<br /><span …>SUB</span>` only when `sub` is present. 2–6 steps, linear only.

### 4.7 Formula box (new)
```html
<div style="margin: 18px auto; padding: 16px; max-width: 440px; text-align: center; background: #f4f2fb; border-radius: 8px; border: 1px solid #ddd8ef;">
    <p style="margin: 0; font-size: 1.25em;"><strong>EXPRESSION</strong></p>
    <p style="margin: 6px 0 0 0; font-size: 0.9em; color: #64748b;">NOTE</p>   (only when note present)
</div>
```

### 4.8 Callouts
Shared left-rule shape `LR(rule, fill)` = `margin: 20px 0; padding: 16px 18px; border-left: 5px solid RULE; background: FILL;`. Shared box shape `BOX(border, fill)` = `margin: 20px 0px; padding: 17px 19px; background: FILL; border-radius: 8px; border: 2px solid BORDER;`. Body as `<p style="margin: 0;">…</p>`; titled callouts put the title in the same paragraph as a bold lead (`<strong>TITLE</strong> BODY`) when there is a body only, or as `<p style="margin: 0 0 8px 0;"><strong …>TITLE</strong></p>` followed by `<ul style="margin: 0; padding-left: 24px;">` when there are items.

| Block | Shape / colours | Title |
|---|---|---|
| `key_point` (new) | LR(`#140f50`, `#f4f2fb`) | bold `lead` (optional) then text |
| `clinical` | LR(`#d97706`, `#fff7ed`) | "Why this matters clinically:" |
| `caution` | BOX(`#d97706`, `#fff7ed`) | block title |
| `critical` | LR(`#b91c1c`, `#fef2f2`), title `color: #991b1b` | title or "Critical safety warning" |
| `tip` | LR(`#1448ff`, `#eff4ff`), title `color: #1039cc` | "Pharmacist tip:" |
| `counselling` | BOX(`#ddd8ef`, `#f4f2fb`) with `border: 1px solid #ddd8ef`, title `color: #140f50` | title or "Counselling points" |
| `evidence` | BOX(`#b8caff`, `#eff4ff`), title `color: #1039cc` | "Evidence: TITLE"; children as today (citations grey 8pt) |
| `self_check` | LR(`#836bff`, `#f4f2fb`), title `color: #140f50` | "Check your understanding"; questions as today, `<summary style="cursor: pointer; color: #140f50;">Show answer</summary>` |
| `link` | BOX(`#b8caff`, `#eff4ff`) | lead-in + link as today |
| `takeaways` (legacy, render only) | card: `border: 1px solid #ddd8ef; border-radius: 8px; margin: 16px 0; overflow: hidden;`, header bar `background: #140f50; color: #ffffff; padding: 8px 16px; font-weight: bold;`, list `margin: 12px 16px 12px 0; padding-left: 40px;` | "Key takeaways" |
| `citation` | unchanged (centred grey 8pt) | — |

### 4.9 Accordion (new; only inside tabs, one level)
```html
<div class="dp-panels-wrapper dp-accordion-default">
    <div class="dp-panel-group">
        <h4 class="dp-panel-heading">PANEL TITLE</h4>
        <div class="dp-panel-content">
            BLOCKS (spacers per §5)
        </div>
    </div>
</div>
```

### 4.10 Figures
Canvas image (has `canvas_tag`): `<p style="text-align: center;">TAG</p>` (alt replacement as today). Extracted image or unknown: `<p style="text-align: center; border: 2px dashed #cbd5e1; padding: 20px; color: #64748b;">[ IMAGE IMG-nn: DESCRIPTION, LOCATION — delete this line and insert from Canvas Files ]</p>`. Caption line unchanged.

### 4.11 Spacer
`<p>&nbsp;</p>` (the only place `&nbsp;` is emitted outside number–unit pairs).

### 4.12 Divider + Revision check
```html
<hr style="border-width: 2px 0px 0px; border-style: solid none none; border-color: #ddd8ef; margin: 34px 0px 28px;" />
<div style="padding: 24px 26px; background: #f4f2fb; border-top: 5px solid #140f50; border-radius: 10px;">
    <h2 style="margin: 0 0 8px 0; color: #140f50;">Revision check</h2>
    <p style="margin: 0 0 18px 0;">Before moving on, check that these ideas can be <strong>explained</strong>, rather than simply recalled.</p>
    <table style="width: 100%; border-collapse: collapse; background: #ffffff;">
        <tbody>
            <tr>
                <td style="width: 44px; padding: 12px; text-align: center; color: #d97706; border: 1px solid #cbd5e1;">1</td>
                <td style="padding: 12px; border: 1px solid #cbd5e1;">POINT</td>
            </tr>
        </tbody>
    </table>
    OPTIONAL FLOW BOX:
    <div style="margin: 20px 0px 0px; padding: 16px; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1;">
        <p style="margin: 0 0 10px 0;"><strong>FLOW TITLE</strong></p>
        FLOW (§4.6 inner flex row only, no outer margin div)
    </div>
    OPTIONAL H5P SLOT (when revision.include or an embed exists):
    <div style="margin: 20px 0px 0px; padding: 16px; background: #ffffff; border-radius: 8px; border: 2px dashed #ddd8ef; text-align: center;">
        <p style="margin: 0 0 10px 0; color: #140f50;"><strong>Interactive questions</strong></p>
        <p style="margin: 0; color: #64748b;">EMBED HTML or [PASTE H5P EMBED HERE]</p>
    </div>
</div>
```
Rendered when `revision.points` is non-empty OR `revision.include` OR an embed ref exists. When there are no points but the block is requested, the numbered table is omitted.

## 5. Editable spacing rules (renderer, never the AI)

- A **major** block is: table, contrast_table, flow, formula, figure, every callout type (key_point, clinical, caution, critical, tip, counselling, evidence, self_check, link, takeaways), and accordion.
- Inside a tab's or accordion panel's `dp-panel-content`: insert one spacer between two consecutive blocks when either is major; always end the content with exactly one spacer. Never emit two spacers in a row.
- Accordions therefore always have a spacer immediately before (unless they are the first block) and after.
- Never insert spacers directly inside `dp-panels-wrapper` or between `dp-panel-group` siblings.
- Top level: spacer after the intro table, after the tabs wrapper, and after the revision check (when rendered). The `<hr>` follows the post-tabs spacer.
- Study materials tab follows the same rules (its parts are major).

## 6. Study materials tab (app-built)

Stored in the page JSON as `study?: StudyMaterials` (frontend-owned; backend ignores it):
```ts
type StudyMaterials = {
  handout?: { label?: string; url?: string };
  recordings: { part: string; title?: string; recording_url?: string; transcript_url?: string }[];
  resources: { title: string; url?: string }[];
};
```
Plus AI-provided page-level `study_activities?: { task: string; purpose: string }[]` (only when the source describes activities).

Order inside the last tab (`N. Study materials`):
1. Study activities table (primary table, headers "What to do" / "Purpose", `row_headers: false`, task text bold) — only if `study_activities` non-empty.
2. `<h4 style="color: #140f50; margin-top: 22px;">Handout</h4>` then:
   - url present → `<p><a href="URL" target="_blank" rel="noopener" style="display: inline-block; padding: 10px 16px; background: #140f50; color: #ffffff; text-decoration: none; border-radius: 999px;">LABEL or "Handout"</a></p>`
   - label only → `<p style="display: inline-block; padding: 10px 16px; border: 2px dashed #ddd8ef; color: #140f50; border-radius: 999px;">[Handout: LABEL — insert the Canvas file link]</p>`
   - neither → same dashed style with `[Add handout link]`.
3. `<h4 style="color: #140f50; margin-top: 26px;">Recordings</h4>` + secondary table with headers Part / Recording / Transcript (row labels "Part 1", "Part 2"… or the given `part`). Recording cell: link with text `title` (or "Recording") when url present, else plain `[Add recording link]`; transcript cell: link "Part N transcript" when url present, else `[Add transcript link]`. No rows → one row `Part 1 | [Add recording link] | [Add transcript link]`.
4. Accordion with one panel "Additional resources": each resource as `<p><a href="URL" target="_blank" rel="noopener">TITLE</a></p>` (title as plain text when no url); none → `<p>[Add additional resources]</p>`.
URLs must match `^https?://` (others are dropped and treated as missing); all text and URLs escaped.

**UI:** a collapsible "Study materials (optional)" section on the Create page (handout label + link; repeatable recording rows: part title, recording link, transcript link; repeatable resource rows: title, link) and a "Study materials" button in the editor that opens the same form (shared component) and saves into `page.study` (no undo entry). Export/import include it. Inline "Edit text" does not edit study materials.

## 7. Course profiles (new)

- Stored in IndexedDB (new object store `courses`, DB version bump with upgrade): `{ id, code, name, level, outcomes, notes, updatedAt }` (all strings; outcomes free text, e.g. one CLO per line).
- Create page: optional "Course" select (None / saved profiles) with a "Manage courses" modal (add, edit, delete). The chosen profile id is saved on the `SavedPage` (`courseId?`).
- The frontend builds `course_context` text: `Course: CODE — NAME\nYear level: LEVEL\nLearning outcomes:\nOUTCOMES\nNotes on this course/topic:\nNOTES` (empty lines omitted) and sends it with `/api/generate` and `/api/regenerate-tab` (regenerate uses the page's saved course; a deleted course sends nothing).
- Backend: `course_context: str = ""` (max 4,000 chars, trimmed) on both request models; included in the prompt under "COURSE CONTEXT (use to pitch the level and connect content; do not reproduce it on the page)".

## 8. Page JSON schema changes

Frontend `types/page.ts` / backend typed models:
- New blocks:
  - `{ type: "key_point"; lead?: string; text: string }`
  - `{ type: "flow"; steps: { label: string; sub?: string; style: "solid" | "outline" | "amber" }[] }`
  - `{ type: "formula"; expression: string; note?: string }`
  - `{ type: "accordion"; panels: { title: string; blocks: InnerBlock[] }[] }` where `InnerBlock` = any block except `accordion`.
- `table` gains `variant?: "primary" | "secondary"` and `row_headers?: boolean` (default true).
- `Page` gains `intro_figure?: FigureBlock`, `study_activities?: {task, purpose}[]`, `study?: StudyMaterials` (frontend only), and `revision` gains `points?: string[]`, `flow_title?: string`, `flow?: FlowBlock`.
- Backend wire models: avoid schema recursion by splitting `WireBlockBase` (all fields except `panels`) → `WireInnerBlock(WireBlockBase)` with an inner `BlockType` literal excluding `accordion`, and `WireBlock(WireBlockBase)` adding `panels: list[WirePanel] | None`, `WirePanel{title, blocks: list[WireInnerBlock]}`. New wire fields: `lead`, `expression`, `note`, `steps: list[WireFlowStep{label, sub, style}]`, `variant`, `row_headers`. `WirePage` gains `intro_figure: WireChild-like figure | None`, `study_activities`, and `revision.points`, `revision.flow_title`, `revision.flow`.
- Validation (`validate.py`): same text/link/ref rules recursively inside accordion panels; drop empty panels and empty accordions; flow needs ≥2 non-empty steps (else dropped with a note), unknown style → `outline`; formula needs an expression; key_point needs text; intro_figure must reference a known image (else dropped silently); revision points: keep 0–8 non-empty; study_activities: keep rows with both fields. The per-tab "missing clinical callout" note counts clinical blocks inside accordions.

## 9. Inline text formatting additions

`~text~` → `<sub>text</sub>`, `^text^` → `<sup>text</sup>` (non-empty, no spaces at the edges), applied after escaping like bold/italic, in both the renderer and the backend link check (unchanged). `htmlToMarkdown` maps `<sub>`/`<sup>` back to `~…~`/`^…^`. The AI prompt documents both.

## 10. AI instructions (backend `prompts/system.md`)

Rewrite around the new architecture while keeping §1 content rules. Add from the colleague's template/instructions:
- Restructuring rules: comparisons of 2+ items across the same dimensions → table (highest-value transformation); sequential processes → `flow`; the one sentence carrying a section → `key_point` (or `clinical` for practice relevance); >~6 flat bullets → table or grouped sub-headings; dense paragraphs → shorter paragraphs with a bold lead phrase; worked calculations, case studies, extra detail and answers → `accordion` panels (attempt before reveal).
- Preserve terminology, equations, worked examples and educational depth; remove duplication across sources without losing content.
- Flag inconsistencies between sources and thin areas (`flag` notes) instead of filling gaps; list deliberate omissions as `unplaced` notes.
- Never reproduce copyrighted figures, tables or extended text — describe the needed figure in a figure/placeholder and flag it.
- Use secondary tables mainly inside accordions; at most one or two callouts per section besides the required clinical callout and self-check.
- Page fields: 2–3 short intro paragraphs; optional `intro_figure`; 3–8 teaching tabs (unnumbered titles); `revision.points` 4–6 explain-don't-recall statements; optional `revision.flow` for a key relationship; `study_activities` only when the source describes them.
- Remove `takeaways` from the block list (no longer generated); keep everything else (clinical ≥1 per tab, self_check last in each tab, counselling/tip/critical/evidence rules).
- Course context: use to pitch level and link to outcomes; do not print course details on the page.
- `regenerate_tab.md`: unchanged rules plus "accordions allowed; one level".

`prompts/system-prompt-v1.md` is replaced by `prompts/system-prompt-v2.md`: the standalone copy-paste prompt (outputs HTML directly) updated to this spec's components and rules; v1 is deleted.

## 11. Preview and editing

- `preview.css` imitates `dp-tabs-buttons-vertical` (stacked rounded buttons, active = deep purple) and `dp-accordion-default` (heading bar with a ▸/▾ marker; content hidden until clicked). CanvasPreview handles accordion heading clicks (toggle) alongside tab clicks; accordion headings and tab headings are not editable.
- Editable (`data-edit`) adds: intro paragraphs, key_point lead/text, flow step label/sub, formula expression/note, accordion inner blocks (paths `tabs.N.blocks.M.panels.P.blocks.Q…`), revision points and flow title/steps, study activity task/purpose. The contract test must cover every new path.
- Spacers are never editable and never carry `data-edit`.

## 12. Compatibility

- Saved pages without the new fields render with the new style: intro panel from `intro` (placeholder image), Study materials tab with placeholders, revision check only if requested/embed (no points), legacy `takeaways` rendered in the new palette.
- `NotesPanel`, export/import and history keep working; import validation accepts the new block types and `study`.

## 13. Testing

- Golden HTML tests for every component in §4 (exact strings), the page skeleton (§3) and the revision check variants.
- Spacer placement tests (§5): between major blocks only, end-of-content spacer, around accordions, none inside wrappers, no doubles.
- Study materials tests: every present/missing combination, URL scheme filtering, escaping.
- Backend: schema parsing incl. accordion panels; validation inside accordions (links, figures, empty panels, nested clinical count); flow/formula/key_point rules; course_context in prompts and length cap; tab title numbering absent from AI output handling (strip a leading "N. " if the AI adds one).
- Frontend: sub/sup inline round-trip; editing contract test over all new paths; course profile store (CRUD, DB upgrade from v1 preserves pages); study-materials form ↔ page JSON.
- Manual: real-browser check of preview (tabs, accordions, editing) and a paste into a Canvas sandbox page.
