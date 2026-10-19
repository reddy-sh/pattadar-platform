# Assistant write actions: design for adding deed results to the user's properties

**Status:** Proposal, not built yet. It is based on what is in `feat/holdings` on 2026-10-04. `apps/web/src/assistant/**` and `services/assistant/**` are being changed right now, so line numbers in those two folders may have moved.

**What the founder asked for:** after a deed search, the assistant offers "Add these to your properties?". It asks whether each one is *yours*, *one you manage*, or *one you're watching*. Then it creates the records through the existing API.

---

## 1. What exists today and what is missing

### 1.1 "Mine or watching" already exists, so no new model is needed

- **Every record already has a stake: `owned | managed | watch`.**
  - It is stored in `parcels.stake` and `properties.stake`, both `TEXT DEFAULT 'owned'` (`services/api/src/main.py:6595-6597`).
  - The GraphQL types expose it at `ParcelType.stake` (`main.py:338`) and `PropertyType.stake` (`main.py:420`). The W360 card exposes it at `services/api/src/web360.py:985`.
- **It can be set when a record is created.**
  - `RecordInput.stake` is at `web360.py:8556`.
  - `_create_record` writes `inp.stake or "owned"` for parcels and for properties (`web360.py:8944` and `:8963`).
  - The W360 add drawer already shows a "Your stake" select (`apps/web/src/w360/pages/PropertyActions.tsx:1248-1254`) and sends the value on create (`:748`).
- **The rest of the app already reads it.**
  - The list filter is `web { properties(stakes:[…]) }` (`web360.py:6199-6257`).
  - The portfolio counts are `managedCount` and `watchedCount` (`web360.py:6095-6096`).
  - Combining is limited to owned records: `canCombine` (`w360/pages/HoldingActions.tsx:26-34`) and spec rule 3 (`docs/specs/2026-09-25-combined-properties.md:46-50`).
- **There is no "monitoring" feature** (alerts or an EC watch) linked to `watch`. A watched record is an ordinary record in the user's account. That is enough for this feature. Alerts are a separate project (see section 5).
- **Do not confuse stake with these:**
  - `holding_status`, which is the record's own status (`main.py:436`; `saveRecord` maps `status` onto it at `web360.py:9132`).
  - Favourites: `toggleFavourite` flips each time it is called, so a retry undoes it (`main.py:4607-4629`).
  - The "Monitoring" stage in groups, which is about safeguarding (`w360/groupsView.ts:58-61`).

**Data-model change needed for owned vs watched: none.** The minimum is to **validate** stake in `saveRecord`, because `_create_record` stores whatever string it receives (`web360.py:8944, 8963`). Only `setStake` checks the value today (`main.py:4635`).

### 1.2 What "Holdings" means, and what we should do

- **In code, a Holding is a combined property.** It groups two or more of the user's owned records (`apps/web/src/w360/api.ts:2731-2740`; spec `2026-09-25-combined-properties.md`). It is created with `createCombinedProperty(name, recordIds, note)` (`web360.py:12770-12808`) and edited with `setCombinedMembers` (`:12831-12868`). Both return `""` when they refuse.
- **What the user means by "add to my holdings" is their portfolio:** `/app/properties`.
- **So the assistant's main write should be *create records with a stake*.** Grouping should only be offered afterwards, as an optional second step, when two or more saved records are owned.

### 1.3 Write paths that exist

| Path | Location | Good for us | Gaps |
|---|---|---|---|
| `web { saveRecord(input: RecordInput) }` | `web360.py:9169-9176` → `_create_record` `:8909-8968` | It is what the W360 drawer uses (`w360/api.ts:1664-1682`). It is scoped to the owner and takes `stake`. It audits `create_parcel` / `create_property` (`web360.py:4864` `_audit`, called at the end of `_create_record`). | No survey number on properties, no deed number, no SRO, no registration date, no N/S/E/W boundaries, no source reference. For parcels, `extentUnit` is not stored and acres are assumed (`:8939-8945`). Stake is not validated. |
| `createProperty` | `main.py:3288-3328` | Takes `regDocNo`, `sro`, `regDate`, `sellerName`, `buyerName` and writes `property_owners`. | No `stake` argument, so a separate `setStake` call is needed. Does not check `groupId` (`createPassbook` does, `:3187-3192`). Legacy path. |
| `createPropertyFromDocument` / `createParcelFromDocument` | `main.py:5306-5349`, `:5201-5240` | — | Need a stored `registered_documents` row with a file and consent. They drop the deed number, SRO, date and boundaries. Parcels store acres but label the unit `"sqyd"`. **Do not use.** |
| Follow-ups | `web { savePurchase }` `web360.py:9750`; `addTransfer` `:10543`; `addOwner` `:10454`; `setBoundary` `:9648` | Can attach deed facts after the record is created. | Each is a separate request, so a partial failure leaves a half-filled record. W360 refusals return `""` instead of an error. |

