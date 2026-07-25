# @pattadar/web

Pattadar web head. React 19 + MUI v9 (Emotion engine, CSS theme variables with
light/dark color schemes) + Vite 8 + React Router 8 (data router) +
TanStack Query 5 + amazon-cognito-identity-js (native SRP auth) +
oidc-client-ts (Cognito PKCE, social logins only). Theme derives from
`@pattadar/tokens`; shared domain logic and GraphQL types come from
`@pattadar/core`. Dates render DD/MM/YYYY via `@pattadar/core` formatters.

One SPA serves both the public landing site (pattadar.com) and the
authenticated app (`/app/*`). Every route component is `React.lazy`, so the
landing page ships as its own small chunk and the app shell + pages load only
after sign-in.

## Commands

```sh
bun install          # from the repo root
bun run dev          # Vite dev server
bun run typecheck    # tsc --noEmit
bun run build        # production bundle
```

## Routes

| Route | Access | Page |
| --- | --- | --- |
| `/` | Public | Landing page (hero, features, trust strip, footer) |
| `/login` | Public | Native email/password sign-in (SRP) + optional social buttons |
| `/signup` | Public | Native sign-up + email confirmation-code step (with resend) |
| `/forgot-password` | Public | Native password reset (email → code + new password) |
| `/privacy` | Public | Privacy notice placeholder — TODO(DPDP) final EN+Telugu |
| `/terms` | Public | Terms of use placeholder — TODO(DPDP) final EN+Telugu |
| `/auth/callback` | Public | Completes the SOCIAL-login redirect, then continues to `/app` (or the preserved return path) |
| `/verify/:token` | Public | Beneficiary verification — must work WITHOUT login |
| `/app/*` | Auth required (`RequireAuth`) | App shell + all views below |

## Auth (native Cognito SRP + social-only redirect)

**FOUNDER RULE: customers never see a non-pattadar.com URL.** Email/password
sign-in, sign-up, confirmation, and password reset all happen on OUR pages
inside the SPA (`/login`, `/signup`, `/forgot-password`) by calling the
Cognito API directly over SRP (`amazon-cognito-identity-js`,
`src/auth/cognitoNative.ts`) — zero redirects. The only exception is social
logins (Google/Facebook/Apple): OAuth requires leaving the page, so those go
to the custom domain in `VITE_COGNITO_DOMAIN` (will be `auth.pattadar.com`)
and return to `/auth/callback`.

`src/auth/AuthProvider.tsx` is a facade over BOTH token sources and exposes
`useAuth()` → `{ user, isAuthenticated, isLoading, signInWithPassword(),
signInSocial(), signOut() }`:

- `signInWithPassword(email, password)` — native SRP sign-in, no redirect.
  Cognito errors surface as typed `AuthError`s with plain-language messages
  (an unconfirmed account routes to the `/signup` confirm step).
- `signInSocial('Google' | 'Facebook' | 'SignInWithApple')` — oidc-client-ts
  `signinRedirect` with `identity_provider` set, so Cognito skips its own
  chooser page and goes straight to the provider. Buttons render on `/login`
  only for providers listed in `VITE_SOCIAL_PROVIDERS` (unset = none).
- `signOut()` — clears whichever session is active. Native: local token
  clear only, no redirect. Social: hosted-UI `/logout` (its cookie must be
  cleared or the next social sign-in silently reuses it).

The ACCESS token feeds `setAccessTokenProvider` in `src/api/client.ts`
(native session first — the library auto-refreshes it via the stored refresh
token — then the oidc user), so all gateway calls carry a Bearer header.
`RequireAuth` sends unauthenticated visitors to `/login` preserving the
attempted path; after sign-in they land back where they aimed.

Configuration comes from env vars (see `.env.example` — copy to `.env.local`):

