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
