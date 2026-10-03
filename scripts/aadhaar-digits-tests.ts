/**
 * No real Aadhaar-shaped numbers in the repository — `bun run scripts/aadhaar-digits-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml.
 *
 * Product rule: an Aadhaar number is shown by its last 4 digits only, and the
 * full number lives as ciphertext in `aadhaar_vault`. Test fixtures, docs and
 * sample payloads therefore use synthetic numbers only. This guard scans every
 * tracked text file (`git ls-files`) for 12-digit runs, with or without a
 * space or hyphen after each group of four.
 *
 * A run is allowed when:
 *   (a) its first digit is 0 or 1 — UIDAI never issues those;
 *   (b) it is the synthetic repeated form, one group of four three times
 *       (the fixtures use the 1234, 5678 and 4321 groups);
 *   (c) its file is on the reviewed PATH_ALLOW list below — but only when the
 *       line itself does not mention Aadhaar (the line rule). A path that
 *       mentions Aadhaar can never be listed at all (the entry rule).
 *
 * Output is `path:line` only. The matched digits are never printed, so the
 * guard's own log can never become the leak it exists to prevent.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
/** An Aadhaar-shaped run: twelve digits, optionally grouped 4-4-4 by a space or hyphen. */
const RUN = /(?<![\d.])\d{4}[ -]?\d{4}[ -]?\d{4}(?![\d.])/g;
const AADHAAR_CONTEXT = /aadha?ar|ఆధార్/i;
const SYNTHETIC = /^(\d{4})\1\1$/;

type Allow = { path: string; reason: string };

/**
 * Reviewed files whose 12-digit runs are not Aadhaar numbers. Every entry
 * names why. A hit on a line that mentions Aadhaar is still reported here.
 */
const PATH_ALLOW: Allow[] = [
  // AWS account ids (Terraform state bucket names and the AWS-owned ELB log-delivery account)
  { path: 'infra/terraform/envs/dev/persistent/backend.tf', reason: 'AWS account id in the Terraform state bucket name' },
  { path: 'infra/terraform/envs/dev/runtime/backend.tf', reason: 'AWS account id in the Terraform state bucket name' },
  { path: 'infra/terraform/envs/prod/persistent/backend.tf', reason: 'AWS account id in the Terraform state bucket name and its bootstrap comment' },
  { path: 'infra/terraform/envs/prod/runtime/backend.tf', reason: 'AWS account id in the Terraform state bucket name' },
  { path: 'infra/terraform/envs/prod/university/backend.tf', reason: 'AWS account id in the Terraform state bucket name' },
  { path: 'infra/terraform/envs/prod/university/main.tf', reason: 'AWS account id in the remote-state bucket name' },
  { path: 'infra/terraform/modules/persistent/s3.tf', reason: 'AWS-owned ELB log-delivery account for ap-south-1' },
  // UUIDs: a UUID's middle groups or its last group can form a 12-digit run
  { path: 'packages/core/src/format/audit.test.ts', reason: 'UUID audit target fixture' },
  { path: 'tests/e2e-app/fixtures/session.ts', reason: 'UUID-shaped Cognito subject fixture' },
  { path: 'tests/e2e-app/specs/10-record-photos.spec.ts', reason: 'UUID stored photo id fixture' },
  { path: 'tests/e2e-app/specs/19-sections-legacy.spec.ts', reason: 'UUID audit target fixture' },
  // +91 phone numbers (country code plus ten digits)
  { path: 'scripts/seed-web360.py', reason: '+91 phone numbers in seeded invitations' },
  { path: 'services/api/src/associates.py', reason: '+91 phone number in a comment on contact masking' },
  { path: 'services/api/src/ticketing.py', reason: '+91 phone number in the mask_contact doctest' },
  { path: 'services/api/tests/test_api_misc_hardening.py', reason: '+91 phone numbers for SMS/WhatsApp sends' },
  { path: 'services/api/tests/test_associates.py', reason: '+91 phone number normalisation cases' },
  { path: 'services/api/tests/test_notification_retention.py', reason: '+91 phone number recipient fixture' },
  { path: 'services/api/tests/test_ticketing.py', reason: '+91 phone number contact-masking cases' },
  { path: 'tests/e2e-app/specs/14-ticket.spec.ts', reason: '+91 phone number in a tel: link' },
  { path: 'tests/e2e-web360/specs/tickets.spec.ts', reason: '+91 phone numbers for assignee contacts' },
];

/** Entry rule: a file that mentions Aadhaar in its path can never be path-allowed. */
function allowErrors(list: Allow[]): string[] {
  const errors: string[] = [];
  for (const entry of list) {
    if (AADHAAR_CONTEXT.test(entry.path)) errors.push(`PATH_ALLOW entry mentions Aadhaar: ${entry.path}`);
    if (!entry.reason.trim()) errors.push(`PATH_ALLOW entry has no reason: ${entry.path}`);
  }
  return errors;
}

