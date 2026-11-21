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


def test_page_renders_become_page_images_for_the_ai():
    ex = extract_with("deck.pdf", {"data": noise_png(), "location": "page 1"})
    ex.page_renders = [("page 1", b"\xff\xd8one"), ("page 2", b"\xff\xd8two")]
    other = extract_with("notes.docx", {"data": noise_png(64, 64)})
    out = assemble([("notes.docx", other), ("deck.pdf", ex)], max_ai_images=20)
    assert [(p.source_index, p.source, p.location) for p in out.pages] == [(2, "deck.pdf", "page 1"), (2, "deck.pdf", "page 2")]
    import base64
    assert base64.b64decode(out.pages[1].data_b64) == b"\xff\xd8two"


def test_page_images_are_capped_with_a_warning():
    ex = extract_with("deck.pdf")
    ex.page_renders = [(f"page {i}", b"\xff\xd8") for i in range(1, 6)]
    out = assemble([("deck.pdf", ex)], max_ai_images=20, max_pages=3)
    assert [p.location for p in out.pages] == ["page 1", "page 2", "page 3"]
    assert any("Only the first 3 pages" in w for w in out.warnings[0])
