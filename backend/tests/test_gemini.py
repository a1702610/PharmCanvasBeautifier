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


def run(models, images=(), sleeps=None):
    client = SimpleNamespace(aio=SimpleNamespace(models=models))
    recorded = sleeps if sleeps is not None else []

    async def fake_sleep(seconds):
        recorded.append(seconds)

    return asyncio.run(gemini.generate_structured(
        api_key="k", system_prompt="sys", prompt="p", images=list(images),
        schema=Small, client_factory=lambda key: client, sleep=fake_sleep,
    ))


BUSY = "503 UNAVAILABLE. This model is currently experiencing high demand."


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
    assert err.value.__cause__ is not None


def test_fails_after_two_generic_errors_keeps_cause():
    second = ApiError(500, "boom")
    with pytest.raises(gemini.GeminiError) as err:
        run(FakeModels([ApiError(500, "boom"), second]))
    assert err.value.status_code == 502
    assert err.value.__cause__ is second


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


def test_busy_model_is_retried_with_backoff():
    models = FakeModels([ApiError(503, BUSY), ApiError(503, BUSY), '{"title": "Pain"}'])
    sleeps = []
    assert run(models, sleeps=sleeps).title == "Pain"
    assert len(models.calls) == 3
    assert sleeps == list(gemini.BUSY_DELAYS[:2])


def test_busy_model_gives_busy_message_when_retries_run_out():
    models = FakeModels([ApiError(503, BUSY)] * (len(gemini.BUSY_DELAYS) + 1))
    sleeps = []
    with pytest.raises(gemini.GeminiError) as err:
        run(models, sleeps=sleeps)
    assert err.value.status_code == 503
    assert err.value.message == gemini.BUSY_MESSAGE
    assert len(models.calls) == len(gemini.BUSY_DELAYS) + 1
    assert sleeps == list(gemini.BUSY_DELAYS)


def test_busy_retries_do_not_use_up_invalid_json_attempts():
    models = FakeModels([ApiError(503, BUSY), "{oops", '{"title": "Pain"}'])
    assert run(models).title == "Pain"
    assert len(models.calls) == 3


def test_automatic_function_calling_is_disabled():
    models = FakeModels(['{"title": "Pain"}'])
    run(models)
    assert models.calls[0]["config"].automatic_function_calling.disable is True


def test_images_are_labelled_parts():
    models = FakeModels(['{"title": "Pain"}'])
    run(models, images=[gemini.ImagePart(label="Image IMG-01 (slide 2):", data=b"jpeg")])
    parts = models.calls[0]["contents"][0].parts
    assert parts[0].text == "p"
    assert parts[1].text == "Image IMG-01 (slide 2):"
    assert parts[2].inline_data.mime_type == "image/jpeg"
