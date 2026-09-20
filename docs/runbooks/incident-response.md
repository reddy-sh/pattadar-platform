# Incident response

What to do when personal data may have been exposed, altered or lost. The
compliance notes cite this runbook for the DPDP and GDPR notification duties,
so the stages below are the ones those duties assume: detect, contain, assess
scope, notify, preserve evidence.

Written for one operator. Every stage says what to run and what to record; the
record is what a regulator asks for later, and it is much easier to write down
while doing it than to reconstruct afterwards.

## 0. Before anything: start the log

Open a file, `incidents/<yyyy-mm-dd>-<short-name>.md`, and append to it as you
go — timestamps (UTC), what you observed, what you ran, what it returned.
Do not clean it up afterwards. An incident log that was edited later is worth
less than a messy one written live.

Record at the top: who noticed, when, and how.

## 1. Detect

The signals that should bring you here:

| Source | What it means |
|---|---|
| GuardDuty finding | Credential misuse, crypto-mining, malicious IP, or an S3 object flagged `THREATS_FOUND` |
| CloudTrail | Unexpected `PutBucketPolicy`, `DeleteTrail`, `CreateUser`, `AttachRolePolicy`, or role assumption from an unknown source |
| `pattadar-<env>-cron-failed-invocations` / `-cron-did-not-run` | The family-safeguard escalation stopped running |
| `pattadar-<env>-<service>-no-healthy-hosts` | A service is down or failing health checks |
| Audit chain verification fails | `services/api/scripts/verify_audit_chain.py` reports a broken link — the ledger was modified outside the append path |
| A user reports seeing someone else's record | Treat as confirmed until disproven |

Anything touching Aadhaar images, deeds or passbooks is the most sensitive
class on the platform: assume it is reportable until the assessment says
otherwise.

## 2. Contain

Containment comes before diagnosis. In rough order of reach:

1. **Revoke the credential** if one is implicated — deactivate the IAM access
   key, or remove the role's trust, before anything else.
2. **Cut public access** — if a bucket policy or `publicly_accessible` flag
   changed, revert it in the console now and fix the Terraform afterwards.
3. **Sign out sessions** — Cognito global sign-out for the affected users;
   refresh tokens last 30 days, so nothing expires on its own quickly.
4. **Freeze the account** — an `account_access_blocks` row stops the gateway
   from serving that principal without deleting anything.
5. **Take the platform down** only if exposure is ongoing and narrower steps
   will not stop it: `./scripts/platform-down.sh` parks the runtime and takes
   a final snapshot. It is reversible; data loss is not.

Do not delete anything to "clean up". Deleted evidence cannot be un-deleted,
and the deletion itself has to be explained.

## 3. Assess scope

The questions a notification has to answer: whose data, what data, when, and
how much left the platform.

- **Who acted**: `audit_events_v2` is the hash-chained trail. Query by
  `actor_id`, `affected_owner` and `occurred_at`. Run
  `services/api/scripts/verify_audit_chain.py` first — if the chain does not
  verify, say so in the log and treat the trail as untrusted from the first
  broken sequence number onward.
- **What was read**: document byte downloads and recipient-token access are
  recorded as `download_document` and `recipient.download`. Share and work
  tokens are hashed at rest, so match on the hash, not the link.
- **What changed**: correction events carry before/after values.
- **What left AWS**: ALB access logs (400-day retention) hold request URLs;
  CloudTrail holds management events. Note that CloudTrail does not record S3
  object-level reads unless data events are enabled — if they are not, say
  plainly in the assessment that object-level reads cannot be enumerated.
- **Cross-border**: if the incident involves document extraction or assistant
  chat, those payloads reached Anthropic in the US. That is a disclosed
  processor, but it belongs in the scope description.

Write the scope as a list of affected users with what each one's exposure was.
That list is the notification list.

## 4. Notify

Two duties, different clocks. Start drafting as soon as scope is roughly
known — do not wait for certainty about the cause.

- **DPDP (India)**: notify the Data Protection Board **and every affected data
  principal**, in the form and timeline set by the DPDP Rules. Users are
  notified directly, not by public notice.
- **GDPR**: notify the supervisory authority within **72 hours of becoming
  aware**, and affected individuals where the risk to them is high. The clock
  starts at awareness, not at confirmation.

Each notice needs: what happened, when, the categories and approximate number
of people and records, likely consequences, what has been done, and a contact
point. If some of that is still unknown, send what you have and say what is
still being established — a late complete notice is worse than a prompt
partial one.

For a breach of Aadhaar numbers specifically, also record whether the exposed
values were ciphertext or plaintext. Fields are encrypted under a dedicated
KMS key with an encryption context; ciphertext without the key is a materially
different exposure, and the notice should be accurate about which it was.

## 5. Preserve evidence

- Do not delete log groups, buckets or snapshots for the duration, even where
  retention would normally expire them. Extend retention if an expiry falls
  inside the investigation window.
- Export the relevant `audit_events_v2` range and its verification output.
- Keep the final snapshot taken by `platform-down.sh` if the platform was
  parked; note that snapshots hold personal data and fall outside the normal
  erasure path, so an incident snapshot needs its own disposal decision.

## 6. Close

Write, in the incident log: root cause, what was notified and when, and the
change that stops a recurrence. Open that change as normal work with a link
back to the log.

Then check one thing honestly — whether the platform would have detected this
on its own, or whether it was luck. If it was luck, the follow-up is a
detection gap, not just a fix.

## Related

- `account-data.md` — export and erasure mechanics
- `up-down.md` — parking and restoring the runtime
- `../compliance/gdpr-dpdp.md` — lawful bases, retention schedule, ROPA
- `../compliance/soc2-controls.md` — control mapping
