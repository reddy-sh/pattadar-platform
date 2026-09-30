"""Invariant 4 — "CRON_SECRET is always set; the inactivity-check endpoint is
open without it" — is enforced in three places and, before this file, asserted
in none of them.

  * src/main.py lifespan: refuses to boot when APP_PUBLIC_URL/CRON_SECRET are
    unset, unless ALLOW_INSECURE_LOCAL=1 says this is somebody's laptop.
  * src/main.py /cron/inactivity-check: fails closed on its own, because the
    bypass above means startup cannot be trusted to have run that check.
  * scripts/deploy-release.py definition(): refuses to build an api task
    definition that does not carry both names.

No database. Every refusal returns before `pool.connection()`, and the two
paths that do get past the checks run against a pool stub that records what was
asked of it. Every environment change goes through monkeypatch, so nothing
leaks into a neighbouring test.
"""
import asyncio
from contextlib import asynccontextmanager
import importlib.util
import json
from pathlib import Path
import sys
import types

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import main

# Synthetic throughout. Nothing here is, or resembles, a deployed value.
SECRET = "test-cron-secret-not-a-real-value"
PUBLIC_URL = "https://pattadar.invalid"
GUARDED = ("APP_PUBLIC_URL", "CRON_SECRET", "ALLOW_INSECURE_LOCAL")

# The release gate lives in a script, not a package; load it the way
# scripts/tests does.
_spec = importlib.util.spec_from_file_location(
    "deploy_release", Path(__file__).resolve().parents[3] / "scripts/deploy-release.py")
release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release)


class StubPool:
    """Stands in for the psycopg pool. It counts, so a test can assert that a
    refused caller never reached the database at all."""

    def __init__(self):
        self.opened = self.closed = self.connections = 0
        self.initialised = False
        self.checks = []          # safeguard passes the stubbed runner started

    async def open(self, wait=False, timeout=30.0):
        self.opened += 1

    async def close(self):
        self.closed += 1

    @asynccontextmanager
    async def connection(self):
        self.connections += 1
        yield object()


@pytest.fixture
def cron_endpoint(monkeypatch):
    """The endpoint with its database work replaced. Yields the stub pool, so a
    test can see whether the safeguard pass was actually started."""
    pool = StubPool()
    monkeypatch.setattr(main, "pool", pool)

    async def run_check(conn, now, only_owner=""):
        pool.checks.append(now)
        return {"stage": "none"}

    monkeypatch.setattr(main, "_run_inactivity_check", run_check)
    monkeypatch.delenv("CRON_SECRET", raising=False)
    return pool


def post(secret_header=None):
    """Call the endpoint. It reads one header off the request and nothing else."""
    headers = {} if secret_header is None else {"x-cron-secret": secret_header}
    return asyncio.run(main.cron_inactivity_check(types.SimpleNamespace(headers=headers)))


def refusal(answer):
    return answer.status_code, json.loads(answer.body)["error"]


# ── The endpoint fails closed ─────────────────────────────────────────

