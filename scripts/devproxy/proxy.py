"""
One public address for the phone.

ngrok's free plan gives a single STATIC domain but only one tunnel, while the
app needs two services. This routes by path so both live behind one URL — and
because the domain never changes, a dropped tunnel no longer forces an iOS
rebuild:

    /api/gateway/**  → gateway  :8082   (file storage, Bearer auth)
    everything else  → api      :8080   (GraphQL, extraction endpoints)

Dev only: it forwards headers verbatim, including the API's x-user-id trust
header. Never point this at anything but localhost.
"""
import os

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response

API = os.getenv("PROXY_API", "http://127.0.0.1:8080")
GATEWAY = os.getenv("PROXY_GATEWAY", "http://127.0.0.1:8082")

app = FastAPI()
# Long read timeout: AI extraction calls can take a while.
client = httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0), follow_redirects=False)

# Hop-by-hop headers must not be forwarded.
_DROP = {"host", "content-length", "connection", "keep-alive", "transfer-encoding", "upgrade"}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def forward(path: str, request: Request) -> Response:
    target = GATEWAY if path.startswith("api/gateway") else API
    url = f"{target}/{path}"
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _DROP}
    try:
        upstream = await client.request(
            request.method, url, content=body, headers=headers,
            params=dict(request.query_params),
        )
    except httpx.RequestError as exc:
        return Response(content=f'{{"error":"upstream unreachable: {exc}"}}',
                        status_code=502, media_type="application/json")
    out = {k: v for k, v in upstream.headers.items() if k.lower() not in _DROP}
    return Response(content=upstream.content, status_code=upstream.status_code, headers=out)
