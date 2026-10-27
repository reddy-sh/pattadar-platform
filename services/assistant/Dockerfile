# Builder: resolves the runtime venv; nothing from this stage ships except /opt/venv.
FROM python:3.13-slim@sha256:81c118faaca296a46b46a7dd7f3bf7575a956d8a4af22623b3de2ff504a3e89b AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt requirements-semantic.txt ./
ARG INSTALL_SEMANTIC=0
# --without-pip: the shipped venv carries no installer; the builder's own pip writes into it.
RUN python -m venv --without-pip /opt/venv \
    && pip --python /opt/venv/bin/python install -r requirements.txt \
    && if [ "$INSTALL_SEMANTIC" = "1" ]; then pip --python /opt/venv/bin/python install -r requirements-semantic.txt; fi
# botocore ships ~27 MB of models for ~400 services; src only builds boto3.client('s3') (attachment_store.py).
# Kept besides s3: the models botocore's credential chain calls (sts: assume-role/web-identity; sso, sso-oidc,
# signin: SSO/login profiles, ~76 KB). The self-check builds every kept client offline and fails the build if one is gone.
RUN find /opt/venv/lib/python3.13/site-packages/botocore/data -mindepth 1 -maxdepth 1 -type d \
        ! -name s3 ! -name sts ! -name sso ! -name sso-oidc ! -name signin -exec rm -rf {} + \
    && AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=x AWS_EC2_METADATA_DISABLED=true /opt/venv/bin/python -c "import boto3; [boto3.client(n, region_name='ap-south-1') for n in ('s3', 'sts', 'sso', 'sso-oidc', 'signin')]; assert boto3.client('s3', region_name='ap-south-1').generate_presigned_url('get_object', Params={'Bucket': 'b', 'Key': 'k'}).startswith('https://')"

FROM python:3.13-slim@sha256:81c118faaca296a46b46a7dd7f3bf7575a956d8a4af22623b3de2ff504a3e89b AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/opt/venv/bin:$PATH
# Runs as a non-root user: a bug in anything it parses should not land as uid 0.
# --create-home: the bundled Claude CLI writes its session files under $HOME.
# The base image's pip and ensurepip (its bundled pip wheel) are deleted: nothing at runtime installs packages, and
# scanners stop flagging them. Not a sandbox (code can still fetch over the network); the bytes stay in the base layer.
RUN useradd --system --create-home --uid 10001 app \
    && rm -rf /usr/local/bin/pip* /usr/local/lib/python3.13/site-packages/pip /usr/local/lib/python3.13/site-packages/pip-*.dist-info \
        /usr/local/lib/python3.13/ensurepip
WORKDIR /app
# Deliberately no --chown=app: COPY's root:root default lets uid 10001 read and run the venv and code, never rewrite them.
COPY --from=builder /opt/venv /opt/venv
COPY src ./src
EXPOSE 8080
USER app
# Single process keeps prompt/model/capability caches coherent per replica;
# scale with replicas, not local workers.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]

# Test-only: pytest on top of the runtime venv, so the shipped dependency set is proven sufficient.
FROM builder AS devdeps
COPY requirements-dev.txt ./
RUN pip --python /opt/venv/bin/python install -r requirements-dev.txt

FROM runtime AS test
USER root
COPY --from=devdeps /opt/venv /opt/venv
COPY tests /repo/services/assistant/tests
# Tests import both src.* and services.assistant.src.*; the link makes both resolve to the shipped /app/src.
RUN ln -s /app/src /repo/services/assistant/src
USER app
WORKDIR /repo
# DB-free suite: test_attachment_migration needs initdb/pg_ctl (a real PostgreSQL) and runs in CI instead.
RUN python -m pytest services/assistant/tests -q -p no:cacheprovider --ignore=services/assistant/tests/test_attachment_migration.py

# Last stage is the default target, so deploy's plain `buildx build services/assistant` ships runtime, never test.
FROM runtime
