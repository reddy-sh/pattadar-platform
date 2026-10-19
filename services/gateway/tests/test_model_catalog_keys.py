from src.ai_catalog import routes


def test_model_catalog_never_resolves_unrelated_task_secrets(monkeypatch):
    # A provider row names its key by env var; it must not be able to name
    # an unrelated task secret and have model sync send it to a provider.
    monkeypatch.setenv("PG_PASSWORD", "private-db-password")
    assert routes._resolve_api_key("PG_PASSWORD") == ""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    assert routes._resolve_api_key("ANTHROPIC_API_KEY") == "sk-test"
