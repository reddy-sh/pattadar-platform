"""The ticket machine, pinned.

This is the module that decides who gets paid, so the tests are written the
way the contract's worked examples are written: a rule per test, stated in the
name, asserted against a number somebody argued about. Where a figure appears
in the seed or on a screen, the figure here is that one — 2,900 for the
re-survey, 4,500 for the title opinion, the 8,600 the wallet strip has to add
up to — so a change that quietly re-prices a job fails here first.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import ticketing as t


# ── The module keeps its promise to be pure ─────────────────────────────

def test_the_module_touches_no_database_no_clock_and_no_entropy():
    # The whole point of a pure module is that it can be reasoned about and
    # tested without standing a service up. An import of psycopg, strawberry,
    # httpx, os, secrets or datetime is the beginning of the end of that, and
    # it always arrives as "just this once".
    src = (Path(__file__).resolve().parents[1] / "src" / "ticketing.py").read_text()
    for banned in ("import psycopg", "import strawberry", "import httpx",
                   "import os", "import secrets", "import datetime",
                   "from datetime", "datetime.now", "os.getenv"):
        assert banned not in src, banned


def test_the_doctests_are_part_of_the_suite():
    import doctest
    failed, ran = doctest.testmod(t, verbose=False)
    assert ran > 0
    assert failed == 0


# ── The status machine ──────────────────────────────────────────────────

def test_every_status_has_a_pip_a_word_and_a_colour():
    # A status that reaches a screen with no entry in one of these tables
    # renders as "Placed" and a hollow ring, which is a lie told quietly.
    for status in t.STATUSES:
        assert status in t.STATUS_STAGE
        assert status in t.STATUS_LABEL
        assert status in t.STATUS_STATE
        assert 0 <= t.STATUS_STAGE[status] <= 3
        assert t.STATUS_STATE[status] in ("good", "warn", "bad", "unknown")


def test_every_transition_names_statuses_and_actions_that_exist():
    for (status, action), (to, who) in t.TRANSITIONS.items():
        assert status in t.STATUSES, status
        assert action in t.ACTIONS, action
        assert to in t.STATUSES, to
        assert who and all(k in ("owner", "worker", "system") for k in who), who


def test_every_legal_move_is_allowed_for_the_actor_that_owns_it():
    for (status, action), (to, who) in t.TRANSITIONS.items():
        for actor in who:
            got = t.transition(status, action, actor)
            assert got["ok"], (status, action, actor, got)
            assert got["from"] == status and got["to"] == to
            assert got["stage"] == t.STATUS_STAGE[to]
            assert got["label"] == t.STATUS_LABEL[to]
            assert got["needs_you"] is (to in t.NEEDS_YOU)
            assert got["closed"] is (to in t.CLOSED)


def test_a_worker_cannot_accept_cancel_or_send_back():
    # The three decisions that spend the owner's money or close their job.
    # `worker` exists in the tuples for the portal that has not been built;
    # it must never have been handed one of these by accident.
    for action in ("accept", "cancel", "send_back", "dispatch", "withdraw"):
        for status in t.STATUSES:
            got = t.transition(status, action, "worker")
            assert not got["ok"], (status, action)


def test_the_desk_cannot_take_the_decisions_that_move_the_owners_money():
    # `system` is the Pattadar desk. It exists so an operator can put somebody
    # on a job and take them off again without impersonating the landowner —
    # not so it can spend his money. Accepting releases the payout and sending
    # back re-opens a delivered job; both are the owner's alone, forever.
    for action in ("accept", "send_back", "start", "deliver", "withdraw"):
        for status in t.STATUSES:
            got = t.transition(status, action, "system")
            assert not got["ok"], (status, action)
    # Cancel is the half-and-half one: the desk may bin a job nobody has
    # worked, but once a surveyor has stood on the land a human phones the
    # owner before anything is refunded.
    for status in ("placed", "sent", "assigned"):
        assert t.transition(status, "cancel", "system")["ok"], status
    for status in ("on_site", "submitted", "changes"):
        assert not t.transition(status, "cancel", "system")["ok"], status


def test_a_silent_surveyor_can_be_taken_off_the_job_without_killing_it():
    # The commonest real failure: he accepts, says he is on site, then stops
    # answering. Before this pair the only exit was cancel, which refunds the
    # owner and destroys a job he still wants done. Unassign returns the
    # ticket to `placed` — open, funded, offerable to somebody else.
    for actor in ("owner", "system"):
        got = t.transition("on_site", "unassign", actor)
        assert got["ok"], actor
        assert got["to"] == "placed"
        assert got["closed"] is False
        assert t.transition("assigned", "unassign", actor)["to"] == "placed"
    # The worker cannot resign from the job; somebody must be told first.
    assert not t.transition("on_site", "unassign", "worker")["ok"]


def test_an_accepted_or_cancelled_ticket_has_no_way_out():
    # A released payout cannot be un-released on any rail we will use, so the
    # remedy for a wrong acceptance is a fresh ticket, not a reopened one.
    for status in ("accepted", "cancelled"):
        assert t.can(status) == []
        assert t.can(status, "worker") == []
        assert t.can(status, "system") == []
        for action in t.ACTIONS:
            assert not t.transition(status, action)["ok"]


def test_illegal_moves_are_refused_with_the_reason_and_never_raise():
    assert t.transition("accepted", "send_back") == {
        "ok": False, "from": "accepted", "to": "", "why": "not a legal move"}
    assert t.transition("submitted", "accept", "worker")["why"] == "not yours to do"
    assert t.transition("nonsense", "accept")["why"] == "unknown status"
    # A few more that a screen could plausibly offer if `can` were ignored.
    assert not t.transition("placed", "deliver")["ok"]
    assert not t.transition("placed", "start")["ok"]
    assert not t.transition("sent", "start")["ok"]
    assert not t.transition("changes", "accept")["ok"]
    assert not t.transition("on_site", "assign")["ok"]
    assert not t.transition("cancelled", "dispatch")["ok"]


def test_can_lists_exactly_what_transition_will_allow():
    # The client draws its buttons from can(), so the two disagreeing means a
    # screen offering a move the server refuses.
    for status in t.STATUSES:
        for actor in ("owner", "worker", "system"):
            for action in t.ACTIONS:
                offered = action in t.can(status, actor)
                assert offered is t.transition(status, action, actor)["ok"]


def test_the_owners_buttons_on_a_submitted_ticket():
    assert t.can("submitted") == ["accept", "cancel", "dispatch", "send_back"]
    assert t.can("placed") == ["assign", "cancel", "dispatch"]
    assert t.can("sent", "worker") == ["assign"]


def test_a_row_with_no_status_is_read_through_its_stage_and_never_backfilled():
    # Seeds and main.py's legacy CRUD write `stage` and no status, and a
    # reseed puts them back — so this fallback is permanent.
    assert t.status_of("submitted", 2, False) == "submitted"
    assert t.status_of("", 0, False) == "placed"
    assert t.status_of("", 1, False) == "assigned"
    assert t.status_of("", 2, False) == "on_site"
    assert t.status_of("", 3, False) == "submitted"
    assert t.status_of("", 3, True) == "accepted"
    assert t.status_of("nonsense", 0, False) == "placed"
    # A stage outside 0..3 clamps rather than crashing a list of tickets.
    assert t.status_of("", 9, False) == "submitted"
    assert t.status_of("", -4, False) == "placed"
    assert t.status_of("", None, False) == "placed"


def test_only_a_submitted_ticket_is_waiting_on_you():
    assert [s for s in t.STATUSES if t.needs_you(s)] == ["submitted"]
    assert [s for s in t.STATUSES if t.is_closed(s)] == ["accepted", "cancelled"]


def test_the_four_pips_never_go_backwards_within_a_run():
    # placed -> assigned -> on_site -> submitted is what the Rail draws; a
    # send-back returns to the third pip on purpose, because the work is back
    # with the person who did it.
    assert [t.stage_of(s) for s in
            ("placed", "assigned", "on_site", "submitted")] == [0, 1, 2, 3]
    assert t.stage_of("changes") == 2
    assert t.stage_of("nope") == 0
    assert t.label_of("changes") == "Sent back"
    assert t.label_of("nope") == "Placed"
    assert t.state_of("nope") == "unknown"


# ── The reference number ────────────────────────────────────────────────

def test_a_seeded_id_keeps_the_reference_it_already_spells():
    assert t.ticket_ref("w360-PT-2094") == "PT-2094"
    assert t.ticket_ref("w360-PT-2103") == "PT-2103"


def test_any_other_id_folds_into_the_same_four_digit_shape():
    import re
    for tid in ("wr-a1b2c3d4e5f6", "wr-000000000000", "", "nothing-hex-here",
                "w360-p-214-2"):
        ref = t.ticket_ref(tid)
        assert re.fullmatch(r"PT-\d{4}", ref), (tid, ref)
    assert t.ticket_ref("wr-a1b2c3d4e5f6") == "PT-6622"
    assert t.ticket_ref("") == "PT-1000"
    # Derived, so it is stable: no counter to keep and nothing to migrate.
    assert t.ticket_ref("wr-deadbeef1234") == t.ticket_ref("wr-deadbeef1234")


# ── Money: the provider gate ────────────────────────────────────────────

def test_a_provider_named_without_its_credentials_falls_through_to_the_stub():
    # notify.py's rule, copied deliberately: half-sending is worse than not
    # sending, and worse still when it is money.
    assert t.provider_gate("razorpay", True) == "razorpay"
    assert t.provider_gate("razorpay", False) == "stub"
    assert t.provider_gate("", True) == "stub"
    assert t.provider_gate("stub", True) == "stub"
    assert t.provider_gate("  Razorpay  ", True) == "razorpay"
    assert t.is_live("razorpay") and not t.is_live("stub") and not t.is_live("")
    assert t.payment_status("stub") == "recorded"
    assert t.payment_status("razorpay") == "settled"


# ── Money: the arithmetic ───────────────────────────────────────────────

def test_the_split_always_adds_back_to_the_whole():
    # The fee is the remainder and is never computed independently, so no
    # rounding can leave a rupee unaccounted for on either side.
    for amount in (2900.0, 1200.0, 4500.0, 450.0, 2200.0, 1180.0, 0.01, 33.33):
        for share in (0.9, 0.85, 0.5, 1.0, 0.0):
            s = t.payee_split(amount, share)
            assert round(s["payout"] + s["fee"], 2) == round(amount, 2), (amount, share)
            assert s["payout"] >= 0 and s["fee"] >= 0
    assert t.payee_split(2900.0, 0.9) == {"payout": 2610.0, "fee": 290.0}
    assert t.payee_split(700.0, 0.9) == {"payout": 630.0, "fee": 70.0}
    assert t.payee_split(0.0, 0.9) == {"payout": 0.0, "fee": 0.0}


def test_a_share_outside_zero_to_one_is_clamped_not_obeyed():
    # A misconfigured PAYMENTS_PAYEE_SHARE must not pay a surveyor more than
    # was held, nor take money out of him.
    assert t.payee_split(1000.0, 1.5) == {"payout": 1000.0, "fee": 0.0}
    assert t.payee_split(1000.0, -1.0) == {"payout": 0.0, "fee": 1000.0}


def test_the_ledger_folds_into_five_buckets_with_no_sign_bugs():
    rows = [
        {"entry": "hold", "from_bucket": "wallet", "to_bucket": "held",
         "amount": 2900.0, "status": "recorded"},
    ]
    assert t.fold(rows) == {"outside": 0.0, "wallet": -2900.0, "held": 2900.0,
                            "payout": 0.0, "fee": 0.0}
    settled = rows + [
        {"entry": "release", "from_bucket": "held", "to_bucket": "payout",
         "amount": 2610.0, "status": "recorded"},
        {"entry": "fee", "from_bucket": "held", "to_bucket": "fee",
         "amount": 290.0, "status": "recorded"},
    ]
    assert t.fold(settled)["held"] == 0.0
    assert t.fold(settled)["payout"] == 2610.0
    assert t.fold(settled)["fee"] == 290.0
    assert t.held_for(settled) == 0.0
    assert t.held_for(rows) == 2900.0
    assert t.held_for([]) == 0.0


def test_a_failed_payment_is_a_fact_and_not_a_balance():
    rows = [
        {"entry": "hold", "from_bucket": "wallet", "to_bucket": "held",
         "amount": 2900.0, "status": "recorded"},
        {"entry": "hold", "from_bucket": "wallet", "to_bucket": "held",
         "amount": 9999.0, "status": "failed"},
    ]
    assert t.held_for(rows) == 2900.0


def test_the_seeded_ledger_adds_up_to_what_the_wallet_strip_prints():
    # The contract's own bucket check. If this drifts, the Wallet page's
    # "Set aside on jobs ₹8,600" is wrong and the e2e that asserts it fails
    # somewhere far away from the cause.
    ledger = [
        ("PT-2094", "hold", 2900.0), ("PT-2081", "hold", 1200.0),
        ("PT-2102", "hold", 4500.0), ("PT-2103", "hold", 450.0),
        ("PT-2103", "release", 405.0), ("PT-2103", "fee", 45.0),
        ("PT-2104", "hold", 2200.0), ("PT-2104", "return", 1500.0),
        ("PT-2104", "release", 630.0), ("PT-2104", "fee", 70.0),
    ]
    rows = [{"entry": e, "from_bucket": t.ENTRIES[e][0],
             "to_bucket": t.ENTRIES[e][1], "amount": a, "status": "recorded"}
            for _tid, e, a in ledger]
    b = t.fold(rows)
    assert b["held"] == 8600.0
    assert b["payout"] == 1035.0
    assert b["fee"] == 115.0
    assert b["payout"] + b["fee"] == 1150.0        # the strip's "Gone out"
    assert b["wallet"] == -9750.0


def test_every_entry_names_a_direction_between_two_real_buckets():
    for entry, (src, dst) in t.ENTRIES.items():
        assert src in t.BUCKETS and dst in t.BUCKETS and src != dst
        assert entry in t.ENTRY_LABEL


# ── Money: the happy path ───────────────────────────────────────────────

def test_accepting_releases_what_was_held_and_nothing_more():
    plan = t.accept_plan(2900.0, 0.9, "G. Srinivas", "wr-abc")
    assert [r["entry"] for r in plan] == ["release", "fee"]
    assert plan[0] == {"entry": "release", "from_bucket": "held",
                       "to_bucket": "payout", "amount": 2610.0,
                       "payee": "G. Srinivas", "note": "Released on acceptance",
                       "idempotency_key": "wr-abc:release:1"}
    assert plan[1]["amount"] == 290.0 and plan[1]["note"] == "Pattadar's share"
    # Held goes to zero and nothing is invented: the plan moves exactly what
    # was set aside.
    assert sum(r["amount"] for r in plan) == 2900.0
    assert t.held_for([{"entry": "hold", "from_bucket": "wallet",
                        "to_bucket": "held", "amount": 2900.0,
                        "status": "recorded"}]
                      + [dict(r, status="recorded") for r in plan]) == 0.0


def test_a_ticket_nobody_funded_can_still_be_accepted():
    # Refusing to accept unfunded work would strand every ticket placed
    # before the owner pressed "Set aside", which is most of them.
    assert t.accept_plan(0.0) == []
    assert t.accept_plan(-5.0, 0.9, "X", "wr-abc") == []


def test_setting_money_aside_is_one_row_and_zero_is_none():
    assert t.hold_plan(2900.0, "wr-abc") == [
        {"entry": "hold", "from_bucket": "wallet", "to_bucket": "held",
         "amount": 2900.0, "payee": "", "note": "Set aside for this job",
         "idempotency_key": "wr-abc:hold:1"}]
    assert t.hold_plan(0.0, "wr-abc") == []
    assert t.hold_plan(-1.0, "wr-abc") == []


# ── Money: the reject-refund path ───────────────────────────────────────

def test_cancelling_gives_back_first_and_settles_second():
    # The pool is autocommit, so a crash between two of these rows must leave
    # the money with the owner and not with a stranger. The order is the
    # safety property, not a formatting preference.
    plan = t.cancel_plan(2900.0, 700.0, 0.9, "G. Srinivas", "wr-abc")
    assert [r["entry"] for r in plan] == ["return", "release", "fee"]
    assert plan[0]["amount"] == 2200.0 and plan[0]["to_bucket"] == "wallet"
    assert plan[1]["amount"] == 630.0 and plan[1]["payee"] == "G. Srinivas"
    assert plan[2]["amount"] == 70.0
    assert sum(r["amount"] for r in plan) == 2900.0


def test_cancelling_with_nothing_settled_returns_the_whole_hold():
    plan = t.cancel_plan(2900.0, 0.0, 0.9, "", "wr-abc")
    assert plan == [{"entry": "return", "from_bucket": "held",
                     "to_bucket": "wallet", "amount": 2900.0, "payee": "",
                     "note": "Given back on cancellation",
                     "idempotency_key": "wr-abc:return:1"}]
    assert t.cancel_plan(0.0) == []


def test_a_cancellation_can_never_settle_more_than_is_held():
    # The dialog's number input has a max attribute; an input attribute is a
    # suggestion, and this is the rule.
    plan = t.cancel_plan(2200.0, 99999.0, 0.9, "B. Ravi", "wr-x")
    assert sum(r["amount"] for r in plan) == 2200.0
    assert not any(r["entry"] == "return" for r in plan)
    assert t.cancel_plan(2200.0, -50.0, 0.9, "B. Ravi", "wr-x")[0]["amount"] == 2200.0


def test_the_seeded_cancellation_is_the_one_the_ledger_shows():
    # PT-2104: ₹2,200 held, ₹700 settled for the trips, ₹1,500 back.
    plan = t.cancel_plan(2200.0, 700.0, 0.9, "B. Ravi", "w360-PT-2104")
    assert [(r["entry"], r["amount"]) for r in plan] == [
        ("return", 1500.0), ("release", 630.0), ("fee", 70.0)]


def test_a_plan_addresses_each_entry_once_so_a_retry_completes_it():
    # The unique index on idempotency_key is the atomicity: a double-tapped
    # Accept finishes a half-written settlement rather than paying twice.
    for plan in (t.accept_plan(2900.0, 0.9, "G", "wr-abc"),
                 t.cancel_plan(2900.0, 700.0, 0.9, "G", "wr-abc"),
                 t.hold_plan(2900.0, "wr-abc")):
        keys = [r["idempotency_key"] for r in plan]
        assert len(keys) == len(set(keys)), keys
        assert all(k.startswith("wr-abc:") for k in keys)


# ── Money: the copy ─────────────────────────────────────────────────────

def test_the_money_headline_reads_the_ticket_it_is_on():
    assert (t.money_headline(2900.0, 2900.0, 0.0, 0.0, "submitted", "G. Srinivas")
            == "₹2,900 set aside for this job")
    assert (t.money_headline(2900.0, 0.0, 2610.0, 0.0, "accepted", "G. Srinivas")
            == "₹2,610 recorded as owed to G. Srinivas · ₹290 to Pattadar")
    assert (t.money_headline(2900.0, 0.0, 0.0, 2900.0, "cancelled", "")
            == "₹2,900 given back to your wallet")
    assert (t.money_headline(2900.0, 0.0, 0.0, 0.0, "placed", "")
            == "Nothing set aside yet")
    # The part-settled cancellation, which is the only case with both.
    assert (t.money_headline(2200.0, 0.0, 630.0, 1500.0, "cancelled", "B. Ravi")
            == "₹630 recorded as owed to B. Ravi · ₹1,500 given back")
    # No payee: the sentence still has to make sense.
    assert "the person who did the work" in t.money_headline(
        2900.0, 0.0, 2610.0, 0.0, "accepted", "")


def test_no_money_copy_ever_claims_a_charge_that_did_not_happen():
    # The provider is a stub. A receipt for a payment that did not happen is
    # a forgery, and the guard in ux-guards.ts checks the pages; this checks
    # the strings the pages render. "Escrow" is banned outright: Pattadar is
    # not a licensed escrow agent, and what a gateway offers is a withheld
    # payout.
    banned = ("paid", "charged", "debited", "payment successful",
              "transaction id", "utr", "rrn", "escrow")
    figures = [
        t.money_headline(2900.0, 2900.0, 0.0, 0.0, "submitted", "G. Srinivas"),
        t.money_headline(2900.0, 0.0, 2610.0, 0.0, "accepted", "G. Srinivas"),
        t.money_headline(2900.0, 0.0, 0.0, 2900.0, "cancelled", ""),
        t.money_headline(2200.0, 0.0, 630.0, 1500.0, "cancelled", "B. Ravi"),
        t.money_headline(0.0, 0.0, 0.0, 0.0, "placed", ""),
    ] + list(t.ENTRY_LABEL.values())
    for line in figures:
        low = line.lower()
        for word in banned:
            assert word not in low, (word, line)

    # The honesty lines are the one place the word may appear, and only as a
    # denial: "Recorded, not charged" is the whole point of them.
    for line in (t.money_honesty("stub", "G. Srinivas"), t.money_honesty("stub"),
                 t.money_honesty("razorpay", "G. Srinivas"),
                 t.WALLET_STUB_NOTICE):
        low = line.lower()
        for word in ("paid", "debited", "payment successful", "transaction id",
                     "utr", "rrn", "escrow"):
            assert word not in low, (word, line)
        for claim in ("charge", "taken", "sent"):
            i = low.find(claim)
            while i >= 0:
                before = low[max(0, i - 40):i]
                assert "not " in before or "nothing has been " in before, (claim, line)
                i = low.find(claim, i + 1)


def test_the_honesty_line_changes_the_day_the_provider_does():
    assert t.money_honesty("stub", "G. Srinivas") == (
        "Recorded, not charged. Paying online is not switched on yet — settle"
        " it with G. Srinivas directly for now.")
    assert "with them directly" in t.money_honesty("stub")
    live = t.money_honesty("razorpay", "G. Srinivas")
    assert live == ("We don't release it to G. Srinivas until you accept what"
                    " came back.")
    assert "not charged" not in live


# ── Dispatch: the token ─────────────────────────────────────────────────

def test_a_token_is_minted_from_the_callers_entropy_and_never_its_own():
    a = t.mint_token(bytes(range(32)))
    assert len(a["token"]) == 43 and len(a["token_hash"]) == 64
    assert a["token_tail"] == a["token"][-4:]
    # Deterministic: the same bytes give the same token, which is what makes
    # a pure module testable and is why `secrets` is the caller's job.
    assert t.mint_token(bytes(range(32))) == a
    assert t.mint_token(bytes(range(1, 33))) != a
    # The stored halves must not give the token back.
    assert a["token"] not in a["token_hash"]


def test_a_tampered_token_does_not_verify():
    a = t.mint_token(bytes(range(32)))
    assert t.verify_token(a["token"], a["token_hash"]) is True
    assert t.verify_token("nope", a["token_hash"]) is False
    # One character changed — the realistic tamper, not a wholesale forgery.
    swapped = ("A" if a["token"][0] != "A" else "B") + a["token"][1:]
    assert t.verify_token(swapped, a["token_hash"]) is False
    assert t.verify_token(a["token"][:-1], a["token_hash"]) is False
    # An empty token against an empty hash must not sail through.
    assert t.verify_token("", "") is False
    assert t.verify_token("", a["token_hash"]) is False
    assert t.verify_token(a["token"], "") is False


# ── Dispatch: who it reaches ────────────────────────────────────────────

def test_an_at_sign_means_email_and_everything_else_is_a_phone():
    assert t.channel_for("g.sri@gmail.com") == "email"
    assert t.channel_for("+91 98480 12345") == "whatsapp"
    assert t.channel_for("9848012345", "sms") == "sms"
    assert t.channel_for("g.sri@gmail.com", "email") == "email"
    assert t.channel_for("", "email") == ""


def test_asking_to_email_a_phone_number_is_refused_not_re_routed():
    # Silently sending an SMS to somebody who asked for email is how a
    # message arrives on a channel the owner did not choose and cannot find.
    assert t.channel_for("+91 98480 12345", "email") == ""
    assert t.channel_for("g.sri@gmail.com", "whatsapp") == ""
    assert t.channel_for("g.sri@gmail.com", "sms") == ""
    assert t.channel_for("+91 98480 12345", "auto") == "whatsapp"


def test_a_masked_contact_is_recognisable_and_unusable():
    assert t.mask_contact("g.srinivas@gmail.com") == "g.sr…@gmail.com"
    assert t.mask_contact("+919848012345") == "+91 98••• ••345"
    assert t.mask_contact("+91 98480 12345") == "+91 98••• ••345"
    assert t.mask_contact("9848012345") == "98•••345"
    assert t.mask_contact("ab@x.com") == "ab…@x.com"
    assert t.mask_contact("") == ""
    # Nothing masked may still contain the whole thing.
    assert "9848012345" not in t.mask_contact("+919848012345")


# ── Dispatch: what goes out ─────────────────────────────────────────────

INVITE = {"ref": "PT-2094", "service": "Boundary re-survey",
          "place": "Peddapuram", "extent": "2.5 Ac", "fee": 2900.0,
          "due_date": "20/08/2026", "person_name": "G. Srinivas",
          "purpose": "invite"}


def test_the_sms_is_the_contracts_sms_to_the_character():
    r = t.render_dispatch("sms", {"ref": "PT-2094",
                                  "service": "Boundary re-survey",
                                  "place": "Peddapuram", "fee": 2900.0,
                                  "due_date": "20/08/2026", "purpose": "invite"})
    assert r["body"] == ("Pattadar PT-2094: Boundary re-survey wanted at"
                         " Peddapuram. Rs2900 on acceptance, by 20/08/2026."
                         " Reply to this number. -PTDR")
    assert r["subject"] == "" and r["truncated"] is False
    assert r["template"] == "" and r["params"] == []
    assert t.sms_ok(r["body"])["fits"]


def test_an_sms_is_ascii_because_one_rupee_sign_costs_a_second_segment():
    # GSM-7 has no ₹. A single non-ASCII character drops the segment from 160
    # characters to 70, so the message that was one becomes two, costs twice
    # and can arrive out of order.
    for purpose in ("invite", "nudge", "changes", "withdrawn", "accepted"):
        r = t.render_dispatch("sms", dict(INVITE, purpose=purpose,
                                          note="Bring the 2019 sketch — it is 2.5 Ac"))
        assert t.sms_ok(r["body"])["ascii"], (purpose, r["body"])
        assert len(r["body"]) <= t.SMS_LIMIT, (purpose, len(r["body"]))
        assert "₹" not in r["body"] and "—" not in r["body"]
        assert r["body"].endswith("Reply to this number. -PTDR")
        assert "PT-2094" in r["body"]


def test_a_long_sms_drops_its_optional_parts_right_to_left():
    long_note = ("Bring the 2019 sketch and meet the neighbour on the east"
                 " side before you start walking the marks.")
    r = t.render_dispatch("sms", dict(INVITE, note=long_note))
    assert len(r["body"]) <= t.SMS_LIMIT and r["truncated"] is False
    # The note went first; the extent, the date and the place survived.
    assert "2019 sketch" not in r["body"]
    assert "2.5 Ac" in r["body"] and "20/08/2026" in r["body"]
    assert "Peddapuram" in r["body"]


def test_an_sms_that_cannot_fit_even_stripped_says_it_was_cut():
    r = t.render_dispatch("sms", {"ref": "PT-2094", "service": "X" * 400,
                                  "purpose": "invite"})
    assert r["truncated"] is True
    assert len(r["body"]) <= t.SMS_LIMIT
    # The reference and the way back are what is never dropped: a message
    # nobody can answer or quote is not worth sending at all.
    assert "PT-2094" in r["body"]
    assert r["body"].endswith("Reply to this number. -PTDR")


def test_an_owners_own_message_keeps_its_words_and_drops_the_furniture():
    r = t.render_dispatch("sms", dict(INVITE, purpose="message",
                                      note="Come Tuesday instead, the gate is locked Monday."))
    assert "Come Tuesday instead" in r["body"]
    assert len(r["body"]) <= t.SMS_LIMIT
    long_r = t.render_dispatch("sms", {"ref": "PT-2094", "service": "Site visit",
                                       "purpose": "message", "note": "N" * 400})
    assert long_r["truncated"] is True and len(long_r["body"]) <= t.SMS_LIMIT
    assert "NNNN" in long_r["body"]


def test_the_email_carries_the_six_things_and_no_link():
    r = t.render_dispatch("email", dict(INVITE, note="The gate is locked.",
                                        answers=[("Survey number", "214/2"),
                                                 ("Why", "for the bank")]))
    assert r["subject"] == "Boundary re-survey at Peddapuram — PT-2094"
    body = r["body"]
    assert body.startswith("<p>Namaste G. Srinivas,</p>")
    assert "A landowner using Pattadar has asked for a Boundary re-survey" in body
    assert "Survey number: 214/2" in body and "Why: for the bank" in body
    assert "Peddapuram · 2.5 Ac" in body and "20/08/2026" in body
    assert "₹2,900, paid when the owner accepts what you send." in body
    assert "The gate is locked." in body
    assert "The owner can withdraw this request at any time." in body
    assert body.rstrip().endswith("<p>— Pattadar · PT-2094</p>")
    assert r["template"] == "" and r["params"] == []


def test_no_message_on_any_channel_ever_carries_a_link():
    # The whole reason create_request refused to be a hand-off to WhatsApp: a
    # link the owner forwards cannot be revoked, tracked or answered for. The
    # token columns exist for a screen that has not been built; nothing is
    # sent until it is.
    import re
    for channel in ("email", "whatsapp", "sms"):
        for purpose in ("invite", "nudge", "changes", "withdrawn", "accepted",
                        "message"):
            r = t.render_dispatch(channel, dict(INVITE, purpose=purpose,
                                                note="see http bits"))
            assert not re.search(r"https?://", r["body"]), (channel, purpose)
            assert "token" not in r["body"].lower()


def test_an_empty_field_omits_its_whole_block_rather_than_printing_a_stub():
    # An email with an empty "Where" line reads like a form the sender could
    # not be bothered to fill in, and a surveyor deletes it.
    r = t.render_dispatch("email", {"ref": "PT-2101", "service": "Encumbrance"
                                    " Certificate", "purpose": "invite"})
    assert "<strong>Where</strong>" not in r["body"]
    assert "<strong>By</strong>" not in r["body"]
    assert "<strong>Fee</strong>" not in r["body"]
    assert "What is being asked" not in r["body"]
    assert r["body"].startswith("<p>Namaste,</p>")
    assert r["subject"] == "Encumbrance Certificate — PT-2101"


def test_whatsapp_carries_the_template_a_live_meta_send_needs():
    r = t.render_dispatch("whatsapp", INVITE)
    assert r["template"] == "pattadar_service_v1"
    assert r["params"] == ["G. Srinivas", "Boundary re-survey", "Peddapuram",
                           "₹2,900", "20/08/2026", "PT-2094"]
    assert r["subject"] == ""
    # The emoji are deliberate: this lands in a chat window beside family
    # messages, and a plain block of text there reads as a scam.
    assert "\U0001f4cd Peddapuram · 2.5 Ac" in r["body"]
    assert r["body"].startswith("Namaste G. Srinivas \U0001f64f")
    assert r["body"].rstrip().endswith("Ref PT-2094")
    nameless = t.render_dispatch("whatsapp", dict(INVITE, person_name=""))
    assert nameless["params"][0] == "there"
    assert nameless["body"].startswith("Namaste \U0001f64f")


def test_each_purpose_has_its_own_opening_sentence():
    openers = {
        "invite": "A landowner using Pattadar has asked for a",
        "nudge": "Any news on the Boundary re-survey at Peddapuram?",
        "changes": "has looked at what came back and asked for changes",
        "withdrawn": "has withdrawn this request. Nothing more is needed.",
        "accepted": "has accepted the work. Thank you.",
    }
    for purpose, text in openers.items():
        r = t.render_dispatch("email", dict(INVITE, purpose=purpose))
        assert text in r["body"], purpose
    # A message is the owner's own words; a preamble in front of them reads
    # like a form letter.
    msg = t.render_dispatch("email", dict(INVITE, purpose="message",
                                          note="Come Tuesday."))
    assert "A landowner using Pattadar" not in msg["body"]
    assert "Come Tuesday." in msg["body"]


def test_an_unknown_channel_renders_nothing_rather_than_guessing():
    r = t.render_dispatch("pigeon", INVITE)
    assert r == {"channel": "pigeon", "subject": "", "body": "",
                 "template": "", "params": [], "truncated": False}


def test_sms_ok_measures_what_a_gateway_measures():
    assert t.sms_ok("Pattadar PT-2094: Boundary re-survey. Reply to this"
                    " number. -PTDR") == {"len": 65, "ascii": True, "fits": True}
    assert t.sms_ok("₹2900")["ascii"] is False
    assert t.sms_ok("₹2900")["fits"] is False
    assert t.sms_ok("a" * 161)["fits"] is False
    assert t.sms_ok("a" * 160)["fits"] is True
    assert t.sms_ok("")["fits"] is True


# ── The filing plan ─────────────────────────────────────────────────────

TICKET = {"id": "w360-PT-2094", "kind": "survey", "assignee": "G. Srinivas"}
PARCEL = {"id": "w360-p-214-2", "kind": "parcel",
          "boundary": "16.8412,80.1233;16.8419,80.1251;16.8404,80.1259"}
PROPERTY = {"id": "w360-pr-1", "kind": "property", "boundary": ""}


def test_a_paper_lands_on_the_shelf_the_service_implies():
    plan = t.filing_plan(
        {"kind": "paper", "label": "Re-survey sketch", "file_ref": "node-1",
         "file_name": "FMB-214-resurvey.pdf", "mime_type": "application/pdf",
         "size_bytes": 1_412_000, "file_as": ""}, TICKET, PARCEL)
    assert plan["ok"] and plan["op"] == "insert" and plan["table"] == "documents"
    assert plan["id_prefix"] == "doc-"
    v = plan["values"]
    # 'map' is load-bearing beyond display: _fmb_sheet selects shelf='map', so
    # this is what makes W04's sheet card appear on the record.
    assert v["shelf"] == "map" and v["doc_type"] == "map"
    assert v["name"] == "Re-survey sketch"
    assert v["subtitle"] == "From PT-2094 · G. Srinivas"
    # documents.parcel_id is NOT NULL with no default, and add_paper writes
    # the record id into both columns.
    assert v["record_id"] == v["parcel_id"] == "w360-p-214-2"
    assert v["source"] == "order" and v["order_ref"] == "w360-PT-2094"
    assert plan["summary"] == "Filed on the Map shelf"
    assert plan["sort_over"] == {"table": "documents", "column": "record_id",
                                 "value": "w360-p-214-2"}


def test_the_owner_can_overrule_the_shelf_a_service_implies():
    plan = t.filing_plan({"kind": "paper", "label": "Patta copy",
                          "file_ref": "n", "file_as": "revenue"},
                         TICKET, PARCEL)
    assert plan["values"]["shelf"] == "revenue"
    assert plan["summary"] == "Filed on the Revenue record shelf"
    # A shelf nobody has heard of files as unsorted rather than inventing one.
    junk = t.filing_plan({"kind": "paper", "label": "x", "file_ref": "n",
                          "file_as": "nonsense"}, TICKET, PARCEL)
    assert junk["values"]["shelf"] == "unsorted"


def test_both_kind_vocabularies_reach_a_shelf():
    # work_requests.kind carries SERVICE_CATALOGUE keys, create_request's
    # survey/opinion/visit/fencing and the legacy 'errand'. They land in the
    # same column, so one lookup has to cope with all three.
    for kind, shelf in (("survey", "map"), ("ec", "search"),
                        ("title_opinion", "title"), ("opinion", "title"),
                        ("mutation", "revenue"), ("patta_copy", "revenue"),
                        ("site_visit", "unsorted"), ("visit", "unsorted"),
                        ("fencing", "unsorted"), ("errand", "unsorted"),
                        ("never-heard-of-it", "unsorted")):
        plan = t.filing_plan({"kind": "paper", "label": "x", "file_ref": "n"},
                             {"id": "wr-1", "kind": kind, "assignee": ""}, PARCEL)
        assert plan["values"]["shelf"] == shelf, kind


def test_a_relayed_photo_claims_no_coordinates_and_no_photographer():
    plan = t.filing_plan(
        {"kind": "photo", "label": "Corner A — stone found", "file_ref": "n-2",
         "file_name": "corner-a.jpg", "file_as": "boundary",
         "submitted_at": "12/08/2026", "submitted_by": "G. Srinivas"},
        TICKET, PARCEL)
    v = plan["values"]
    assert plan["table"] == "parcel_photos" and v["parcel_id"] == "w360-p-214-2"
    assert v["category"] == "boundary" and v["caption"] == "Corner A — stone found"
    # The gallery renders captured_by as proof and verified as a badge. The
    # owner typed the surveyor's name; that is not proof, so none is claimed.
    assert v["captured_by"] == ""
    assert v["verified"] is False
    assert v["latitude"] == 0 and v["longitude"] == 0
    assert v["accuracy_m"] == 0 and v["device_clock_ok"] is False
    assert v["is_cover"] is False and v["sha256"] == ""
    assert v["source"] == "order" and v["order_ref"] == "w360-PT-2094"
    assert plan["summary"] == "Added to the record's photos"
    assert "not the person who stood in the field" in plan["why"]


def test_a_property_photo_goes_to_the_property_table():
    plan = t.filing_plan({"kind": "photo", "label": "Front", "file_ref": "n"},
                         TICKET, PROPERTY)
    assert plan["table"] == "property_photos"
    assert plan["values"]["property_id"] == "w360-pr-1"
    assert "parcel_id" not in plan["values"]
    assert plan["sort_over"]["column"] == "property_id"


def test_an_accepted_outline_replaces_the_one_on_file_and_keeps_it():
    plan = t.filing_plan(
        {"kind": "boundary", "label": "The corrected outline",
         "payload": '{"ring": "16.8412,80.1233;16.8419,80.1251;'
                    '16.8404,80.1259;16.8397,80.1240"}'},
        TICKET, PARCEL)
    assert plan["ok"] and plan["op"] == "update" and plan["table"] == "parcels"
    assert plan["key"] == "id" and plan["key_value"] == "w360-p-214-2"
    # The caller reads prev_column into ticket_deliverables.filed_prev before
    # writing, so an overwrite is recoverable without a migration.
    assert plan["prev_column"] == "boundary"
    assert plan["values"]["boundary"] == (
        "16.841200,80.123300;16.841900,80.125100;"
        "16.840400,80.125900;16.839700,80.124000")
    assert plan["summary"] == "Replaced the outline on file · 4 corners"
    assert plan["sort_over"] is None
    assert t.filing_plan({"kind": "boundary", "payload": '{"ring": "1,1;2,2;3,3"}'},
                         TICKET, PROPERTY)["table"] == "properties"


def test_a_feature_from_a_visit_keeps_the_state_that_was_reported():
    plan = t.filing_plan(
        {"kind": "feature", "label": "Bore well", "note": "Casing cracked.",
         "payload": '{"condition_state": "warn", "category": "water",'
                    ' "spec": "6 inch", "icon": "bore"}'},
        TICKET, PARCEL)
    v = plan["values"]
    assert plan["table"] == "land_features" and plan["id_prefix"] == "lf-"
    # add_feature writes the record's own kind here; the seeds write the
    # literal 'record'. The resolver is the one to match.
    assert v["entity_type"] == "parcel" and v["entity_id"] == "w360-p-214-2"
    assert v["condition_state"] == "warn" and v["category"] == "water"
    assert v["spec"] == "6 inch" and v["icon"] == "bore"
    assert v["note"] == "Casing cracked."
    # Nothing was stood next to, so the card says so rather than drawing a pin
    # at the equator.
    assert v["lat"] == 0 and v["lon"] == 0 and v["pin_label"] == "No pin yet"
    assert v["order_ref"] == "w360-PT-2094"
    assert plan["summary"] == "Added 'Bore well' to what stands on this land"


def test_a_feature_with_a_pin_loses_the_no_pin_label():
    plan = t.filing_plan({"kind": "feature", "label": "Gate",
                          "payload": '{"lat": 16.84, "lon": 80.12}'},
                         TICKET, PARCEL)
    assert plan["values"]["pin_label"] == ""
    assert plan["values"]["lat"] == 16.84


def test_a_condition_nobody_reported_is_unknown_and_never_good():
    # A green dot on the strength of a word being typed is an assurance the
    # app invented for itself.
    for state in ("", "excellent", None, "GOOD"):
        plan = t.filing_plan(
            {"kind": "feature", "label": "Fence",
             "payload": '{"condition_state": %s}' % (
                 "null" if state is None else '"%s"' % state)},
            TICKET, PARCEL)
        assert plan["values"]["condition_state"] == "unknown", state
    for state in t.FEATURE_STATES:
        plan = t.filing_plan({"kind": "feature", "label": "Fence",
                              "payload": '{"condition_state": "%s"}' % state},
                             TICKET, PARCEL)
        assert plan["values"]["condition_state"] == state


def test_a_deliverable_that_cannot_be_filed_is_refused_and_left_on_the_ticket():
    cases = [
        ({"kind": "paper", "label": "x", "file_ref": ""},
         "a paper with no file cannot be filed"),
        ({"kind": "photo", "label": "x", "file_ref": "  "},
         "a photo with no file cannot be filed"),
        ({"kind": "boundary", "payload": '{"ring": "16.8,80.1;16.9,80.2"}'},
         "that outline is not a closed shape — fewer than three usable corners"),
        ({"kind": "boundary", "payload": "not json at all"},
         "that outline is not a closed shape — fewer than three usable corners"),
        ({"kind": "feature", "label": "   ", "payload": "{}"},
         "a feature with no name cannot be filed"),
        ({"kind": "note", "label": "x"},
         "that is not something this system knows how to file"),
        ({"kind": "", "label": "x"},
         "that is not something this system knows how to file"),
    ]
    for deliverable, why in cases:
        plan = t.filing_plan(deliverable, TICKET, PARCEL)
        assert plan == {"ok": False, "why": why}, deliverable


def test_filing_a_plan_never_raises_on_rubbish():
    for bad in ({}, {"kind": "paper"}, {"kind": "feature", "payload": None},
                {"kind": "photo", "file_ref": "n", "size_bytes": "big"}):
        assert isinstance(t.filing_plan(bad, {}, {}), dict)
    assert isinstance(t.filing_plan(None, None, None), dict)


def test_the_review_card_says_where_a_thing_will_land_before_it_lands():
    assert t.goes_to("paper", "map") == "Papers · Map shelf"
    assert t.goes_to("paper", "", "ec") == "Papers · Search & tax shelf"
    assert t.goes_to("paper", "", "") == "Papers · Unsorted shelf"
    assert t.goes_to("photo", "boundary") == "The record's photos · Boundary"
    assert t.goes_to("photo", "") == "The record's photos · General"
    assert t.goes_to("boundary", "") == "The outline on file"
    assert t.goes_to("feature", "") == "What stands on this land"
    assert t.goes_to("nonsense", "") == ""


def test_only_papers_and_photos_offer_a_choice_of_where_to_file():
    assert t.file_targets("paper")[0] == ("title", "Title")
    assert [v for v, _ in t.file_targets("paper")] == list(t.SHELVES)
    assert [v for v, _ in t.file_targets("photo")] == list(t.PHOTO_CATEGORIES)
    # A boundary and a feature have exactly one place to go, so the select is
    # not drawn at all rather than drawn with one option.
    assert t.file_targets("boundary") == []
    assert t.file_targets("feature") == []
    assert t.file_targets("") == []


def test_every_offered_target_is_one_filing_plan_will_accept():
    for value, _label in t.file_targets("paper"):
        plan = t.filing_plan({"kind": "paper", "label": "x", "file_ref": "n",
                              "file_as": value}, TICKET, PARCEL)
        assert plan["values"]["shelf"] == value
    for value, _label in t.file_targets("photo"):
        plan = t.filing_plan({"kind": "photo", "label": "x", "file_ref": "n",
                              "file_as": value}, TICKET, PARCEL)
        assert plan["values"]["category"] == value


# ── Small shared helpers ────────────────────────────────────────────────

def test_a_ring_that_is_wrong_in_a_way_nobody_can_see_is_refused():
    # web360._ring's rule and its reason: a boundary drawn from three of four
    # corners looks right, and is not.
    assert t.parse_ring("17.1,80.1;17.2,80.2;17.2,80.3") == [
        (17.1, 80.1), (17.2, 80.2), (17.2, 80.3)]
    assert t.parse_ring("17.1,80.1;17.2,80.2") == []          # two enclose nothing
    assert t.parse_ring("rubbish") == []
    assert t.parse_ring("") == []
    assert t.parse_ring("17.1,80.1;bad;17.2,80.3") == []
    assert t.parse_ring("17.1,80.1;17.2,;17.2,80.3") == []
    assert t.parse_ring("91.0,80.1;17.2,80.2;17.2,80.3") == []   # off the planet
    assert t.parse_ring("17.1,181.0;17.2,80.2;17.2,80.3") == []
    assert t.parse_ring("nan,80.1;17.2,80.2;17.2,80.3") == []
    # (0,0) is the Gulf of Guinea, and it is what an unread coordinate column
    # serialises to. It is never a corner of anybody's field.
    assert t.parse_ring("0,0;17.2,80.2;17.2,80.3") == []


def test_a_closed_ring_is_accepted_and_stored_open():
    # The column stores corners; the repeated closing corner is a GeoJSON
    # rule, not a survey fact.
    closed = "17.1,80.1;17.2,80.2;17.2,80.3;17.1,80.1"
    assert t.parse_ring(closed) == [(17.1, 80.1), (17.2, 80.2), (17.2, 80.3)]
    # A closing repeat that leaves only two distinct corners still encloses
    # nothing.
    assert t.parse_ring("17.1,80.1;17.2,80.2;17.1,80.1") == []
    assert t.parse_ring("17.1,80.1;17.1,80.1;17.2,80.2;17.2,80.3") == [
        (17.1, 80.1), (17.2, 80.2), (17.2, 80.3)]


def test_a_ring_is_written_back_at_six_decimals():
    assert t.format_ring([(17.1, 80.1), (17.2, 80.2), (17.2, 80.3)]) == (
        "17.100000,80.100000;17.200000,80.200000;17.200000,80.300000")
    assert t.format_ring([]) == ""
    # Round-trips: what filing_plan writes must parse back to what it read.
    text = "16.8412,80.1233;16.8419,80.1251;16.8404,80.1259"
    assert t.parse_ring(t.format_ring(t.parse_ring(text))) == t.parse_ring(text)


def test_rupees_are_grouped_the_indian_way_on_every_screen():
    assert t.in_group(1234567) == "12,34,567"
    assert t.in_group(2900) == "2,900"
    assert t.in_group(100) == "100"
    assert t.in_group(-1234567) == "-12,34,567"
    assert t.inr_short(2900) == "₹2,900"
    assert t.inr_short(18400) == "₹18,400"
    assert t.inr_short(4200000) == "₹42.0 L"
    assert t.inr_short(14000000) == "₹1.40 Cr"
    assert t.inr_short(0) == "₹0"


def test_days_between_reads_both_date_shapes_the_columns_carry():
    # due_date is written the Indian way and created_at is ISO; the tracking
    # screen has to subtract one from the other without knowing which is which.
    assert t.days_between("2026-08-01", "2026-08-13") == 12
    assert t.days_between("01/08/2026", "13/08/2026") == 12
    assert t.days_between("2026-08-04", "13/08/2026") == 9
    assert t.days_between("2026-08-01T09:30:00", "2026-08-13") == 12
    assert t.days_between("2025-12-28", "2026-01-04") == 7      # across a year
    assert t.days_between("2024-02-28", "2024-03-01") == 2      # a leap day
    assert t.days_between("2026-08-13", "2026-08-01") == -12
    assert t.days_between("", "2026-08-13") == 0
    assert t.days_between("2026-08-13", "not a date") == 0
    assert t.days_between("2026-13-45", "2026-08-13") == 0


def test_a_trail_line_is_composed_when_it_happens_not_when_it_is_read():
    # Written at write time so 2027 code cannot re-word a 2026 event.
    assert t.event_headline("status", "accept", {"actor_label": "You"}) == (
        "You accepted the work")
    assert t.event_headline("status", "assign",
                            {"actor_label": "You", "assignee": "G. Srinivas"}) == (
        "You put G. Srinivas on it")
    assert t.event_headline("status", "unassign",
                            {"actor_label": "You", "assignee": "B. Ravi"}) == (
        "You took B. Ravi off it")
    assert t.event_headline("status", "start", {"assignee": "G. Srinivas"}) == (
        "G. Srinivas is on site")
    assert t.event_headline("status", "deliver", {}) == "Work came back"
    assert t.event_headline("status", "dispatch", {"actor_label": "You"}) == (
        "You sent it out")
    assert t.event_headline("status", "withdraw", {"actor_label": "You"}) == (
        "You withdrew it")
    assert t.event_headline("status", "send_back", {"actor_label": "You"}) == (
        "You sent it back")
    assert t.event_headline("status", "cancel", {"actor_label": "You"}) == (
        "You cancelled it")
    assert t.event_headline("status", "place", {}) == "Placed"


def test_a_dispatch_line_says_on_its_face_that_nothing_was_sent():
    assert t.event_headline("dispatch", "", {
        "channel": "whatsapp", "person_name": "G. Srinivas",
        "provider": "stub"}) == (
        "Sent to G. Srinivas on WhatsApp — recorded, not sent (stub)")
    # The day a provider is configured, the same line stops apologising.
    assert t.event_headline("dispatch", "", {
        "channel": "email", "person_name": "G. Srinivas",
        "provider": "resend"}) == "Sent to G. Srinivas on email"
    assert "SMS" in t.event_headline("dispatch", "", {
        "channel": "sms", "person_name": "B. Ravi", "provider": "msg91"})


def test_a_deliverable_a_filing_and_a_payment_each_read_as_a_sentence():
    assert t.event_headline("deliverable", "", {"label": "Re-survey sketch"}) == (
        "'Re-survey sketch' came back")
    assert t.event_headline("filed", "", {"summary": "Filed on the Map shelf"}) == (
        "Filed on the Map shelf")
    assert t.event_headline("payment", "", {"entry": "hold",
                                            "amount": 2900.0}) == "₹2,900 set aside"
    assert t.event_headline("payment", "", {"entry": "release", "amount": 405.0,
                                            "payee": "K. Prasad"}) == (
        "₹405 recorded as owed to K. Prasad")
    assert t.event_headline("payment", "", {"entry": "return",
                                            "amount": 1500.0}) == "₹1,500 given back"
    assert t.event_headline("payment", "", {"entry": "fee",
                                            "amount": 45.0}) == "₹45 to Pattadar"
    assert t.event_headline("refused", "", {"why": "not a legal move"}) == (
        "A move was refused: not a legal move")


def test_the_dot_beside_a_trail_line_agrees_with_what_happened():
    assert t.event_tone("status", "accept") == "up"
    assert t.event_tone("status", "cancel") == "down"
    assert t.event_tone("status", "send_back") == "down"
    assert t.event_tone("status", "withdraw") == "down"
    assert t.event_tone("payment", "") == "accent"
    assert t.event_tone("status", "assign") == "plain"
    assert t.event_tone("deliverable", "") == "plain"


def test_no_trail_line_is_ever_empty_for_a_move_the_machine_allows():
    # An event with a blank headline is a row in the file nobody can read.
    for (_status, action) in t.TRANSITIONS:
        line = t.event_headline("status", action,
                                {"actor_label": "You", "assignee": "G. Srinivas"})
        assert line.strip(), action
    for entry in t.ENTRIES:
        assert t.event_headline("payment", "", {"entry": entry,
                                                "amount": 1.0}).strip()


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    sys.exit(1 if failures else 0)
