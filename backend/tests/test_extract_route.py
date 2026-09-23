from fastapi.testclient import TestClient

from app.main import app
from tests.helpers import make_docx, noise_png

client = TestClient(app)
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_extract_mixed_sources_in_order():
    files = [
        ("files", ("notes.docx", make_docx(noise_png()), DOCX)),
        ("files", ("readme.txt", b"hello", "text/plain")),
    ]
    data = {"canvas_html": ["<p>Old page</p>"], "order": ["canvas:0", "file:0", "file:1"]}
    response = client.post("/api/extract", files=files, data=data)
    assert response.status_code == 200
    body = response.json()
    assert [s["ok"] for s in body["sources"]] == [True, True, False]
    assert body["sources"][0] == {"name": "Pasted Canvas page 1", "kind": "canvas", "ok": True, "warnings": []}
    assert "Unsupported file type" in body["sources"][2]["error"]
    assert body["text"].startswith("=== SOURCE 1: Pasted Canvas page 1 ===\n\nOld page")
    assert "=== SOURCE 2: notes.docx ===" in body["text"]
    assert body["images"][0]["ref"] == "IMG-01"
    assert "canvas_tag" not in body["images"][0]
    assert body["token_limit"] == 150000
    assert body["approx_tokens"] == len(body["text"]) // 4


def test_extract_default_order_files_then_pastes():
    data = {"canvas_html": ["<p>A</p>", "<p>B</p>"]}
    body = client.post("/api/extract", data=data).json()
    assert [s["name"] for s in body["sources"]] == ["Pasted Canvas page 1", "Pasted Canvas page 2"]


def test_extract_requires_a_source():
    response = client.post("/api/extract", data={})
    assert response.status_code == 400


def test_extract_rejects_too_many_sources():
    response = client.post("/api/extract", data={"canvas_html": ["<p>x</p>"] * 6})
    assert response.status_code == 400
    assert "Up to 5" in response.json()["detail"]


def test_extract_rejects_bad_order():
    response = client.post("/api/extract", data={"canvas_html": ["<p>x</p>"], "order": ["file:0"]})
    assert response.status_code == 400