### 1.4 Idempotency already exists on the server, but the web client never sends it

- The GraphQL middleware runs any mutation that carries `x-idempotency-key` at most once per (uid, key) and replays the stored response for 7 days (`main.py:7089-7104`; classification at `:7120-7139`; middleware at `:7205-7225`). A duplicate that is still in flight gets 409.
- It **fails open** if the idempotency table is down (`main.py:7202`, `:7293`).
- **The web client never sends the key.** `gql()` sets only `Content-Type` (`apps/web/src/api/client.ts:150-170`). Only iOS sends it (`PattadarAPI.swift:172`).
- There is no unique constraint that stops the same deed being added twice through two different proposals.

### 1.5 The assistant cannot write today, which is correct

- The record tools are read-only, and their results can never become an action (`services/assistant/src/adapters/mcp/records.py:24-29`; `domain/tool_policy.py:173`).
- The UI tools (`adapters/mcp/ui.py:27-75`) only build envelopes: `navigate`, `set_filter`, `open_record`, `fill_field`, `submit_form`.
- **The web panel only ever runs `navigate`.** `dispatchAction` (`apps/web/src/assistant/AssistantPanel.tsx:422-429`) fires `pattadar:assistant-action` / `shell-action` window events, and nothing in the repo listens for them. So `fill_field` and `submit_form` are dead code.
- **The panel sends no `forms` or `navigation`** (`AssistantPanel.tsx:318-321`, `:479-482`).
- **The scope gate's route list is stale.** `_TRUSTED_ROUTES` (`domain/scope_policy.py:27-47`) and `safe_navigation` (`tool_policy.py:76-109`) do not include `/app/holdings`, `/app/records/*`, `/app/papers`, `/app/maps` or `/app/services`, and they list routes that are now redirects (`apps/web/src/routes.tsx:447-461`).
- **The assistant has no HTTP client and never receives the user's Bearer token.** The gateway strips it (`services/gateway/src/routes/proxy.py:35-56`).
- **Its internal-secret check fails open** while `INTERNAL_PROXY_SECRET` is unset (`services/assistant/src/internal_auth.py:7-9`, `:27-31`).
- **Incognito** is `POST /api/chat/incognito/stream` (`services/assistant/src/main.py:594-660`). It writes nothing on the server. It uses the same trusted-context and tool path as saved chats (`:627-630`).
- **The pieces a card can reuse already exist:**
  - Deed rows reach the browser as `records` SSE events (`domain/sse_events.py:22`) and render in `assistant/rich/RecordViewCard.tsx`.
  - Tap-to-ask prompts are built from rows in `domain/follow_ups.py:66-80`.

### 1.6 Gaps this feature has to close

1. **No proposal concept.** There is no SSE event, no card, and no executor in the browser.
2. **The web client sends no idempotency key** (`client.ts:150`).
3. **`RecordInput` cannot carry the deed facts** the founder expects: survey number, document number and year, SRO, registration date, boundaries, and the source rid. **Properties have no columns for survey number or N/S/E/W boundary text.** The only `boundary` column holds map coordinates.
4. **No server-side duplicate guard** for "this deed is already in my account".
5. **Stake is not validated** in `saveRecord`.
6. **Stale route lists** in `scope_policy.py` and `tool_policy.py`.
7. **Audit lines do not say the write came from the assistant.**

---

## 2. Recommended architecture

### 2.1 Options

**Option A. The assistant proposes, a card in the chat confirms, and the browser calls the existing API.**

- The model calls a new UI tool. The service builds the draft itself from the public-record rows, without trusting the model's copy of the facts, and streams it as a new `proposal` SSE event.
- The panel renders a card. The user edits the fields, chooses the stake and clicks **Save**.
- The browser calls `web { saveRecord }` through `gql()` with the user's own Cognito token and an `x-idempotency-key` derived from the proposal.

