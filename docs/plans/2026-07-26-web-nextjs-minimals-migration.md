# Web Head Migration: Vite/MUI SPA → Next.js (Minimals) + rfactory Naming Purge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Adversarially verified 2026-07-26 (3-lens review: accuracy / coverage / feasibility); all confirmed findings are folded in below.

**Goal:** Rebuild `apps/web` as a Next.js application founded on the Minimals dashboard template (`~/Downloads/react-template`, @minimal-kit/next-js 5.7.0), at full feature parity with the current Vite SPA, and purge every remaining `rfactory`/`rhub` legacy name from the platform.

**Architecture:** A new `apps/web-next` workspace starts from the Minimals kit but is modernized to the repo's existing stack (React 19 + MUI 9, Next 16). The ~21.4k-LOC page layer of the current `apps/web` — already MUI, already live-tested, already gated by the 46-test Playwright suite — ports across with only routing/data-plumbing changes; the Minimals *design slice* (theme, dashboard layout, nav, core components) is upgraded to MUI 9 once and becomes the app's visual foundation. Backend, gateway, auth model, and GraphQL contract are untouched. Cutover swaps CloudFront's default origin from the S3 SPA bucket to a new `web` ECS service, then `apps/web` is deleted and `web-next` takes its name.

**Tech Stack:** Next.js **16.2.x** (App Router, Turbopack, `output: 'standalone'`), React 19.2.8, MUI 9.2.0, TanStack Query 5, `@pattadar/core` + `@pattadar/tokens`, amazon-cognito-identity-js + oidc-client-ts, Bun workspaces, Playwright (`tests/e2e-ux`), ECS Fargate ARM64 + CloudFront.

## Global Constraints

- **FOUNDER RULE:** customers must never see a non-pattadar.com URL (no amazoncognito.com; native login pages; `auth.pattadar.com` only for social redirects).
- **Invariant:** `services/api` trusts `x-user-id`; it must never be reachable except through the gateway. The gateway strips client identity headers and injects `x-user-id` from validated Cognito claims — do not add any client-side `x-user-id` in production code paths.
- **Invariant:** user id = email local-part, lowercased. The normalization in `services/gateway/app/auth.py` is byte-identical to rhub — do NOT "improve" it.
- **Invariant:** AI extraction routes (`/import-*`, `/extract-*`) run up to 180 s — every hop needs ≥200 s timeout and must never retry.
- **GraphQL convention:** every mutation arg is required — send `''` / `false` / `0` for unused.
- **No mock data in shipped UI:** `useLiveOrSample` is live-only; failures render shape-correct empty data + "Service unreachable" chip (founder decision 2026-07-26).
- **Copy rules:** DD/MM/YYYY dates, INR formatting via `@pattadar/core`, no internal/roadmap copy in user-facing UI. Brand is **Pattadar** everywhere — zero `rfactory`/`R Factory`/`rhub` in anything user-visible or in new code.
- **Deploy gates:** prod deploys and prod terraform applies require explicit founder approval — stage, do not apply.
- **e2e gate:** `tests/e2e-ux` (**11 specs, 46 tests** — `bunx playwright test --list` says "Total: 46 tests in 11 files") is the acceptance gate. Selectors are role/text-based — ported pages must keep headings, button labels, and aria roles stable. **URL shape is asserted too — do NOT enable `trailingSlash` (the kit's next.config sets it; ours must not).**
- Bun ≥1.3 for all JS work (`bun install`, `bun run --filter ...`); never pnpm/yarn in this repo.
- Work directly on `main`, push to `origin/main` (pre-release, no PRs). Frequent small commits.

## Locked decisions (founder-approved 2026-07-26 unless noted)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Web framework | Next.js (founder-directed) |
| D2 | Template | Minimals v5.7.0 JS kit at `~/Downloads/react-template` |
| D3 | Version strategy | **Modernize the template slice** to React 19 + MUI 9 + Next 16.2.x; keep the existing page code's stack. (Fallback if the slice upgrade stalls badly: freeze on template's Next 14/React 18/MUI 5 and downgrade pages — costlier, not recommended.) |
| D4 | Landing page | Keep the founder-approved Aceternity-style `LandingPage` as-is; Minimals styling applies to the app shell, not the marketing page |
| D5 | Wallet | Stays "coming soon" placeholder |
| D6 | Storage org ids | Rename `rfactory` → `pattadar` (PG rows only — S3 keys are `owner/node/version`, no object copy needed) |
| D7 | Metadata DB name `hub` | Defer rename to the next platform-down/up cycle; tracked, not in this plan's critical path |
| D8 | Prod deploy of the new web | Staged behind founder gate (terraform plan + ECR image ready, no apply/flip without approval) |
| D9 | `/.well-known/*` (mobile app links) | Files move into `apps/web-next/public/.well-known/`; in ecs mode the CloudFront ordered behavior retargets to the ALB origin. One deploy path, no orphaned bucket dependency. |
| D10 | Historical docs mentioning rhub | Design specs (`docs/specs/*`), `docs/runbooks/migration.md` commands, and `test_user_id.py` fixtures are **deliberate keeps** (historical record / target the real source system / pin behavior). READMEs, compliance docs, `.env.example` comments, and workflow comments get reworded (Task A5). |

---

# Phase A — rfactory naming purge (independent; do first)

### Task A1: Customer-visible "R Factory" copy → Pattadar

**Files:**
- Modify: `services/api/src/main.py:1631-1632,1645,2490-2491,2543-2544`
- Modify: `services/api/src/notify.py:49`

**Interfaces:** none (string-only changes).

