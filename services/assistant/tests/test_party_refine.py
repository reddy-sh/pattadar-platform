"""Name + place: villages / SRO filters inside the bounded party search, the
facets the refine checkboxes are drawn from, and the save follow-up."""
import asyncio
import json
import re
from pathlib import Path

import pytest

from src.domain import tool_policy
from src.domain.follow_ups import ADD_EXACT_PROMPT, ADD_LABEL, follow_ups
from src.domain.record_views import record_view
from src.domain.scope_policy import evaluate_scope, is_trusted_route, trusted_application_context
from src.public_records.exceptions import PublicRecordsQueryTimeout
from src.public_records.service import PublicRecordsService, party_facets
from src.public_records.settings import PublicRecordSettings

PARTY = "mcp__pattadar_records__find_properties_by_party"


class Corpus:
    """Answers by statement shape, recording each one."""

    def __init__(self, parties, records, villages=("VINUKONDA",), sros=("VINUKONDA", "NARASARAOPET (R.O)"),
                 slow_filtered=False):
        self.parties, self.records = parties, records
        self.villages, self.sros = set(villages), list(sros)
        self.slow_filtered = slow_filtered
        self.offices = {"VINUKONDA": "AP070730"}
        self.calls = []

    async def fetch_all(self, sql, params=None, **kwargs):
        params = params or {}
        self.calls.append((sql, params, kwargs))
        if "WITH RECURSIVE" in sql and "min(rid)" in sql:
            return [{"office": office, "sro_name": name} for name, office in self.offices.items()]
        if "WITH RECURSIVE" in sql:
            return [{"sro_name": name} for name in self.sros]
        if "unnest(%(w)s::text[])" in sql:
            return [{"village_norm": v} for v in params["w"] if v in self.villages]
        if sql.startswith("SELECT village_norm FROM"):
            return [{"village_norm": params["v"]}] if params["v"] in self.villages else []
        if "max(similarity(village_norm" in sql:
            near = [v for v in self.villages if v.startswith(params["n"][:5])]
            return [{"village_norm": near[0], "sim": 0.8}] if near else []
        if sql.startswith("SELECT p.rid"):
            if self.slow_filtered and "JOIN" in sql:
                raise PublicRecordsQueryTimeout("slow")
            return list(self.parties) if "LIKE" in sql else []
        if sql.startswith("SELECT r.rid"):
            return list(self.records)
        return []


def _service(db):
    service = PublicRecordsService(PublicRecordSettings())
    service.db = db
    return service


def _party(rid, score=1.0, name="BOBBA USHARANI"):
    return {"rid": rid, "s_no": 1, "seq": 1, "name": name, "role": "CL", "side": "claimant", "score": score}


def _record(rid, village="VINUKONDA", sro="VINUKONDA"):
    return {"rid": rid, "s_no": 1, "village": village.title(), "village_norm": village, "sro_name": sro,
            "survey_no": "12", "reg_date": "2019-01-01", "buyers": ["BOBBA USHARANI"], "sellers": ["X"]}


def test_a_village_filter_is_pushed_into_the_bounded_candidate_pass():
    db = Corpus([_party("A")], [_record("A")])
    result = asyncio.run(_service(db).find_properties_by_party("Usharani Bobba", villages=["vinukonda"]))
    words_sql, words_params, words_kwargs = next(c for c in db.calls if "LIKE" in c[0])
    assert "JOIN land.real_estate_records r ON r.rid = p.rid AND r.s_no = p.s_no" in words_sql
    assert "r.village_norm = ANY(%(villages)s::text[])" in words_sql
    assert words_sql.rstrip().endswith("LIMIT %(cap)s") and words_params["cap"] == 2001
    assert words_params["villages"] == ["VINUKONDA"]
    assert words_kwargs["timeout_ms"] <= 6_000, "the place join gets the shorter budget"
    fuzzy_sql = next(c[0] for c in db.calls if "p.name_norm %% %(query)s" in c[0])
    assert "r.village_norm = ANY" in fuzzy_sql
    assert result["query"] == {"name": "Usharani Bobba", "villages": ["VINUKONDA"], "sro": None,
                               "min_similarity": 0.6, "side": None}
    assert len(result["matches"]) == 1 and result["complete"] is True


