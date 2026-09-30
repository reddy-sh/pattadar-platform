# Evidence capture

How to get the CURRENT state without reaching real data. Use the first option
that works and write the one used in the board footer.

1. The user's screenshots.
2. A temporary sealed capture through `tests/e2e-app`.
3. Source only.

Every audit also reads the source, because counts and citations come from code.
A render adds appearance: what is above the fold, how text wraps, and what the
phone width hides.

## 1. The user's screenshots

- A screenshot attached in chat is cited as "user screenshot N" with the region
  described. For one given as a file path, copy it (never move it) to
  `evidence/user-<n>.png` in the audit folder.
- It may show real records. Keep it under `.local/` only. Never transcribe owner
  names, survey numbers, places or amounts from it into a board; draw the
  schematic from fixture records (`tests/e2e-app/fixtures/seed.ts`) or generic
  labels.
- Its revision is unknown, so label it "user screenshot, revision unknown" and
  confirm every count against current source.
- When the user asks to keep an audit under `docs/`, leave real-record
  screenshots out and say so.

## 2. Temporary sealed capture

The sealed harness answers every `/api` call from fixtures, so a capture reads
and writes no real data. It drives the dev server the founder already runs;
this skill never starts or stops it.

### Before

- Check the server the user is running, read-only:
  `curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:<port>/app`.
  `scripts/start-local.sh` pins 5180, which is the harness default; a plain
  Vite dev server answers on 5173. Use the port from the user's URL when they
  give one, and pass it to the run as `APP_WEB_URL`. Anything but `200` means
  source only. Never start a server.
- Record the test tree's state:
  `git status --short --untracked-files=all tests/ | shasum`.

### The spec

Write `tests/e2e-app/specs/zz-ux-audit-<slug>.spec.ts`. The `zz-ux-audit-`
prefix makes a leftover obvious. The `@phone` tag runs the same test in the
`app` project (1512×950) and the `phone` project (iPhone 14, 390 wide).

```ts
/** TEMPORARY heuristic-ux-audit capture. Delete as soon as it has run. */
import { test, expect } from '../fixtures/harness';

const OUT = process.env.UX_AUDIT_EVIDENCE ?? '';

// Marketing, legal and auth pages are public. Leave signed in for /app/*.
test.use({ signedIn: false });

test('ux-audit capture · landing @phone', async ({ page }, info) => {
  expect(OUT, 'set UX_AUDIT_EVIDENCE to the audit evidence folder').not.toBe('');
  // The finished picture: scenes mount complete and nothing is mid-motion.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const name = `landing-${info.project.name}`;
  await page.screenshot({ path: `${OUT}/${name}-top.png`, animations: 'disabled' });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true, animations: 'disabled' });
});
```

- Import `test` from `../fixtures/harness`, never from `@playwright/test`.
- Never set `allowEscapes` or `sealed: false`, and never run the `live`
  project. A capture that fails on an unanswered `/api` call, or on a console
  error it did not provoke, has found something: report it (harness questions
  go to `test-governance`) and fall back to source only for that state.
- A failure state is provoked with a non-2xx answer, and Chrome logs every
  non-2xx response as a console error. Put only those captures in a
  `test.describe` with `test.use({ allowConsole: true })` and a comment saying
  the error is provoked, as `tests/e2e-app/AUTHORING.md` rule 8 allows.
- Never edit `fixtures/`. Set states per test before `goto`, as
  `tests/e2e-app/AUTHORING.md` describes: `world.patch('<key>', …)` for an
  empty state, `world.set('<key>', World.gqlError('…'))` or
  `World.httpError(503)` for a failed read, `World.never()` for loading. Import
  `World` from the harness and record ids from `../fixtures/ids`.
- No `waitForTimeout`. Wait on what a person would see.
- The `-top` shot is one viewport, which is what pass 1's "filled buttons per
  viewport" counts. The `-full` shot is the whole page for the schematic.
- A still cannot show motion. Motion findings come from source (pass 7).

### Run

From `tests/e2e-app` as the working directory:

```sh
APP_WEB_URL="http://localhost:<port>" \
UX_AUDIT_EVIDENCE="<repo>/.local/ux-audits/<slug>/evidence" \
  ./node_modules/.bin/playwright test specs/zz-ux-audit-<slug>.spec.ts \
  --project=app --project=phone --reporter=line \
  --output="<repo>/.local/ux-audits/<slug>/pw-output"
```

`--reporter=line` replaces the configured reporters, so the user's
`results.json` and `playwright-report/` are not overwritten. `--output` moves
the results folder, because Playwright empties its output folder at the start
of a run and would otherwise delete the user's `test-results/`.

### After, on success or failure

- Delete the spec and the `pw-output` folder.
- Re-run the `git status … | shasum` line. It must match the first hash. If
  not, find and undo only what the capture added.

## 3. Source only

- Read the page component, its stylesheet and its content module. Trace each
  rendered element to `file:line`, and read the breakpoints from the CSS
  (`site.css` for marketing, `w360.css` for the app).
- The footer says "Evidence: source only, not rendered".
- List what source cannot settle as not verified: the fold line, wrapping,
  measured contrast, real image sizes and the per-viewport button count.

## Never

- `e2e-web360` (it seeds and writes a database), the `live` project, a browser
  attached to a signed-in session, founder or production data, or a built
  bundle (`apps/web/dist`, `.local/e2e-web360-dist-*`) as current evidence.
- Starting any server, or installing a browser or package, without the user's
  approval.
