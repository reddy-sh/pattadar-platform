"""Request correlation shared by every log line this service writes.

The gateway mints ``x-request-id`` when a client omits it and forwards the same
value to api and assistant, so one chat turn can be followed across the three
services in CloudWatch.
"""
from __future__ import annotations

import logging
import re
from contextvars import ContextVar
from uuid import uuid4

REQUEST_ID_HEADER = "x-request-id"
_NO_REQUEST = "-"
# Correlation ids end up in log lines and in a response header: keep them to
# the characters uuids and trace ids actually use.
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._\-]{1,200}$")

request_id_var: ContextVar[str] = ContextVar("assistant_request_id", default=_NO_REQUEST)


def current_request_id() -> str:
    return request_id_var.get()


def normalize_request_id(supplied: str | None) -> str:
    candidate = (supplied or "").strip()
    return candidate if _SAFE_REQUEST_ID.match(candidate) else str(uuid4())


class RequestIdFilter(logging.Filter):
    """Stamp the in-flight correlation id on every record, including library ones."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def install_log_filter() -> None:
    root = logging.getLogger()
    if any(isinstance(item, RequestIdFilter) for item in root.filters):
        return
    root.addFilter(RequestIdFilter())
    for handler in root.handlers:
        handler.addFilter(RequestIdFilter())


class RequestIdMiddleware:
    """Pure-ASGI so the id outlives the response headers of an SSE stream."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        supplied = None
        for name, value in scope.get("headers") or ():
            if name == REQUEST_ID_HEADER.encode():
                supplied = value.decode("latin-1")
                break
        request_id = normalize_request_id(supplied)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((REQUEST_ID_HEADER.encode(), request_id.encode()))
            await send(message)

        token = request_id_var.set(request_id)
        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_var.reset(token)
