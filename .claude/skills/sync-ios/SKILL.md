---
name: sync-ios
description: Adapt a web change into the native iOS app, by hand. Use when the user says "/sync-ios", "sync this to iOS", "catch iOS up", "does the phone need this?", or asks what a web change means for apps/ios. Takes an optional commit ref or range; defaults to the working tree.
---

# Sync a web change into iOS

The manual twin of the `post-commit` hook. Same contract, same triage, nothing
detached — use this to check a change before committing, or to re-run a sweep
the hook already did.

## Steps

**1. Find the range.** `$ARGUMENTS` is a commit ref, a range, or empty.
Empty means the working tree.

**2. Get the mechanical findings first.**

```bash
bun run scripts/parity-check.ts $ARGUMENTS --json
```

This already knows about unported twins, stale vectors, fields `Queries.swift`
names that the Python schema no longer has, doc-taxonomy splits and
contractual token moves. Do not re-derive any of it by reading files.

**3. Read the contract**, then do the work:
`docs/specs/2026-08-22-web-ios-parity-contract.md`.

Delegate the adaptation to the `ios-parity` agent, which carries the full brief:

> Adapt commit `<ref>` into apps/ios. Here is `parity-check --json`: `<output>`.
> Follow `docs/specs/2026-08-22-web-ios-parity-contract.md`. Write the report to
> `docs/parity/<short-sha>.md`.

For a small, obvious port — one rule, one twin module — just do it inline
rather than spawning an agent.

**4. Verify.**

```bash
bun run scripts/emit-vectors.ts        # only if you added a vector case
cd apps/ios/PattadarKit && swift test
rm -rf apps/ios/PattadarKit/.swiftpm apps/ios/PattadarKit/.build
```

`swift test` is the gate. **Never** run `apps/ios/verify.sh` on the user's
behalf — it installs onto their physical iPhone.

## What "done" looks like

Report to the user, in this order:

1. what was ported, and to which Swift file
2. what was deliberately **not** ported, and why (usually: it is web layout, or
   it lives on the `Query.web` namespace iOS does not read)
3. anything filed as **NEEDS-FOUNDER**
4. the `swift test` result

An empty sweep with a stated reason is a good outcome. Most `apps/web/src/w360/**`
diffs correctly produce no Swift at all.
