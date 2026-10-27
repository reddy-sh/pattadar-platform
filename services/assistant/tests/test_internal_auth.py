"""/internal/metrics answers only the gateway's secret holder.

On a shared host a co-resident container can reach the assistant's port, so
the metrics route is guarded like every other route. No database: the app is
driven without its lifespan, and the metrics route reads none.
"""
from fastapi.testclient import TestClient
import pytest

from src import internal_auth
from src.main import app

# Synthetic throughout. Nothing here is, or resembles, a deployed value.
SECRET = "test-assistant-secret-not-real"


@pytest.mark.parametrize("supplied", [None, "", "wrong"])
def test_metrics_refuse_a_caller_without_the_secret(monkeypatch, supplied):
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", SECRET)
    headers = {} if supplied is None else {internal_auth.INTERNAL_PROXY_SECRET_HEADER: supplied}
    assert TestClient(app).get("/internal/metrics", headers=headers).status_code == 403


def test_metrics_answer_the_secret_holder(monkeypatch):
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", SECRET)
    response = TestClient(app).get(
        "/internal/metrics", headers={internal_auth.INTERNAL_PROXY_SECRET_HEADER: SECRET})
    assert response.status_code == 200


def test_metrics_stay_open_while_the_secret_is_unconfigured(monkeypatch):
    """The local stack sets no secret, matching every other route."""
    monkeypatch.delenv("INTERNAL_PROXY_SECRET", raising=False)
    assert TestClient(app).get("/internal/metrics").status_code == 200


def test_only_the_health_probe_is_unguarded():
    assert internal_auth._UNGUARDED_PATHS == frozenset({"/health"})
