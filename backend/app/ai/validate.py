"""Turn Gemini's wire output into a validated, sanitised Page.

Drops empty blocks, removes links whose URL isn't in the source material,
removes figures/embeds with unknown refs, and records each change as a note.
"""
import re
from dataclasses import dataclass, field

from app.ai.schema import (
    Accordion, Flow, FlowStep, Formula, KeyPoint, Panel, StudyActivity,
    WireFlowStep, WireInnerBlock,
    Block, Caution, Citation, Clinical, Counselling, ContrastTable, Critical,
    Evidence, EvidenceChild, Figure, Heading, Link, ListBlock, Note, Page,
    Paragraph, Question, References, Revision, SelfCheck, Tab, Table,
    Takeaways, Tip, WireBlock, WireChild, WireCoverage, WirePage, WireTab,
)

# A URL segment made of "plain" characters or a single balanced (...) group, so a
# trailing ")" that closes an outer markdown link or sentence isn't swallowed, while a
# balanced pair inside the URL itself (e.g. a DOI like ...(20)30183-5) is kept.
_URL_BODY = r'(?:[^\s<>"\'\[\]()]|\([^\s<>"\'()]*\))+'
URL_RE = re.compile(r"https?://" + _URL_BODY)
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((" + _URL_BODY + r")\)")
IMG_REF_RE = re.compile(r"\[(IMG-\d+)")
EMBED_REF_RE = re.compile(r"\[(EMBED-\d+)\]")
TAB_NUMBER_RE = re.compile(r"^\s*\d+\s*[.)]\s+")
SOURCE_HEADER_RE = re.compile(r"^=== SOURCE (\d+): (.*) ===$", re.M)
UNIT_MARKER_RE = re.compile(r"^--- (Slide|Page) (\d+) ---$", re.M)
TITLE_MAX = 60


def _norm_url(url: str) -> str:
    return url.strip().rstrip("/.,;:")


TEMPLATE_MARK_RE = re.compile(r"^[+\u2022*\-]\s*")
SKIP_PREFIXES = ("[IMG-", "[EMBED-", "Links:", "|")


def _clean_line(line: str) -> str:
    """A slide line without the template's leading "+"/bullet mark."""
    return TEMPLATE_MARK_RE.sub("", line.strip()).strip()


def _source_units(text: str) -> dict[tuple[int, int], tuple[str, str, str]]:
    """Every "--- Slide n ---" / "--- Page n ---" in the source, keyed by (source, number),
    with the source's file name, "Slide"/"Page" and the unit's first real line of text as a
    title (skipping template marks, bare page numbers and footers repeated on most slides)."""
    units: dict[tuple[int, int], tuple[str, str, str]] = {}
    headers = list(SOURCE_HEADER_RE.finditer(text))
    for i, header in enumerate(headers):
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        section = text[header.end():end]
        markers = list(UNIT_MARKER_RE.finditer(section))
        bodies = [
            [_clean_line(line) for line in section[m.end():(markers[j + 1].start() if j + 1 < len(markers) else len(section))].splitlines()]
            for j, m in enumerate(markers)
        ]
        counts: dict[str, int] = {}
        for body in bodies:
            for line in set(body):
                counts[line] = counts.get(line, 0) + 1
        repeated = {line for line, n in counts.items() if len(bodies) >= 4 and n > len(bodies) / 2}
        for marker, body in zip(markers, bodies):
            title = next(
                (line for line in body if line and not line.isdigit() and line not in repeated and not line.startswith(SKIP_PREFIXES)),
                "",
            )
            if len(title) > TITLE_MAX:
                title = title[: TITLE_MAX - 1].rstrip() + "…"
            units[(int(header.group(1)), int(marker.group(2)))] = (header.group(2), marker.group(1), title)
    return units


