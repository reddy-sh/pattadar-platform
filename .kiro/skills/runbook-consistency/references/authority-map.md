# Documentation Authority Map

## Default precedence

1. Current executable behavior: source, scripts, workflows, Terraform.
2. Root `README.md`, `SECURITY.md`, active design and steering invariants.
3. Current operational runbooks and service READMEs.
4. Active specs/contracts.
5. Historical plans, repair reports, examples, and illustrative payloads.

When sources at the same level conflict, report the conflict and ask rather than
inventing a winner.

## Required distinctions

- Implemented code ≠ deployed control.
- Local test pass ≠ production readiness.
- Terraform declaration ≠ applied infrastructure.
- Checked historical phase item ≠ current compliance evidence.
- Historical estimate ≠ current billing.
- Illustrative JSON/IDs ≠ valid operator evidence.

## Repeat on every audit

- Compare phase/status language to actual entrypoints, routes, workflows, and
  tests; classify old plans/reports as historical.
- Verify every relative link/path exists and names the right authority.
- Check identity text against immutable issuer/subject + reviewed legacy bindings.
- Check lifecycle commands against current scripts/runbooks; never preserve stale
  targeted/state-surgery shortcuts.
- Inventory actual retained test suites before documenting CI/coverage.
- Ensure architecture says declared/implemented unless live evidence proves
  deployed state.
