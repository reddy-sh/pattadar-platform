FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt requirements-semantic.txt ./
ARG INSTALL_SEMANTIC=0
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_SEMANTIC" = "1" ]; then pip install --no-cache-dir -r requirements-semantic.txt; fi
COPY src ./src
EXPOSE 8080

# Runs as a non-root user: a bug in anything it parses should not land as uid 0.
RUN useradd --system --create-home --uid 10001 app
USER app
# Single process keeps prompt/model/capability caches coherent per replica;
# scale with replicas, not local workers.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
