from app.ai.schema import (
    Counselling, Critical, Figure, Link, Paragraph, Takeaways, Tip, WirePage,
)
from app.ai.validate import SourceContext, finalize_page

SOURCE = (
    "=== SOURCE 1: a.pptx ===\n\n--- Slide 1 ---\n"
    "See https://www.tga.gov.au/guidance.\n[IMG-01: slide 1]\n[EMBED-01]"
)
CTX = SourceContext.from_text(SOURCE)
P = {"type": "paragraph", "text": "Body."}
CLINICAL = {"type": "clinical", "body": "Relevant to practice."}


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
    blocks = [{"type": "link", "lead_in": "See", "url": DOI_URL, "link_text": "the study"}, CLINICAL]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), DOI_CTX, include_revision=False)
    assert page.tabs[0].blocks[0] == Link(lead_in="See", url=DOI_URL, link_text="the study")
    assert page.notes == []


def test_inline_md_link_with_balanced_paren_url_is_kept():
    w = wire([tab("A", P, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)])
    w.intro = [f"Read [the study]({DOI_URL})."]
    page = finalize_page(w, DOI_CTX, include_revision=False)
    assert page.intro == [f"Read [the study]({DOI_URL})."]
    assert page.notes == []


def test_source_context_collects_urls_and_refs():
    assert CTX.urls == {"https://www.tga.gov.au/guidance"}
    assert CTX.image_refs == {"IMG-01"}
    assert CTX.embed_refs == {"EMBED-01"}


