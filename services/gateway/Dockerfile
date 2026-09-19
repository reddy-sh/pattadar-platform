FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
COPY sql ./sql
EXPOSE 8080
# Single worker by default — the psycopg pool is per-process. Override via
# UVICORN_WORKERS if needed.
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port 8080 --workers ${UVICORN_WORKERS:-1}"]
