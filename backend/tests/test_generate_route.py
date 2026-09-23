import base64

import pytest
from fastapi.testclient import TestClient

from app.ai import gemini
from app.ai.schema import WirePage, WireTab
from app.main import app

client = TestClient(app)
HEADERS = {"X-Gemini-Key": "test-key"}
TEXT = "=== SOURCE 1: a.pptx ===\n\n--- Slide 1 ---\nSee https://www.tga.gov.au\n[IMG-01: slide 1]"
IMAGES = [{"ref": "IMG-01", "location": "slide 1", "thumb_b64": base64.b64encode(b"jpeg").decode()}]
P = {"type": "paragraph", "text": "Body."}


def wire_page():
    tabs = [{"title": t, "blocks": [P]} for t in ("Overview", "Mechanism", "Management")]
    tabs[0]["blocks"].append({"type": "figure", "ref": "IMG-01", "alt": "Pain pathway"})
    return WirePage.model_validate({"title": "AI title", "intro": ["Intro."], "tabs": tabs})


class Recorded(list):
    """List of captured kwargs, plus .outcome: the value (or exception) the fake returns."""


@pytest.fixture
def calls(monkeypatch):
    recorded = Recorded()
    recorded.outcome = {"value": None}

    async def fake(**kwargs):
        recorded.append(kwargs)
        value = recorded.outcome["value"]
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr(gemini, "generate_structured", fake)
    return recorded


def test_generate_returns_finalized_page(calls):
    calls.outcome["value"] = wire_page()
    body = {"text": TEXT, "images": IMAGES, "instructions": "Focus on counselling", "include_revision": True, "title": "Chronic pain"}
    response = client.post("/api/generate", json=body, headers=HEADERS)
    assert response.status_code == 200
    page = response.json()["page"]
    assert page["title"] == "Chronic pain"
    assert [t["id"] for t in page["tabs"]] == ["t1", "t2", "t3"]
    assert page["tabs"][0]["blocks"][1] == {"type": "figure", "ref": "IMG-01", "alt": "Pain pathway"}
    assert page["revision"] == {"include": True}
    kwargs = calls[0]
    assert kwargs["api_key"] == "test-key"
    assert kwargs["schema"] is WirePage
    assert "Focus on counselling" in kwargs["prompt"]
    assert "SOURCE MATERIAL" in kwargs["prompt"]
    assert kwargs["images"][0].label == "Image IMG-01 (slide 1):"
    assert kwargs["images"][0].data == b"jpeg"


def test_generate_requires_key(calls):
    response = client.post("/api/generate", json={"text": TEXT})
    assert response.status_code == 401


def test_generate_maps_gemini_errors(calls):
    calls.outcome["value"] = gemini.GeminiError(gemini.RATE_MESSAGE, 429)
    response = client.post("/api/generate", json={"text": TEXT}, headers=HEADERS)
    assert response.status_code == 429
    assert response.json()["detail"] == gemini.RATE_MESSAGE


def test_regenerate_tab_keeps_id_and_passes_instruction(calls):
    calls.outcome["value"] = WireTab.model_validate({"title": "Management", "blocks": [P, P]})
    body = {
        "text": TEXT,
        "images": IMAGES,
        "outline": {"intro": ["Intro."], "tab_titles": ["Overview", "Management"]},
        "tab": {"id": "t2", "title": "Management", "blocks": [P]},
        "instruction": "Make it shorter",
    }
    response = client.post("/api/regenerate-tab", json=body, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["tab"]["id"] == "t2"
    assert len(data["tab"]["blocks"]) == 2
    assert data["notes"] == []
    kwargs = calls[0]
    assert kwargs["schema"] is WireTab
    assert "Make it shorter" in kwargs["prompt"]
    assert "Overview" in kwargs["prompt"]
    assert "Regenerating one tab" in kwargs["system_prompt"]


def test_regenerate_tab_empty_result_is_502(calls):
    calls.outcome["value"] = WireTab.model_validate({"title": "X", "blocks": []})
    body = {"text": TEXT, "outline": {}, "tab": {"id": "t1", "title": "X", "blocks": [P]}, "instruction": "Shorter"}
    response = client.post("/api/regenerate-tab", json=body, headers=HEADERS)
    assert response.status_code == 502
