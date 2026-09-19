"""The seams the assistant depends on.

Written down so a reader can see what the chat turn actually needs, and so a
test can substitute a part without importing a provider SDK or reaching a
database. These describe existing behaviour; they are not a new abstraction
layer and nothing is required to inherit from them.
"""
from __future__ import annotations

from typing import Any, AsyncGenerator, Protocol


class AgentRuntime(Protocol):
    """Runs one bounded turn and yields the service's SSE events.

    Implemented by adapters.agent_runtime.AssistantAgent over the Claude Agent
    SDK. The turn is bounded on purpose (max turns, thinking budget, timeout):
    an unbounded agent loop is a cost and latency incident.
    """

    async def stream(
        self,
        *,
        content: str | list[dict],
        transcript: list[dict],
        model: str,
        prompt_context: str,
        navigation: list[dict],
        session_id: str,
    ) -> AsyncGenerator[dict[str, Any], None]:
        ...


class ModelCatalog(Protocol):
    """Which model the assistant may use.

    The gateway-owned ``platform_models`` table is authoritative, including when
    it returns nothing: an administrator disabling every model must produce a
    refusal, never a fallback.
    """

    def default_model(self) -> str:
        ...

    def is_supported(self, model_id: str) -> bool:
        ...


class PromptRepository(Protocol):
    """The system prompt for a named agent, newest wins, cached briefly."""

    async def get(self, name: str) -> str:
        ...