def test_assigns_tab_ids_and_keeps_valid_content():
    page = finalize_page(wire([tab("A", P, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
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



# ── New block types ──────────────────────────────────────────────────────────

def test_takeaways_kept_and_empty_dropped():
    blocks = [{"type": "takeaways", "items": ["First point.", "Second point."]}, CLINICAL]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert page.tabs[0].blocks[0] == Takeaways(items=["First point.", "Second point."])

    empty_blocks = [{"type": "takeaways", "items": []}, P, CLINICAL]
    page = finalize_page(wire([tab("A", *empty_blocks), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert all(b.type != "takeaways" for b in page.tabs[0].blocks)


def test_self_check_keeps_only_complete_questions():
    block = {"type": "self_check", "questions": [
        {"question": "What is the mechanism?", "answer": "It blocks the receptor."},
        {"question": "Missing answer?", "answer": None},
        {"question": None, "answer": "Missing question."},
        {"question": "   ", "answer": "Blank question."},
    ]}
    page = finalize_page(wire([tab("A", block, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    self_check = page.tabs[0].blocks[0]
    assert self_check.type == "self_check"
    assert len(self_check.questions) == 1
    assert self_check.questions[0].question == "What is the mechanism?"
    assert self_check.questions[0].answer == "It blocks the receptor."


def test_self_check_dropped_when_no_complete_questions():
    block = {"type": "self_check", "questions": [{"question": None, "answer": None}]}
    page = finalize_page(wire([tab("A", block, P, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert all(b.type != "self_check" for b in page.tabs[0].blocks)


def test_counselling_title_defaults_to_none_and_empty_dropped():
    block = {"type": "counselling", "items": ["Take with food."]}
    page = finalize_page(wire([tab("A", block, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    counselling = page.tabs[0].blocks[0]
    assert counselling == Counselling(title=None, items=["Take with food."])

    titled = {"type": "counselling", "title": "Talking to patients", "items": ["Take with food."]}
    page = finalize_page(wire([tab("A", titled, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert page.tabs[0].blocks[0].title == "Talking to patients"

    empty = {"type": "counselling", "items": []}
    page = finalize_page(wire([tab("A", empty, P, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert all(b.type != "counselling" for b in page.tabs[0].blocks)


def test_tip_kept_and_empty_dropped():
    block = {"type": "tip", "body": "Check for interactions before dispensing."}
    page = finalize_page(wire([tab("A", block, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert page.tabs[0].blocks[0] == Tip(body="Check for interactions before dispensing.")

    empty = {"type": "tip", "body": "   "}
    page = finalize_page(wire([tab("A", empty, P, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert all(b.type != "tip" for b in page.tabs[0].blocks)


def test_critical_needs_body_or_items_and_title_defaults_to_none():
    body_only = {"type": "critical", "body": "Can cause fatal overdose."}
    page = finalize_page(wire([tab("A", body_only, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    critical = page.tabs[0].blocks[0]
    assert critical == Critical(title=None, body="Can cause fatal overdose.", items=None)

    items_only = {"type": "critical", "title": "Boxed warning", "items": ["Do not exceed dose."]}
    page = finalize_page(wire([tab("A", items_only, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    critical = page.tabs[0].blocks[0]
    assert critical.title == "Boxed warning"
    assert critical.items == ["Do not exceed dose."]

    empty = {"type": "critical", "title": "Boxed warning"}
    page = finalize_page(wire([tab("A", empty, P, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert all(b.type != "critical" for b in page.tabs[0].blocks)


# ── Missing clinical callout ─────────────────────────────────────────────────

def test_finalize_page_notes_tabs_missing_clinical_callout():
    page = finalize_page(wire([tab("A", P), tab("B", P, CLINICAL), tab("C", P)]), CTX, include_revision=False)
    assert any(
        n.kind == "flag" and "Tab 'A' has no 'Why this matters clinically' callout." in n.text
        for n in page.notes
    )
    assert any(
        n.kind == "flag" and "Tab 'C' has no 'Why this matters clinically' callout." in n.text
        for n in page.notes
    )
    assert not any("Tab 'B'" in n.text for n in page.notes)


def test_finalize_page_no_note_when_every_tab_has_clinical():
    page = finalize_page(wire([tab("A", P, CLINICAL), tab("B", P, CLINICAL), tab("C", P, CLINICAL)]), CTX, include_revision=False)
    assert not any("clinically" in n.text for n in page.notes)



# --- PHAR3004 house-style blocks and page fields ---
from app.ai.schema import Accordion, Flow, Formula, KeyPoint, Table  # noqa: E402

CLIN = CLINICAL


def test_key_point_flow_formula_validated():
    blocks = [
        {"type": "key_point", "lead": "Lead.", "text": "Text [x](https://fake.example)"},
        {"type": "key_point", "text": "  "},
        {"type": "flow", "steps": [{"label": "Dose", "style": "solid"}, {"label": "  "}, {"label": "Effect", "style": None}]},
        {"type": "flow", "steps": [{"label": "Only one"}]},
        {"type": "formula", "expression": "CL = Q × E", "note": ""},
        {"type": "formula", "expression": ""},
        CLIN,
    ]
    page = finalize_page(wire([tab("A", *blocks), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    b = page.tabs[0].blocks
    assert b[0] == KeyPoint(lead="Lead.", text="Text x")
    assert isinstance(b[1], Flow) and [s.label for s in b[1].steps] == ["Dose", "Effect"]
    assert b[1].steps[1].style == "outline"
    assert b[2] == Formula(expression="CL = Q × E")
    assert len(b) == 4  # empty key point, 1-step flow and empty formula dropped
    assert any("fewer than two steps" in n.text for n in page.notes)


def test_accordion_validated_recursively_and_nesting_dropped():
    acc = {"type": "accordion", "panels": [
        {"title": "Worked example", "blocks": [
            {"type": "paragraph", "text": "See [fake](https://fake.example)"},
            {"type": "figure", "ref": "IMG-09", "alt": "x"},
            {"type": "clinical", "body": "Inside."},
        ]},
        {"title": "Empty", "blocks": [{"type": "paragraph", "text": " "}]},
    ]}
    page = finalize_page(wire([tab("A", acc), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    accordion = page.tabs[0].blocks[0]
    assert isinstance(accordion, Accordion)
    assert [p.title for p in accordion.panels] == ["Worked example"]
    assert accordion.panels[0].blocks[0] == Paragraph(text="See fake")
    assert len(accordion.panels[0].blocks) == 2  # unknown figure removed
    # clinical inside the accordion satisfies the per-tab check
    assert not any("Tab 'A'" in n.text for n in page.notes)


def test_inner_accordion_type_is_rejected_by_wire_schema_or_dropped():
    # WireInnerBlock cannot be "accordion", so a nested accordion fails validation at the wire level;
    # finalize must still drop a panel whose blocks end up empty.
    acc = {"type": "accordion", "panels": [{"title": "T", "blocks": []}]}
    page = finalize_page(wire([tab("A", acc, P, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    assert all(not isinstance(b, Accordion) for b in page.tabs[0].blocks)


def test_table_variant_and_row_headers_pass_through():
    t = {"type": "table", "headers": ["A", "B"], "rows": [["1", "2"]], "variant": "secondary", "row_headers": False}
    page = finalize_page(wire([tab("A", t, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)]), CTX, include_revision=False)
    table = page.tabs[0].blocks[0]
    assert isinstance(table, Table) and table.variant == "secondary" and table.row_headers is False


def test_tab_title_number_prefix_stripped():
    page = finalize_page(wire([tab("1. Overview", P, CLIN), tab("2) Next", P, CLIN), tab("Three", P, CLIN)]), CTX, include_revision=False)
    assert [t.title for t in page.tabs] == ["Overview", "Next", "Three"]


def test_page_fields_revision_points_flow_activities_intro_figure():
    w = wire([tab("A", P, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)])
    from app.ai.schema import WireFigureRef, WireActivity, WireRevision, WireFlow, WireFlowStep
    w.intro_figure = WireFigureRef(ref="IMG-01", alt="Course map")
    w.study_activities = [WireActivity(task="Watch part 1", purpose="Framework"), WireActivity(task="", purpose="x")]
    w.revision = WireRevision(points=["One", " ", "Two"] + [f"P{i}" for i in range(10)], flow_title="Direction",
                              flow=WireFlow(steps=[WireFlowStep(label="CL"), WireFlowStep(label="k", style="amber")]))
    page = finalize_page(w, CTX, include_revision=False)
    assert page.intro_figure.ref == "IMG-01" and page.intro_figure.alt == "Course map"
    assert [(a.task, a.purpose) for a in page.study_activities] == [("Watch part 1", "Framework")]
    assert page.revision.points[:2] == ["One", "Two"] and len(page.revision.points) == 8
    assert page.revision.flow_title == "Direction" and [s.label for s in page.revision.flow.steps] == ["CL", "k"]


def test_unknown_intro_figure_dropped_silently():
    from app.ai.schema import WireFigureRef
    w = wire([tab("A", P, CLIN), tab("B", P, CLIN), tab("C", P, CLIN)])
    w.intro_figure = WireFigureRef(ref="IMG-77", alt="x")
    page = finalize_page(w, CTX, include_revision=False)
    assert page.intro_figure is None
    assert not any("IMG-77" in n.text for n in page.notes)
