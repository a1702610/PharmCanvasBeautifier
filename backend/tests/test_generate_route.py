import base64

import pytest
from fastapi.testclient import TestClient

from app.ai import gemini
from app.ai.schema import WirePage
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


def test_generate_empty_page_is_502(calls):
    calls.outcome["value"] = WirePage.model_validate({"title": "X", "intro": [], "tabs": []})
    response = client.post("/api/generate", json={"text": TEXT}, headers=HEADERS)
    assert response.status_code == 502
    assert response.json()["detail"] == "The AI returned an empty page. Please try again."


def test_generate_passes_course_context_truncated(calls):
    calls.outcome["value"] = wire_page()
    long_ctx = "x" * 13000
    r = client.post("/api/generate", json={"text": TEXT, "course_context": "  " + long_ctx + "  "}, headers=HEADERS)
    assert r.status_code == 200
    prompt = calls[-1]["prompt"]
    assert "COURSE CONTEXT" in prompt
    assert "x" * 12000 in prompt and "x" * 12001 not in prompt


def test_generate_sends_page_images_before_image_thumbnails(calls):
    calls.outcome["value"] = wire_page()
    page_b64 = base64.b64encode(b"page-jpeg").decode()
    body = {"text": TEXT, "images": IMAGES, "pages": [{"source_index": 1, "source": "a.pptx", "location": "slide 1", "data_b64": page_b64}]}
    response = client.post("/api/generate", json=body, headers=HEADERS)
    assert response.status_code == 200
    parts = calls[0]["images"]
    assert parts[0].label == "Full image of SOURCE 1 (a.pptx), slide 1:"
    assert parts[0].data == b"page-jpeg"
    assert parts[1].label == "Image IMG-01 (slide 1):"


def test_generate_limits_page_images(calls):
    page = {"source_index": 1, "source": "a.pdf", "location": "page 1", "data_b64": base64.b64encode(b"x").decode()}
    response = client.post("/api/generate", json={"text": TEXT, "pages": [page] * 201}, headers=HEADERS)
    assert response.status_code == 422


def test_generate_uses_flash_by_default_and_pro_when_asked(calls):
    from app.config import settings

    calls.outcome["value"] = wire_page()
    assert client.post("/api/generate", json={"text": TEXT}, headers=HEADERS).status_code == 200
    assert calls[-1]["model"] == settings.GEMINI_MODEL
    assert client.post("/api/generate", json={"text": TEXT, "model": "pro"}, headers=HEADERS).status_code == 200
    assert calls[-1]["model"] == settings.GEMINI_PRO_MODEL
    assert settings.GEMINI_PRO_MODEL != settings.GEMINI_MODEL


def test_generate_rejects_unknown_model_choices(calls):
    response = client.post("/api/generate", json={"text": TEXT, "model": "gemini-ultra"}, headers=HEADERS)
    assert response.status_code == 422


def test_pro_with_a_key_that_cannot_use_it_explains_billing(calls):
    calls.outcome["value"] = gemini.GeminiError(gemini.RATE_MESSAGE, 429)
    response = client.post("/api/generate", json={"text": TEXT, "model": "pro"}, headers=HEADERS)
    assert response.status_code == 429
    detail = response.json()["detail"]
    assert "billing" in detail and "Flash" in detail
