"""Run an agent event stream in its own task and stop it cleanly.

The chat endpoint reads agent events through a queue so it can send SSE
keepalives while the model is quiet. The producer task owns a
``ClaudeSDKClient`` and with it a CLI subprocess.

Stopping that task correctly is subtle. The SDK's transport ``close()`` runs
in an anyio *shielded* scope so its terminate/kill escalation survives an
anyio cancellation. A bare ``asyncio.Task.cancel()`` is not an anyio
cancellation, though: it is delivered at the first await inside that shield,
the escalation is skipped and the CLI child is orphaned. So the pump cancels
its producer through an anyio ``CancelScope`` and waits for the cleanup under
a shield. It falls back to ``Task.cancel()`` only after a grace period.

A client Stop reaches the endpoint as an anyio cancellation (Starlette cancels
its task group when the request disconnects). That cancellation is
level-triggered, so every await in the cleanup path has to be shielded too.
"""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Callable

import anyio

#: Returned by :meth:`EventPump.get` when the source has no more events.
FINISHED = object()
#: Returned by :meth:`EventPump.get` when nothing arrived within the wait.
IDLE = object()


class EventPump:
    def __init__(self, source: Callable[[], AsyncIterator[dict[str, Any]]], timeout: float):
        self._source = source
        self._timeout = timeout
        self._queue: asyncio.Queue[Any] = asyncio.Queue()
        self._scope = anyio.CancelScope()
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._produce())

    async def _produce(self) -> None:
        try:
            with self._scope, anyio.fail_after(self._timeout):
                async for event in self._source():
                    await self._queue.put(event)
        except Exception as error:  # surfaced to the reader, re-raised there
            await self._queue.put(error)
        finally:
            await self._queue.put(FINISHED)

    async def get(self, wait: float) -> Any:
        """The next event, an Exception from the source, ``IDLE`` or ``FINISHED``."""
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=wait)
        except asyncio.TimeoutError:
            return IDLE

    async def join(self) -> None:
        if self._task is not None:
            await self._task

    @property
    def done(self) -> bool:
        return self._task is None or self._task.done()

    async def stop(self, grace: float = 25.0) -> None:
        """Cancel the source and wait, shielded, for its cleanup to finish.

        ``grace`` covers the SDK's own bounded close (about 20 seconds in the
        worst case). A task still running after that is cancelled outright.
        """
        task = self._task
        if task is None or task.done():
            return
        self._scope.cancel()
        with anyio.CancelScope(shield=True):
            await asyncio.wait({task}, timeout=grace)
        if not task.done():
            task.cancel()


__all__ = ["EventPump", "FINISHED", "IDLE"]
