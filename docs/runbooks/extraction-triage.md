# AI extraction triage

For failures on `/import-passbook`, `/extract-aadhaar`,
`/import-registered-document`, `/extract-property`. Work the checks **in
order** — each layer rules out the next.

## Hard rule first

**Never retry an extraction POST.** Not with curl, not by clicking again, not
by adding retries to gateway/EventBridge/CloudFront config (VPC origins keep
`connection_attempts = 1`). A duplicate
call doubles Anthropic spend and can double-import documents. Diagnose, fix,
then let the *user* re-submit once the cause is fixed.

## 1. CloudWatch api logs (the exact exception is logged)

```sh
aws logs tail /pattadar/<env>/api --since 30m --follow \
  --filter-pattern "?extract ?import ?anthropic ?error"
```

The api logs the exact Anthropic exception/status server-side (no more silent
502s). What you see decides the branch:

| Log shows | Meaning |
| --- | --- |
| `429` / `overloaded_error` / `529` | Anthropic throttling → check step 2 |
| `401` from Anthropic | `ANTHROPIC_API_KEY` secret wrong/rotated |
| httpx `ReadTimeout` at ~180 s | Genuinely slow doc — check step 3 timeouts before blaming the model |
| Nothing at all for the request | Request never reached the api → steps 3–4 |

## 2. Anthropic status

<https://status.anthropic.com> — if Sonnet is degraded, stop here; wait it
out. Do not retry stuck requests (see hard rule).

## 3. Edge: CloudFront 5xx vs timeout

There is no ALB. Web traffic reaches the gateway through the SPA
distribution's `/api/*` VPC origin, and iOS/Expo through the
`api.pattadar.com` distribution. CloudFront metrics live in `us-east-1`:

```sh
# Is the origin erroring, or is CloudFront timing it out?
aws cloudwatch get-metric-statistics --region us-east-1 --namespace AWS/CloudFront \
  --metric-name 5xxErrorRate \
  --dimensions Name=DistributionId,Value=<distribution-id> Name=Region,Value=Global \
  --start-time "$(date -u -v-1H +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --period 300 --statistics Average
```

- **The gateway log shows the request finishing with a 5xx** → app-level; back
  to step 1's logs.
- **A 504 at the client, with the gateway log still waiting at about the
  origin timeout** → the CloudFront origin response timeout cut it. Check the
  value:

```sh
aws cloudfront get-distribution-config --id <distribution-id> \
  --query "DistributionConfig.Origins.Items[].{origin:Id,read:VpcOriginConfig.OriginReadTimeout}"
```

The origin timeout is `cloudfront_origin_read_timeout`: 120 s now, 180 s after
the quota request. The synchronous reads (iOS passbook, Expo passbook and
deed) wait on the model for up to 170 s, so at 120 s a slow read fails at the
edge while the api may still finish and be billed. That is why moving them to
the `-async` routes is a cutover gate. The gateway's own proxy timeout is
200 s for these routes (`services/gateway/src/routes/proxy.py`). If someone
"tuned" either one down, that's the bug.

## 4. GuardDuty scan-tag gate

Extraction reads the uploaded object from S3; the bucket policy gates reads on
the malware-scan tag. A stuck/failed scan blocks the read:

```sh
aws s3api get-object-tagging --bucket <documents-bucket> \
  --key "<owner>/<node>/<version>"
```

| `GuardDutyMalwareScanStatus` | Action |
| --- | --- |
| `NO_THREATS_FOUND` | Not the problem — go back to step 3 |
| absent / scan pending | Wait 1–2 min (scan runs on PUT); check GuardDuty console if it never lands |
| `THREATS_FOUND` | Working as intended — the document is quarantined; tell the user |
| `ACCESS_DENIED` / `FAILED` | GuardDuty's role lost bucket/KMS access — check the malware-protection plan in the console |

Also confirm the object isn't parked in a Glacier class
([s3-thaw.md](s3-thaw.md)) — an un-thawed object fails reads too.

## Escalation notes

- Extraction endpoints have **no retries by design** at every layer; if you
  find a retry setting anywhere on these paths, removing it *is* the fix.
- Repeated `ReadTimeout` on ordinary single-page documents usually means the
  model call is fine but response streaming is being buffered somewhere new —
  compare gateway and api timestamps for the same request.
- A release restarts each service with about 1-2 minutes of outage (one host,
  static ports). A reading in flight on an api restart is marked failed and
  never retried. The user re-submits once; do not replay it.
