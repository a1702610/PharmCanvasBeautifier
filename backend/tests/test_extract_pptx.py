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
