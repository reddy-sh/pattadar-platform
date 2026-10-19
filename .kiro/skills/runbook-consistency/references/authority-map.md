# Documentation Authority Map

## Facts and rules

- **Facts** (paths, commands, ports, flags, counts, current behavior): current
  executable behavior wins; fix the doc.
- **Rules** (`SECURITY.md` policy, `design.md` locked rules, the README and
  `.kiro/steering/pattadar-standards.md` invariants, recorded Reddy decisions):
  code that disagrees is a defect or a decision for Reddy. Report it; never
  edit a rule to match code.

## Levels (precedence for facts)

1. Current executable behavior: source, scripts, workflows, Terraform.
2. Root `README.md`, `SECURITY.md`, `design.md`, then the always-on steering
   (`.kiro/steering/*.md`). Where a steering file and
   README/design disagree, prefer README/design and flag the drift.
3. Current operational docs: `docs/runbooks/`, service/app READMEs,
   `docs/architecture.md` and current `docs/architecture/` files,
   `docs/compliance/`, `docs/qa/`.
4. Active specs/contracts (`docs/specs/`, `docs/superpowers/specs/`); check
   each status against source.
5. Historical: dated reviews, plans (`docs/plans/`,
   `docs/superpowers/plans/`), repair reports (`docs/parity/`), examples, and
   illustrative payloads.

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
