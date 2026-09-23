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
