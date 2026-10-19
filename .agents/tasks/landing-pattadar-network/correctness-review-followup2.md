# Pattadar Network follow-up 2: eight-card offerings, server-only ID-number message, consent pin

Commit `4a95ca4` renames "Lawyers and advocates" to "Lawyers and legal connect", so legal connect is one card. It also replaces the catch-all "Valuers, builders and more" with a real "Property valuers" card, so the list is exactly eight Coming soon cards. It closes the two nits from the first correctness review. The form now maps any server `invalid` on a free-text field that passes every client check to the ID-number sentence, and pytest pins `sha256(CONSENT_TEXT)`. The interest enum is unchanged, so stored rows and the server allowlist need no compatibility work. A new guard group F pins the card titles and checks that the form choices equal `network.INTERESTS`.

Watch for: the new server-only mapping treats every free-text refusal the client cannot explain as an ID-number refusal. A pasted tab or other control character, which the server refuses and the client does not check, now shows "Please don't enter Aadhaar…" (likely, non-blocking).

**Verdict**: APPROVED

## High-level view

The card list in `landingContent.ts` `NETWORK.items` is in the requested order: sell, buy, rent or lease, lawyers and legal connect, licensed surveyors, document writers, land developers, property valuers. Every card has the shared `Coming soon` chip, and the section keeps "No listings or professionals are on Pattadar today." The new valuer body says "A planned way…", like the other cards, so nothing claims a live service. The `more` icon was removed and `calculate` already existed in `ICONS`, so no card renders without an icon. "Legal connect" no longer appears anywhere in active web copy except the guard comment and the spec note that records the merge.

The form already had a choice for each professional card (`lawyer`, `surveyor`, `document_writer`, `developer`, `valuer`), plus `other_professional`, `sell`, `buy`, `rent` and `lease`. Those ten values equal the server `INTERESTS` frozenset, and guard F4 now enforces that equality by parsing `network.py`. With no enum change, existing `network_interest` rows stay valid. `packages/core` has no interest mirror; it holds only the phone and ID-number helpers, which this commit leaves alone.

`serverError` now re-runs `check(v)` and shows `COPY.errors.idNumber` when a server `invalid` lands on name/district/mandal/note and the client finds nothing wrong with that field, or the client already flagged it as ID-like. This closes the original nit for Telugu and full-width digit runs, and a new e2e test covers it. The heuristic is broader than ID numbers, though. The server's `_free_text_ok` also refuses control characters, and the client does not mirror that check, so those refusals now get the ID-number sentence too.

The consent pin is a one-line pytest that hashes `network.CONSENT_TEXT` and compares it with `CONSENT_TEXT_SHA256`. It runs alongside the existing guard that keeps the web text, the version and the hash in step.

<details>
<summary>Issues (2)</summary>

1. **Control-character refusals labelled as ID numbers** (likely, nit): a name, district, mandal or note containing a pasted tab or another C0 control character passes `check()` but fails the server's `_CONTROL` check, and `serverError` now shows the Aadhaar sentence. Either mirror the control-character test in `check()` (strip or refuse with the field's sentence), or limit the ID-number mapping to text that contains a non-ASCII digit run.
2. **Stale "wording unchanged" comment** (confirmed, nit): the `NETWORK` doc comment still says the former ROADMAP items keep "their wording unchanged", but the lawyer card title changed in this commit. Reword the comment so it matches the current titles.

</details>

<details>
<summary>Details</summary>

### Server-only refusal mapping in `serverError`

```ts
const freeText = ['name', 'district', 'mandal', 'note'].includes(f);
const own = check(v)[f];
const idLike = freeText && (own === undefined || own === COPY.errors.idNumber);
```

The server's free-text check runs three tests in order: length, then control characters (`[\x00-\x1f\x7f]`, with newlines allowed in the note), then `_AADHAAR_LIKE`. The client mirrors length (it is stricter for astral characters, because JS `.length` counts UTF-16 units) and the ASCII Aadhaar-like run, but not control characters. So "client passes, server refuses" has two causes: non-ASCII digit runs, which this fix targets, and control characters, which it misattributes. Neither a single-line MUI input nor the multiline note stops a pasted tab, so a user pasting from a spreadsheet would see "Please don't enter Aadhaar or other ID numbers here." against an ordinary name.

Before this commit, the same case showed the field's own sentence ("Enter your name." or "Keep the note to 500 characters."), which was also wrong. That makes this a change of wrong message rather than a regression in safety, and the submission is still refused. It is non-blocking.

When the client already flags a length problem, `own` is the field's length sentence, so the mapping falls back to `COPY.errors[f]`. Because client and server check length first in the same order, that fallback is correct.

### Test coverage

Guard group F pins the exact title array, allows only one legal/lawyer/advocate card, requires a form choice for each professional card, and checks that the form choices equal `INTERESTS`. e2e spec 20 adds an ordered `.card__h` assertion with a zero count for a bare "Legal connect" title. It also adds a stubbed test for a server-only ID-number refusal using Telugu digits, which checks both the alert text and focus. Recorded evidence: guard A–F pass, spec 20 15/15, API pytest 721, and local functional acceptance creating `sell` and `valuer` rows.

Not tested: a server `invalid` on district, mandal or note through the new mapping (only `name` is exercised), and the control-character path described above.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/pages/landing/landingContent.ts`: lawyer card retitled, valuer card replaces the catch-all, comment updated.
- `apps/web/src/pages/landing/LandingPage.tsx`: unused `more` icon removed.
- `apps/web/src/pages/landing/NetworkInterestForm.tsx`: `serverError` maps server-only free-text refusals to the ID-number sentence.
- `scripts/network-interest-tests.ts`: group F (titles, single legal card, form choices equal `INTERESTS`).
- `tests/e2e-app/specs/20-public-auth.spec.ts`: ordered card titles; server-only ID-number test.
- `services/api/tests/test_network_interest.py`: value-free error-log tests; `CONSENT_TEXT` SHA-256 pin.
- `services/api/tests/test_network_interest_db.py`: masked-error log assertion updated to class-only.
- `services/api/src/main.py`: `PattadarSchema.process_errors` and `MaskUnexpectedErrors` log value-free for this root (security fix; outside this correctness scope).
- `docs/specs/TODO-pattadar-network.md`, `design.md`, `services/api/README.md`: offerings table, revision note, log invariant.

Full diff: `git diff HEAD~1` in the worktree.

</details>
