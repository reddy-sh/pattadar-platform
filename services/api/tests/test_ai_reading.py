"""Contract tests for AI document reading (services/api/src/ai_reading).

These freeze the behaviour the four reading operations are relied on for, so a
later change to prompts, provider handling or module layout cannot quietly move
it. Nothing here calls a provider: every test substitutes the transport, which
is also the point — the provider call is reachable from exactly one place.

The invariants under test, in order of how much they cost to get wrong:

1. A paid call that may already have been charged is never re-issued.
2. An unreadable document is a failure, not a 200 with empty fields.
3. Full Aadhaar digits are accepted only as an internal candidate source; the
   API boundary emits a mask and opaque one-use candidate (covered in
   test_aadhaar_security.py).
4. The acres/cents rule reaches every prompt that extracts an extent.
5. Consent is checked before any document bytes reach the provider.
"""
import asyncio
import io
import json
import logging

import httpx
import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from src import ai_reading
from src.ai_reading import config, operations, prompts, usage
from src.ai_reading.providers import anthropic as provider


# ── helpers ───────────────────────────────────────────────────────────

def upload(data=b"%PDF-1.4 bytes", name="deed.pdf", mime="application/pdf"):
    return UploadFile(file=io.BytesIO(data), filename=name,
                      headers=Headers({"content-type": mime}))


def reply(text, *, stop="end_turn", status=200):
    """An Anthropic Messages response shaped like the real one."""
    return httpx.Response(
        status_code=status,
        json={"content": [{"type": "text", "text": text}],
              "stop_reason": stop,
              "usage": {"input_tokens": 11, "output_tokens": 7,
                        "cache_creation_input_tokens": 0,
                        "cache_read_input_tokens": 0}},
    )