- [ ] **Step 1: Edit the 8 strings** — in `main.py` replace every `R Factory` with `Pattadar` in: inactivity nudge subject+body (1631-1632), escalation body (1645), heir-invite subject+body (2490-2491), test-notification subject+body (2543-2544). In `notify.py:49` the default is an **inline arg inside the Resend POST body** (there is no FROM_EMAIL constant) — change it in place:

```python
json={"from": _env("NOTIFY_EMAIL_FROM", "Pattadar <no-reply@pattadar.com>"), ...}
```

(`no-reply@pattadar.com` matches the SES identity planned in `infra/terraform/modules/persistent/ses.tf`; current legacy value is `noreply@rfactory.ai`.)

- [ ] **Step 2: Verify zero legacy brand strings**

Run: `grep -rin "r factory\|rfactory" services/api/src/`
Expected: no output.

- [ ] **Step 3: Sanity-run the API import** — `cd services/api && ../../.local/api-venv/bin/python -c "import src.main, src.notify; print('ok')"`. Expected: `ok`.

- [ ] **Step 4: Commit** — `git commit -m "fix(brand): all customer-facing notification copy says Pattadar, never R Factory"`

### Task A2: Mobile bundle identifiers → com.pattadar.app

**Files:**
- Modify: `apps/mobile/app.json:11,16` (`com.rfactory.pattadar` → `com.pattadar.app`), `apps/mobile/README.md:71`
- Regenerate: `apps/mobile/ios/` (expo prebuild)

- [ ] **Step 1: Edit app.json** — set `ios.bundleIdentifier` and `android.package` to `com.pattadar.app`.
- [ ] **Step 2: Regenerate native project** — `cd apps/mobile && bunx expo prebuild --clean -p ios`. Expected: `ios/` regenerated; `grep -rn com.rfactory ios/ app.json` → no output.
- [ ] **Step 3: Boot check** — `bunx expo start` (metro boots, ctrl-C). No store submissions exist yet, so this rename is free; after this task it is near-immutable.
- [ ] **Step 4: Commit** — `git commit -m "fix(mobile): bundle ids com.pattadar.app — pattadar-owned identity before any store submission"`

### Task A3: Dead rhub runtime defaults + local-dev bridge retargeting

**Files:**
- Modify: `services/api/src/main.py:57` — replace the rhub-cluster DSN default (`pg-proxy.platform.svc.cluster.local... user=rhub`) with a localhost default: `"host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd"` (host PG user is `rhub` locally; AWS always sets `APP_PG_DSN` explicitly via terraform, so the default is local-only).
- Modify: `services/gateway/app/db.py:30` — keep `PG_USER` default `rhub` but add: `# local host-Postgres user; AWS task defs always override via env`.
- Modify: `scripts/start-local.sh:18` and `tests/e2e-ux/playwright.config.ts:20-22` — default `RHUB_API_DIR` → `$PLATFORM_DIR/services/api` (the in-repo ported backend), env override retained.

- [ ] **Step 1: Make the four edits above.**
- [ ] **Step 2: Verify local stack** — `scripts/start-local.sh`; expect API `:8080/health` → `{"status":"healthy"}` and gateway `:8082` up, now running the **in-repo** `services/api`.
- [ ] **Step 3: Verify e2e harness still boots its isolated API** — `cd tests/e2e-ux && bun run test -- specs/nav.spec.ts`; expected: PASS.
- [ ] **Step 4: Commit** — `git commit -m "chore(local): run the in-repo services/api everywhere; drop dead rhub-cluster DSN default"`

### Task A4: Storage org/workspace `rfactory` → `pattadar`

**Files:**
- Modify: `services/gateway/app/storage_service.py:37-38` (`ORG_ID = "pattadar"`, `WORKSPACE_ID = "pattadar"`)
- Modify: `services/gateway/sql/init.sql:22-23` (defaults `'pattadar'`)
- Create: `scripts/migrate-org-id.sql`

**Interfaces:** S3 keys are `owner/node_id/version_id` (`storage_service.py:134`) — org ids exist only in PG rows, so this is a metadata-only migration.

- [ ] **Step 1: Write the migration** — `scripts/migrate-org-id.sql`:

```sql
-- rfactory → pattadar org rename (metadata only; S3 keys carry no org id)
BEGIN;
UPDATE storage_nodes SET org_id = 'pattadar' WHERE org_id = 'rfactory';
UPDATE storage_nodes SET workspace_id = 'pattadar' WHERE workspace_id = 'rfactory';
COMMIT;
SELECT org_id, workspace_id, count(*) FROM storage_nodes GROUP BY 1, 2;
```

(Check `sql/init.sql` for any other table with these columns — e.g. tags/versions — and extend the UPDATE list to match before running.)

- [ ] **Step 2: Change the code constants + init.sql defaults.**
- [ ] **Step 3: Local rehearsal** — with the local stack up: `psql -U rhub -d pattadar_hub -f scripts/migrate-org-id.sql`; then browse My Documents in the web app and upload+download one file. Expected: all files visible, upload works, final SELECT shows only `pattadar` rows.
- [ ] **Step 4: Prod run (founder gate)** — during a quiet window, run the same SQL against RDS (`docs/runbooks/` bastion/psql procedure), deploy gateway image with the new constants. **Order matters:** run SQL first, then deploy, then re-run the idempotent SQL once after deploy (closes the window where old code wrote `rfactory`).
- [ ] **Step 5: Commit** — `git commit -m "feat(storage): pattadar org/workspace identity + one-shot rfactory row migration"`

### Task A5: Legacy-name sweep in surviving docs/config (per decision D10)