def test_no_filter_means_no_join_as_before():
    db = Corpus([_party("A")], [_record("A")])
    asyncio.run(_service(db).find_properties_by_party("Usharani Bobba"))
    assert all("JOIN land" not in sql for sql, _, _ in db.calls if sql.startswith("SELECT p.rid"))


def test_an_sro_becomes_exact_names_the_btree_can_use_and_is_cached():
    db = Corpus([_party("A")], [_record("A", sro="NARASARAOPET (R.O)")])
    service = _service(db)
    asyncio.run(service.find_properties_by_party("Usharani Bobba", sro="narasaraopet"))
    words_sql, params, _ = next(c for c in db.calls if "LIKE" in c[0])
    assert "r.sro_name = ANY(%(sros)s::text[])" in words_sql and "ILIKE" not in words_sql
    assert params["sros"] == ["NARASARAOPET (R.O)"]
    asyncio.run(service.find_properties_by_party("Usharani Bobba", sro="Vinukonda"))
    assert sum("min(sro_name)" in sql for sql, _, _ in db.calls) == 1, "office list read once"
    assert sum("min(rid)" in sql for sql, _, _ in db.calls) == 1, "rid office prefixes read once"


def test_a_place_that_matches_nothing_says_so_without_searching_140m_names():
    db = Corpus([_party("A")], [_record("A")])
    result = asyncio.run(_service(db).find_properties_by_party("Usharani Bobba", villages=["Zzzzz"]))
    assert result["matches"] == [] and "No such village ZZZZZ" in result["note"]
    assert not any(sql.startswith("SELECT p.rid") for sql, _, _ in db.calls)


def test_a_slow_place_join_falls_back_to_the_plain_sample_filtered_after():
    parties = [_party("A"), _party("B")]
    records = [_record("A"), _record("B", village="GUNTUR")]
    db = Corpus(parties, records, villages=("VINUKONDA", "GUNTUR"), slow_filtered=True)
    result = asyncio.run(_service(db).find_properties_by_party("Usharani Bobba", villages=["VINUKONDA"]))
    assert [m["rid"] for m in result["matches"]] == ["A"], "the other village is filtered out after"
    assert result["complete"] is False and "sample" in result["note"]
    assert not any("%%" in sql for sql, _, _ in db.calls), "no fuzzy pass after the fallback"


def test_facets_count_every_matched_row_not_just_the_page():
    parties = [_party(f"R{i}", score=1.0 if i < 5 else 0.92 if i < 20 else 0.75 if i < 28 else 0.6)
               for i in range(30)]
    records = [_record(f"R{i}", village="VINUKONDA" if i % 3 else "KATRAGUNTA",
                       sro="VINUKONDA" if i % 2 else "NARASARAOPET (R.O)") for i in range(30)]
    db = Corpus(parties, records)
    result = asyncio.run(_service(db).find_properties_by_party("Usharani Bobba", limit=5))
    assert len(result["matches"]) == 5 and result["total_matches"] == 30
    facets = result["facets"]
    assert facets["villages"] == [{"name": "VINUKONDA", "count": 20}, {"name": "KATRAGUNTA", "count": 10}]
    assert {item["name"]: item["count"] for item in facets["sros"]} == {"VINUKONDA": 15, "NARASARAOPET (R.O)": 15}
    assert facets["confidence"] == {"exact": 5, "high": 15, "medium": 8, "low": 2}


def test_facets_are_capped():
    rows = [{"village_norm": f"V{i:02d}", "sro_name": f"S{i:02d}", "score": 1.0} for i in range(40)]
    facets = party_facets(rows)
    assert len(facets["villages"]) == 15 and len(facets["sros"]) == 10


