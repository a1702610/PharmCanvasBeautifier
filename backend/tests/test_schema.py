from app.ai.schema import (
    Counselling, Critical, Evidence, Figure, Page, SelfCheck, Table,
    Takeaways, Tip, WirePage,
)


def test_wire_page_accepts_flat_blocks_with_nulls():
    wire = WirePage.model_validate({
        "title": "Chronic pain",
        "intro": ["Intro."],
        "tabs": [{
            "title": "Overview",
            "blocks": [
                {"type": "paragraph", "text": "Body.", "items": None, "ref": None},
                {"type": "evidence", "title": "Paracetamol", "children": [
                    {"type": "paragraph", "text": "Little benefit."},
                    {"type": "citation", "text": "Ennis 2016"},
                ]},
            ],
        }],
    })
    assert wire.tabs[0].blocks[1].children[1].type == "citation"
    assert wire.revision.include is False
    assert wire.notes == []


def test_typed_page_parses_discriminated_blocks():
    page = Page.model_validate({
        "title": "T",
        "intro": [],
        "tabs": [{"id": "t1", "title": "A", "blocks": [
            {"type": "table", "headers": ["A", "B"], "rows": [["1", "2"]]},
            {"type": "figure", "ref": "IMG-01", "alt": "Chart"},
            {"type": "evidence", "title": "E", "children": [
                {"type": "references", "items": ["Ref 1"]},
            ]},
        ]}],
        "revision": {"include": False},
        "notes": [],
    })
    blocks = page.tabs[0].blocks
    assert isinstance(blocks[0], Table)
    assert isinstance(blocks[1], Figure)
    assert isinstance(blocks[2], Evidence)
    dumped = page.model_dump(exclude_none=True)
    assert "caption" not in dumped["tabs"][0]["blocks"][1]


def test_wire_block_accepts_new_types_and_questions():
    wire = WirePage.model_validate({
        "title": "T",
        "intro": [],
        "tabs": [{
            "title": "Overview",
            "blocks": [
                {"type": "takeaways", "items": ["A", "B"]},
                {"type": "self_check", "questions": [
                    {"question": "Q1?", "answer": "A1."},
                    {"question": None, "answer": None},
                ]},
                {"type": "counselling", "items": ["Take with food."]},
                {"type": "tip", "body": "Check interactions."},
                {"type": "critical", "title": "Warning", "body": "Serious.", "items": ["Item"]},
            ],
        }],
    })
    blocks = wire.tabs[0].blocks
    assert blocks[0].type == "takeaways"
    assert blocks[0].items == ["A", "B"]
    assert blocks[1].questions[0].question == "Q1?"
    assert blocks[1].questions[0].answer == "A1."
    assert blocks[1].questions[1].question is None
    assert blocks[1].questions[1].answer is None
    assert blocks[2].type == "counselling"
    assert blocks[3].body == "Check interactions."
    assert blocks[4].title == "Warning"


def test_typed_page_parses_new_block_types():
    page = Page.model_validate({
        "title": "T",
        "intro": [],
        "tabs": [{"id": "t1", "title": "A", "blocks": [
            {"type": "takeaways", "items": ["A", "B"]},
            {"type": "self_check", "questions": [{"question": "Q?", "answer": "A."}]},
            {"type": "counselling", "items": ["Take with food."]},
            {"type": "tip", "body": "Check interactions."},
            {"type": "critical", "title": "Warning", "body": "Serious.", "items": ["Item"]},
        ]}],
        "revision": {"include": False},
        "notes": [],
    })
    blocks = page.tabs[0].blocks
    assert isinstance(blocks[0], Takeaways)
    assert isinstance(blocks[1], SelfCheck)
    assert isinstance(blocks[2], Counselling)
    assert isinstance(blocks[3], Tip)
    assert isinstance(blocks[4], Critical)
    assert blocks[1].questions[0].question == "Q?"
    dumped = page.model_dump(exclude_none=True)
    assert "title" not in dumped["tabs"][0]["blocks"][2]


def test_typed_counselling_title_defaults_to_none():
    page = Page.model_validate({
        "title": "T",
        "intro": [],
        "tabs": [{"id": "t1", "title": "A", "blocks": [
            {"type": "counselling", "items": ["Take with food."]},
        ]}],
        "revision": {"include": False},
        "notes": [],
    })
    assert page.tabs[0].blocks[0].title is None