def body_of(response):
    return json.loads(response.body)


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    """Every test runs as if the provider key is present but unreachable."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-used")
    # Consent is exercised explicitly in its own test; elsewhere it is open so
    # a failure points at the thing the test is actually about.
    monkeypatch.setattr(operations, "require_read_consent", _noop)
    yield


async def _noop(_request=None):
    return None


# ── 1. no automatic retry of a possibly-charged call ──────────────────

def test_read_timeout_is_never_retried_because_the_model_may_still_be_billing():
    """A ReadTimeout can mean the answer is still being generated and paid for.

    Retrying it would double-charge and re-issue an in-flight call, so it must
    surface as a failure after exactly one attempt.
    """
    attempts = []

    async def one_shot(self, *a, **k):
        attempts.append(1)
        raise httpx.ReadTimeout("still generating")

    async def run():
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(httpx.AsyncClient, "post", one_shot)
            with pytest.raises(httpx.ReadTimeout):
                await provider.post_with_retry(
                    "https://example.invalid", headers={}, json_body={}, timeout=1)
    asyncio.run(run())
    assert attempts == [1], "a read timeout was retried; that can double-charge"


def test_only_faults_with_no_response_are_retried_and_each_gets_a_fresh_connection():
    """A dropped TLS/TCP connection never reached the model, so it is safe."""
    clients, attempts = [], []

    async def flaky(self, *a, **k):
        clients.append(id(self))
        attempts.append(1)
        if len(attempts) < 3:
            raise httpx.ConnectError("connection reset")
        return reply('{"ok": 1}')

    async def run():
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(httpx.AsyncClient, "post", flaky)
            mp.setattr(asyncio, "sleep", _noop)
            r = await provider.post_with_retry(
                "https://example.invalid", headers={}, json_body={}, timeout=1)
            assert r.status_code == 200
    asyncio.run(run())
    assert len(attempts) == 3
    assert len(set(clients)) == 3, "a retry reused a possibly-corrupted connection"


def test_transient_errors_exclude_read_and_pool_timeouts():
    assert httpx.ReadTimeout not in provider.TRANSIENT_CONNECTION_ERRORS
    assert httpx.PoolTimeout not in provider.TRANSIENT_CONNECTION_ERRORS
    assert httpx.ConnectError in provider.TRANSIENT_CONNECTION_ERRORS


# ── 2. an unreadable document fails loudly ────────────────────────────

def test_unreadable_document_is_an_error_not_an_empty_success(monkeypatch):
    """A 200 with {"fields": {}} reads to the user as 'the button did nothing'."""
    async def blank(*a, **k):
        return reply("I could not read this.")

    monkeypatch.setattr(provider, "post_with_retry", blank)
    out = asyncio.run(provider.vision_extract(
        b"\x89PNG\r\n\x1a\n" + b"0" * 64, "image/png", "scan.png",
        "SYSTEM", "extract"))
    assert "_error" in out
    status, message = out["_error"]
    assert status == 502
    assert "fields" not in out
    assert message, "a failure must carry a sentence the owner can act on"


def test_running_out_of_room_retries_once_at_lower_effort_then_reports_it(monkeypatch):
    """Hitting the ceiling is a budget problem, so one cheaper attempt is made.

    That retry is safe because the first call completed and returned a usable
    response; it is not an in-flight generation.
    """
    efforts = []

    async def truncated(url, *, headers, json_body, timeout):
        efforts.append(json_body["output_config"]["effort"])
        return reply("{partial", stop="max_tokens")

    monkeypatch.setattr(provider, "post_with_retry", truncated)
    out = asyncio.run(provider.vision_extract(
        b"%PDF-1.4", "application/pdf", "deed.pdf", "SYSTEM", "extract"))
    assert efforts == ["medium", "low"], "the low-effort retry policy changed"
    assert out["_error"][0] == 502
    assert "ran out of room" in out["_error"][1]


def test_bytes_decide_the_media_type_not_the_client_label(monkeypatch):
    """Pickers hand over a PNG named .jpg; forwarding the label earns a 400."""
    seen = {}

    async def capture(url, *, headers, json_body, timeout):
        seen["media"] = json_body["messages"][0]["content"][0]["source"]["media_type"]
        return reply('{"kind": "land"}')

    monkeypatch.setattr(provider, "post_with_retry", capture)
    out = asyncio.run(provider.vision_extract(
        b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/jpeg", "photo.jpg",
        "SYSTEM", "extract"))
    assert seen["media"] == "image/png"
    assert out["fields"] == {"kind": "land"}


def test_oversize_and_unsupported_uploads_are_refused_before_any_provider_call(monkeypatch):
    async def explode(*a, **k):
        raise AssertionError("provider must not be called")

    monkeypatch.setattr(provider, "post_with_retry", explode)
    too_big = asyncio.run(provider.vision_extract(
        b"0" * (9 * 1024 * 1024), "application/pdf", "big.pdf", "S", "u", max_mb=8))
    assert too_big["_error"][0] == 413
    wrong_kind = asyncio.run(provider.vision_extract(
        b"MZ\x90\x00", "application/x-msdownload", "thing.exe", "S", "u"))
    assert wrong_kind["_error"][0] == 400


def test_a_missing_provider_key_is_reported_as_unconfigured(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    out = asyncio.run(provider.vision_extract(
        b"%PDF-1.4", "application/pdf", "d.pdf", "S", "u"))
    assert out["_error"][0] == 503


def test_json_is_recovered_from_fenced_or_chatty_model_output():
    assert provider.extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert provider.extract_json('Sure! {"a": 1} hope that helps') == {"a": 1}
    assert provider.extract_json("no object here") == {}
    assert provider.extract_json("") == {}


# ── 3. Aadhaar numbers never leave an extraction in full ──────────────

def test_aadhaar_prompt_limits_transient_digits_to_the_secure_candidate_source():
    # The provider may transiently read all 12 digits so the API can encrypt
    # them. test_aadhaar_security.py proves those digits/raw text never cross
    # the API boundary or enter a durable job result.
    assert '"aadhaar":"<12-digit Aadhaar number, digits only>"' in prompts.AADHAAR_SYSTEM
    assert "never invent or guess digits" in prompts.AADHAAR_SYSTEM
    assert "Output MUST be valid JSON and nothing else" in prompts.AADHAAR_SYSTEM
    # The deed reader can also meet an Aadhaar card, and that path stores its
    # output unencrypted, so masking remains mandatory there.
    assert "NEVER write the full Aadhaar or PAN number" in prompts.DEED_SYSTEM
    assert "XXXX XXXX 8203" in prompts.DEED_SYSTEM


# ── 4. the acres/cents rule reaches every extent-bearing prompt ───────

def test_every_prompt_that_reads_an_extent_carries_the_acres_cents_rule():
    """Stating it in one prompt and not another once cost a real owner 24.75 acres."""
    for name in ("PASSBOOK_SYSTEM", "DEED_SYSTEM", "PROPERTY_SYSTEM"):
        text = getattr(prompts, name)
        assert prompts.EXTENT_NOTATION_RULE in text, f"{name} lost the extent rule"


def test_prompts_are_present_and_only_defined_once():
    named = ("EXTENT_NOTATION_RULE", "PASSBOOK_SYSTEM", "AADHAAR_SYSTEM",
             "PARCEL_PHOTO_SYSTEM", "DEED_SYSTEM", "PROPERTY_SYSTEM")
    for name in named:
        assert getattr(prompts, name).strip(), f"{name} is empty"
    # Prompt caching keys on exact bytes, so a prompt must not be rebuilt
    # per request; these are module constants and stay that way.
    assert prompts.DEED_SYSTEM is prompts.DEED_SYSTEM


# ── 5. consent precedes the provider ──────────────────────────────────

def test_each_reading_operation_checks_consent_before_reading_the_document():
    calls = []

    async def refuse(_request=None):
        calls.append("checked")
        raise PermissionError("consent withdrawn")

    async def explode(*a, **k):
        raise AssertionError("document reached the provider despite refusal")

    async def run():
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(operations, "require_read_consent", refuse)
            mp.setattr(operations, "vision_extract", explode)
            mp.setattr(operations, "send_messages", explode)
            for op in (operations.import_passbook,
                       operations.import_registered_document,
                       operations.extract_property,
                       operations.extract_aadhaar):
                with pytest.raises(PermissionError):
                    await op(file=upload(), request=object())
    asyncio.run(run())
    assert len(calls) == 4


# ── cost accounting ───────────────────────────────────────────────────

def test_an_unpriced_model_reports_zero_rather_than_the_last_models_price():
    assert usage.usd_per_mtok("some-future-model") == {
        "input": 0.0, "output": 0.0, "cache_write": 0.0, "cache_read": 0.0}


def test_cache_rates_are_derived_from_the_input_price():
    rate = usage.usd_per_mtok(config.IMPORT_MODEL)
    base = usage.LIST_PRICE_PER_MTOK[config.IMPORT_MODEL]["input"]
    assert rate["cache_write"] == pytest.approx(base * 1.25)
    assert rate["cache_read"] == pytest.approx(base * 0.1)


def test_usage_line_reports_every_token_class_and_a_cost(caplog):
    body = {"usage": {"input_tokens": 100, "output_tokens": 50,
                      "cache_creation_input_tokens": 20,
                      "cache_read_input_tokens": 30},
            "stop_reason": "end_turn"}
    with caplog.at_level(logging.INFO, logger="pattadar"):
        usage.log_usage(body, endpoint="import-passbook", name="p.pdf")
    line = "\n".join(caplog.messages)
    assert "ai.usage" in line
    assert "prompt_total=150" in line          # fresh + cache_write + cache_read
    assert "fresh=100 cache_write=20 cache_read=30" in line
    assert "output=50" in line
    assert "usd=" in line


def test_the_system_prompt_is_sent_as_one_cache_marked_block():
    blocks = usage.cacheable_system("some rules")
    assert blocks == [{"type": "text", "text": "some rules",
                       "cache_control": {"type": "ephemeral"}}]


# ── module boundary ───────────────────────────────────────────────────

def test_durable_job_handlers_match_the_public_async_operations():
    """Queued rows carry these names; renaming one orphans work in flight."""
    assert set(ai_reading.JOB_HANDLERS) == {
        "import-registered-document", "import-passbook",
        "extract-property", "extract-aadhaar"}


def test_the_reading_routes_are_exactly_the_paths_clients_already_call():
    paths = {r.path for r in ai_reading.router.routes}
    assert paths == {"/import-passbook", "/import-registered-document",
                     "/extract-property", "/extract-aadhaar",
                     "/classify-parcel-photo"}
    for route in ai_reading.router.routes:
        assert route.methods == {"POST"}


def test_only_the_adapter_talks_to_the_provider():
    """Keeps the single-call-site property this module was created to give."""
    import pathlib
    pkg = pathlib.Path(operations.__file__).parent
    offenders = []
    for path in pkg.rglob("*.py"):
        if path.name == "anthropic.py":
            continue
        if "api.anthropic.com" in path.read_text(encoding="utf-8"):
            offenders.append(path.name)
    assert not offenders, f"provider URL escaped the adapter: {offenders}"