def test_the_inactivity_endpoint_refuses_every_caller_when_no_cron_secret_is_set(
        cron_endpoint, monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    for supplied in (None, "", SECRET, "anything at all"):
        assert refusal(post(supplied)) == (503, "cron not configured")
    # Refused instead of run: no connection taken, no safeguard stage advanced.
    assert cron_endpoint.connections == 0 and cron_endpoint.checks == []


def test_an_empty_cron_secret_is_unset_rather_than_a_secret_everyone_knows(
        cron_endpoint, monkeypatch):
    """The case the invariant exists for. hmac.compare_digest("", "") is true,
    so without the emptiness check running first, a blank CRON_SECRET would
    authorise a caller who sends no secret at all."""
    monkeypatch.setenv("CRON_SECRET", "")
    assert refusal(post("")) == (503, "cron not configured")
    assert refusal(post(None)) == (503, "cron not configured")
    assert cron_endpoint.connections == 0 and cron_endpoint.checks == []


def test_a_whitespace_only_cron_secret_is_unset_too(cron_endpoint, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "   ")
    # Including for the caller who sends back exactly what was configured.
    assert refusal(post("   ")) == (503, "cron not configured")
    assert refusal(post("")) == (503, "cron not configured")
    assert cron_endpoint.connections == 0


def test_the_inactivity_endpoint_rejects_a_caller_whose_secret_does_not_match(
        cron_endpoint, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", SECRET)
    for supplied in (None, "", "wrong-secret", SECRET[:-1], SECRET + "x",
                     SECRET.upper(), SECRET + " ", " " + SECRET):
        assert refusal(post(supplied)) == (403, "forbidden")
    assert cron_endpoint.connections == 0 and cron_endpoint.checks == []


def test_the_inactivity_endpoint_accepts_the_configured_secret_and_runs_one_pass(
        cron_endpoint, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", SECRET)
    assert post(SECRET) == {"ok": True, "summary": {"stage": "none"}}
    assert cron_endpoint.connections == 1 and len(cron_endpoint.checks) == 1
    # A daily pass that is not told "now" cannot decide what is due.
    assert cron_endpoint.checks[0].tzinfo is not None


def test_the_configured_secret_is_compared_stripped_but_the_caller_header_is_not(
        cron_endpoint, monkeypatch):
    """Documents the real comparison: os.getenv(...).strip() on the configured
    value against the raw header. A deployment that pads the variable still
    works; a caller that pads its header does not."""
    monkeypatch.setenv("CRON_SECRET", f"  {SECRET}\n")
    assert post(SECRET) == {"ok": True, "summary": {"stage": "none"}}
    assert refusal(post(f"  {SECRET}\n")) == (403, "forbidden")


def test_the_guarded_handler_is_what_actually_serves_the_cron_path():
    """A guard on a function nothing routes to would protect nothing."""
    routes = [r for r in main.app.routes
              if getattr(r, "path", "") == "/cron/inactivity-check"]
    assert len(routes) == 1
    assert routes[0].methods == {"POST"}
    assert routes[0].endpoint is main.cron_inactivity_check


# ── Startup refuses to boot unconfigured ──────────────────────────────

@pytest.fixture
def startup(monkeypatch):
    """lifespan with everything after the environment guard stubbed out, so a
    permitted boot needs neither a database nor background workers."""
    pool = StubPool()
    monkeypatch.setattr(main, "pool", pool)

    async def init_db():
        pool.initialised = True

    @asynccontextmanager
    async def worker(*args, **kwargs):
        yield

    monkeypatch.setattr(main, "init_db", init_db)
    monkeypatch.setattr(main.reading_jobs, "lifecycle", worker)
    monkeypatch.setattr(main.payments, "lifecycle", worker)
    monkeypatch.setattr(main.audit, "lifecycle", worker)
    for name in GUARDED:
        monkeypatch.delenv(name, raising=False)
    return pool


def boot():
    """Take the app through startup and shutdown the way uvicorn would."""
    async def run():
        async with main.lifespan(main.app):
            return True
    return asyncio.run(run())


def test_startup_refuses_to_boot_when_the_cron_secret_is_not_set(startup, monkeypatch):
    monkeypatch.setenv("APP_PUBLIC_URL", PUBLIC_URL)
    with pytest.raises(RuntimeError) as raised:
        boot()
    message = str(raised.value)
    assert "required env not set: CRON_SECRET." in message
    # The refusal has to say why, or the next operator simply unsets it again.
    assert "the endpoint is open to anyone without it" in message
    # Refused before anything was touched: no pool, no schema, no workers.
    assert startup.opened == 0 and startup.initialised is False


@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
def test_startup_treats_a_blank_cron_secret_as_not_set(startup, monkeypatch, blank):
    monkeypatch.setenv("APP_PUBLIC_URL", PUBLIC_URL)
    monkeypatch.setenv("CRON_SECRET", blank)
    with pytest.raises(RuntimeError) as raised:
        boot()
    assert "required env not set: CRON_SECRET." in str(raised.value)
    assert startup.opened == 0


def test_startup_names_every_missing_variable_at_once(startup):
    with pytest.raises(RuntimeError) as raised:
        boot()
    assert "required env not set: APP_PUBLIC_URL, CRON_SECRET." in str(raised.value)
    assert startup.opened == 0


def test_startup_proceeds_once_the_cron_secret_is_set(startup, monkeypatch):
    monkeypatch.setenv("APP_PUBLIC_URL", PUBLIC_URL)
    monkeypatch.setenv("CRON_SECRET", SECRET)
    assert boot() is True
    assert startup.opened == 1 and startup.closed == 1 and startup.initialised is True


def test_startup_is_permitted_without_the_secret_when_allow_insecure_local_is_1(
        startup, monkeypatch):
    """The laptop escape hatch, and the reason the endpoint carries its own
    check rather than trusting that startup made one."""
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "1")
    assert boot() is True
    assert startup.opened == 1 and startup.closed == 1


@pytest.mark.parametrize("value", ["", "0", "true", "yes", "on", "1 ", " 1"])
def test_only_the_exact_allow_insecure_local_value_1_bypasses_the_guard(
        startup, monkeypatch, value):
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", value)
    with pytest.raises(RuntimeError) as raised:
        boot()
    assert "required env not set: APP_PUBLIC_URL, CRON_SECRET." in str(raised.value)
    assert startup.opened == 0


# ── A release cannot ship an api task without the secret ──────────────

IMAGE = "registry/api@sha256:" + "b" * 64
URL_ONLY = (("APP_PUBLIC_URL", PUBLIC_URL),)
SECRET_ONLY = (("CRON_SECRET", SECRET),)


def api_task(environment=(), secrets=None):
    """The shape definition() reads: an ECS api task and its one container."""
    container = {"name": "api", "image": "registry/api:previous",
                 "environment": [{"name": key, "value": value} for key, value in environment]}
    if secrets is not None:
        container["secrets"] = secrets
    return {"family": "api", "taskDefinitionArn": "old-api", "networkMode": "awsvpc",
            "containerDefinitions": [container]}


@pytest.mark.parametrize("environment", [(), URL_ONLY, SECRET_ONLY])
def test_a_release_is_blocked_when_the_api_task_does_not_carry_both_variables(environment):
    with pytest.raises(ValueError) as raised:
        release.definition(api_task(environment), "api", IMAGE)
    # The api branch specifically. The assistant branch raises "Apply durable
    # assistant bucket/IAM infrastructure before release", which is a different
    # gate and is asserted elsewhere.
    assert str(raised.value) == "Apply required API runtime configuration before release"


def test_a_release_proceeds_when_both_variables_are_on_the_api_task():
    planned = release.definition(api_task(URL_ONLY + SECRET_ONLY), "api", IMAGE)
    container = planned["containerDefinitions"][0]
    assert container["image"] == IMAGE
    assert {item["name"] for item in container["environment"]} == {
        "APP_PUBLIC_URL", "CRON_SECRET"}


def test_the_cron_secret_may_be_an_ecs_secret_reference_rather_than_a_plain_variable():
    """The deployed value belongs in SSM/Secrets Manager, so the gate counts
    `secrets` names as well as `environment` names."""
    reference = [{"name": "CRON_SECRET",
                  "valueFrom": "arn:aws:ssm:ap-south-1:000000000000:parameter/synthetic"}]
    planned = release.definition(api_task(URL_ONLY, secrets=reference), "api", IMAGE)
    container = planned["containerDefinitions"][0]
    assert [item["name"] for item in container["secrets"]] == ["CRON_SECRET"]
    assert {item["name"] for item in container["environment"]} == {"APP_PUBLIC_URL"}


def test_the_release_gate_checks_that_the_names_exist_and_not_that_they_have_values(
        cron_endpoint, monkeypatch):
    """Real behaviour, deliberately recorded rather than asserted as desired:
    CRON_SECRET="" satisfies the release gate, which is a name-presence check.
    The endpoint does not open as a result — the container refuses to boot, and
    if it were forced up with ALLOW_INSECURE_LOCAL the endpoint still answers
    503 — but an empty value is caught at boot, not at release time."""
    accepted = release.definition(api_task(URL_ONLY + (("CRON_SECRET", ""),)), "api", IMAGE)
    assert {item["name"] for item in accepted["containerDefinitions"][0]["environment"]} == {
        "APP_PUBLIC_URL", "CRON_SECRET"}
    # The layer that does catch it.
    monkeypatch.setenv("CRON_SECRET", "")
    assert refusal(post(SECRET)) == (503, "cron not configured")
