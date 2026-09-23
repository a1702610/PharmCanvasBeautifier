from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_health_returns_ok():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_settings_defaults():
    assert settings.MAX_SOURCES == 5
    assert settings.max_file_bytes == 25 * 1024 * 1024
    assert "http://localhost:5173" in settings.allowed_origins_list
