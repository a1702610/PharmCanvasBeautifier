import asyncio
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from app.ai import gemini


class Small(BaseModel):
    title: str


class FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome)


class ApiError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def run(models, images=()):
    client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return asyncio.run(gemini.generate_structured(
        api_key="k", system_prompt="sys", prompt="p", images=list(images),
        schema=Small, client_factory=lambda key: client,
    ))


def test_success_first_try():
    models = FakeModels(['{"title": "Pain"}'])
    assert run(models) == Small(title="Pain")
    assert len(models.calls) == 1
    assert models.calls[0]["config"].response_schema is Small


def test_retries_once_on_invalid_json():
    models = FakeModels(["{oops", '{"title": "Pain"}'])
    assert run(models).title == "Pain"
    assert len(models.calls) == 2


def test_fails_after_two_invalid_responses():
    with pytest.raises(gemini.GeminiError) as err:
        run(FakeModels(["{oops", '{"wrong": 1}']))
    assert err.value.status_code == 502
    assert err.value.message == gemini.FAILED_MESSAGE


def test_invalid_key_is_not_retried():
    models = FakeModels([ApiError(400, "API key not valid. Please pass a valid API key.")])
    with pytest.raises(gemini.GeminiError) as err:
        run(models)
    assert err.value.status_code == 401
    assert len(models.calls) == 1


def test_rate_limit_maps_to_429():
    with pytest.raises(gemini.GeminiError) as err:
        run(FakeModels([ApiError(429, "RESOURCE_EXHAUSTED")]))
    assert err.value.status_code == 429
    assert err.value.message == gemini.RATE_MESSAGE


def test_images_are_labelled_parts():
    models = FakeModels(['{"title": "Pain"}'])
    run(models, images=[gemini.ImagePart(label="Image IMG-01 (slide 2):", data=b"jpeg")])
    parts = models.calls[0]["contents"][0].parts
    assert parts[0].text == "p"
    assert parts[1].text == "Image IMG-01 (slide 2):"
    assert parts[2].inline_data.mime_type == "image/jpeg"