**Scope:** reword rhub/vkx/Auth0 mentions in: root `README.md`, `docs/compliance/{README.md,soc2-controls.md,engineering-checklist.md}`, `services/{api,gateway,assistant}/README.md`, `packages/core/README.md`, `services/assistant/.env.example`, `.github/workflows/deploy.yml:92` comment, and `services/**`/`packages/core/src/**` source-header provenance comments. **Deliberate keeps (do not touch):** `docs/specs/*` historical design docs, `docs/runbooks/migration.md` (`pg_dump -U rhub`, `mc alias rhubminio` — they target the real source system), `services/gateway/tests/test_user_id.py` `auth0|ABC123` fixtures (pin normalization behavior), `apps/web/**` (deleted wholesale in D5).

- [ ] **Step 1: Sweep.** Verify with a **filterless** grep over the whole repo:

Run: `grep -rin "rfactory\|rhub\|vkx" . --exclude-dir={node_modules,.git,.local,ios,Pods,.next} | grep -v "docs/specs/\|docs/runbooks/migration.md\|test_user_id.py\|apps/web/"`
Expected: no output.

- [ ] **Step 2: Run gateway tests** — `cd services/gateway && python -m pytest tests/ -q`. Expected: all pass.
- [ ] **Step 3: Commit** — `git commit -m "chore: pattadar-only naming in all surviving docs, config and code comments"`

---

# Phase B — Next.js scaffold + platform plumbing (`apps/web-next`)

### Task B1: Scaffold the workspace from the Minimals kit

**Files:**
- Create: `apps/web-next/` from `~/Downloads/react-template` (copy, then prune)
- Modify: `apps/web-next/package.json` (name `@pattadar/web-next`, scripts, dep prune)
- Create: `apps/web-next/tsconfig.json`
- Create: `apps/web-next/next.config.mjs` — **written fresh, do NOT carry over the kit's** (its `trailingSlash: true` breaks every e2e URL assertion; its webpack hooks are dead under Turbopack):

```js
/** Fresh config — kit's next.config.js is webpack-era and must not be copied. */
const nextConfig = {
  output: 'standalone',
  redirects: async () => [
    { source: '/app/properties', destination: '/app/parcels?tab=properties', permanent: false },
    { source: '/app/deeds', destination: '/app/documents', permanent: false },
    { source: '/app/sro', destination: '/app/tools?tab=sro', permanent: false },
    { source: '/app/stamp-duty', destination: '/app/tools?tab=stamp-duty', permanent: false },
    { source: '/app/market-value', destination: '/app/tools?tab=market-value', permanent: false },
    { source: '/app/calculator', destination: '/app/tools?tab=calculator', permanent: false },
  ],
};
export default nextConfig;
```

(The six redirects mirror `apps/web/src/routes.tsx:144-149` exactly, `?tab=` queries included.)

**Prune list (delete outright):** `src/_mock/`, `src/api/` (template's SWR demo fetchers), `src/sections/*` EXCEPT keep `_examples` temporarily as a component reference (delete in C10), all `src/app/*` demo routes except the root layout, `src/auth/context/{amplify,firebase,jwt,supabase,auth0}` (all five), `src/locales/` (no i18n in scope), `public/assets` demo images, **plus the files the prune orphans:** `src/theme/overrides/components/{loading-button,data-grid,date-picker,timeline,tree-view}.js` (import pruned @mui/lab and @mui/x-*), `src/components/hook-form/rhf-code.js` (imports pruned mui-one-time-password-input), `src/components/hook-form/rhf-autocomplete.js` if it imports autosuggest-highlight.

**Keep-list (must survive the prune with their internal deps):** `src/theme/` (de-i18n'd in B2), `src/layouts/` (dashboard layout gets **rewritten** in B5, not reused verbatim), `src/routes/{components,hooks,paths}` (kit components import these), `src/hooks/`, `src/utils/`, `src/components/{iconify,label,logo,scrollbar,settings,snackbar,custom-breadcrumbs,custom-dialog,custom-popover,empty-content,loading-screen,table,hook-form,upload,chart,nav-section,image,svg-color,animate,search-not-found,file-thumbnail}`.

**Dependency changes:** remove `@auth0/auth0-react, aws-amplify, firebase, @supabase/supabase-js, mapbox-gl, react-map-gl, @fullcalendar/*, @hello-pangea/dnd, react-organizational-chart, react-quill, react-slick, slick-carousel, react-joyride, mui-one-time-password-input, @react-pdf/renderer, autosuggest-highlight, react-markdown, rehype-*, remark-gfm, highlight.js, yet-another-react-lightbox, swr, axios, i18next, i18next-browser-languagedetector, react-i18next, @mui/lab, @mui/system, @mui/x-data-grid, @mui/x-date-pickers, framer-motion`. Add/pin: `next: 16.2.x`, `react`/`react-dom: 19.2.8`, `@mui/material`/`@mui/icons-material: 9.2.0`, `motion: ^12` (React-19-supported framer-motion successor; kit's `animate/`, `loading-screen/`, `upload/` switch to `motion/react` imports), latest `react-apexcharts` + `notistack` minors (declared peers ≤18 — verify at runtime in B2's preview), `@pattadar/core: workspace:*`, `@pattadar/tokens: workspace:*`, `@tanstack/react-query: 5.101.4`, `amazon-cognito-identity-js: 6.3.20`, `oidc-client-ts: 3.5.0`, `leaflet: 1.9.4`, `jspdf: 4.2.1`, `jspdf-autotable: 5.0.8`, `xlsx: 0.18.5`. Keep: `@iconify/react, apexcharts, notistack, nprogress, simplebar-react, react-dropzone, react-lazy-load-image-component, react-hook-form, @hookform/resolvers, yup, date-fns, lodash, numeral, stylis, stylis-plugin-rtl`.

**tsconfig.json** (the kit resolves everything through the `src/...` alias — without `baseUrl` nothing compiles):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "allowJs": true,
    "checkJs": false,
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "noEmit": true
  },
  "include": ["src", "next-env.d.ts", ".next/types/**/*.ts"]
}
```

**Scripts:** `"dev": "next dev"` (port via `-p` arg — portless so the e2e harness can pin its own), `"dev:local": "next dev -p 5273"`, `"build": "next build"`, `"start": "next start"`, `"e2e:serve": "next build && next start -p 5174"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 1: Copy + prune + rewrite package.json/tsconfig/next.config.mjs** as above.
- [ ] **Step 2: `bun install`** at repo root. Expected: lockfile updates; bun is lenient on the notistack/react-apexcharts peer ranges — runtime verification happens in B2.
- [ ] **Step 3: Minimal boot** — reduce `src/app/layout.js` + `src/app/page.js` to a plain "Pattadar web-next scaffold" page with the kit ThemeProvider import commented out (theme compiles only after B2). Run `bun run --filter @pattadar/web-next dev:local`; expected: renders at `http://localhost:5273`.
- [ ] **Step 4: Commit** — `git commit -m "feat(web-next): scaffold Next 16 app from Minimals 5.7 kit, pruned to pattadar needs"`

