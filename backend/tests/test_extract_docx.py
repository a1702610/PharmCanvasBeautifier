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
