"""The assistant's Server-Sent Event vocabulary.

These names are a published contract: apps/web/src/assistant/AssistantPanel.tsx
switches on them, and a rename is a breaking client change, not a refactor.
They are collected here so that contract is greppable from one place rather
than inferred from string literals spread across the stream translator.

Terminal behaviour, also contractual: every stream ends with ``[DONE]`` after a
keepalive preamble, so a client can tell "finished" from "connection dropped".
"""
from __future__ import annotations

#: Incremental answer text.
TOKEN = "token"
#: Model reasoning, surfaced as an activity indicator rather than raw thought.
THINKING = "thinking"
#: A tool call started / finished.
TOOL_START = "tool_start"
TOOL_END = "tool_end"
#: A validated browser command (see domain.tool_policy.action_event).
ACTION = "action"
#: A display-only copy of a public-record result (see domain.record_views).
RECORDS = "records"
#: A save offer the user must confirm: a confirmation card, never a command.
#: Built in code from re-read public-record rows (domain/record_drafts.py) when
#: the model calls propose_add_records; never emitted in incognito, and never
#: routed through ACTION, which the panel runs immediately. Shape::
#:
#:   {type:'proposal', id:<uuid>, status:'draft'|'saved'|'partial'|'dismissed',
#:    stake:'owned'|'managed'|'watch'|null,
#:    items:[{index, rid, s_no, kind:'parcel'|'property', title, village, mandal,
#:            district, survey_no, extent:number|null,
#:            extent_unit:'ac'|'sq.yd'|'sq.ft'|null, doc_no, sro, reg_date,
#:            exec_date, consideration:number|null, govt_value:number|null
#:            (the registry's value; market_value is no longer sent),
#:            transaction_type, txn_class, acquisition_mode ('' = moves no
#:            title), plot_no, house_no, land_class,
#:            boundary_north, boundary_south, boundary_east, boundary_west,
#:            seller_name, buyer_name, source_ref, buyer_matches_user:bool|null,
#:            record_id:string|null, error:string|null}]}
#:
#: Party names (seller_name / buyer_name) are always present in the event. When
#: the user chooses Watching (stake 'watch') the BROWSER must drop them before
#: saving: a watched record keeps property facts only, no third-party names.
#: buyer_matches_user is null from the service (it never learns the user's
#: name); the browser compares buyer_name with the signed-in profile. The
#: browser reports the outcome with PUT /api/proposals/{id}.
PROPOSAL = "proposal"
#: A service request the user must confirm (propose_service_order): a card that
#: prices and places nothing itself. Saved chats only; never in incognito.
#: Shape::
#:
#:   {type:'service_proposal', id:<uuid>,
#:    status:'draft'|'ordered'|'partial'|'dismissed',
#:    records:[{record_id, title:string|null}],
#:    requested:[string],          # the user's own words, 1-8, plain text
#:    note:string|null,
#:    orders:[{index, record_id, service, order_id, order_ref, error}]}
#:
#: ``orders`` is what the browser reported placing (empty while a draft). The
#: browser loads the real catalogue and prices for ``records`` through the
#: user's session, places orders only on "Place request" with idempotency key
#: ``asst:<id>:<recordId>:<stakeOrKind>``, and reports the outcome with
#: PUT /api/proposals/{id} (status 'ordered'|'partial'|'dismissed').
SERVICE_PROPOSAL = "service_proposal"
#: What the finished request cost (domain/billing.request_cost). In a saved chat
#: it may also carry ``follow_ups``: reply-level tap-to-ask questions that come
#: from the chat rather than from a record view (domain/follow_ups.chat_follow_ups).
USAGE = "usage"
#: A failure the user should see.
ERROR = "error"

#: Internal frame consumed by the transport, never sent to a client.
RESULT = "_result"

#: Sent verbatim to close a stream.
DONE = "data: [DONE]\n\n"
#: Sent before the first event and while waiting, so proxies keep the stream open.
KEEPALIVE = ": keepalive\n\n"

CLIENT_EVENTS = frozenset({
    TOKEN, THINKING, TOOL_START, TOOL_END, ACTION, RECORDS, PROPOSAL, SERVICE_PROPOSAL, USAGE, ERROR,
})

__all__ = [
    "ACTION", "CLIENT_EVENTS", "DONE", "ERROR", "KEEPALIVE", "PROPOSAL", "RECORDS", "RESULT", "SERVICE_PROPOSAL", "USAGE",
    "THINKING", "TOKEN", "TOOL_END", "TOOL_START",
]
