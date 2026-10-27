# python:3.13-slim (3.13.18, trixie) multi-arch index, pinned so a rebuild is
# the same base; Dependabot's docker ecosystem bumps the digest.
FROM python:3.13-slim@sha256:81c118faaca296a46b46a7dd7f3bf7575a956d8a4af22623b3de2ff504a3e89b AS base

FROM base AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt /tmp/requirements.txt
# Wheels only: no setup.py ever runs, and nothing needs a compiler.
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --only-binary=:all: -r /tmp/requirements.txt \
 && /opt/venv/bin/pip check
# botocore/boto3 ship API data for ~440 AWS services (~28 MB). Keep only the
# services src builds clients for (literal names, or the build fails) plus sts
# for the credential chain, then build every kept client and a presign offline.
# getattr(boto3, ...) or `from boto3 import` would hide a client, so they fail too.
RUN --mount=type=bind,source=src,target=/tmp/src \
    AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=x AWS_EC2_METADATA_DISABLED=true \
    /opt/venv/bin/python -c "\
import pathlib, re, shutil, boto3, botocore; \
code = ' '.join(p.read_text() for p in pathlib.Path('/tmp/src').rglob('*.py')); \
P = r'\.(?:create_)?(?:client|resource)\(\s*(?:service_name\s*=\s*)?([^,)\s]+)'; \
assert re.findall(P, 'b.create_client(\"kms\") s.resource(service_name=\"sqs\")') == ['\"kms\"', '\"sqs\"']; \
assert not re.search(r'getattr\(\s*boto|from\s+boto3\s+import', code), 'name every boto3 client literally'; \
args = re.findall(P, code); \
assert args and all(re.fullmatch(r'[\"\x27][a-z0-9-]+[\"\x27]', a) for a in args), args; \
keep = {a.strip('\"\x27') for a in args} | {'sts'}; \
roots = [pathlib.Path(m.__file__).parent / 'data' for m in (botocore, boto3)]; \
assert keep <= {d.name for d in roots[0].iterdir()}, keep; \
[shutil.rmtree(d) for r in roots for d in r.iterdir() if d.is_dir() and d.name not in keep]; \
[boto3.client(s, region_name='ap-south-1') for s in keep]; \
boto3.client('s3', region_name='ap-south-1').generate_presigned_url('get_object', Params={'Bucket': 'b', 'Key': 'k'}); \
print('botocore data kept:', sorted(keep))" \
 && /opt/venv/bin/pip uninstall -y -q pip
# Wheels ship Cython/C sources that never run (~8 MB, mostly psycopg_binary's
# generated C). Delete them; RECORD hashes stop matching, and nothing checks them.
RUN find /opt/venv/lib -type f \( -name '*.c' -o -name '*.pyx' -o -name '*.pxd' -o -name '*.pxi' \) -delete

FROM base AS runtime
ENV PATH=/opt/venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Runs as a non-root user: this container parses untrusted input (JWTs, HEIC
# and JPEG uploads, multipart bodies) at the internet-facing boundary, so a
# parser bug should not land as uid 0. The base image's pip goes too (attack
# surface only: its bytes stay in the base layer).
RUN python -m pip uninstall -y -q --root-user-action=ignore pip \
 && useradd --system --create-home --uid 10001 app
WORKDIR /app
# No --chown on purpose: venv and code stay root-owned, so uid 10001 can read
# but never rewrite what it runs (as before). src/database.py reads sql/init.sql.
COPY --from=builder /opt/venv /opt/venv
COPY src ./src
COPY sql ./sql
USER app
EXPOSE 8080
# Single worker by default — the psycopg pool is per-process. Override via
# UVICORN_WORKERS if needed.
# The keep-alive default is uvicorn's own; the task raises it above the edge's
# idle timeout so a reused connection is never closed under a request.
# No websockets package (no websocket route): an Upgrade request is now served as
# plain HTTP (200 + two uvicorn WARNINGs) instead of a 403; 3 log lines either way.
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port 8080 --workers ${UVICORN_WORKERS:-1} --timeout-keep-alive ${UVICORN_TIMEOUT_KEEP_ALIVE:-5}"]

# `docker build --target test`: pytest on top of the shipped venv runs the
# DB-free suite with no network, proving the runtime set is sufficient.
FROM runtime AS test
USER root
COPY requirements-dev.txt /tmp/requirements-dev.txt
RUN python -m ensurepip > /dev/null \
 && python -m pip install -q --no-cache-dir --only-binary=:all: -r /tmp/requirements-dev.txt
COPY tests ./tests
COPY scripts ./scripts
USER app
RUN --network=none python -m pytest tests -q -p no:cacheprovider --ignore=tests/test_aadhaar_card_storage.py

# Last stage = default target: deploy.yml builds without --target and must
# ship the runtime image, never the test stage.
FROM runtime
