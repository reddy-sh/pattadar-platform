# @pattadar/web

Pattadar web head. React 19 + MUI v9 (Emotion engine, CSS theme variables with
light/dark color schemes) + Vite 8 + React Router 8 (data router) +
TanStack Query 5 + oidc-client-ts (Cognito PKCE). Theme derives from
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
| `/privacy` | Public | Privacy notice placeholder — TODO(DPDP) final EN+Telugu |
| `/terms` | Public | Terms of use placeholder — TODO(DPDP) final EN+Telugu |
| `/auth/callback` | Public | Completes the Cognito hosted-UI redirect, then continues to `/app` (or the preserved return path) |
| `/verify/:token` | Public | Beneficiary verification — must work WITHOUT login |
| `/app/*` | Auth required (`RequireAuth`) | App shell + all views below |

## Auth (Cognito, PKCE)

`src/auth/AuthProvider.tsx` wraps the router (see `main.tsx`) and exposes
`useAuth()` → `{ user, isAuthenticated, isLoading, signIn(), signOut() }`.
`signIn(returnTo?)` redirects to the Cognito hosted UI; `signOut()` clears the
local session and exits through the hosted-UI `/logout` endpoint back to `/`.
The ACCESS token feeds `setAccessTokenProvider` in `src/api/client.ts`, so all
gateway calls carry a Bearer header.

Configuration comes from env vars (see `.env.example` — copy to `.env.local`):

| Var | Value |
| --- | --- |
| `VITE_COGNITO_AUTHORITY` | `https://cognito-idp.ap-south-1.amazonaws.com/<userPoolId>` |
| `VITE_COGNITO_CLIENT_ID` | SPA app client id (public client, no secret) |
| `VITE_COGNITO_DOMAIN` | Hosted-UI domain (`pattadar-auth-<env>.auth.ap-south-1.amazoncognito.com`) |
| `VITE_COGNITO_REDIRECT_URI` | Optional; defaults to `<origin>/auth/callback` |

Track B (Terraform) creates the user pool, SPA client, and hosted-UI domain
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
