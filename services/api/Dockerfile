FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# --workers > 1 only helps for sync resolvers — async resolvers with a single
# connection pool benefit more from staying single-process (the pool is
# per-process). Default to 1; override at runtime via UVICORN_WORKERS env if
# an app's resolvers are sync-bound. UI-driven GraphQL pages routinely fire
# 5–10 parallel queries, so even brief sync DB calls block the event loop
# and the gateway's 30s timeout starts tripping the circuit breaker —
# generated apps MUST use async resolvers + AsyncConnectionPool (see prompt).
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port 8080 --workers ${UVICORN_WORKERS:-1}"]
