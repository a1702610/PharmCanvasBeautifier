from app.extractors.common import RawImage, SourceExtract
from app.extractors.stream import assemble
from tests.helpers import noise_png


def extract_with(name, *images, prefix="Intro"):
    ex = SourceExtract()
    tokens = [ex.add_image(RawImage(source=name, **img)) for img in images]
    ex.text = prefix + "\n\n" + "\n\n".join(tokens) + "\n\nEnd"
    return ex


def test_numbers_images_and_adds_source_headers():
    png = noise_png()
    out = assemble([("a.pptx", extract_with("a.pptx", {"location": "slide 2", "data": png}))], max_ai_images=20)
    assert out.text == "=== SOURCE 1: a.pptx ===\n\nIntro\n\n[IMG-01: slide 2]\n\nEnd"
    image = out.images[0]
    assert (image.ref, image.mime, image.source) == ("IMG-01", "image/png", "a.pptx")
    assert image.data_b64 and image.thumb_b64


def test_logo_repeated_more_than_twice_is_skipped():
    logo = noise_png()
    ex = extract_with("deck.pptx", *[{"data": logo, "location": f"slide {i}"} for i in (1, 2, 3)])
    out = assemble([("deck.pptx", ex)], max_ai_images=20)
    assert out.images == []
    assert "IMG" not in out.text
    assert out.text == "=== SOURCE 1: deck.pptx ===\n\nIntro\n\nEnd"


def test_image_used_twice_shares_one_ref():
    png = noise_png()
    ex = extract_with("a.docx", {"data": png}, {"data": png})
    out = assemble([("a.docx", ex)], max_ai_images=20)
    assert len(out.images) == 1
    assert out.text.count("[IMG-01]") == 2


def test_small_skipped_silently_and_unreadable_warned():
    ex = extract_with("a.docx", {"data": noise_png(40, 40)}, {"data": b"junk" * 1000})
    out = assemble([("a.docx", ex)], max_ai_images=20)
    assert out.images == []
    assert out.warnings == [["1 image(s) couldn't be read (unsupported format) and were skipped."]]


def test_canvas_images_and_embeds_get_refs():
    ex = SourceExtract()
    img = ex.add_image(RawImage(source="Pasted Canvas page 1", canvas_tag='<img src="x">'))
    emb = ex.add_embed("<iframe></iframe>")
    ex.text = f"{img}\n{emb}"
    out = assemble([("Pasted Canvas page 1", ex)], max_ai_images=20)
    assert out.text.endswith("[IMG-01]\n[EMBED-01]")
    assert out.images[0].canvas_tag == '<img src="x">'
    assert out.images[0].thumb_b64 is None
    assert out.embeds[0].ref == "EMBED-01"


def test_only_first_n_images_get_thumbnails_and_numbering_spans_sources():
    a = extract_with("a.docx", {"data": noise_png()})
    b = extract_with("b.docx", {"data": noise_png()})
    out = assemble([("a.docx", a), ("b.docx", b)], max_ai_images=1)
    assert [i.ref for i in out.images] == ["IMG-01", "IMG-02"]
    assert out.images[0].thumb_b64 and out.images[1].thumb_b64 is None
    assert "=== SOURCE 2: b.docx ===\n\nIntro\n\n[IMG-02]" in out.text
