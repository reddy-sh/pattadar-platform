# AI extraction triage

For failures on `/import-passbook`, `/extract-aadhaar`,
`/import-registered-document`, `/extract-property`. Work the checks **in
order** — each layer rules out the next.

## Hard rule first

**Never retry an extraction POST.** Not with curl, not by clicking again, not
by adding retries to gateway/ALB/EventBridge/CloudFront config. A duplicate
call doubles Anthropic spend and can double-import documents. Diagnose, fix,
then let the *user* re-submit once the cause is fixed.

## 1. CloudWatch api logs (the exact exception is logged)

```sh
aws logs tail /ecs/pattadar-<env>/api --since 30m --follow \
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

## 3. ALB: target 5xx vs timeout

```sh
# Is the target erroring (5xx) or timing out (504 + no target 5xx)?
aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=LoadBalancer,Value=<alb-arn-suffix> \
  --start-time "$(date -u -v-1H +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --period 300 --statistics Sum
# Also compare: HTTPCode_ELB_504_Count, TargetResponseTime (Maximum)
```

- **Target 5xx** → app-level; back to step 1's logs.
- **504 with no target 5xx** → a timeout in the chain. Verify the invariant:

```sh
aws elbv2 describe-load-balancer-attributes --load-balancer-arn <arn> \
  --query "Attributes[?Key=='idle_timeout.timeout_seconds'].Value"
```

`idle_timeout` **must stay >= 200** (extraction runs up to 180 s). Same for
the CloudFront origin-response timeout on the `/api/*` behavior and the
gateway's proxy timeout. If someone "tuned" any of these down, that's the bug.

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
  compare gateway and ALB timestamps for the same request id.