def test_places_with_confident_matches_rank_above_a_crowd_of_near_misses():
    # The live shape of "Usharani Bobba": 4 exact deeds in VINUKONDA, and
    # hundreds of low-confidence spellings spread over other villages.
    rows = [{"village_norm": "VINUKONDA", "sro_name": "VINUKONDA", "score": 1.0} for _ in range(4)]
    rows += [{"village_norm": f"NOISE{i:02d}", "sro_name": f"SRO{i:02d}", "score": 0.62}
             for i in range(20) for _ in range(10)]
    facets = party_facets(rows)
    assert facets["villages"][0] == {"name": "VINUKONDA", "count": 4}, "the count shown is still the total"
    assert facets["sros"][0] == {"name": "VINUKONDA", "count": 4}
    assert [item["count"] for item in facets["villages"][1:]] == [10] * 14


# ── the view the browser draws the checkboxes from ───────────────────

def _envelope(**extra):
    return json.dumps({
        "matches": [{"rid": "AP1", "s_no": 1, "matched_name": "BOBBA USHARANI", "side": "claimant",
                     "score": 1.0, "village": "VINUKONDA", "survey_no": "12"}],
        "total_matches": 40, "complete": True, "note": None,
        "facets": {"villages": [{"name": "VINUKONDA", "count": 30}, {"name": "<b>X</b>", "count": "9"}],
                   "sros": [{"name": "VINUKONDA", "count": 40}],
                   "confidence": {"exact": 12, "high": 20, "medium": 8, "low": 0}},
        "query": {"name": "Usharani Bobba", "villages": ["VINUKONDA"], "sro": None,
                  "min_similarity": 0.9, "side": None},
        **extra,
    })


def test_the_party_view_carries_facets_and_the_query_it_ran():
    view = record_view(PARTY, _envelope(), {"name": "Usharani Bobba"}, "t", incognito=False)
    assert view["facets"]["villages"][0] == {"name": "VINUKONDA", "count": 30}
    assert view["facets"]["villages"][1] == {"name": "<b>X</b>", "count": 0}, "strings stay text; bad counts are 0"
    assert view["facets"]["confidence"] == {"exact": 12, "high": 20, "medium": 8, "low": 0}
    assert view["query"] == {"name": "Usharani Bobba", "villages": ["VINUKONDA"], "sro": None,
                             "min_similarity": 0.9, "side": None}
    assert {"label": ADD_LABEL, "prompt": ADD_EXACT_PROMPT} in view["follow_ups"]


def test_other_tools_get_no_facets_and_empty_views_only_on_request():
    history = record_view("mcp__pattadar_records__get_property_history",
                          json.dumps({"records": [{"rid": "R", "village": "V"}]}), incognito=False)
    assert "facets" not in history and "query" not in history
    empty = _envelope(matches=[], total_matches=0)
    assert record_view(PARTY, empty) is None
    view = record_view(PARTY, empty, {"name": "x"}, "t", allow_empty=True)
    assert view["rows"] == [] and view["total"] == 0 and view["facets"]["sros"]


# ── the save follow-up ───────────────────────────────────────────────

ROWS = [{"matched_name": "BOBBA USHARANI", "score": 1.0, "village": "VINUKONDA", "survey_no": "12", "rid": "A"}]


def test_the_save_offer_is_only_for_saved_chats_and_exact_matches():
    saved = follow_ups(PARTY.rsplit("__", 1)[-1], ROWS, {"name": "Usharani Bobba"}, incognito=False)
    assert saved[-1] == {"label": ADD_LABEL, "prompt": ADD_EXACT_PROMPT}
    incognito = follow_ups("find_properties_by_party", ROWS, {"name": "Usharani Bobba"}, incognito=True)
    assert all(item["label"] != ADD_LABEL for item in incognito)
    fuzzy = follow_ups("find_properties_by_party", [dict(ROWS[0], score=0.8)], {}, incognito=False)
    assert all(item["label"] != ADD_LABEL for item in fuzzy), "no 100% deed, nothing to add"
    assert follow_ups("find_properties_by_party", ROWS, {}) == follow_ups(
        "find_properties_by_party", ROWS, {}, incognito=True), "unknown means incognito"


