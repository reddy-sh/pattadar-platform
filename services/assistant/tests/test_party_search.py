"""Party-name search against the ~140M-row party table.

A bare trigram `%` scan on a name containing "REDDY" pulled ~436k candidate rows
and hit the 25 s statement timeout cold, which the assistant reported as
"public records temporarily unavailable". These pin the cheap path and the honest
failure.
"""
import asyncio

import psycopg
import pytest

from src.domain.scope_policy import evaluate_scope
from src.public_records.database import ReadOnlyDatabase
from src.public_records.exceptions import PublicRecordsQueryTimeout, PublicRecordsUnavailable
from src.public_records.service import PublicRecordsService
from src.public_records.settings import PublicRecordSettings


class FakeDatabase:
    def __init__(self, *results):
        self.results = list(results)
        self.calls = []

    async def fetch_all(self, sql, params=None, **kwargs):
        self.calls.append((sql, params or {}, kwargs))
        return self.results.pop(0) if self.results else []


def _service(db):
    service = PublicRecordsService(PublicRecordSettings())
    service.db = db
    return service


def _party(rid, name, score, seq=1, side="claimant"):
    return {"rid": rid, "s_no": 1, "seq": seq, "name": name, "role": "CL", "side": side, "score": score}


def _record(rid, reg_date="2019-10-10"):
    return {"rid": rid, "s_no": 1, "village": "KATRAGUNTA", "survey_no": "120-2",
            "txn_class": "sale", "transaction_type": "Sale Deed", "market_value": 1,
            "extent_val": 2.8, "extent_unit": None, "reg_date": reg_date}


def test_every_name_word_is_required_then_variants_are_merged_in():
    db = FakeDatabase(
        [_party("A", "SANKARA REDDY TELUKUTLA", 1.0)],
        [_party("A", "SANKARA REDDY TELUKUTLA", 1.0), _party("B", "TELUKUTLA SANKARA REDDI", 0.7)],
        [_record("A"), _record("B", "2013-12-10")],
    )
    result = asyncio.run(_service(db).find_properties_by_party("Sankara Reddy  Telukutla."))
    words_sql, words_params, words_kwargs = db.calls[0]
    assert "%%" not in words_sql, "the word pass must not use the trigram similarity operator"
    assert words_sql.count("p.name_norm LIKE") == 3
    assert {words_params[f"w{i}"] for i in range(3)} == {"%SANKARA%", "%REDDY%", "%TELUKUTLA%"}
    assert "JOIN" not in words_sql, "candidate passes must not join 140M rows to records"
    assert "p.name_norm %% %(query)s" in db.calls[1][0]
    assert words_kwargs["timeout_ms"] + db.calls[1][2]["timeout_ms"] < 25_000
    assert [m["matched_name"] for m in result["matches"]] == [
        "SANKARA REDDY TELUKUTLA", "TELUKUTLA SANKARA REDDI",
    ], "deduped by party row and ranked by score"
    assert result["complete"] is True and result["note"] is None


def test_a_very_common_name_returns_a_flagged_sample_without_the_fuzzy_scan():
    flood = [_party(f"R{i}", "SRINIVASA RAO", 1.0) for i in range(2001)]
    db = FakeDatabase(flood, [_record(f"R{i}") for i in range(2001)])
    result = asyncio.run(_service(db).find_properties_by_party("Srinivasa Rao", limit=5))
    assert len(db.calls) == 2 and "%%" not in db.calls[0][0]
    assert result["complete"] is False and "very common" in result["note"]
    assert len(result["matches"]) == 5


def test_a_slow_variant_scan_keeps_the_exact_word_hits():
    class SlowFuzzy(FakeDatabase):
        async def fetch_all(self, sql, params=None, **kwargs):
            if "%%" in sql:
                self.calls.append((sql, params, kwargs))
                raise PublicRecordsQueryTimeout("slow")
            return await super().fetch_all(sql, params, **kwargs)

    db = SlowFuzzy([_party("A", "TAMMA SIVA RAMI REDDY", 1.0)], [_record("A")])
    result = asyncio.run(_service(db).find_properties_by_party("Tamma Siva Rami Reddy"))
    assert len(result["matches"]) == 1
    assert result["complete"] is False and "variants" in result["note"].lower()


def test_initials_are_not_words_and_like_metacharacters_are_escaped():
    db = FakeDatabase([])
    asyncio.run(_service(db).find_properties_by_party("K. Rao_%"))
    _, params, _ = db.calls[0]
    assert [v for k, v in params.items() if k.startswith("w")] == ["%RAO\\_\\%%"]