**Option B. The assistant service calls `services/api` for the user.**

- The service would need an HTTP client, the api URL and the gateway's `INTERNAL_PROXY_SECRET`. With those it could set **any** `x-user-id`, because the API trusts that header completely (`main.py:1197-1205`; `web360.py:66-67` falls back to `"system"`).
- The user's Bearer token never reaches the assistant (`proxy.py:35-56`). The alternative of forwarding it would mean a long-lived user credential sitting in an LLM tool process.
- Requiring a click would need a separate server-side confirmation token, because the model process itself would be holding write power.

| Constraint | A (browser runs the write) | B (service runs the write) |
|---|---|---|
| Never writes without an explicit click | Built in: the only code that writes is a click handler. | Needs a server-side confirm-token protocol, and the model process still has the capability. |
| Exactly the signed-in user's authority | Yes: same token, gateway and resolvers as the drawer. | No: a service secret that can impersonate anyone. This is the superuser we are told not to build. |
| Idempotent | `x-idempotency-key` = proposal id, using the existing middleware. | Possible, but needs new plumbing. |
| Auditable | The existing `_audit` (`actor_kind=owner`) plus an origin marker. | The audit would show the user, but the actor was a service, which is misleading. |
| Incognito cannot write | Do not offer the tool or render the card in incognito. | Same, but enforced on the server. |
| Reuses the existing UI (toasts, cache refresh) | Yes: `useW360Mutation` (`w360/api.ts:1249-1257`). | No: the browser cache is stale until a refetch. |
| New attack surface | A new event type and a card. | A new outbound channel and a secret in the assistant service. Its internal-auth check already fails open. |

**Recommendation: A.** It is the only option where the write can never go beyond what the user can do in the drawer by hand. It reuses the mutation, audit, toast and cache code that already exist. Option B creates exactly the service-level superuser the constraints rule out.

**Option A′ (the fallback inside A).** The card's **"Edit in full form"** button opens the existing `RecordDrawer` prefilled, through router state. Use this for anything the card does not cover: multi-survey passbooks, attaching a scan, or editing many fields. It reuses all of the drawer's logic.

### 2.2 Flow

```
user: "find deeds for Ramaiah in Kondapur"
  └─ assistant → records tool (read-only) → SSE `records` (RecordViewCard), unchanged
user: "add the 2019 one to my properties" | taps follow-up "Add to my properties?"
  └─ model → mcp__pattadar_ui__propose_add_records({rids:[…], stake?})
       service: re-fetch each rid from public_records (SELECT-only) → deterministic draft
                → persist proposal row (saved chats only) → SSE `proposal`
  └─ browser: ProposalCard (fields editable, stake required) — NO auto-execution
user clicks Save
  └─ browser: per item, gql(saveRecord(input), {idempotencyKey: `${proposalId}:${index}`,
                                              origin: 'assistant'})
       gateway (Cognito → x-user-id) → api idempotency middleware → _create_record
       → one transaction: record row + deed facts + _audit(create_property, origin=assistant)
  └─ browser: card → "Saved · Open Sy 214/2"; POST result back to assistant
       (saved chats) so the next turn can cite the id and the card survives reload
  └─ optional: ≥2 saved & owned → "Group these as one holding?" → useCreateHolding
```

### 2.3 Rules that enforce the constraints

1. **No click, no write.**
   - A `proposal` is a **separate SSE event type**. It never goes through `action`, because `AssistantPanel` runs `action` events immediately (`AssistantPanel.tsx:596-597`).
   - The only caller of `saveRecord` is the card's Save `onClick`.
   - The prompt suffix (`tool_policy.py:31-61`) must say: never claim a record was saved; a confirmation comes only from the browser's result.