def test_deed_and_history_results_offer_it_too_and_every_prompt_is_in_scope():
    for tool in ("get_record_by_rid", "get_property_history"):
        found = follow_ups(tool, [{"rid": "AP0808", "village": "V"}], {}, incognito=False)
        assert found[-1]["label"] == ADD_LABEL and "AP0808" in found[-1]["prompt"]
        for item in found:
            assert evaluate_scope(item["prompt"]).allowed, item["prompt"]
    assert evaluate_scope(ADD_EXACT_PROMPT).allowed


@pytest.mark.parametrize("message", [
    "add to my properties", "watch this land", "put it on my watchlist", "monitor this one",
])
def test_save_words_are_product_words(message):
    assert evaluate_scope(message).allowed


def test_the_prompt_tells_the_model_it_cannot_save():
    suffix = tool_policy.STRICT_SYSTEM_SUFFIX
    assert "propose_add_records" in suffix
    assert "Never say a record was saved" in suffix
    assert tool_policy.INCOGNITO_SAVE_TEXT in suffix
    assert "villages / sro" in suffix


# ── the trusted routes follow apps/web/src/routes.tsx ────────────────

ROUTES = Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "routes.tsx"
#: Signed-in screens (children of the `id: 'app'` layout) deliberately NOT page context for the assistant.
UNTRUSTED_ON_PURPOSE = {"desk", "admin"}


def _app_routes() -> tuple[set[str], set[str]]:
    text = ROUTES.read_text()
    # Fail loudly, never parse an empty slice, if the layout anchor moves.
    assert "id: 'app'," in text and "path: '/legacy'," in text, "routes.tsx anchors moved"
    block = text[text.index("id: 'app',"): text.index("path: '/legacy',")]
    screens, redirects = set(), set()
    # Direct children of the app layout sit at six spaces ("{ path: 'x', ...") or as an
    # eight-space "path:" line inside a multi-line child object.
    for match in re.finditer(r"^(?: {6}\{ path| {8}path): '([^']+)',(.*)$", block, re.M):
        path, rest = match.group(1), match.group(2)
        (redirects if "<Navigate" in rest or "<To" in rest or "<From" in rest else screens).add(path)
    return screens, redirects


@pytest.mark.skipif(not ROUTES.exists(), reason="web app source not present")
def test_every_current_app_screen_is_trusted_and_no_redirect_is():
    screens, redirects = _app_routes()
    assert "properties" in screens and "properties/:id" in screens, "route parser broke"
    for path in screens:
        if path.split("/")[0] in UNTRUSTED_ON_PURPOSE or path == "*":
            continue
        concrete = "/" + path.replace(":id", "abc123").replace(":key", "deeds").replace("/*", "")
        assert is_trusted_route(concrete), f"{concrete} is a current screen the gate does not trust"
    for path in redirects:
        if ":" in path or "*" in path:
            continue
        assert not is_trusted_route("/" + path), f"/{path} is a redirect now"


def test_id_routes_match_on_a_prefix_but_cannot_escape():
    assert is_trusted_route("/properties/0192f3a4-7b1c-7d2e-8f30-1a2b3c4d5e6f/people")
    assert is_trusted_route("/holdings/h1") and is_trusted_route("/papers/shelf/sale")
    for bad in ("/properties/../admin", "/properties/", "/properties/a/b/c", "/desk",
                "/parcels", "https://x/app", "/properties/a?x=1", "//evil.com",
                "https://x", "/unknown", "/app", "/records/a"):
        assert not is_trusted_route(bad), bad
    context = {"app": {"name": "Pattadar"}, "page": {"path": "/properties/0192f3a4-7b1c-7d2e-8f30-1a2b3c4d5e6f"}}
    assert trusted_application_context(context)