/** The 1-based line numbers of every unallowed run in `text`. */
function unallowedLines(path: string, text: string, allowed: Set<string>): number[] {
  const lines: number[] = [];
  const pathAllowed = allowed.has(path);
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(RUN)) {
      const digits = match[0].replace(/[ -]/g, '');
      if (digits[0] === '0' || digits[0] === '1') continue;
      if (SYNTHETIC.test(digits)) continue;
      if (pathAllowed && !AADHAAR_CONTEXT.test(line)) continue;
      lines.push(index + 1);
      break;
    }
  });
  return lines;
}

let failures = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name}`); }
};

// ── Self-tests (every value is built from parts, so this file holds no run) ──
const group = (first: number) => String(first) + String(first + 1) + String(first + 2) + String(first + 3);
const realLike = [group(2), group(5), group(1)]; // a 2–9 start, not the repeated form
const none = new Set<string>();
check('a real-looking run is reported', unallowedLines('x.ts', `const id = '${realLike.join('')}';`, none).length === 1);
check('a spaced run is reported', unallowedLines('x.ts', `id ${realLike.join(' ')}`, none).length === 1);
check('a hyphenated run is reported', unallowedLines('x.ts', `id ${realLike.join('-')}`, none).length === 1);
check('the line number is 1-based', unallowedLines('x.ts', `one\ntwo ${realLike.join('')}`, none)[0] === 2);
check('rule (a): a run starting with 0 is allowed', unallowedLines('x.ts', `n ${'0' + realLike.join('').slice(1)}`, none).length === 0);
check('rule (a): a run starting with 1 is allowed', unallowedLines('x.ts', `n ${'1' + realLike.join('').slice(1)}`, none).length === 0);
check('rule (b): the repeated synthetic form is allowed', unallowedLines('x.ts', `Aadhaar ${[group(5), group(5), group(5)].join(' ')}`, none).length === 0);
check('a longer digit string is not a run', unallowedLines('x.ts', `n ${realLike.join('')}9`, none).length === 0);
check('a decimal tail is not a run', unallowedLines('x.ts', `n 80.${realLike.join('')}`, none).length === 0);
check('rule (c): a path-allowed file passes a non-Aadhaar line', unallowedLines('infra/a.tf', `account = "${realLike.join('')}"`, new Set(['infra/a.tf'])).length === 0);
check('line rule: an Aadhaar line in a path-allowed file is reported', unallowedLines('infra/a.tf', `aadhar = "${realLike.join('')}"`, new Set(['infra/a.tf'])).length === 1);
check('line rule: the Telugu word counts as Aadhaar context', unallowedLines('infra/a.tf', `ఆధార్ ${realLike.join(' ')}`, new Set(['infra/a.tf'])).length === 1);
check('entry rule: an allow entry named like an Aadhaar fixture fails', allowErrors([{ path: 'tests/aadhaar-fixture.ts', reason: 'x' }]).length === 1);
check('entry rule: an allow entry needs a reason', allowErrors([{ path: 'infra/a.tf', reason: ' ' }]).length === 1);
check('entry rule: a plain entry passes', allowErrors([{ path: 'infra/a.tf', reason: 'account id' }]).length === 0);

// ── The repository scan ──────────────────────────────────────────────────────
for (const error of allowErrors(PATH_ALLOW)) check(error, false);
const listed = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
if (listed.status !== 0) {
  check('git ls-files runs', false);
} else {
  const files = [...new Set(listed.stdout.split('\0').filter(Boolean))].sort();
  const allowed = new Set(PATH_ALLOW.map((entry) => entry.path));
  const used = new Set<string>();
  for (const path of files) {
    let bytes: Buffer;
    try { bytes = readFileSync(join(ROOT, path)); } catch { continue; } // deleted in the worktree
    if (bytes.subarray(0, 8000).includes(0)) continue; // binary
    const text = bytes.toString('utf8');
    if (allowed.has(path) && unallowedLines(path, text, none).length > 0) used.add(path);
    for (const line of unallowedLines(path, text, allowed)) {
      failures += 1;
      console.error(`FAIL: Aadhaar-shaped number at ${path}:${line}`);
    }
  }
  for (const entry of PATH_ALLOW) {
    if (!used.has(entry.path)) check(`PATH_ALLOW entry no longer needed: ${entry.path}`, false);
  }
}

console.log(failures === 0 ? 'AADHAAR DIGITS TESTS PASS' : `AADHAAR DIGITS TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