2. **The user's own authority.** The write goes through `gql()` (`client.ts:150`), so it carries the same Cognito token, gateway check (`proxy.py:78-88`) and owner-scoped resolver (`web360.py:9169`) as the drawer. The assistant service gets no API client.
3. **Idempotency, in three layers:**
   - **Key:** `x-idempotency-key: asst:<proposalId>:<itemIndex>`. The proposal id is a UUID generated on the server. A double-click, a network retry or a reload-and-click replays the stored id (`main.py:7085-7104`).
   - **Card state:** the card disables Save once a request is in flight, the same way the drawer uses `savedId` / `batchDone` (`PropertyActions.tsx:406-424`). This also covers the moment when the idempotency table is down and the middleware fails open (`main.py:7202`).
   - **Database:** a new unique index on `(owner_user_id, source_ref)` stops the *same deed* being added through two different proposals. The resolver catches the conflict and returns the existing id, and the card shows "Already in your properties, open it".
4. **Auditable.**
   - `_create_record` already writes `create_parcel` / `create_property` audit lines as `actor_kind=owner`.
   - Add `origin` (`"assistant"`) and `source_ref` (`"pr:<rid>"`) to the record and to the audit metadata.
   - On the assistant side, the proposal row stores the conversation id, message id, draft, final submitted input, outcome and record id.
5. **Incognito cannot write.**
   - The incognito handler (`main.py:594+`) builds its runtime **without** the proposal tool.
   - `action_event` and the new `proposal_event` drop proposals when `incognito=True`, as a second check.
   - The panel refuses to render a proposal card while incognito is on.
   - The prompt tells the model to say "Turn off incognito to save records to your account."
   - Reason: incognito's promise is "nothing written anywhere" (`main.py:599-601`), and a saved record is written somewhere.
6. **Deliberate gate and allowlist.**
   - Add the one new tool name to `UI_TOOL_NAMES` and `qualified_tool_names` (`tool_policy.py:25`, `:64-73`), so both enforcement points (`agent_runtime.py:85-112`) cover it.
   - Bring `_TRUSTED_ROUTES` and `safe_navigation` up to date with the current routes.
   - Add a test that fails whenever the allowlist changes without a matching test update.
7. **The model cannot invent facts.**
   - The tool takes **rids, not field values**. The service re-reads each row from the read-only public-records database and builds the draft in code.
   - A prompt-injected party name or a hallucinated extent cannot reach the card except as the actual public-record text, which the user then sees and confirms.

---

## 3. Confirmation card UX

**Where it appears:** inline in the reply, directly under the `RecordViewCard` it came from.

**Two triggers:**
- The model calls the tool after the user asks.
- A tap-to-ask follow-up chip, "Add to my properties?", that `follow_ups.py` adds to `get_record_by_rid`, `get_property_history` and `find_properties_by_party` results. It is only added when the chat is not incognito.

### 3.1 Layout for one deed

