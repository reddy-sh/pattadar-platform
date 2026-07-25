FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
EXPOSE 8080
# Single process on purpose: the LangGraph checkpointer and model-registry
# cache are per-process; scale with replicas, not workers.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