@dataclass
class SourceContext:
    urls: set[str]
    image_refs: set[str]
    embed_refs: set[str]
    units: dict[tuple[int, int], tuple[str, str, str]] = field(default_factory=dict)

    @classmethod
    def from_text(cls, text: str) -> "SourceContext":
        return cls(
            urls={_norm_url(u) for u in URL_RE.findall(text)},
            image_refs=set(IMG_REF_RE.findall(text)),
            embed_refs=set(EMBED_REF_RE.findall(text)),
            units=_source_units(text),
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

    def _col_widths(self, col_widths: list[float] | None, n: int) -> list[float] | None:
        if not col_widths or len(col_widths) != n:
            return None
        total = sum(col_widths)
        if total <= 1.5:
            col_widths = [w * 100 for w in col_widths]
            total *= 100
        if not 80 <= total <= 120:
            return None
        return col_widths

    def _table(self, b: WireBlock) -> Table | None:
        headers = [self.text(h) for h in b.headers or []]
        if not any(headers):
            return None
        rows = [r for r in (self._row(r, len(headers)) for r in b.rows or []) if any(r)]
        if not rows:
            return None
        widths = self._col_widths(b.col_widths, len(headers))
        variant = "secondary" if b.variant == "secondary" else None
        row_headers = False if b.row_headers is False else None
        return Table(headers=headers, col_widths=widths, rows=rows, variant=variant, row_headers=row_headers)

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

    def block(self, b: WireBlock | WireInnerBlock, allow_accordion: bool = True) -> Block | None:
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
        if t == "takeaways":
            items = self.texts(b.items)
            return Takeaways(items=items) if items else None
        if t == "self_check":
            questions = []
            for q in b.questions or []:
                question, answer = self.text(q.question), self.text(q.answer)
                if question and answer:
                    questions.append(Question(question=question, answer=answer))
            return SelfCheck(questions=questions) if questions else None
        if t == "counselling":
            items = self.texts(b.items)
            if not items:
                return None
            return Counselling(title=self.text(b.title) or None, items=items)
        if t == "tip":
            body = self.text(b.body)
            return Tip(body=body) if body else None
        if t == "critical":
            body = self.text(b.body) or None
            items = self.texts(b.items) or None
            if not body and not items:
                return None
            return Critical(title=self.text(b.title) or None, body=body, items=items)
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
        return None

    def tab(self, w: WireTab, tab_id: str) -> Tab | None:
        blocks = [b for b in (self.block(b) for b in w.blocks) if b is not None]
        if not blocks:
            return None
        title = TAB_NUMBER_RE.sub("", self.text(w.title)) or "Untitled"
        return Tab(id=tab_id, title=title, blocks=blocks)


def _has_clinical(blocks) -> bool:
    for b in blocks:
        if isinstance(b, Clinical):
            return True
        if isinstance(b, Accordion) and any(_has_clinical(p.blocks) for p in b.panels):
            return True
    return False


def finalize_page(wire: WirePage, ctx: SourceContext, include_revision: bool) -> Page:
    f = _Finalizer(ctx)
    tabs: list[Tab] = []
    for w in wire.tabs:
        t = f.tab(w, f"t{len(tabs) + 1}")
        if t is not None:
            tabs.append(t)
    if not 3 <= len(tabs) <= 8:
        f.note(f"This page has {len(tabs)} tabs; 3–8 is recommended.")
    for t in tabs:
        if not _has_clinical(t.blocks):
            f.note(f"Tab '{t.title}' has no 'Why this matters clinically' callout.")

    embed_ref = (wire.revision.embed_ref or "").strip() or None
    if embed_ref and embed_ref not in ctx.embed_refs:
        f.note(f"Removed an unknown embed reference: {embed_ref}")
        embed_ref = None

    intro = f.texts(wire.intro)
    intro_figure = None
    if wire.intro_figure and (wire.intro_figure.ref or "").strip() in ctx.image_refs:
        intro_figure = f.figure(wire.intro_figure.ref, wire.intro_figure.alt, wire.intro_figure.caption)
    activities = []
    for a in wire.study_activities or []:
        task, purpose = f.text(a.task), f.text(a.purpose)
        if task and purpose:
            activities.append(StudyActivity(task=task, purpose=purpose))
    points = f.texts(wire.revision.points)[:8]
    revision = Revision(
        include=include_revision or wire.revision.include or embed_ref is not None,
        embed_ref=embed_ref,
        points=points or None,
    )
    ai_notes = [Note(kind=n.kind, text=n.text.strip()) for n in wire.notes if n.text.strip()]
    coverage_notes = _coverage_notes(wire.coverage or [], ctx)
    return Page(
        title=wire.title.strip() or "Untitled page",
        intro=intro,
        intro_figure=intro_figure,
        study_activities=activities or None,
        tabs=tabs,
        revision=revision,
        notes=coverage_notes + ai_notes + f.notes,
    )


def unit_label(ctx: SourceContext, key: tuple[int, int]) -> str:
    """How a slide/page is named in notes: "Page 2 (Title)", with the file name when there
    are several sources."""
    name, kind, title = ctx.units[key]
    one_source = len({source for source, _ in ctx.units}) == 1
    where = f"{kind} {key[1]}" if one_source else f"{name} {kind.lower()} {key[1]}"
    return where + (f" ({title})" if title else "")


def _coverage_notes(coverage: list[WireCoverage], ctx: SourceContext) -> list[Note]:
    """Lists the slides/pages the AI didn't account for (so gaps aren't silent), and the ones
    it deliberately left out, with its reasons."""
    used: set[tuple[int, int]] = set()
    omitted: dict[tuple[int, int], str] = {}
    for item in coverage:
        key = (item.source, item.unit)
        if key not in ctx.units:
            continue
        if item.status == "used":
            used.add(key)
        elif item.status == "omitted" and (item.reason or "").strip():
            omitted[key] = item.reason.strip()

    def label(key: tuple[int, int]) -> str:
        return unit_label(ctx, key)

    notes: list[Note] = []
    missing = [k for k in sorted(ctx.units) if k not in used and k not in omitted]
    if missing:
        notes.append(Note(
            kind="unplaced",
            text="Slides/pages not accounted for by the AI. Check their content made it onto the page:\n"
            + "\n".join(f"- {label(k)}" for k in missing),
        ))
    left_out = [(k, r) for k, r in sorted(omitted.items()) if k not in used]
    if left_out:
        notes.append(Note(
            kind="unplaced",
            text="Slides/pages the AI left out:\n" + "\n".join(f"- {label(k)}: {r}" for k, r in left_out),
        ))
    return notes

