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
