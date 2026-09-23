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