def test_navigation_labels_point_at_current_routes():
    lookup = tool_policy.safe_navigation([{"label": "This deed", "path": "/properties/0192f3a4-7b1c-7d2e-8f30-000000000001"},
                                          {"label": "Bad", "path": "/properties/../x"}])
    assert lookup["this deed"] == "/properties/0192f3a4-7b1c-7d2e-8f30-000000000001" and "bad" not in lookup
    assert lookup["documents"] == "/papers" and lookup["holdings"] == "/holdings"
    for path in lookup.values():
        assert is_trusted_route(path.split("?", 1)[0]), path


def test_an_sro_filter_also_narrows_party_rows_by_rid_office_range():
    """The planner cannot drive a common name + SRO from the deed side in time;
    the office's rid range on the party row lets the index do it."""
    db = Corpus([_party("AP07073019920000102", score=1.0)], [_record("AP07073019920000102")])
    asyncio.run(_service(db).find_properties_by_party("Srinivasa Rao", sro="Vinukonda"))
    words_sql, params, _ = next(c for c in db.calls if "LIKE" in c[0])
    assert "(p.rid >= %(lo0)s AND p.rid < %(hi0)s)" in words_sql
    assert params["lo0"] == "AP070730" and params["hi0"] == "AP070731"


def test_an_sro_without_a_known_office_is_filtered_by_name_only():
    db = Corpus([_party("A")], [_record("A", sro="NARASARAOPET (R.O)")])
    asyncio.run(_service(db).find_properties_by_party("Usharani Bobba", sro="narasaraopet"))
    words_sql = next(c[0] for c in db.calls if "LIKE" in c[0])
    assert "p.rid >=" not in words_sql and "r.sro_name = ANY" in words_sql


def test_one_deed_matched_by_two_parties_counts_once():
    twice = [_party("A", score=1.0), {**_party("A", score=0.95), "seq": 4, "side": "executant"}]
    db = Corpus(twice + [_party("B", score=0.8)], [_record("A"), _record("B")])
    result = asyncio.run(_service(db).find_properties_by_party("Usharani Bobba"))
    assert result["total_matches"] == 2 and len(result["matches"]) == 2
    assert result["facets"]["confidence"] == {"exact": 1, "high": 0, "medium": 1, "low": 0}
    assert result["facets"]["villages"] == [{"name": "VINUKONDA", "count": 2}]


def test_misspelt_villages_resolve_one_at_a_time_time_boxed_and_capped():
    db = Corpus([_party("A")], [_record("A")])
    typed = ["VINUKONDAA", "KOWTARAMM", "TOTHARAMUDII", "GUNADALAA", "RAMANAYYAPETAA", "VINUKONDA"]
    result = asyncio.run(_service(db).find_properties_by_party("Usharani Bobba", villages=typed))
    fuzzy = [c for c in db.calls if "max(similarity(village_norm" in c[0]]
    assert len(fuzzy) == 3, "at most three misspelt names go to the slow pass"
    assert all(c[2].get("timeout_ms") == 3_000 for c in fuzzy)
    assert result["query"]["villages"] == ["VINUKONDA"]
    assert "GUNADALAA" in (result["note"] or "")


def test_a_capped_sample_marks_its_facets_as_sampled():
    many = [{**_party(f"R{i}"), "score": 0.7} for i in range(2001)]
    db = Corpus(many, [_record(f"R{i}") for i in range(2001)])
    result = asyncio.run(_service(db).find_properties_by_party("Srinivasa Rao"))
    assert result["facets"]["sampled"] is True
    small = asyncio.run(_service(Corpus([_party("A")], [_record("A")])).find_properties_by_party("Usharani Bobba"))
    assert small["facets"]["sampled"] is False
