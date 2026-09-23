import pytest

from app.ai.schema import Figure, Link, Paragraph, WirePage, WireTab
from app.ai.validate import SourceContext, finalize_page, finalize_tab

SOURCE = (
    "=== SOURCE 1: a.pptx ===\n\n--- Slide 1 ---\n"
    "See https://www.tga.gov.au/guidance.\n[IMG-01: slide 1]\n[EMBED-01]"
)
CTX = SourceContext.from_text(SOURCE)
P = {"type": "paragraph", "text": "Body."}


def tab(title, *blocks):
    return {"title": title, "blocks": list(blocks)}


def wire(tabs, **extra):
    return WirePage.model_validate({"title": "Chronic pain", "intro": ["Intro."], "tabs": tabs, **extra})


DOI_SOURCE = (
    "=== SOURCE 1: a.pptx ===\n\n--- Slide 1 ---\n"
    "See https://doi.org/10.1016/S0140-6736(20)30183-5 for detail.\n[IMG-01: slide 1]\n[EMBED-01]"
)
DOI_CTX = SourceContext.from_text(DOI_SOURCE)
DOI_URL = "https://doi.org/10.1016/S0140-6736(20)30183-5"


def test_source_context_collects_url_with_balanced_parens():
    assert DOI_CTX.urls == {DOI_URL}


def test_link_block_with_balanced_paren_url_is_kept():
    blocks = [{"type": "link", "lead_in": "See", "url": DOI_URL, "link_text": "the study"}]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P), tab("C", P)]), DOI_CTX, include_revision=False)
    assert page.tabs[0].blocks == [Link(lead_in="See", url=DOI_URL, link_text="the study")]
    assert page.notes == []


def test_inline_md_link_with_balanced_paren_url_is_kept():
    w = wire([tab("A", P), tab("B", P), tab("C", P)])
    w.intro = [f"Read [the study]({DOI_URL})."]
    page = finalize_page(w, DOI_CTX, include_revision=False)
    assert page.intro == [f"Read [the study]({DOI_URL})."]
    assert page.notes == []


def test_source_context_collects_urls_and_refs():
    assert CTX.urls == {"https://www.tga.gov.au/guidance"}
    assert CTX.image_refs == {"IMG-01"}
    assert CTX.embed_refs == {"EMBED-01"}


def test_assigns_tab_ids_and_keeps_valid_content():
    page = finalize_page(wire([tab("A", P), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert [t.id for t in page.tabs] == ["t1", "t2", "t3"]
    assert page.notes == []


def test_removes_invented_inline_links_and_notes_them():
    w = wire([tab("A", P), tab("B", P), tab("C", P)])
    w.intro = ["Read [TGA](https://www.tga.gov.au/guidance) and [fake](https://fake.example.com)."]
    page = finalize_page(w, CTX, include_revision=False)
    assert page.intro == ["Read [TGA](https://www.tga.gov.au/guidance) and fake."]
    assert any("fake.example.com" in n.text and n.kind == "flag" for n in page.notes)


def test_drops_unknown_figures():
    blocks = [
        {"type": "figure", "ref": "IMG-01", "alt": "Chart"},
        {"type": "figure", "ref": "IMG-09", "alt": "Invented"},
    ]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert page.tabs[0].blocks == [Figure(ref="IMG-01", alt="Chart")]
    assert any("IMG-09" in n.text for n in page.notes)


def test_link_block_with_unknown_url_becomes_paragraph():
    blocks = [
        {"type": "link", "lead_in": "Guidance", "url": "https://www.tga.gov.au/guidance/", "link_text": "TGA"},
        {"type": "link", "lead_in": "Report", "url": "https://made.up/report", "link_text": "2025 Report"},
    ]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert isinstance(page.tabs[0].blocks[0], Link)
    assert page.tabs[0].blocks[1] == Paragraph(text="Report 2025 Report")


def test_table_rows_are_padded_and_bad_widths_dropped():
    block = {"type": "table", "headers": ["Class", "Agents"], "col_widths": [30], "rows": [["TCA"], ["SNRI", "duloxetine", "extra"]]}
    page = finalize_page(wire([tab("A", block), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    table = page.tabs[0].blocks[0]
    assert table.rows == [["TCA", ""], ["SNRI", "duloxetine"]]
    assert table.col_widths is None


def test_table_fractional_col_widths_are_scaled_to_percent():
    block = {"type": "table", "headers": ["Class", "Agents"], "col_widths": [0.26, 0.74], "rows": [["TCA", "amitriptyline"]]}
    page = finalize_page(wire([tab("A", block), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    table = page.tabs[0].blocks[0]
    assert table.col_widths == [26.0, 74.0]


def test_table_col_widths_with_bad_sum_are_dropped():
    block = {"type": "table", "headers": ["Class", "Agents"], "col_widths": [10, 10], "rows": [["TCA", "amitriptyline"]]}
    page = finalize_page(wire([tab("A", block), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    table = page.tabs[0].blocks[0]
    assert table.col_widths is None


def test_empty_blocks_and_tabs_removed_with_tab_count_note():
    empty = {"type": "paragraph", "text": "   "}
    page = finalize_page(wire([tab("A", empty), tab("B", P), tab("C", P)]), CTX, include_revision=False)
    assert [t.title for t in page.tabs] == ["B", "C"]
    assert [t.id for t in page.tabs] == ["t1", "t2"]
    assert any("2 tabs" in n.text for n in page.notes)


def test_revision_embed_ref_kept_when_known():
    tabs = [tab("A", P), tab("B", P), tab("C", P)]
    page = finalize_page(wire(tabs, revision={"include": False, "embed_ref": "EMBED-01"}), CTX, include_revision=False)
    assert page.revision.include is True
    assert page.revision.embed_ref == "EMBED-01"


def test_revision_unknown_embed_cleared():
    tabs = [tab("A", P), tab("B", P), tab("C", P)]
    page = finalize_page(wire(tabs, revision={"include": False, "embed_ref": "EMBED-07"}), CTX, include_revision=False)
    assert page.revision.include is False
    assert page.revision.embed_ref is None
    assert any("EMBED-07" in n.text for n in page.notes)


def test_include_revision_request_forces_block():
    page = finalize_page(wire([tab("A", P), tab("B", P), tab("C", P)]), CTX, include_revision=True)
    assert page.revision.include is True


def test_finalize_tab_keeps_id_and_raises_when_empty():
    t, notes = finalize_tab(WireTab.model_validate(tab("A", P)), CTX, "t4")
    assert t.id == "t4" and notes == []
    with pytest.raises(ValueError):
        finalize_tab(WireTab.model_validate(tab("A", {"type": "list", "items": []})), CTX, "t4")