def test_a_name_of_only_initials_goes_straight_to_the_fuzzy_pass():
    db = FakeDatabase([])
    asyncio.run(_service(db).find_properties_by_party("K V"))
    assert len(db.calls) == 1 and "%%" in db.calls[0][0]


def test_the_party_report_uses_the_same_word_first_match():
    db = FakeDatabase([])
    asyncio.run(_service(db).generate_report(party="Sankara Reddy Telukutla"))
    assert "p.name_norm LIKE" in db.calls[0][0]


class _Canceled:
    statements = []

    async def execute(self, sql, params=None):
        if sql.startswith("SELECT p."):
            raise psycopg.errors.QueryCanceled("canceling statement due to statement timeout")

    def transaction(self):
        return _Ctx()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _Ctx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _Pool:
    def connection(self):
        return _Canceled()


def test_a_statement_timeout_asks_for_a_fuller_name_not_service_down():
    db = ReadOnlyDatabase(PublicRecordSettings(database_dsn="configured"))
    db._pool = _Pool()
    with pytest.raises(PublicRecordsQueryTimeout) as raised:
        asyncio.run(db.fetch_all("SELECT p.rid FROM land.party p", timeout_ms=1000))
    assert "fuller name" in str(raised.value).lower()
    # Still an Unavailable, so readiness probes keep treating it as a failure.
    assert isinstance(raised.value, PublicRecordsUnavailable)


@pytest.mark.parametrize("reply", ["yes", "Try again", "try again?", "OK", "go ahead."])
def test_a_bare_answer_to_the_assistants_question_is_in_scope_mid_conversation(reply):
    assert evaluate_scope(reply, has_prior_accepted_turn=True).allowed
    assert not evaluate_scope(reply, has_prior_accepted_turn=False).allowed


def test_a_bare_reply_does_not_launder_an_off_topic_request():
    assert not evaluate_scope("yes, write python code", has_prior_accepted_turn=True).allowed
    assert not evaluate_scope("tell me a joke", has_prior_accepted_turn=True).allowed
    assert not evaluate_scope("who will win the election", has_prior_accepted_turn=True).allowed


@pytest.mark.parametrize("reply", ["get again", "use mcp", "and the 2013 one?"])
def test_short_follow_ups_pass_only_inside_an_accepted_conversation(reply):
    assert evaluate_scope(reply, has_prior_accepted_turn=True).allowed
    assert not evaluate_scope(reply, has_prior_accepted_turn=False).allowed


def test_asking_for_results_or_an_address_is_about_records_on_its_own():
    assert evaluate_scope("get the results againa").allowed
    assert evaluate_scope("what is the address").allowed


def test_a_long_unanchored_message_is_still_refused_mid_conversation():
    long_text = "tell me everything you know about " + "the history of the world " * 4
    assert not evaluate_scope(long_text, has_prior_accepted_turn=True).allowed


@pytest.mark.parametrize(
    "message",
    ["what are the prpperites name on sankara reddy telukutla", "show my documnets", "villge records"],
)
def test_a_misspelled_product_word_still_anchors_the_request(message):
    assert evaluate_scope(message).allowed


@pytest.mark.parametrize("message", ["tell me about tomorrow", "around the world", "write a poem about properties"])
def test_typo_tolerance_does_not_admit_off_topic_text(message):
    assert not evaluate_scope(message).allowed


def test_try_now_is_a_reply_mid_conversation():
    assert evaluate_scope("try now", has_prior_accepted_turn=True).allowed


def test_a_deed_without_a_village_still_says_where_it_is():
    from src.public_records.service import _party_match_row
    row = _party_match_row({
        "rid": "AP0707", "s_no": 1, "matched_name": "TELUKUTLA SANKARA REDDY", "side": "claimant",
        "score": 1.0, "village": "", "village_full": None, "plot_no": "5", "sro_name": "NALLAPADU",
        "orig_doc_no": "CD_Volume: 141\n        8881/2013", "sellers": ["JANYAVULA HARI KRISHNA", None],
        "buyers": ["TELUKUTLA SANKARA REDDY"], "boundary_north": "PLOT NO 5", "boundary_east": " ",
        "consideration_value": 375000,
    })
    assert row["location"] == "Plot 5, NALLAPADU SRO area"
    assert row["village"] is None
    assert row["document"] == "8881/2013"
    assert row["counterparty"] == "JANYAVULA HARI KRISHNA", "a buyer's other party is the seller"
    assert row["boundaries"] == "N: PLOT NO 5"