```
┌ Add to your properties ─────────────────────────────── from deed 1234/2019 ┐
│ Is this yours?   ( Mine )  ( I manage it )  ( Watching )   ← required       │
│                                                                              │
│ Name        [ Plot 14, Kondapur              ]   Kind [ Plot ▾ ]            │
│ Village     [ Kondapur ]  Mandal [ Serilingampally ]  District [ R.R. ]     │
│ Survey no.  [ 214/2 ]                                                        │
│ Extent      [ 200 ] [ sq.yd ▾ ]                                              │
│ Deed        1234 / 2019 · SRO Kukatpally · Registered 12 Mar 2019           │
│ Paid        ₹ 24,00,000      Govt value ₹ 18,50,000                          │
│ Boundaries  N: Road 30ft · S: Plot 15 · E: Plot 13 · W: Open land            │
│ Seller → Buyer   K. Narayana → R. Ramaiah                                     │
│                                                                              │
│ ⚠ Owner in deed is "R. Ramaiah" — not you? Choose "Watching" or "I manage". │
│                                                                              │
│ [ Save ]   Edit in full form   Not now                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Field rules

**Prefilled from the row** (columns from `services/assistant/src/public_records/service.py:61-67, 574-578`):

| Card field | Comes from |
|---|---|
| Village | village |
| Mandal / district | `resolve_village` when it is known, otherwise blank and editable. Public rows have no mandal column. |
| Survey number | `survey_no` |
| Name | plot, house or apartment label |
| Extent and unit | `extent_val` and `extent_unit`, converted into one of `ac`, `sq.yd`, `sq.ft` |
| Deed number / year | `doc_no` / `year` |
| SRO | `sro_name` |
| Registered | `reg_date` |
| Paid | `consideration_value` |
| Govt value | `market_value` |
| Boundaries | the four boundary columns |
| Seller / buyer | sellers / buyers |

**Kind:** chosen from `land_class` / `property_type`.
- Agricultural rows with a survey number become a **parcel**.
- Plots, houses and flats become a **property**.
- The user can change it.

**Stake has no default.** Save stays disabled until the user picks one, unless the user already said it in the chat ("this is mine") and the model passed `stake`. In that case it is preselected and still visible.
- The labels match the UI words in `w360/ui.tsx:811`: Mine = `owned`, I manage it = `managed`, Watching = `watch`.
- A hint: "Watched and managed land is left out of combining and out of your setup checklist" (`homeGaps.ts:57`).

**Name-mismatch warning:** show it when no buyer name fuzzy-matches the user's profile name. It is a soft warning, not a block.

**All fields can be edited inline.** "Edit in full form" opens `RecordDrawer` with `card=null` and a `seed`. The card then shows "Continue in the form" and does not write anything itself.

### 3.3 Several deeds in one proposal

- The card shows a compact list, one row per deed, each with a checkbox. All are checked by default.
- One stake choice applies to all of them, with an "Set each one separately" toggle.
- Save writes **in sequence**, the same way the drawer does (`PropertyActions.tsx:607-612`). The card shows progress, for example "2 of 3 saved".
- Proposals are capped at **10 items**.

### 3.4 States

| State | What the card shows |
|---|---|
| Draft | Fields can be edited. |
| Saving | Fields locked; Save shows a spinner and is disabled. |
| Saved | "Saved as Mine · **Open Plot 14, Kondapur**", which links to `/app/records/<id>`. A secondary link goes to "View in Properties". If ≥2 owned records were saved: **"Group these as one holding?"**, which opens a name field and then calls `useCreateHolding`. |
| Already exists | The server returned the existing id for this `source_ref`: "This deed is already in your properties · Open". This counts as success. |
| Partly saved (several deeds) | "2 of 3 saved". The failed row is listed with its reason, and **Retry failed** reuses the same per-item keys, so the rows that succeeded are replayed rather than duplicated. |
| Errors | **Session ended (401):** "Sign in again, your draft is kept", with the draft kept in the panel. **Still saving elsewhere (409):** "Still saving in another tab…", retried once after 2 s. **Network:** Retry with the same key. **Validation:** shown next to the field. **`""` / false from a W360 refusal:** "Couldn't save, nothing was changed." All of these also raise the usual `useW360Mutation` toast. |
| Incognito | No card. The model's text says to leave incognito. |
| Reloaded saved chat | The card is rebuilt from the proposal row with its final state, so it cannot be saved a second time. |
| Dismissed | "Not now" marks the proposal `dismissed`. It can be undone until the chat is closed. |

---

## 4. Changes by service and file

### 4.1 `services/api`

1. **Additive `RecordInput` fields** (`web360.py:8546-8566`), all optional:
   ```python
   survey_no: Optional[str] = None          # property: new column; parcel: already survey_no/subdivision
   doc_no: Optional[str] = None             # → reg_doc_no ("1234/2019")
   sro: Optional[str] = None
   reg_date: Optional[str] = None           # ISO date → reg_date + purchase_date
   boundary_north/south/east/west: Optional[str] = None
   seller_name: Optional[str] = None        # property: property_owners past owner (as createProperty does)
   source_ref: Optional[str] = None         # "pr:<rid>"; max 64
   origin: Optional[str] = None             # "assistant" | "drawer"; audited only
   ```
2. **`_create_record` (`web360.py:8909-8968`):**
   - Write the new fields in the **same transaction** as the record row.
   - For a parcel, store `extent_unit`, or convert it into acres explicitly, so the current silent acres assumption at `:8939-8945` goes away.
   - **Validate** `stake ∈ {owned, managed, watch}` and `status` on create and on update (`:9073`, `:9132`).
   - Pass `origin` and `source_ref` into the `_audit` metadata.
   - If `source_ref` is set and `(owner_user_id, source_ref)` already exists, return the existing id instead of inserting.
3. **No new mutation.** The drawer benefits from the same fields: survey number, deed number, SRO and date are things users already want there.
4. **Make `_TRUSTED`/`_audit` able to take metadata,** if it cannot today (`web360.py:4864`; `main.log_audit` already takes `metadata`, `main.py:1393-1396`).
5. **Migration (additive, idempotent `ALTER … ADD COLUMN IF NOT EXISTS`):**
   ```sql
   ALTER TABLE properties ADD COLUMN IF NOT EXISTS survey_no TEXT DEFAULT '';
   ALTER TABLE properties ADD COLUMN IF NOT EXISTS boundary_north TEXT DEFAULT '';  -- + south/east/west
   ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_ref TEXT DEFAULT '';
   ALTER TABLE parcels    ADD COLUMN IF NOT EXISTS source_ref TEXT DEFAULT '';
   ALTER TABLE parcels    ADD COLUMN IF NOT EXISTS extent_unit TEXT DEFAULT 'ac';   -- if not already present
   CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_owner_source
     ON properties(owner_user_id, source_ref) WHERE source_ref <> '';
   -- parcels: owner via passbook → enforce in resolver with SELECT … FOR UPDATE on the passbook,
   -- or add parcels.owner_user_id; resolver check is sufficient for v1.
   ```
   Parcels already have `boundary_*`, `reg_doc_no`, `sro`, `reg_date` and `purchase_date` (`updateParcel`, `main.py:3756-3810`).
6. **Expose the new columns on the read side** (`RecordCard` / `record(id)`), so that "update erases omitted fields" cannot apply (memory: every writable field must round-trip through the read query). The drawer's update path must send only the fields that changed.
7. **Tests** in `services/api/tests/` (run with `LC_ALL=C`):
   - `saveRecord` creates a property with every deed field, and they round-trip through `record(id)`.
   - A bad stake is rejected on create and on update.
   - A duplicate `source_ref` returns the same id.
   - Two POSTs with the same `x-idempotency-key` produce one row and the second replays the first.
   - A different uid cannot see or update the record.
   - The audit row carries `origin=assistant`.

### 4.2 `services/gateway`

- Check that `x-idempotency-key` is forwarded to the API by `routes/proxy.py` (`:35-56` builds the outbound headers). If it is not forwarded, add it to the forwarded set. **Unverified;** iOS depends on it, so it probably is.
- Nothing else changes. Do not forward the Bearer token to the assistant.

### 4.3 `services/assistant`

1. **New UI tool** in `adapters/mcp/ui.py`: `propose_add_records`.
   ```json
   {
     "name": "propose_add_records",
     "description": "Offer to add public-record deeds to the user's own properties. Shows a confirmation card; NOTHING is saved until the user clicks Save. Call only after the user asks to add/save/track a deed, or accepts the 'Add to my properties?' offer. Pass stake only if the user has said whether it is theirs, managed, or watched.",
     "input_schema": {
       "type": "object",
       "properties": {
         "rids":  {"type": "array", "items": {"type": "string", "maxLength": 64}, "minItems": 1, "maxItems": 10},
         "stake": {"type": "string", "enum": ["owned", "managed", "watch"]},
         "note":  {"type": "string", "maxLength": 200}
       },
       "required": ["rids"],
       "additionalProperties": false
     }
   }
   ```
   - **Handler:** re-fetch each rid through `public_records/service.py`, using the same read-only path as `get_record_by_rid`, and drop any rid that is not found.
   - Map each row into a `RecordInput` draft with a new pure function `domain/record_drafts.py: draft_from_row(row) -> dict`. It covers kind inference, unit normalisation into `ac|sq.yd|sq.ft`, Indian-format money, ISO dates and boundaries.
   - Generate `proposal_id = uuid4()`.
   - Return the envelope `{"action":"propose_write","proposal":{id, op:"create_records", stake, items:[{source_ref:"pr:<rid>", input:{…}, display:{…}}]}}`.
2. **`domain/tool_policy.py`:**
   - Add the name to `UI_TOOL_NAMES` (`:25`) and to the allowlist (`:64-73`).
   - Add `proposal_event(text, tool, *, incognito) -> dict | None`. It only accepts `mcp__pattadar_ui__propose_add_records`, checks the schema again, and returns `None` when `incognito`.
   - Keep `action_event`'s action set unchanged (`:182`), so a proposal can never become an auto-run action.
   - Add rules to `STRICT_SYSTEM_SUFFIX` (`:31-61`):
     - Ask Mine / I manage it / Watching when the user has not said.
     - Never say "saved" or "added" before a `proposal_result` comes back.
     - "Holdings" means the user's properties; offer grouping only for two or more owned records.
3. **`domain/sse_events.py`:** add `PROPOSAL = "proposal"` and a client-to-server result shape. Add it to `CLIENT_EVENTS`. The module says the event names are a published contract (`:3-5`).
4. **`adapters/agent_runtime.py`** (around `:196-202`, where tool results become events):
   - Call `proposal_event` and emit `{"type":"proposal", ...}`.
   - The runtime factory takes `allow_proposals: bool`. The incognito endpoint (`main.py:594-660`) passes `False`, so the tool is **not registered** there. The saved-chat endpoint (`~:777`) passes `True`.
5. **`domain/scope_policy.py:27-47` and `tool_policy.py:76-109`:**
   - Replace the stale route lists with the current ones from `apps/web/src/routes.tsx`: `/app/properties`, `/app/holdings`, `/app/holdings/:id`, `/app/records/:id`, `/app/papers`, `/app/maps`, `/app/services`, `/app/home`.
   - Match on a prefix for `:id` routes.
   - Add a test that diffs the list against a fixture copied from `routes.tsx`.
6. **`domain/follow_ups.py:66-80`:**
   - For `get_record_by_rid`, `get_property_history` and party results with ≤10 rows, add the chip `"Add to my properties?"` → `"Add deed <rid> to my properties."`.
   - Leave it out when incognito. The follow-up builder needs an `incognito` flag.
7. **Hub database migration** (assistant `hub` DB, `config.py:45-50`):
   ```sql
   CREATE TABLE IF NOT EXISTS r_assistant_proposals (
     id UUID PRIMARY KEY, user_id TEXT NOT NULL, conversation_id UUID NOT NULL,
     message_id UUID, op TEXT NOT NULL, draft JSONB NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',  -- pending|saved|partial|dismissed|failed
     submitted JSONB, result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     resolved_at TIMESTAMPTZ);
   CREATE INDEX IF NOT EXISTS idx_proposals_conv ON r_assistant_proposals(conversation_id);
   ```
   - It is written when the proposal is emitted (saved chats only) and returned with the conversation's messages, so the card can be rebuilt after a reload.
8. **New endpoint** `POST /api/conversations/{cid}/proposals/{pid}/result`:
   - Body: `{status, items:[{source_ref, record_id|"", error|""}]}`.
   - It is scoped by `x-user-id` and the conversation's owner, and only allows `pending → saved|partial|dismissed|failed`.
   - **It is a record of what the browser did, not an authorisation.** The API's own audit remains the source of truth.
   - The next turn's context includes "Saved: Plot 14, Kondapur (rec-…)", so the model can refer to it.
9. **Operations:** set `INTERNAL_PROXY_SECRET` everywhere so `internal_auth.py:27-31` stops failing open. The new endpoint is a write.
10. **Tests:**
    - `tests/test_tool_policy.py`: the allowlist contains exactly the expected names; `proposal_event` rejects other tools, bad stakes and more than 10 rids; it returns `None` when incognito; `action_event` never passes `propose_write`.
    - New `tests/test_record_drafts.py`: unit normalisation, kind inference, a missing mandal, boundaries, a non-numeric `consideration_value`.
    - New `tests/test_proposals.py`: a rid that is not found is dropped; rows are re-read and the model's values are ignored; the incognito runtime has no proposal tool; the result endpoint's owner check and state machine.
    - `tests/test_follow_ups.py`: the chip is present in a saved chat and absent in incognito.
    - `tests/test_event_pump.py`: a `proposal` frame passes through in order.

### 4.4 `apps/web`

1. **`src/api/client.ts:150`:**
   - Extend the signature to `gql<T>(query, variables?, opts?: { idempotencyKey?: string; origin?: string })` and set the `x-idempotency-key` header when a key is given.
   - Existing callers do not change.
2. **`src/w360/api.ts:1664-1682`:**
   - `useSaveRecord` accepts `{input, idempotencyKey?}`.
   - Add the new `RecordInput` fields to the TypeScript type.
   - `useW360Mutation` (`:1249-1257`) already shows toasts and invalidates the cache.
3. **`src/assistant/types.ts`:** add the `ProposalEvent` and `ProposalItem` types. **`src/assistant/AssistantPanel.tsx`:**
   - Handle `event.type === 'proposal'` next to `records` (`~:578`) by attaching it to the current assistant message.
   - **Do not** route it through `dispatchAction` (`:422-429`).
   - Drop it if the panel is in incognito.
4. **New `src/assistant/rich/ProposalCard.tsx`** (beside `RecordViewCard.tsx`):
   - It implements section 3: the stake segmented control, editable fields, the single-flight Save (a `useRef` lock plus `disabled`), the per-item key `asst:${id}:${i}`, sequential writes, and the results and errors.
   - After it finishes, it POSTs to the result endpoint.
   - It uses `ConfirmDialog` or W360 form primitives per `w360` design (`PropertyActions.tsx:1292`), the Bloom tokens, and the zero-state rules (no dead controls).
5. **"Edit in full form":**
   - Navigate to `/app/properties` with router `state: { seed: RecordInput, sourceRef }`, not query parameters, because owner names are personal data.
   - `Properties.tsx:736-750` consumes and clears it the same way it does `?new=1`.
   - Add `seed?: Partial<RecordInput>` to `RecordDrawer` (`PropertyActions.tsx:331`) to feed the `useState` initialisers at `:372-388`, keeping `card=null`.
6. **Grouping after save:** the card's "Group these as one holding?" calls `useCreateHolding` (`w360/api.ts:~3053`) with the saved ids that are owned, using its own idempotency key `asst:${id}:holding`. A `""` result is shown as "Couldn't group: one of these is already in a holding".
7. **Delete the unused `shell-action` duplicate,** or leave it alone. This feature does not depend on it.
8. **e2e:**
   - Extend `tests/e2e-app/specs/40-assistant-records.spec.ts`. It is sealed, with fixture-answered `/api`, per memory.
   - Cover these cases:
     - A proposal renders and has no network write before the click.
     - A double-click produces exactly one `saveRecord` POST, with the `x-idempotency-key` header asserted.
     - Each stake choice is sent.
     - The success link goes to `/app/records/<id>`.
     - The partial-failure retry reuses the keys.
     - The incognito panel never renders a card.
     - "Edit in full form" opens a prefilled drawer.
   - **Add `saveRecord`'s new fields to the fixture catalogue** (memory: the fixture catalogue must mirror the server).

### 4.5 iOS and Expo

- Not in scope for v1. The API additions are optional fields, so the existing iOS `AddPropertyScreen` / `AddParcelScreen` keep working.
- Note for parity: iOS never sends a stake on create.

---

## 5. Open questions for the founder, with recommended defaults

1. **What should "add to my holdings" mean in the assistant's words?**
   - **Default:** the assistant says "your properties" and creates records. "Holding" is used only for the optional grouping step after two or more owned records are saved.
   - Otherwise a user saying "holdings" will run into the two-record, owned-only rule and get a silent `""`.
2. **Should the stake be required, or default to Mine?**
   - **Default:** required, with nothing preselected unless the user already said. A deed found by searching someone else's name is often *not* the user's, and a wrong `owned` puts it into combining and setup gaps.
3. **What if the deed's buyer is not the user?**
   - **Default:** a soft warning and a nudge towards Watching. Do not block, because family members and GPAs are common.
4. **Parcel or property for agricultural deeds?**
   - **Default:** a parcel when there is a survey number and an agricultural `land_class`, otherwise a property. The user can switch it on the card.
   - Caveat: public rows have no khata, so deed-created parcels in the same village share one blank-khata passbook in the default family group (`web360.py:8935`). Accept this for v1, or make it a property-only feature.
5. **Should "Watching" do anything beyond tagging?**
   - **Default:** no new behaviour in v1. A watched record is a normal record counted as `watchedCount`.
   - New-registration or EC alerts for watched survey numbers would be a separate feature. It would need a public-records diff job and notifications, and nothing in the code supports it today.
6. **How much of the deed should be copied?**
   - **Default:** all of it: deed number, SRO, date, price, boundaries, plus seller → buyer as an ownership-chain entry.
   - For **Watching** records, copy only the property facts (village, survey number, extent, boundaries, deed reference) and not the party names. Storing third parties' names under a watched record raises a DPDP question. Raise it before launch, alongside the Aadhaar note.

**Not open:** whether to use Option A, whether incognito can write, and whether idempotency is required. The constraints settle all three as described above.