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
