FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
COPY sql ./sql
EXPOSE 8080

# Runs as a non-root user: this container parses untrusted input (JWTs, HEIC
# and JPEG uploads, multipart bodies) at the internet-facing boundary, so a
# parser bug should not land as uid 0.
RUN useradd --system --create-home --uid 10001 app
USER app
# Single worker by default — the psycopg pool is per-process. Override via
# UVICORN_WORKERS if needed.
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port 8080 --workers ${UVICORN_WORKERS:-1}"]
