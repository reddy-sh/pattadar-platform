# Value-free GraphQL error logs for the anonymous registerNetworkInterest root

Scope: commit `4a95ca4` on `feat/landing-pattadar-network` (Fix 1, AC 18), read against the earlier `security-review.md` Issue 1, `verification.md` § Follow-up 2 and the installed Strawberry 0.323.2 in `.local/api-venv`. Card and copy changes in the same commit carry no security surface and were only skimmed.

The fix closes the earlier LOW finding. `PattadarSchema.process_errors` replaces Strawberry's `logger.error(error, exc_info=original_error)` with `graphql.public_error kind=<class> path=<path>` for any request whose error source or query text contains `registerNetworkInterest`. `MaskUnexpectedErrors.anonymise_error` logs the class name instead of the `repr` for the same requests, since that repr carried `String cannot represent a non string value: <phone>`. Errors returned to the client are not mutated. Authenticated and other roots fall through to `super().process_errors` and the original repr. The new caplog tests send an int phone variable, an inline-literal document (name holding an Aadhaar-like run, an email and a phone) and an unparseable document. They assert at DEBUG across all loggers that no submitted value appears in `caplog.text` and that every `strawberry.execution` line is the value-free form. A control test proves `claimInvitation` keeps the default line. The local functional run grepped API and gateway logs for every submitted value and found zero hits.

Watch for: the masking extension is a shared instance, so its `self.execution_context` fallback can be another concurrent request's context. The primary `error.source` check covers every value-bearing error on this path, so this stays informational (possible, non-blocking). The value-free path also drops the traceback for unexpected faults on this root, which costs some debuggability.

**Verdict**: APPROVED

## High-level view

Classification is textual and fails safe. GraphQL can only select a field by writing its exact, case-sensitive name, so a request that reaches `registerNetworkInterest` always matches. A request that only mentions the name in a comment or string gets the quieter line, which means less logging, never more. The match runs on both the error's own `source.body` and `execution_context.query`, so parse failures (no document) and pre-execution coercion errors are covered.

The emitted fields hold no values. `kind` is a Python class name (`GraphQLError`, `NetworkSaveFailed`, …) and `path` is a list of response keys and indices. Neither can carry request data. Strawberry's `exc_info` traceback, which would render the exception message, is no longer attached for this root.

Validation and coercion messages that echo the caller's own input back to that same caller are still returned. That is pre-existing graphql-core behaviour, and the design keeps it.

<details>
<summary>Issues (2)</summary>

1. **Shared masker context fallback** (info, possible, non-blocking) — `MaskUnexpectedErrors()` is passed as an instance, so Strawberry reuses it and overwrites `self.execution_context` per request. Under concurrency, the fallback in `anonymise_error` can read another request's query. The `error.source.body` check comes first and is present for every value-bearing error here: located resolver errors and variable-coercion errors both carry nodes with locations, because default parse options keep them. So no leak path was found. To make it airtight, pass the extension as a class or factory (`MaskUnexpectedErrors` without `()`), which also clears Strawberry's deprecation of shared instances. No test covers concurrent interleaving.
2. **Traceback dropped for unexpected faults on this root** (info, non-blocking) — a non-psycopg bug in the resolver now logs only `ref`, `field` and the class name, with no message or stack. If more diagnosis is needed later, log a stack with frame locals disabled and without the exception message, or rely on the `ref` plus local reproduction. This is not a security issue.

</details>

<details><summary>Details</summary>

## Where the values used to leak, and what now runs

```
POST /graphql (anonymous, via gateway single-root allowlist)
  ├─ parse/validate/coerce error ──> Schema._process_errors ──> PattadarSchema.process_errors
  │                                     match? ── yes ─> "graphql.public_error kind=… path=…"
  │                                               no ──> StrawberryLogger.error(str, exc_info)
  └─ MaskErrors.on_operation tail ──> anonymise_error (original_error not ValueError/NotAuthorized)
                                         match? ── yes ─> "graphql.unexpected_error ref field: <Class>"
                                                   no ──> "... : <repr(original_error)>"
```

Both log sinks that previously rendered user input are covered: the variable message `got invalid value 9848012345`, the inline source excerpt, and the coercion repr. `network.py`'s own lines were already value-free. Resolver `ValueError`s from `network.py` were logged by Strawberry before and are now reduced to the class name.

## Shared-instance fallback

Strawberry 0.323.2's `get_extensions` passes `SchemaExtension` instances through as-is and assigns `extension.execution_context = execution_context` on every request. Since `MaskUnexpectedErrors()` is one object, two interleaved async requests can see each other's context when `on_operation` resumes. `process_errors` is not exposed to this, because Strawberry passes it the per-request context explicitly. In `anonymise_error`, the risky case is a network request's error that has no `source` while the shared context holds a non-network query, so the repr is logged. The errors that reach `anonymise_error` on this root are located resolver errors (`NetworkSaveFailed`) and variable-coercion errors. Both are built from AST nodes with locations, so `source` is set and the primary check matches. Hence possible but not reachable on the traced paths. The opposite race only produces quieter logs.

## Test evidence

`test_malformed_request_logs_no_submitted_value` covers the three malformed shapes and checks `caplog.text`. That text includes the `api` logger's `graphql.unexpected_error` line as well as `strawberry.execution`, so both sinks are covered. The asserted values include the name, phone, the `98480` prefix, the email in both cases, district, mandal, note, the spaced Aadhaar-like run and the full inline name. The tests call `main.schema.execute` directly rather than through `GraphQLRouter`. The local-stack functional grep through gateway → API closes that gap. No spot-check was run, since the evidence left no specific doubt. Not tested: concurrent interleaving of the shared masker.

</details>

<details><summary>File map</summary>

- `services/api/src/main.py` — `_value_free_error`/`_error_kind`/`_error_path` helpers, `PattadarSchema.process_errors` override, value-free branch in `MaskUnexpectedErrors.anonymise_error`.
- `services/api/tests/test_network_interest.py` — three malformed-request caplog cases, other-root control, `CONSENT_TEXT` SHA-256 pin.
- `services/api/tests/test_network_interest_db.py`, `apps/web/src/pages/landing/*`, `scripts/network-interest-tests.ts`, `tests/e2e-app/specs/20-public-auth.spec.ts`, docs — card/copy tidy and guards, no security surface.
- Full diff: `git show 4a95ca4`.

</details>
