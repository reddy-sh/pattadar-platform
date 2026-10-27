# python:3.13-slim pinned by its multi-arch index digest; Dependabot's docker
# updater moves the digest.
FROM python:3.13-slim@sha256:81c118faaca296a46b46a7dd7f3bf7575a956d8a4af22623b3de2ff504a3e89b AS base

# Builds the venv; only /opt/venv crosses into the runtime image.
FROM base AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
# No pip inside the venv: the base image's pip installs into it from outside.
RUN python -m venv --without-pip /opt/venv
COPY requirements.txt /tmp/
RUN pip --python /opt/venv/bin/python install -r /tmp/requirements.txt \
 && pip --python /opt/venv/bin/python check
# botocore ships ~27 MB of models for ~440 AWS services. Keep only the clients
# this code creates: kms (src/aadhaar.py), s3 and cognito-idp
# (scripts/erase_account.py, scripts/clear_aadhaar.py, run in this image by
# ECS run-task), plus sts, sso, sso-oidc and signin, which botocore's own
# credential providers create (assume-role/web identity, SSO, aws login). The
# build fails when the code creates a client that is not kept, and every kept
# client must load offline.
# shortcut: the scan sees only literal client("name")/resource("name") calls; a computed service name fails at runtime instead, so add it here by hand.
ARG BOTOCORE_KEEP="cognito-idp kms s3 signin sso sso-oidc sts"
COPY src /tmp/scan/src
COPY scripts /tmp/scan/scripts
RUN --network=none /opt/venv/bin/python - <<'PY'
import os, pathlib, re, shutil, sys
import boto3, botocore
keep = set(os.environ["BOTOCORE_KEEP"].split())
call = re.compile(r"""\.(?:client|resource)\(\s*["']([a-z0-9-]+)["']""")
used = {m for p in pathlib.Path("/tmp/scan").rglob("*.py") for m in call.findall(p.read_text())}
if used - keep:
    sys.exit(f"Add {sorted(used - keep)} to BOTOCORE_KEEP in services/api/Dockerfile")
data = pathlib.Path(botocore.__file__).parent / "data"
for d in data.iterdir():
    if d.is_dir() and d.name not in keep:
        shutil.rmtree(d)
for name in sorted(keep):
    client = boto3.client(name, region_name="ap-south-1",
                          aws_access_key_id="offline", aws_secret_access_key="offline")
    assert client.meta.service_model.operation_names, name
print("botocore models kept:", sorted(d.name for d in data.iterdir() if d.is_dir()))
PY

FROM base AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/opt/venv/bin:$PATH
# Runs as a non-root user: a bug in anything it parses should not land as uid 0.
# The base image's pip goes too: no pip in the venv or on PATH (stdlib
# ensurepip remains in the base layer, and removing pip saves no bytes there).
RUN useradd --system --create-home --uid 10001 app \
 && rm -rf /usr/local/bin/pip* /usr/local/lib/python3.13/site-packages/pip /usr/local/lib/python3.13/site-packages/pip-*.dist-info
WORKDIR /app
# No --chown: code stays root-owned and read-only to uid 10001, as before.
COPY --from=builder /opt/venv /opt/venv
COPY data data
COPY scripts scripts
COPY src src
USER app

# --workers > 1 only helps for sync resolvers — async resolvers with a single
# connection pool benefit more from staying single-process (the pool is
# per-process). Default to 1; override at runtime via UVICORN_WORKERS env if
# an app's resolvers are sync-bound. UI-driven GraphQL pages routinely fire
# 5–10 parallel queries, so even brief sync DB calls block the event loop
# and the gateway's 30s timeout starts tripping the circuit breaker —
# generated apps MUST use async resolvers + AsyncConnectionPool (see prompt).
# src.private_ingress wraps src.main:app and refuses any caller without the
# gateway's secret (it will not start without one). The keep-alive default is
# uvicorn's own; the task raises it above the edge's idle timeout.
CMD ["sh", "-c", "exec uvicorn src.private_ingress:app --host 0.0.0.0 --port 8080 --workers ${UVICORN_WORKERS:-1} --timeout-keep-alive ${UVICORN_TIMEOUT_KEEP_ALIVE:-5}"]

# `docker build --target test services/api`: the runtime image plus
# requirements-dev.txt only, running the suite with no network, so a green
# build proves the runtime set is enough. Database tests skip without a server.
FROM runtime AS test
USER root
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt requirements-dev.txt ./
RUN python -m ensurepip >/dev/null \
 && python -m pip install -r requirements-dev.txt \
 && python -m pip check
COPY tests tests
USER app
# The three left out read repo files outside this build context (scripts/,
# apps/web, tests/e2e-app); CI runs them from the checkout.
RUN --network=none ALLOW_INSECURE_LOCAL=1 python -m pytest tests -q -p no:cacheprovider \
      --ignore=tests/test_cron_secret.py --ignore=tests/test_group_facts.py \
      --deselect=tests/test_catalogue.py::test_the_e2e_catalogue_snapshot_equals_the_server_catalogue

# deploy.yml builds the last stage with no --target: keep it the runtime image.
FROM runtime
