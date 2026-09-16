# Incident Symptom Routing

| Symptom | Start with | Key safety rule |
|---|---|---|
| AI extraction failed/stuck | `docs/runbooks/extraction-triage.md` | no automatic POST retry; trace durable job |
| Uploaded file unreadable | storage/share code + scan/thaw runbooks | do not bypass malware verdict/owner checks |
| Cold/archived object | `docs/runbooks/s3-thaw.md` | never auto-thaw; account for restore time/cost |
| Wrong/empty account | identity migration runbook | immutable subject + reviewed binding; no email inference |
| Release unhealthy/stuck | `tested-release.md`, release receipt | exact SHA; rollback-incomplete is incident |
| Platform up/down failure | `docs/runbooks/up-down.md` | rerun idempotent script; no manual state surgery |
| Database recovery | `rds-restore-drill.md` | restore to scratch and verify before cutover |
| Share/recipient access | `scoped-recipient-access.md` | token scope/expiry and server authorization |
| Payment/provider | `razorpay-payments.md` | preserve idempotency and signed webhook checks |
| Account export/erasure | `account-data.md` | receipt completeness; payments can block erasure |

## Triage output

| Time | Observation | Evidence | Hypothesis | Next discriminating check |
|---|---|---|---|---|

Keep resource identifiers and PII redacted. Record what was not checked.