### Task B2: Minimals theme slice on MUI 9 + Pattadar tokens + theme.ts seams

**Files:**
- Modify: `apps/web-next/src/theme/{index.js→index.tsx, palette.js, typography.js, shadows.js, custom-shadows.js, css.js}` + `src/theme/overrides/` — upgrade to MUI 9 API (`createTheme` colorSchemes/CSS-vars, `Grid` v2, renamed slot props per the MUI 5→6→7 migration guides), **de-i18n `theme/index.js`** (drop `useLocales`/`themeWithLocale`; drop RTL unless wanted), convert to TS as touched
- Modify: merge `packages/tokens` values (brand colors, radii) into `palette.ts` — single source: tokens feed both this theme and mobile Paper theme
- **Port the functional seams from `apps/web/src/theme.ts`** (14+ ported pages depend on them; without these, typecheck fails and UI silently degrades): the TS module augmentation + `palette.primary.container`/`.onContainer`, the custom `tonal` Button variant, the `.tnum` and `.rowActions` utility classes, the prefers-reduced-motion CssBaseline guard, bottom-center snackbar `anchorOrigin`. `apps/web/src/theme.ts` is thereby **superseded by this task**.
- Create: `apps/web-next/src/app/layout.tsx` — root layout: emotion registry, `<ThemeProvider>`, `<SettingsProvider>` (kit settings drawer: mode/contrast/nav), notistack `SnackbarProvider` (bottom-center), nprogress, **metadata** (title "Pattadar", description, og tags) — the server-rendered public site will be crawled
- Create: `public/favicon/*`, `public/logo/*`, `public/robots.txt` — **`apps/web` has NO public/ dir; there is nothing to reuse.** Generate Pattadar favicon/logo from brand tokens (or reuse mobile's `apps/mobile` icon assets); do NOT ship the kit's Minimals-branded icons. Fonts: use `next/font/local` with vendored font files (deterministic Docker builds — no network fetch at build time).
- Keep-list kit components: fix MUI 9 breakages until they compile; delete any that turn out unused by C10.

- [ ] **Step 1: Theme core compiles on MUI 9** — palette/typography/shadows/overrides + tokens + theme.ts seams; `bun run --filter @pattadar/web-next typecheck` clean.
- [ ] **Step 2: Kept components compile & render** — build a `/theme-preview` throwaway route rendering: buttons (all variants **including `tonal`**), a Card grid, a table via kit `table/`, a hook-form with 3 field types, kit `upload` dropzone, snackbar trigger, one `animate/` motion element — in light AND dark via the settings drawer. This is where notistack/react-apexcharts/motion get runtime-verified under React 19.
- [ ] **Step 3: Verify** — dev render both modes; `typecheck` clean; `bun run --filter @pattadar/web-next build` succeeds.
- [ ] **Step 4: Commit** — `git commit -m "feat(web-next): Minimals theme slice on MUI 9 — pattadar tokens, theme.ts seams, dark mode, brand assets"`

### Task B3: Cognito auth (native SRP + social callback) in Next

**Files:**
- Create: `apps/web-next/src/lib/global-polyfill.ts` — **bundler-agnostic** (Next 16 is Turbopack-first; webpack hooks in next.config are dead — this replaces vite's `define: { global: 'globalThis' }`):

```ts
// amazon-cognito-identity-js expects a Node-style `global`.
if (typeof (globalThis as Record<string, unknown>).global === 'undefined') {
  (globalThis as Record<string, unknown>).global = globalThis;
}
export {};
```

Imported at the TOP of `cognitoNative.ts` and the root layout, before amazon-cognito-identity-js loads.

- Create: `apps/web-next/src/auth/` — port **verbatim logic** from `apps/web/src/auth/{cognitoNative.ts, AuthProvider.tsx, RequireAuth.tsx, AuthCallbackPage.tsx}` as client components (`'use client'`), env reads `import.meta.env.VITE_*` → `process.env.NEXT_PUBLIC_*` (`NEXT_PUBLIC_COGNITO_AUTHORITY/CLIENT_ID/DOMAIN/REDIRECT_URI`, `NEXT_PUBLIC_SOCIAL_PROVIDERS`); mock-mode when AUTHORITY unset/empty must keep working
- Create: routes `src/app/(public)/{login,signup,forgot-password}/page.tsx` + `src/app/(public)/auth/callback/page.tsx` — port page logic from `apps/web/src/pages/auth/{LoginPage,SignupPage,ForgotPasswordPage,AuthLayout}.tsx`, restyled onto the kit's `layouts/auth` (classic) look; all form flows (SRP sign-in, signup+confirm code, forgot/reset) unchanged
- Create: `src/app/app/layout.tsx` — client layout composing `RequireAuth` around the shell (shell lands in B5; until then a plain `<main>{children}</main>`)
- Delete: kit `src/auth/` remnants once ours compiles

**Interfaces:**
- Produces: `useAuth(): { user, status, signIn, signOut, getAccessToken }` and `setAccessTokenProvider(fn)` — keep the exact names from `apps/web/src/auth/AuthProvider.tsx` so ported pages compile untouched.

- [ ] **Step 1: Port the four auth files + polyfill; build the three public auth routes on kit styling.**
- [ ] **Step 2: Mock-mode check** — with no `NEXT_PUBLIC_COGNITO_AUTHORITY`: visiting `/app` lands you in as the dev user, zero redirects.
- [ ] **Step 3: Real-pool check** — `.env.local` with the values `scripts/start-local.sh` exports (pool `ap-south-1_XfgAF21Z3`, the SPA client id): sign in at `/login` with a real pattadar.com account. Expected: lands on `/app`, token in localStorage under `CognitoIdentityServiceProvider.*`, survives reload, sign-out returns to `/login`. No non-pattadar.com URL ever shown. **Then DELETE `.env.local`** — `next dev` auto-loads it and it would silently knock later e2e runs out of mock-auth mode (the harness also force-sets `NEXT_PUBLIC_COGNITO_AUTHORITY=''` in its webServer env as belt-and-braces, since process env beats .env.local).
- [ ] **Step 4: Commit** — `git commit -m "feat(web-next): native Cognito auth (SRP + social callback + mock mode) on kit auth layouts"`

### Task B4: Data layer — gateway client, TanStack Query, dev proxy

**Files:**
- Create: `apps/web-next/src/api/client.ts` — port `apps/web/src/api/client.ts` unchanged (gateway-relative paths, Bearer injection via `setAccessTokenProvider`)
- Create: `src/lib/QueryProvider.tsx` (`'use client'`: `QueryClientProvider`, staleTime 30s, retry 0 — mirror `apps/web` config); mount in root layout
- Create: `src/data/` — port verbatim: `hooks.ts`, `pattadarActions.ts`, `portfolio.ts`, `useLiveOrSample.ts` from `apps/web/src/data/`
- Create: `src/app/api/gateway/[...path]/route.ts` — **dev-only proxy** replacing vite's proxy (Next rewrites can't inject headers). Guards are **per-branch** (API and gateway independently), response passthrough strips hop-by-hop/encoding headers, and the 200s abort signal exempts the assistant SSE stream:

```ts
// Dev-only stand-in for the vite proxy. In AWS this route is unreachable —
// CloudFront/ALB route /api/* to the gateway before Next ever sees it.
// Each branch refuses independently when its target env is unset.
import { NextRequest } from 'next/server';

const API = process.env.DEV_API_TARGET;         // http://localhost:8080  (pattadar API, 'pattadar/' prefix stripped)
const GATEWAY = process.env.DEV_GATEWAY_TARGET; // http://localhost:8082  (storage/admin/assistant, Bearer passthrough)
const DEV_USER = process.env.DEV_USER_ID;       // injected as x-user-id on direct-API calls only

export const dynamic = 'force-dynamic';

const HOP = ['host', 'connection', 'content-encoding', 'content-length', 'transfer-encoding'];

async function forward(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const direct = path[0] === 'pattadar';
  const target = direct ? API : GATEWAY;
  if (!target) return new Response('dev proxy disabled for this target', { status: 404 });
  const search = req.nextUrl.search;
  const url = direct
    ? `${target}/${path.slice(1).join('/')}${search}`
    : `${target}/api/gateway/${path.join('/')}${search}`;
  const headers = new Headers(req.headers);
  HOP.forEach((h) => headers.delete(h));
  if (direct && DEV_USER) headers.set('x-user-id', DEV_USER);
  const sse = path[0] === 'assistant'; // SSE stream must not be time-capped
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    // AI extraction can run 180s; ≥200s and never retry (global invariant)
    // @ts-expect-error duplex required by node fetch for streamed bodies
    duplex: 'half',
    signal: sse ? undefined : AbortSignal.timeout(200_000),
  });
  const out = new Headers(res.headers);
  HOP.forEach((h) => out.delete(h));
  return new Response(res.body, { status: res.status, headers: out });
}
export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
```

- Modify: `scripts/start-local.sh` — add a `WEB_NEXT=1` mode: exports `DEV_API_TARGET=http://localhost:8080`, `DEV_GATEWAY_TARGET=http://localhost:8082`, `DEV_USER_ID=sankara.telukutla`, **sets `APP_PUBLIC_URL=http://localhost:5273` for the API** (invite/verify links must point at the running web head, not the dead vite port), and starts `bun run --filter @pattadar/web-next dev:local` instead of vite

- [ ] **Step 1: Port client + hooks + providers; write the proxy route; extend start-local.sh.**
- [ ] **Step 2: Probe check** — temporary `/app/probe` client page calling `usePassbooks()`; with the local stack up expect the founder's real khatas listed (5 rows). Delete the probe after.
- [ ] **Step 3: 180s invariant check** — POST a sample passbook image through `/api/gateway/pattadar/import-passbook` (reuse `PassbookCreateDialog`'s fetch shape). Expected: extraction completes (>30 s is normal), no proxy timeout, no retry. Also open the assistant panel path once streaming exists (B5) to confirm SSE is not capped.
- [ ] **Step 4: Commit** — `git commit -m "feat(web-next): gateway client, query provider, ported data hooks, dev proxy with x-user-id"`

### Task B5: App shell + full route skeleton

**Files:**
- Create: `src/layout/AppShell.tsx` — **rewrite** `apps/web/src/layout/AppShell.tsx` on the kit's `layouts/dashboard` structure (vertical `nav-section`, header with account popover + settings + assistant toggle) — the kit layout is a donor, not a drop-in: delete its searchbar, language popover, contacts/notifications demos, and `use-mocked-user` wiring. Nav config (order + labels must match current shell for the nav e2e spec): Dashboard `/app` · Passbooks `/app/passbooks` · Land & Properties `/app/parcels` · Documents `/app/documents` · Families & Groups `/app/groups` · Invitations `/app/invitations` · Notifications `/app/notifications` · Wallet `/app/wallet` · Tools `/app/tools` · Audit Log `/app/audit` · Admin & Ref Data `/app/admin` · Profile `/app/profile`
- Create: `src/assistant/AssistantPanel.tsx` — port from `apps/web/src/assistant/AssistantPanel.tsx` (SSE streaming via gateway `/api/gateway/assistant/*`)
- Create: route skeleton, every page a `'use client'` stub rendering `<PageHeader>` + kit `EmptyContent` until its Phase C task lands:
  `src/app/app/{page,passbooks/page,passbooks/[id]/page,parcels/page,parcels/[id]/page,properties/[id]/page,documents/page,groups/page,invitations/page,notifications/page,wallet/page,tools/page,audit/page,admin/page,profile/page}.tsx`
  and public: `src/app/(public)/{page (landing),privacy/page,terms/page,verify/[token]/page,active/[token]/page}.tsx`
- (Legacy redirects already live in `next.config.mjs` from B1.)

**Interfaces:**
- Produces: `<AppShell>` mounted in `src/app/app/layout.tsx` inside `RequireAuth`; ported pages use `next/navigation` (`useRouter`, `useParams`, `useSearchParams`) and `next/link` — this is the single mechanical rewrite every Phase C port applies.

- [ ] **Step 1: Build shell + skeleton.**
- [ ] **Step 2: e2e nav check** — run `specs/nav.spec.ts` against web-next using the harness shape that C10 makes permanent: playwright `webServer` spawns `${BUN} run e2e:serve` (i.e. `next build && next start -p 5174` — prod-mode serve avoids next-dev lazy-compile flakes against the suite's 10s/15s timeouts) with `cwd: apps/web-next` and env `DEV_API_TARGET=http://localhost:18080`, **`DEV_GATEWAY_TARGET=http://localhost:8082`** (required — the proxy 404s its gateway branch without it; dead port is fine, storage specs tolerate per-request failures exactly like vite's dead-default did), `DEV_USER_ID=sankara.telukutla`, `NEXT_PUBLIC_COGNITO_AUTHORITY=''` (force mock auth). Expected: nav spec PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(web-next): Minimals dashboard shell, pattadar nav, full route skeleton"`

---

# Phase C — Page ports

**The porting recipe (applies to every Task C*):** copy the listed source files from `apps/web/src/` into `apps/web-next/src/`; add `'use client'`; swap `react-router` imports for `next/navigation`/`next/link` (`useNavigate`→`useRouter().push`, `useParams<{id}>`→`useParams()`, `<Link to>`→`<Link href>`); env reads `VITE_*`→`NEXT_PUBLIC_*`; keep MUI 9 code as-is; replace ad-hoc styled bits with kit components ONLY where the kit has a direct equivalent (breadcrumbs → `custom-breadcrumbs`, snackbars → notistack, upload drop-zones → kit `upload`, empty states → `empty-content`); **never change visible headings/labels/roles** (e2e is text-based); `GeoMap`/`FileViewer` load via `next/dynamic` with `ssr: false` (leaflet + blob URLs are browser-only; leaflet CSS imported in the component, not the root layout). Shared modules port once, first time needed. After each task: run the listed e2e spec(s) against web-next (B5 Step 2 harness), then commit.

### Task C1: Dashboard
**Files:** port `pages/DashboardPage.tsx`, `components/charts/{HealthRing,Donut,BarList,chartColors}`, `components/{GlassCard,PageHeader,EmptyState,Skeletons,holdingCards,tableSx,useSchemeMode}`, `lib/format.ts` → same relative paths under `web-next/src`; wire `src/app/app/page.tsx`.
- [ ] Port per recipe → [ ] `dashboard.spec.ts` PASS → [ ] commit `feat(web-next): dashboard at parity`.

### Task C2: Passbooks + detail + AI import
**Files:** port `pages/PassbooksPage.tsx`, `pages/detail/PassbookDetailPage.tsx`, `pages/detail/common.tsx`, `pages/passbooks/PassbookCreateDialog.tsx`, `export/{ExportMenu,exporters}` (first exporter consumer) → wire `passbooks/page.tsx`, `passbooks/[id]/page.tsx`.
- [ ] Port → [ ] `passbooks.spec.ts` PASS (AI-import dialog open/close; live extraction exercised in C10) → [ ] commit.

### Task C3: Land & Properties + Parcel 360 + Property 360
**Files:** port `pages/LandPropertiesPage.tsx`, `pages/holdings/{AddParcelDialog,AddPropertyDialog,LocationDialog,StakeDialog,propertyImport,propertyTypes}`, `pages/detail/{ParcelDetailPage,PropertyDetailPage,PropertyFilesPanel}`, `components/{GeoMap,GeoMapLazy,FileViewer}` → wire `parcels/page.tsx`, `parcels/[id]/page.tsx`, `properties/[id]/page.tsx`.
- [ ] Port (GeoMap + FileViewer via `next/dynamic` `ssr:false`) → [ ] `holdings.spec.ts` + `parcel-detail.spec.ts` + `viewer.spec.ts` PASS → [ ] commit.

### Task C4: Documents + Registered Deeds
**Files:** port `pages/DocumentsPage.tsx`, `pages/documents/{DocumentsTab,RegisteredDeedsTab,DeedImportDialog,docTypes,readingMessages,storage}` → wire `documents/page.tsx`.
- [ ] Port → [ ] `documents.spec.ts` PASS → [ ] commit.

### Task C5: Families & Groups
**Files:** port `pages/FamiliesGroupsPage.tsx`, `pages/families/{GroupDetail,PersonDialog,countryCodes,familiesData}` → wire `groups/page.tsx`.
- [ ] Port → [ ] `families.spec.ts` PASS → [ ] commit.

### Task C6: Invitations, Notifications, Wallet, Profile
**Files:** port `pages/{InvitationsPage,NotificationsPage,WalletPage,ProfilePage}.tsx` → wire the four routes.
- [ ] Port → [ ] `misc.spec.ts` PASS (profile round-trip included) → [ ] commit.

### Task C7: Tools
**Files:** port `pages/ToolsPage.tsx`, `pages/tools/{CalculatorTool,StampDutyTool,MarketValueTool}` (SRO tab lives in ToolsPage) → wire `tools/page.tsx`.
- [ ] Port → [ ] `tools.spec.ts` PASS (asserts real duty math from `@pattadar/core`) → [ ] commit.

### Task C8: Audit + Admin
**Files:** port `pages/{AuditLogPage,AdminRefDataPage}.tsx` → wire both routes.
- [ ] Port → [ ] covered assertions in `misc.spec.ts`/`nav.spec.ts` PASS → [ ] commit.

### Task C9: Public pages — landing, legal, verify
**Files:** port `pages/landing/LandingPage.tsx` (as-is per D4), `pages/legal/{LegalLayout,PrivacyPage,TermsPage}`, `pages/VerifyPage.tsx` (serves both `/verify/[token]` and `/active/[token]` — check `routes.tsx` for the active-token variant) → wire `(public)` routes. `verifyBeneficiary` must fire with NO auth (the gateway's only public carve-out).
- [ ] Port → [ ] `auth-pages.spec.ts` PASS; manual: open `/verify/BOGUS` logged-out → graceful invalid-token card, no login redirect → [ ] commit.

### Task C10: Full-suite gate + cleanup
- [ ] Make the harness switch permanent — `tests/e2e-ux/playwright.config.ts` webServer: command `${BUN} run e2e:serve`, `cwd: apps/web-next`, url `http://localhost:5174`, env `DEV_API_TARGET=http://localhost:18080`, `DEV_GATEWAY_TARGET=http://localhost:8082`, `DEV_USER_ID=sankara.telukutla`, `NEXT_PUBLIC_COGNITO_AUTHORITY=''`. Note: `next start` has no `--strictPort`; the config's url healthcheck is the guard against a port drift.
- [ ] Run the **full suite**: `cd tests/e2e-ux && bun run test`. Expected: **46/46 PASS** (11 files).
- [ ] Live AI pass (manual, real Anthropic key, local stack in WEB_NEXT=1 mode): passbook import, Aadhaar scan, deed import, property extract — each completes and prefills.
- [ ] Delete `src/sections/_examples`, `/theme-preview`, any kept-but-unused kit component; `bun run --filter @pattadar/web-next typecheck && bun run --filter @pattadar/web-next build` clean.
- [ ] Commit `feat(web-next): full e2e parity — 46/46, suite now gates web-next`.

---

# Phase D — Cutover (founder-gated)

### Task D1: Production container

**Files:** Create `apps/web-next/Dockerfile` — **build context is the repo root** (`workspace:*` deps make an app-dir context unresolvable):

```dockerfile
# syntax=docker/dockerfile:1
FROM oven/bun:1 AS builder
WORKDIR /repo
COPY package.json bun.lock ./
COPY packages/core packages/core
COPY packages/tokens packages/tokens
COPY apps/web-next apps/web-next
RUN bun install --frozen-lockfile
ARG NEXT_PUBLIC_COGNITO_AUTHORITY
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID
ARG NEXT_PUBLIC_COGNITO_DOMAIN
ARG NEXT_PUBLIC_COGNITO_REDIRECT_URI
ARG NEXT_PUBLIC_SOCIAL_PROVIDERS
RUN cd apps/web-next && bun run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=builder /repo/apps/web-next/.next/standalone ./
COPY --from=builder /repo/apps/web-next/.next/static ./apps/web-next/.next/static
COPY --from=builder /repo/apps/web-next/public ./apps/web-next/public
USER node
EXPOSE 3000
CMD ["node", "apps/web-next/server.js"]
```

(Fonts are vendored via `next/font/local` per B2 — no build-time network fetch.)

- [ ] Build: `docker build --provenance=false -f apps/web-next/Dockerfile -t pattadar/web:v1 .` (repo root) → [ ] `docker run -p 3000:3000` + curl `/` returns the landing HTML → [ ] commit.

### Task D2: Terraform — web ECS service + CloudFront ecs mode

**Files:** Modify `infra/terraform/modules/persistent/ecr.tf` (repo `pattadar/web`); `modules/runtime/{ecs.tf,alb.tf,security_groups.tf}` (service `web`, ARM64, target group :3000); `modules/runtime/cloudfront.tf` (variable `web_origin = "spa" | "ecs"`, default `spa`); env roots' variables.

**The ecs mode must handle all four verified gotchas:**
1. `default_root_object = var.web_origin == "ecs" ? null : "index.html"` — otherwise CloudFront requests `/index.html` from Next for the apex and the landing page 404s.
2. The `spa_router` viewer function does TWO jobs — **keep a redirect-only variant** (www→apex 301, no index.html rewrite) associated in ecs mode; dropping the function entirely would let `www.pattadar.com` serve as a second origin and break the single-origin Cognito-callback rule.
3. Default behavior in ecs mode: `CachingDisabled` + `AllViewerExceptHostHeader` origin-request policy (mirror the existing `/api/*` behavior) — the current Managed-CachingOptimized with no origin-request policy would cache authenticated HTML at the edge.
4. Ordered behavior `/_next/static/*` → ALB origin with `CachingOptimized` (immutable hashed assets). **`/.well-known/*` behavior retargets to the ALB origin in ecs mode** (files served from `apps/web-next/public/.well-known/` per decision D9 — mobile app links depend on this path).

**ALB rule ordering (state explicitly):** cron rule priority 10 (existing), `/api/*` → gateway priority 20, default action → web TG. Note: after the flip, bare paths on `api.pattadar.com` serve the web app — the gateway only exposes `/api/gateway/*` + `/health`, and no current consumer hits bare paths, so this is a documented semantic change, not a break.

- [ ] Write TF → [ ] `terraform fmt && terraform validate` all 4 roots → [ ] `terraform plan` in `envs/dev/runtime` with `web_origin="ecs"` — review adds; expect no destroys of persistent resources → [ ] commit. **No apply beyond dev without founder approval.**

### Task D3: CI — image build + deploy path

**Files:** Modify `.github/workflows/deploy.yml`: replace the S3-sync SPA job with (a) build `pattadar/web` image from the **repo root** context (`-f apps/web-next/Dockerfile`) with `NEXT_PUBLIC_COGNITO_*` build args from terraform outputs (exactly like today's VITE_* wiring), push to ECR, `aws ecs update-service --force-new-deployment`; keep the S3 job behind an `if: vars.WEB_ORIGIN == 'spa'` guard for rollback.
- [ ] Edit workflow → [ ] dry review; push-to-main run against dev (the existing "Track B guard" skip protects when prod state is absent) → [ ] commit.

### Task D4: Dev deploy → prod cutover (founder gate)

- [ ] `scripts/platform-up.sh dev` with `web_origin="ecs"` → run the full e2e suite against the dev URL (baseURL override) → expected 46/46.
- [ ] Smoke on dev: `curl https://<dev-domain>/` returns landing HTML (**not 404** — this is the default_root_object check), `curl -I https://www.<domain>/` → 301 to apex, `/verify/BOGUS` public, `/_next/static/*` returns cache headers.
- [ ] **FOUNDER APPROVAL CHECKPOINT** — then: push `pattadar/web:v1` to prod ECR, `terraform apply` prod runtime with `web_origin="ecs"`, CloudFront invalidation, smoke: login on pattadar.com, dashboard renders live data, one AI import, assistant panel streams, mobile deep link `https://pattadar.com/verify/<token>` resolves.
- [ ] Rollback path (documented in `docs/runbooks/up-down.md` addendum): set `web_origin="spa"`, apply — the S3 SPA bucket and its sync job (guarded, not deleted, until D5) still serve the old app.

### Task D5: Decommission the Vite app, web-next becomes web

**Files:** Delete `apps/web/`; rename `apps/web-next` → `apps/web`, package `@pattadar/web-next` → `@pattadar/web`; update: root `package.json` filters, `scripts/start-local.sh` (incl. the two "web on :5173" echo lines and `APP_PUBLIC_URL`), `tests/e2e-ux/playwright.config.ts` paths, `.github/workflows/{ci,deploy}.yml` (remove the guarded S3 job + its `apps/web/dist` input), `README.md`, `docs/architecture.md`. Confirm `/.well-known` still serves from the ECS origin (D9) before the S3 SPA bucket's sync job is removed.
- [ ] Only after prod cutover is verified stable (founder call on the soak window). → [ ] `bun install && bun run typecheck && cd tests/e2e-ux && bun run test` → 46/46 → [ ] commit `chore: web-next is now the one true web head; Vite SPA retired`.

---

## Self-review notes

- **Spec coverage:** founder directives — Next.js ✓ (B1–D5), pattadar-only naming ✓ (A1–A5 + D10 keeps recorded), plan-first ✓ (this document; D2/D4 hold prod behind founder gates). All 24 routes and every `apps/web/src` file trace to a named task or a recorded supersession (`theme.ts`→B2, `routes.tsx`/`main.tsx`→B1/B5 structure); assistant panel ✓ (B5); mobile untouched except bundle ids (A2).
- **Known risks:** (1) B2 (Minimals slice on MUI 9) is still the least predictable task even with the orphan-prune list — timebox it; fallback pinned in decision D3. (2) Kit JS files get zero type checking under `checkJs: false` — convert opportunistically; strictness arrives with conversion. (3) e2e text-selectors may catch styling-driven DOM changes — fix by preserving text, never by rewriting specs without founder-approved UX intent. (4) The dev-proxy route must never be live in prod — env-gated AND unreachable (CloudFront/ALB route `/api/*` away from Next); both layers verified in D4 smoke. (5) `next start` has no strictPort — the playwright url healthcheck is the only port guard.
