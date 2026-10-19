"""Stop mid-stream: the SDK source is torn down, not orphaned."""
import asyncio

import anyio

from src.adapters.event_pump import FINISHED, IDLE, EventPump


def _sdk_like_source(log: list[str], forever: bool = True):
    async def source():
        try:
            yield {"type": "token", "text": "Hel"}
            yield {"type": "token", "text": "lo"}
            if forever:
                await asyncio.Event().wait()  # the model is still thinking
        finally:
            # Like the SDK transport close(): a shielded, multi-await teardown
            # that only an anyio cancellation lets run to the end.
            with anyio.CancelScope(shield=True):
                await anyio.sleep(0.01)
                log.append("terminated")
                await anyio.sleep(0.01)
                log.append("reaped")

    return source


def test_a_finished_stream_drains_in_order():
    async def run():
        pump = EventPump(_sdk_like_source([], forever=False), timeout=5)
        pump.start()
        seen = []
        while (item := await pump.get(1.0)) is not FINISHED:
            seen.append(item)
        await pump.join()
        return seen

    assert [e["text"] for e in asyncio.run(run())] == ["Hel", "lo"]


def test_quiet_model_yields_idle_for_keepalives():
    async def run():
        pump = EventPump(_sdk_like_source([]), timeout=5)
        pump.start()
        await pump.get(1.0), await pump.get(1.0)
        idle = await pump.get(0.05)
        await pump.stop()
        return idle

    assert asyncio.run(run()) is IDLE


def test_stop_runs_the_sdk_teardown_to_completion():
    log: list[str] = []

    async def run():
        pump = EventPump(_sdk_like_source(log), timeout=5)
        pump.start()
        await pump.get(1.0)
        await pump.stop(grace=2)
        assert pump.done

    asyncio.run(run())
    assert log == ["terminated", "reaped"]


def test_a_client_disconnect_cancels_the_reader_and_still_tears_down():
    """Starlette cancels the response through an anyio scope on disconnect."""
    log: list[str] = []
    marked: list[str] = []

    async def run():
        pump = EventPump(_sdk_like_source(log), timeout=5)
        pump.start()
        with anyio.CancelScope() as request_scope:
            try:
                while (item := await pump.get(1.0)) is not FINISHED:
                    if item is not IDLE and item["text"] == "lo":
                        request_scope.cancel()  # the browser pressed Stop
            except asyncio.CancelledError:
                # Level-triggered: unshielded awaits here would be cancelled too.
                with anyio.CancelScope(shield=True):
                    await pump.stop(grace=2)
                    await anyio.sleep(0)
                    marked.append("client_disconnected")
                raise
        assert request_scope.cancelled_caught and pump.done

    asyncio.run(run())
    assert log == ["terminated", "reaped"] and marked == ["client_disconnected"]


def test_source_errors_and_timeouts_reach_the_reader():
    async def broken():
        yield {"type": "token", "text": "x"}
        raise RuntimeError("Claude Agent SDK run failed")

    async def slow():
        await asyncio.Event().wait()
        yield {}

    async def drain(source, timeout):
        pump = EventPump(source, timeout=timeout)
        pump.start()
        items = []
        while (item := await pump.get(1.0)) is not FINISHED:
            items.append(item)
        return items

    items = asyncio.run(drain(broken, 5))
    assert isinstance(items[-1], RuntimeError)
    assert isinstance(asyncio.run(drain(slow, 0.05))[-1], TimeoutError)


def test_a_proposal_frame_passes_through_in_order():
    async def source():
        yield {"type": "tool_end", "name": "mcp__pattadar_ui__propose_add_records"}
        yield {"type": "proposal", "id": "p1", "status": "draft", "stake": None, "items": []}
        yield {"type": "token", "text": "Review the card."}

    async def run():
        pump = EventPump(source, timeout=5)
        pump.start()
        seen = []
        while (item := await pump.get(1.0)) is not FINISHED:
            seen.append(item["type"])
        await pump.join()
        return seen

    assert asyncio.run(run()) == ["tool_end", "proposal", "token"]