| Var | Value |
| --- | --- |
| `VITE_COGNITO_AUTHORITY` | `https://cognito-idp.ap-south-1.amazonaws.com/<userPoolId>` (pool id parsed from the tail) |
| `VITE_COGNITO_CLIENT_ID` | SPA app client id (public client, no secret) |
| `VITE_COGNITO_DOMAIN` | Auth domain for SOCIAL logins only — will be `auth.pattadar.com` |
| `VITE_COGNITO_REDIRECT_URI` | Optional; defaults to `<origin>/auth/callback` |
| `VITE_SOCIAL_PROVIDERS` | Comma-separated social buttons (`Google,Facebook,Apple`); empty = no social section |

Track B (Terraform) creates the user pool, SPA client, and auth domain
and outputs these values; CI injects them at build time per environment.

**Mock mode:** with `VITE_COGNITO_AUTHORITY` unset, auth is a local stub — a
dev user is auto-signed-in, the AppShell shows an "Auth mocked — dev only"
chip, and the landing Sign-in button goes straight to `/app`. This is the
default for `bun run dev` before the pool exists.

## View inventory (under `/app`)

Each placeholder page maps to the rhub source it gets rebuilt from
(`rhub/ui/apps/pattadar/src/`).

| Route | Page | rhub source |
| --- | --- | --- |
| `/app` | Dashboard | `RemoteApp.tsx` DashboardView + `dashboard.ts` |
| `/app/passbooks` | Passbooks | PassbooksView, PassbookDetailView, `PassbookCreateModal.tsx` |
| `/app/parcels` | Parcels | HoldingsView (initial `all`), ParcelDetailView, `ParcelGallery.tsx`, `AllHoldingsView.tsx` |
| `/app/properties` | Properties | `properties/` — PropertiesView, PropertyDetailView, Add/EditPropertyModal, `propertyTypes.ts` |
| `/app/documents` | Documents | `DocumentsView.tsx`, `FilesPanel.tsx`, `driveFolders.ts`, `docTypes.ts`, `documentClassify.ts` |
| `/app/deeds` | Deeds | RegisteredDocsView, RegisteredDocDetailView (`RemoteApp.tsx`) |
| `/app/groups` | Groups | `family/` — GroupsListView, GroupDetailView, FamilyTree, UnifiedFamilyView, `genealogy.ts` |
| `/app/invitations` | Invitations | InvitationsView (`RemoteApp.tsx`) |
| `/app/notifications` | Notifications | `NotificationsView.tsx` |
| `/app/sro` | SRO Offices | ToolsView `sro` tab |
| `/app/stamp-duty` | Stamp Duty | ToolsView `stamp-duty` tab |
| `/app/market-value` | Market Value | ToolsView `market-value` tab |
| `/app/calculator` | Calculator | `Calculator.tsx`, `landcalc.ts`, `units.ts` (logic moves to `@pattadar/core`) |
| `/app/audit` | Audit | AuditView (`RemoteApp.tsx`) |
| `/app/admin` | Admin | AdminView (`RemoteApp.tsx`) + gateway super-admin AI/model settings |
| `/app/profile` | Profile | ProfileView (`RemoteApp.tsx`) |

## Component replacements

| rhub component | Replacement |
| --- | --- |
| DataTable / AdvancedTable (Ant Design) | MUI X DataGrid — TODO(Phase 2). Lesson from rhub: AdvancedTable silently ignored `visible`/`disabled` on row actions; guard row-action availability inside `onClick`, not only via declarative props, and verify the grid honours whichever you use. |
| ExportMenu | Port with `exporters.ts` — jspdf + autotable + xlsx (lazy-imported); branded A4-landscape PDF with PATTADAR watermark and header/footer. |
| FileExplorer (My Drive) | Scoped v1: list/upload/preview/trash/star over the gateway S3 storage API. Versioning and sharing later. |
| GeoMap | TODO: evaluate MapLibre GL before porting parcel maps. |

Date formatting is centralised in `@pattadar/core` (`formatDate`), Indian
convention DD/MM/YYYY — do not format dates inline in components.
