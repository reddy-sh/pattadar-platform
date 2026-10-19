"""Per-request cost and provider-failure wording."""
from src.domain.billing import CREDIT_EXHAUSTED, classify_failure, estimate_cost, failure_detail, failure_text, request_cost

USAGE = {"input_tokens": 6, "cache_creation_input_tokens": 5491, "cache_read_input_tokens": 13088, "output_tokens": 425}


def test_sonnet_4_6_cost_counts_cache_writes_and_reads_at_their_rates():
    # 6*3 + 5491*3.75 + 13088*0.30 + 425*15, per million
    assert estimate_cost("claude-sonnet-4-6", USAGE) == round((18 + 20591.25 + 3926.4 + 6375) / 1e6, 6)


def test_the_sdk_reported_cost_wins_and_unknown_models_are_not_guessed():
    assert request_cost("claude-sonnet-4-6", USAGE, 0.0421)["cost_usd"] == 0.0421
    assert request_cost("some-new-model", USAGE)["cost_usd"] is None
    assert request_cost("claude-sonnet-4-6", USAGE)["cache_read_tokens"] == 13088


def test_an_empty_credit_balance_is_named_and_explained():
    assert classify_failure("Credit balance is too low") == CREDIT_EXHAUSTED
    # The owner reads one plain sentence; the vendor reason is for logs and admins.
    for code in (CREDIT_EXHAUSTED, "provider_auth", "provider_rate_limited", "provider_overloaded"):
        owner = failure_text(code)
        assert owner.startswith("The assistant is not available right now.")
        assert "Anthropic" not in owner and "console" not in owner and "API" not in owner
    assert "console.anthropic.com" in failure_detail(CREDIT_EXHAUSTED)
    assert failure_text("something_unknown") is None
    assert classify_failure("x", 429) == "provider_rate_limited"
    assert classify_failure("something else entirely") is None
