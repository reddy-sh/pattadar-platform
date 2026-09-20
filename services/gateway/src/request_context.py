"""Request correlation across gateway → api → assistant.

Every inbound request carries an ``x-request-id``: the caller's when it sent
one, a fresh uuid4 otherwise. The id goes three places — a contextvar, so
every log record of that request names it without each call site passing it;
the ASGI scope, so the proxy routes forward it upstream untouched with the
rest of the inbound headers; and the response, so a user report can quote it.
"""
from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar
from typing import Optional

REQUEST_ID_HEADER = "x-request-id"
_HEADER_BYTES = REQUEST_ID_HEADER.encode()

#: Long enough for a uuid4 or a W3C traceparent, short enough that a hostile
#: id cannot bloat every log line it appears on.
_MAX_LENGTH = 128

#: Empty, not "-", outside a request: callers test it before forwarding, and a
#: placeholder would travel upstream as if it were a real correlation id.
_request_id: ContextVar[str] = ContextVar("request_id", default="")


def current_request_id() -> str:
    return _request_id.get()


def _accept(raw: bytes) -> str:
    """A caller-supplied id is echoed back and written into logs, so only
    printable single-byte ASCII survives — anything else is replaced."""
    value = raw.decode("latin-1", "ignore").strip()[:_MAX_LENGTH]
    if not value or not all(33 <= ord(c) < 127 for c in value):
        return ""
    return value


class RequestIdMiddleware:
    """Mint/adopt the request id before any handler or logger runs."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        supplied = next(
            (v for (k, v) in scope["headers"] if k.lower() == _HEADER_BYTES), b""
        )
        request_id = _accept(supplied) or str(uuid.uuid4())
        encoded = request_id.encode("latin-1")
        scope = dict(scope)
        scope["headers"] = [
            (k, v) for (k, v) in scope["headers"] if k.lower() != _HEADER_BYTES
        ] + [(_HEADER_BYTES, encoded)]
        token = _request_id.set(request_id)

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                message = dict(message)
                message["headers"] = [
                    (k, v)
                    for (k, v) in message.get("headers", [])
                    if k.lower() != _HEADER_BYTES
                ] + [(_HEADER_BYTES, encoded)]
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            _request_id.reset(token)


class RequestIdLogFilter(logging.Filter):
    """Stamp the current request id on every record so the root format string
    can name it — including records emitted by libraries."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get() or "-"
        return True


def install_log_filter(logger: Optional[logging.Logger] = None) -> None:
    for handler in (logger or logging.getLogger()).handlers:
        handler.addFilter(RequestIdLogFilter())
