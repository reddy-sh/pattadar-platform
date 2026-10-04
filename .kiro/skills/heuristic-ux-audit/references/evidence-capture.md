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
- Read it by the same size rule as a capture (§ 2, after the spec): never
  open a side over 2000 px; read a `sips -Z 1800` copy or crops in `scratch/`.
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
import { writeFileSync } from 'node:fs';
import { test, expect } from '../fixtures/harness';

const OUT = process.env.UX_AUDIT_EVIDENCE ?? '';

// Marketing, legal and auth pages are public, so their tests go in here.
// /app/* tests stay outside it, signed in by the harness.
test.describe('public', () => {
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
});

// § Interaction states: one test per control the inventory found, each from
// its own load; this one is a text input. For a popover trigger, swap the
// typed states for a click on it, a wait for its surface by role and name and
// capture('popover-open'), then choose an option. A public page's test goes in
// the describe above. Replace each <…>.
test('ux-audit states · <page> · <control> @phone', async ({ page }, info) => {
  expect(OUT, 'set UX_AUDIT_EVIDENCE to the audit evidence folder').not.toBe('');
  const control = '<control>'; // a slug: in every evidence name and the key of both JSON files
  const field = page.getByLabel('<the label the code renders>');
  const stage = page.locator('<the viewport instrument, e.g. a map stage>'); // none: drop shift
  const file = (kind: string) => `${OUT}/<page>-${control}-${kind}-${info.project.name}`;
  const shift: Record<string, unknown> = {};
  const rings: Record<string, unknown> = {};
  // Both JSON files are rewritten in every state, so a failing step keeps the
  // states before it. measure = false for a state from another load or scheme.
  const capture = async (state: string, measure = true) => {
    await page.screenshot({ path: `${file(state)}.png`, animations: 'disabled' });
    // A viewport box moves when focus(), fill() or click() scroll a target into
    // view, so add back every ancestor's scroll (<html> holds the window's).
    if (measure) shift[state] = await stage.evaluate((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      let sx = 0, sy = 0;
      for (let n = el.parentElement; n; n = n.parentElement) { sx += n.scrollLeft; sy += n.scrollTop; }
      return { x, y, width, height, scrollX: sx, scrollY: sy, pageX: x + sx, pageY: y + sy };
    });
    writeFileSync(`${file('shift')}.json`, JSON.stringify({ [control]: shift }, null, 2));
    writeFileSync(`${file('focus')}.json`, JSON.stringify({ [control]: rings }, null, 2));
  };
  // outline-*, box-shadow and border-color of the focused element and of the
  // visible container that draws the control, such as a pill.
  const ring = () => field.evaluate((el, box) => [el, el.closest(box)].map((node) => {
    const s = node && getComputedStyle(node);
    return s && { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      offset: s.outlineOffset, shadow: s.boxShadow, border: s.borderColor };
  }), '<the visible container>');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('<route>');
  await expect(field).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await capture('resting');
  await field.focus();
  await expect(field).toBeFocused();
  rings.dark = await ring();
  await capture('focused');
  await field.fill('<a value the fixtures hold>');
  await expect(page.getByText('<a match>')).toBeVisible();
  await capture('typed-match');
  await field.fill('<a value no fixture holds>');
  await expect(page.getByText('<the no-match sentence>')).toBeVisible();
  await capture('typed-none');
  await field.fill('<a value the fixtures hold>');
  await page.getByRole('button', { name: '<a match>' }).click(); // or option, link
  await expect(page.getByText('<what choosing it shows>')).toBeVisible();
  await capture('chosen');
  // High Contrast, W360 pages only: the theme menu is in the signed-in shell.
  // Elsewhere delete this block and list it as not applicable. The harness
  // writes its own scheme again on every load, so load once more, switch
  // through the app's menu and stay. Another load and scheme: not measured.
  await page.goto('<route>');
  await page.getByRole('button', { name: 'Change theme' }).click();
  // Choose with Enter, not a click: after a click, a scripted focus matches
  // :focus-visible only on a text input, so a button's ring would read none.
  await page.getByRole('menuitemradio', { name: 'High Contrast' }).press('Enter');
  await expect(page.locator('[data-scheme="highContrast"]')).toHaveCount(1);
  await field.focus();
  rings.highContrast = await ring();
  await capture('focused-highcontrast', false);
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
- Read a capture back as SKILL.md § Safety says: check it with
  `sips -g pixelWidth -g pixelHeight`, and never open one with a side over
  2000 px. A `phone` shot is 3× (1170 wide, and a `-full` shot is far taller),
  so read a `sips -Z 1800` copy, or crops no larger than 1800 px on either
  side, written to the audit folder's `scratch/`.
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

## Interaction states

A page at rest shows none of what happens once someone uses it. For every text
input, popover trigger and list control in the inventory (SKILL.md step 3),
capture each state below that applies to it, or list it as not verified.

| State | How the sealed spec drives it |
|---|---|
| resting | `goto`, then wait for the control |
| keyboard focus | `focus()` on the control, from a fresh load or after a key press, never straight after a click, then `toBeFocused()` |
| typed with matches | `fill()` with a value the fixtures hold, then wait for a match |
| typed with no match | `fill()` with a value no fixture holds, then wait for the no-match words |
| popover open | click the trigger, then wait for the surface by role and name |
| an item chosen | click an option or a match, then wait for what choosing it shows |

Loading, empty and failed are provoked per test before `goto`, as § 2
describes. The template's states test drives one control; write one test per
control, each loading the page itself and naming its own `control`.

- Name every evidence file `<page>-<control>-<state>-<project>`, the control
  being a slug of its inventory name (`search`, `filter`, `results`) and the
  state `resting`, `focused`, `focused-highcontrast`, `typed-match`,
  `typed-none`, `popover-open`, `chosen`, `loading`, `empty` or `failed`.
- Write the viewport instrument (a map stage, a chain canvas, a media viewer)
  in every state to `<page>-<control>-shift-<project>.json`, the shift file:
  its viewport box (`x`, `y`, `width`, `height`), its ancestors' summed scroll
  (`scrollX`, `scrollY`), and the two added, its page position (`pageX`,
  `pageY`). `focus()`, `fill()` and `click()` scroll their target into view,
  which moves the viewport box but not the page position, so pass 9 can tell a
  scroll from a move, in pixels instead of by comparing two pictures.
- In each focus state, write the computed `outline-style`, `outline-width`,
  `outline-color` and `outline-offset` of the focused element and of the
  visible container that draws the control (a pill, a field row), plus the
  `box-shadow` and `border-color` some rings use, to
  `<page>-<control>-focus-<project>.json`, in Dark and in High Contrast. Pass
  12 traces the rule behind each value.
- Read every ring as a keyboard user meets it. The rings in `w360.css` and
  `site.css` are `:focus-visible` rules, and once the last input is a click,
  Chromium (the `app` project) and WebKit (`phone`) match `:focus-visible` on
  a scripted `focus()` only for a text input. So when any other control's
  ring is read after clicks (a trigger once High Contrast is on, an option in
  a popover opened by click), make the last input a key: choose with Enter, as
  the template does, or move with Tab or an arrow key. A modifier key alone,
  such as Shift, counts in Chromium but not in WebKit.
- Key both JSON objects by control and write them again after every state, as
  the template does, so a step that fails keeps what was measured before it.
- High Contrast, W360 pages only: the theme menu and `data-scheme` belong to
  the signed-in W360 shell, and design.md § Theme choice and persistence keeps
  marketing dark. On any other page, list High Contrast as not applicable.
  The harness's `scheme` option takes only `dark` or `light`, its init script
  writes that scheme again on every document load, and `fixtures/` is never
  edited. So after `goto`, click
  `getByRole('button', { name: 'Change theme' })`, then press Enter on
  `getByRole('menuitemradio', { name: 'High Contrast' })`, assert
  `[data-scheme="highContrast"]`, and do not navigate again. This state comes
  from another load and scheme, so it is not measured for the shift file.
- Not verified: a user's screenshot shows one state and source only shows
  none. Name every state not captured, with its control and width, in the
  report and in the footer's "Not verified" line.

## Never

- `e2e-web360` (it seeds and writes a database), the `live` project, a browser
  attached to a signed-in session, founder or production data, or a built
  bundle (`apps/web/dist`, `.local/e2e-web360-dist-*`) as current evidence.
- Starting any server, or installing a browser or package, without the user's
  approval.
