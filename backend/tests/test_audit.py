import base64

import pytest
from fastapi.testclient import TestClient

from app.ai import gemini
from app.ai.audit import MAX_ISSUES, audit_notes, page_to_text
from app.ai.schema import Page, WireAudit, WireAuditIssue
from app.ai.validate import SourceContext
from app.main import app

client = TestClient(app)
HEADERS = {"X-Gemini-Key": "test-key"}
SOURCE = (
    "=== SOURCE 1: deck.pdf ===\n\n--- Page 1 ---\nHYPERTENSION\n\n"
    "--- Page 2 ---\nDrug Dosing Strategies\n\n--- Page 3 ---\nCombination Therapy"
)

PAGE = Page.model_validate({
    "title": "Hypertension",
    "intro": ["Intro paragraph."],
    "revision": {"include": False, "points": ["Explain targets."]},
    "notes": [],
    "tabs": [{
        "id": "t1",
        "title": "Drugs",
        "blocks": [
            {"type": "heading", "text": "Combinations"},
            {"type": "table", "headers": ["First", "Second"], "rows": [["ACEI", "CCB"]]},
            {"type": "flow", "steps": [{"label": "Start low", "style": "solid"}, {"label": "Add second drug", "sub": "after 3 months"}]},
            {"type": "clinical", "body": "Monitor K+."},
            {"type": "self_check", "questions": [{"question": "Why start low?", "answer": "Avoid hypotension."}]},
            {"type": "accordion", "panels": [{"title": "Worked example", "blocks": [{"type": "paragraph", "text": "Step one."}]}]},
        ],
    }],
})


def test_page_to_text_includes_every_kind_of_content():
    text = page_to_text(PAGE)
    for expected in [
        "Hypertension", "Intro paragraph.", "Drugs", "Combinations", "First | Second", "ACEI | CCB",
        "Start low → Add second drug (after 3 months)", "Monitor K+.", "Why start low?", "Avoid hypotension.",
        "Worked example", "Step one.", "Explain targets.",
    ]:
        assert expected in text


def test_audit_notes_group_findings_by_kind_with_slide_labels():
    ctx = SourceContext.from_text(SOURCE)
    notes = audit_notes([
        WireAuditIssue(source=1, unit=2, kind="missing", detail="Conservative vs aggressive dosing comparison"),
        WireAuditIssue(source=1, unit=3, kind="changed", detail="Verapamil effects attributed to dihydropyridines"),
        WireAuditIssue(kind="added", detail="Creatinine rise of up to 30%"),
        WireAuditIssue(kind="missing", detail="  "),
    ], ctx)
    by_kind = {n.text.split("\n")[0]: n for n in notes}
    missing = next(n for t, n in by_kind.items() if t.startswith("Missing from the page"))
    assert missing.kind == "unplaced"
    assert missing.text.split("\n")[1] == "- Page 2 (Drug Dosing Strategies): Conservative vs aggressive dosing comparison"
    changed = next(n for t, n in by_kind.items() if t.startswith("Changed from your slides"))
    assert changed.text.split("\n")[1] == "- Page 3 (Combination Therapy): Verapamil effects attributed to dihydropyridines"
    added = next(n for t, n in by_kind.items() if t.startswith("Not in your slides"))
    assert added.text.split("\n")[1] == "- Creatinine rise of up to 30%"
    assert len(notes) == 3


def test_audit_notes_cap_the_number_of_findings():
    ctx = SourceContext.from_text(SOURCE)
    notes = audit_notes([WireAuditIssue(kind="missing", detail=f"Gap {i}") for i in range(MAX_ISSUES + 10)], ctx)
    assert len(notes[0].text.split("\n")) == MAX_ISSUES + 1


def test_a_clean_audit_says_so():
    notes = audit_notes([], SourceContext.from_text(SOURCE))
    assert len(notes) == 1 and notes[0].kind == "flag"
    assert "didn't find" in notes[0].text


@pytest.fixture
def calls(monkeypatch):
    recorded = []

    async def fake(**kwargs):
        recorded.append(kwargs)
        return WireAudit(issues=[WireAuditIssue(source=1, unit=2, kind="missing", detail="Dosing comparison")])

    monkeypatch.setattr(gemini, "generate_structured", fake)
    return recorded


def test_audit_route_returns_notes_and_sends_the_page_and_slides(calls):
    from app.config import settings

    body = {
        "text": SOURCE,
        "pages": [{"source_index": 1, "source": "deck.pdf", "location": "page 2", "data_b64": base64.b64encode(b"jpeg").decode()}],
        "page": PAGE.model_dump(),
        "model": "pro",
    }
    response = client.post("/api/audit", json=body, headers=HEADERS)
    assert response.status_code == 200
    notes = response.json()["notes"]
    assert notes[0]["kind"] == "unplaced" and "Page 2 (Drug Dosing Strategies): Dosing comparison" in notes[0]["text"]
    kwargs = calls[0]
    assert kwargs["schema"] is WireAudit
    assert kwargs["model"] == settings.GEMINI_PRO_MODEL
    assert "ACEI | CCB" in kwargs["prompt"] and "Drug Dosing Strategies" in kwargs["prompt"]
    assert kwargs["images"][0].label == "Full image of SOURCE 1 (deck.pdf), page 2:"
    assert "missing" in kwargs["system_prompt"]


def test_audit_requires_a_key(calls):
    response = client.post("/api/audit", json={"text": SOURCE, "page": PAGE.model_dump()})
    assert response.status_code == 401
