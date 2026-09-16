# Release Readiness Evidence Matrix

Verified against repository release sources on 2026-09-16.

| Gate | Evidence | Source |
|---|---|---|
| Exact revision | full SHA is current main and CI passed for it | `.github/workflows/{ci,deploy}.yml` |
| Web origin | `WEB_ORIGIN=spa`; web-next remains blocked until parity review | `deploy.yml` |
| Immutable images | every required service image exists for the SHA/digest | `scripts/deploy-release.py` |
| SPA revision | bundle stamped with the exact SHA | `apps/web/dist/.release-sha` contract |
| Identity | complete owner/admin inventory and reviewed bindings | `docs/runbooks/identity-migration.md` |
| Attachments | complete copy/readback receipt | `docs/runbooks/assistant-attachment-migration.md` |
| Rollback | tested durable assistant task and evidence | `docs/runbooks/tested-release.md` |
| Infrastructure | reviewed task/IAM/S3/KMS configuration applied | `tested-release.md` |
| Operations | restore/alert exercise and provider setup recorded | compliance checklist/runbooks |
| Preflight artifact | private, exact-SHA, under 24 hours, complete | `tested-release.md` |

Read `.github/workflows/deploy.yml`, `scripts/deploy-release.py`, and
`docs/runbooks/tested-release.md` when assessing a real release. Use actual tool
outputs, not illustrative empty objects.

## Go/no-go template

| Gate | Status (ready/blocker/unknown) | Evidence | Owner | Next action |
|---|---|---|---|---|

End with one decision: **GO**, **NO-GO**, or **CONDITIONAL**. Unknown external
evidence is a blocker, not an assumed pass.
