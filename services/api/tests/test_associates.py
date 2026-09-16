"""The roster, pinned.

Same posture as test_ticketing.py: a rule per test, stated in the name. This
module decides who is offered paid work, so every rule that could quietly
exclude somebody — a folded village name, a phone number typed with a country
code, a capacity that is really a stale counter — is asserted here rather than
discovered on a roster of four people in a district with no cover.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import associates as a


# ── The module keeps its promise to be pure ────────────────────────────

def test_no_database_network_or_strawberry_is_imported():
    """The contract ticketing.py set, and the reason it is testable at all."""
    source = (Path(__file__).resolve().parents[1] / "src" / "associates.py").read_text()
    for banned in ("import psycopg", "import strawberry", "import httpx",
                   "import requests", "from . import web360"):
        assert banned not in source, banned


def test_the_only_clock_call_is_inside_a_function_that_is_given_its_time():
    """`offer_deadline` does date arithmetic, so it imports datetime — but it
    is handed the instant to start from and never asks the OS for `now`."""
    source = (Path(__file__).resolve().parents[1] / "src" / "associates.py").read_text()
    assert "datetime.now(" not in source
    assert "date.today(" not in source
    assert "uuid" not in source


# ── Folding a place name ───────────────────────────────────────────────

def test_a_village_spelled_three_ways_in_the_revenue_record_is_one_place():
    """Revenue records carry the rural/urban suffix, stray case and trailing
    space. An exact match on a typed village name matches almost nothing."""
    assert a.fold("Peddapuram (R)") == a.fold("peddapuram ") == a.fold("PEDDAPURAM")


def test_folding_keeps_digits_because_survey_villages_carry_them():
    assert a.fold("Kothapalli-2") == "kothapalli2"


def test_folding_an_empty_or_missing_name_is_empty_and_matches_nothing():
    """An empty slot must never match an empty enrolled area — that would
    offer every job in the state to whoever left a field blank."""
    assert a.fold("") == ""
    assert a.fold(None) == ""


# ── One human, one row ─────────────────────────────────────────────────

def test_the_same_number_typed_four_ways_folds_to_one_key():
    keys = {a.contact_key(s) for s in
            ("+91 98480 12345", "098480 12345", "9848012345", "+919848012345")}
    assert keys == {"9848012345"}


def test_an_email_is_its_own_key_lowercased():
    assert a.contact_key("Ravi@Example.COM") == "ravi@example.com"


def test_somebody_with_no_number_yet_gets_no_key_so_two_of_them_do_not_collide():
    """The desk is allowed to enrol a name it has no number for. If those
    folded to the same '' the unique index would reject the second one."""
    assert a.contact_key("") == ""
    assert a.contact_key("Ravi Kumar") == ""
    assert a.contact_key("12345") == ""


def test_a_masked_number_keeps_the_last_four_and_nothing_else():
    assert a.mask_contact("+91 98480 12345") == "••••••2345"


def test_one_number_typed_two_ways_masks_to_one_string():
    """A desk comparing two rows must not read the same person as two."""
    assert a.mask_contact("+91 98480 12345") == a.mask_contact("9848012345")


def test_a_masked_number_is_recognisable_to_its_owner_and_useless_to_anyone_else():
    masked = a.mask_contact("9848012345")
    assert masked.endswith("2345")
    assert "9848" not in masked


def test_a_masked_email_keeps_its_domain_so_the_owner_knows_which_address():
    assert a.mask_contact("ravi@example.com").endswith("@example.com")
    assert a.mask_contact("ravi@example.com").startswith("r")


# ── Which seam reaches somebody ────────────────────────────────────────

def test_a_number_goes_by_sms_and_an_address_by_email_without_being_told():
    assert a.channel_for("9848012345") == "sms"
    assert a.channel_for("ravi@example.com") == "email"


def test_somebody_who_said_whatsapp_only_is_not_overridden_by_the_shape():
    assert a.channel_for("9848012345", "whatsapp") == "whatsapp"


# ── The disciplines cover both vocabularies ────────────────────────────

def test_every_catalogue_kind_has_somebody_who_can_take_it():
    """SERVICE_CATALOGUE's six keys. A kind with no discipline is never
    enqueued, so a gap here is a service that silently never dispatches."""
    for kind in ("ec", "survey", "site_visit", "title_opinion", "mutation", "patta_copy"):
        assert a.disciplines_for(kind), kind


def test_the_create_request_vocabulary_is_covered_too():
    """`create_request` writes survey/opinion/visit/fencing into the same
    column. A taxonomy that knew only the catalogue would miss half the rows."""
    for kind in ("survey", "opinion", "visit", "fencing"):
        assert a.disciplines_for(kind), kind


def test_a_document_writer_leads_for_an_ec_and_a_revenue_agent_follows():
    """Ordered by fit, so a caller that wants one can take the first."""
    assert [d.key for d in a.disciplines_for("ec")][:2] == ["writer", "agent"]


def test_a_kind_nothing_covers_is_desk_assign_only_rather_than_mis_routed():
    assert a.disciplines_for("other") == ()
    assert a.disciplines_for("") == ()


def test_a_title_opinion_is_state_grain_because_reading_papers_is_not_walking_land():
    """The most consequential line in the table: making the ₹4,500 service
    village-scoped would manufacture a scarcity that does not exist."""
    assert a.DISCIPLINES["advocate"].grain == "state"
    assert a.DISCIPLINES["surveyor"].grain == "village"


def test_the_first_five_labels_are_the_words_remember_person_already_writes():
    """_TICKET_ROLE hardcodes Surveyor, Caretaker, Advocate, Agent,
    Contractor. Growing a second vocabulary for the same five people is how
    one screen calls somebody an Advocate and the next calls them Legal."""
    for key, label in (("surveyor", "Licensed surveyor"), ("advocate", "Advocate"),
                       ("agent", "Revenue agent"), ("caretaker", "Caretaker")):
        assert a.DISCIPLINES[key].label == label


# ── Where a job is ─────────────────────────────────────────────────────

PARCEL = {"kind": "parcel", "village": "Peddapuram (R)",
          "mandal": "Peddapuram", "district": "Kakinada"}
PLOT = {"kind": "property", "village": "Kukatpally",
        "mandal": "Hyderabad", "district": "Rangareddy"}


def test_a_parcel_folds_to_a_key_and_keeps_a_printable_label():
    key, label = a.area_key_of(PARCEL)
    assert key == "p|peddapuram|peddapuram|kakinada"
    assert label == "Peddapuram (R), Peddapuram"


def test_a_property_is_flagged_differently_from_a_parcel():
    """This one character is what stops a surveyor who covers Peddapuram
    MANDAL being offered a plot in a Peddapuram LOCALITY of a city."""
    key, _ = a.area_key_of(PLOT)
    assert key.startswith("u|")
    assert a.area_slots(key)["slot2_level"] == "city"
    assert a.area_slots(a.area_key_of(PARCEL)[0])["slot2_level"] == "mandal"


def test_a_record_with_no_place_on_it_still_produces_a_key_that_matches_nothing():
    key, label = a.area_key_of({"kind": "parcel"})
    assert key == "p|||"
    assert label == ""


def test_widening_a_round_blanks_a_slot_rather_than_rewriting_the_query():
    """One candidate SQL statement in the whole system, so every round
    exercises the same code path."""
    key = "p|peddapuram|peddapuram|kakinada"
    assert a.area_slots(key, 0)["slot1"] == "peddapuram"
    assert a.area_slots(key, 1)["slot1"] == ""
    assert a.area_slots(key, 1)["slot2"] == "peddapuram"
    assert a.area_slots(key, 2)["slot2"] == ""
    assert a.area_slots(key, 2)["slot3"] == "kakinada"


def test_a_malformed_area_key_matches_nothing_instead_of_everything():
    """Every legacy row has area_key ''. If that fell through to empty slots
    that matched empty enrolled areas, every old ticket would offer itself to
    the entire roster the first time the dispatcher ran."""
    slots = a.area_slots("")
    assert slots["slot1"] == slots["slot2"] == slots["slot3"] == ""


# ── Who covers it ──────────────────────────────────────────────────────

KEY = "p|peddapuram|peddapuram|kakinada"


def test_a_village_level_enrolment_covers_that_village():
    assert a.covers(KEY, [{"level": "village", "name_key": "peddapuram"}])


def test_a_district_level_enrolment_covers_a_village_inside_it():
    assert a.covers(KEY, [{"level": "district", "name_key": "kakinada"}])


def test_a_neighbouring_village_does_not_cover_it():
    assert not a.covers(KEY, [{"level": "village", "name_key": "kothapalli"}])


def test_a_city_enrolment_does_not_cover_a_parcels_mandal_of_the_same_name():
    """The flag doing its job: 'Peddapuram' the city locality is not
    'Peddapuram' the rural mandal."""
    assert not a.covers(KEY, [{"level": "city", "name_key": "peddapuram"}])


def test_an_advocate_works_at_state_grain_and_ignores_the_place_entirely():
    assert a.covers(KEY, [{"level": "state", "name_key": "telangana"}], grain="state")
    assert not a.covers(KEY, [{"level": "district", "name_key": "kakinada"}], grain="state")


def test_somebody_enrolled_nowhere_covers_nothing():
    assert not a.covers(KEY, [])


# ── Who may be offered a job ───────────────────────────────────────────

ACTIVE = {"state": "active", "discipline_state": "on", "capacity": 3, "max_open": 3}


def test_an_active_associate_with_room_is_offered_the_job():
    ok, why = a.dispatchable(ACTIVE, "surveyor", 0)
    assert ok and why == ""


def test_somebody_newly_enrolled_can_be_offered_work_without_a_second_click():
    """A roster where the first offer needs an 'activate' step is a roster
    that is always one step out of date."""
    ok, _ = a.dispatchable({**ACTIVE, "state": "invited"}, "surveyor", 0)
    assert ok


def test_a_paused_associate_is_refused_with_a_word_the_desk_can_print():
    ok, why = a.dispatchable({**ACTIVE, "state": "paused"}, "surveyor", 0)
    assert not ok and why == "Paused"


def test_a_blocked_associate_is_refused_with_the_desks_own_reason():
    ok, why = a.dispatchable(
        {**ACTIVE, "state": "blocked", "state_reason": "Complaint from owner"},
        "surveyor", 0)
    assert not ok and why == "Complaint from owner"


def test_a_suspended_discipline_does_not_suspend_the_whole_person():
    """A surveyor whose licence lapsed is still a good photographer, which is
    why state lives on the pair and not on the associate."""
    blocked = {**ACTIVE, "discipline_state": "blocked",
               "discipline_reason": "Survey licence lapsed"}
    ok, why = a.dispatchable(blocked, "surveyor", 0)
    assert not ok and why == "Survey licence lapsed"


def test_somebody_at_capacity_is_refused_and_told_how_many_they_hold():
    ok, why = a.dispatchable(ACTIVE, "surveyor", 3)
    assert not ok and why == "Already holds 3"


def test_the_tighter_of_the_two_limits_wins():
    """`capacity` is per discipline and `max_open` is per person. Somebody who
    will take five surveys but only three jobs in total takes three."""
    ok, _ = a.dispatchable({**ACTIVE, "capacity": 5, "max_open": 2}, "surveyor", 2)
    assert not ok
    ok, _ = a.dispatchable({**ACTIVE, "capacity": 2, "max_open": 5}, "surveyor", 2)
    assert not ok


# ── The order they are offered in ──────────────────────────────────────

def test_whoever_holds_least_is_offered_first():
    out = a.rank([
        {"id": "b", "name": "Bhaskar", "open_jobs": 2, "last_offered_at": ""},
        {"id": "r", "name": "Ravi", "open_jobs": 0, "last_offered_at": ""},
    ])
    assert [c["id"] for c in out] == ["r", "b"]
    assert out[0]["rank"] == 1


def test_a_tie_goes_to_whoever_has_waited_longest_since_their_last_offer():
    """Without this the same person is offered everything and the rest of the
    roster learns that opening the message is a waste of time."""
    out = a.rank([
        {"id": "new", "name": "Anil", "open_jobs": 1, "last_offered_at": "2026-09-12T09:00:00"},
        {"id": "old", "name": "Bhaskar", "open_jobs": 1, "last_offered_at": "2026-08-01T09:00:00"},
    ])
    assert [c["id"] for c in out] == ["old", "new"]


def test_somebody_never_offered_anything_sorts_ahead_of_everyone():
    out = a.rank([
        {"id": "seen", "name": "Anil", "open_jobs": 0, "last_offered_at": "2026-08-01T09:00:00"},
        {"id": "fresh", "name": "Bhaskar", "open_jobs": 0, "last_offered_at": ""},
    ])
    assert out[0]["id"] == "fresh"
    assert "Never offered a job yet" in out[0]["why"]


def test_every_candidate_carries_its_own_sentences_so_they_can_be_frozen():
    """A score whose reasons are re-derived later can be quietly re-worded
    after the fact, which is exactly what an associate would dispute."""
    out = a.rank([{"id": "r", "name": "Ravi", "open_jobs": 2,
                   "last_offered_at": "", "area_label": "Kakinada"}])
    assert "2 in hand" in out[0]["why"]
    assert "Covers Kakinada" in out[0]["why"]


def test_ranking_an_empty_roster_is_an_empty_list_and_not_an_error():
    assert a.rank([]) == []


# ── How long an offer stays open ───────────────────────────────────────

def test_an_offer_window_is_hours_not_seconds():
    """A countdown in seconds is a decline machine aimed at somebody in a
    field or in court. The job itself takes twenty-one days."""
    assert a.ROUND_HOURS[0] >= 1


def test_the_first_round_closes_six_hours_later_inside_the_working_day():
    assert a.offer_deadline("2026-09-14T09:00:00", 0) == "2026-09-14T15:00:00"


def test_an_offer_made_at_night_closes_in_the_morning_not_at_four_am():
    """An offer that lands at 22:00 and expires at 04:00 was never really
    offered to anybody."""
    assert a.offer_deadline("2026-09-14T22:00:00", 0) == "2026-09-15T08:00:00"


def test_an_offer_that_would_close_before_dawn_is_pushed_to_opening_time():
    assert a.offer_deadline("2026-09-14T01:00:00", 0) == "2026-09-14T08:00:00"


def test_later_rounds_wait_longer():
    first = a.offer_deadline("2026-09-14T09:00:00", 0)
    second = a.offer_deadline("2026-09-14T09:00:00", 1)
    assert second > first


def test_a_round_past_the_last_one_still_answers_rather_than_raising():
    assert a.offer_deadline("2026-09-14T09:00:00", 99)


def test_an_unparseable_timestamp_answers_empty_rather_than_raising():
    """A ticket with a malformed status_at must not take the dispatcher down."""
    assert a.offer_deadline("not a time", 0) == ""
    assert a.offer_deadline("", 0) == ""


def test_after_the_last_round_the_job_goes_to_a_human():
    """Escalating to the desk is the strong lever at this scale. Past the
    district there is nobody else to widen to."""
    assert not a.rounds_exhausted(0)
    assert a.rounds_exhausted(len(a.ROUND_HOURS))


# ── What an offer says ─────────────────────────────────────────────────

def test_an_offer_names_the_work_and_the_place_and_nothing_that_identifies_the_owner():
    """It goes to several people and only one will take it."""
    lines = a.offer_lines("Boundary re-survey", "Peddapuram, Kakinada", 2030.0, 21,
                          "today 3pm")
    body = " ".join(lines)
    assert "Boundary re-survey" in body and "Peddapuram" in body
    for leaked in ("khata", "Sy ", "survey no", "owner"):
        assert leaked.lower() not in body.lower()


def test_an_offer_states_the_share_the_associate_actually_receives():
    assert "₹2,030" in " ".join(a.offer_lines("Survey", "Kakinada", 2030.0, 21, ""))


def test_an_offer_with_no_agreed_share_says_so_rather_than_printing_zero():
    assert "₹0" not in " ".join(a.offer_lines("Survey", "Kakinada", 0, 21, ""))


def test_an_offer_says_first_to_accept_takes_it_so_nobody_thinks_it_is_theirs():
    assert "First to accept" in " ".join(a.offer_lines("Survey", "Kakinada", 100, 7, ""))


def test_the_losers_are_not_told_they_were_too_slow():
    """A marketplace that makes opening the message feel like a loss stops
    getting opened."""
    assert "slow" not in a.TAKEN_BY_ANOTHER.lower()
    assert "Nothing is needed from you" in a.TAKEN_BY_ANOTHER


# ── The backstop is asserted, not assumed ──────────────────────────────

def test_the_two_indexes_that_prevent_double_assignment_are_required():
    """CREATE INDEX IF NOT EXISTS silently does nothing when an index of that
    name exists with a DIFFERENT definition, so a renamed predicate can leave
    the backstop absent while every statement reports success."""
    assert "uq_dispatch_one_accept" in a.REQUIRED_INDEXES
    assert "uq_dispatch_one_per_round" in a.REQUIRED_INDEXES


def test_a_missing_index_is_named_rather_than_counted():
    assert a.missing_indexes(["uq_associates_contact"]) == (
        "uq_dispatch_one_accept", "uq_dispatch_one_per_round")
    assert a.missing_indexes(a.REQUIRED_INDEXES) == ()


def test_every_ddl_statement_is_idempotent_because_it_runs_on_every_boot():
    for stmt in a.DDL:
        assert "IF NOT EXISTS" in stmt, stmt


def test_the_one_accepted_offer_index_is_scoped_to_liveness_not_history():
    """An unassign downgrades the prior accepted row to 'ended', so re-offering
    a job that came back must stay legal."""
    idx = [s for s in a.DDL if "uq_dispatch_one_accept" in s][0]
    assert "WHERE offer_state = 'accepted'" in idx


def test_the_per_round_index_excludes_the_winners_own_later_dispatches():
    """accept_ticket writes a purpose='accepted' row carrying the same
    associate_id at round 0; an index that did not exclude it would raise
    inside accept and roll back filing, ledger and trail."""
    idx = [s for s in a.DDL if "uq_dispatch_one_per_round" in s][0]
    assert "purpose = 'offer'" in idx
