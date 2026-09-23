from app.ai.schema import Evidence, Figure, Page, Table, WirePage


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
