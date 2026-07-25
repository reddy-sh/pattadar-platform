"""Assistant service — Prometheus metrics."""

from prometheus_client import Counter, Histogram

# Chat
chat_total = Counter(
    "assistant_chat_total",
    "Total chat requests completed",
    # NOTE: per-user labels would be unbounded cardinality; user-level analysis
    # belongs in logs/conversations, not a metric label.
    ["model"],
)
chat_seconds = Histogram(
    "assistant_chat_seconds",
    "Wall time for a chat stream to complete",
    ["model"],
    buckets=(0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600),
)
chat_errors_total = Counter(
    "assistant_chat_errors_total",
    "Chat stream failures",
    ["error_type"],
)

# Tools (built-in navigate/page-action tools, plus MCP when configured)
tool_calls_total = Counter(
    "assistant_tool_calls_total",
    "Tool invocations from assistant",
    ["server", "tool"],
)

# Conversations CRUD
conversations_total = Counter(
    "assistant_conversations_total",
    "Conversations created",
)
