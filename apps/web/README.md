# @pattadar/web

Pattadar web head. React 19 + MUI v9 (Emotion engine, CSS theme variables with
light/dark color schemes) + Vite 8 + React Router 8 (data router) +
TanStack Query 5. Theme derives from `@pattadar/tokens`; shared domain logic
and GraphQL types come from `@pattadar/core`. Dates render DD/MM/YYYY via
`@pattadar/core` formatters.

Currently a buildable shell-lite skeleton: AppBar, responsive nav drawer,
placeholder pages, footer, and a closed assistant-panel stub
(TODO(Phase 3)). Auth is a seam in `src/api/client.ts`
(TODO(Phase 2): Auth0 SPA). All API paths are gateway-relative (`/api/...`);
the Vite dev server proxies them to the slim gateway on `localhost:8080`.

## Commands

```sh
bun install          # from the repo root
bun run dev          # Vite dev server
bun run typecheck    # tsc --noEmit
bun run build        # production bundle
```

## View inventory

Each placeholder page maps to the rhub source it gets rebuilt from
(`rhub/ui/apps/pattadar/src/`).

| Route | Page | rhub source |
| --- | --- | --- |
| `/` | Dashboard | `RemoteApp.tsx` DashboardView + `dashboard.ts` |
| `/passbooks` | Passbooks | PassbooksView, PassbookDetailView, `PassbookCreateModal.tsx` |
| `/parcels` | Parcels | HoldingsView (initial `all`), ParcelDetailView, `ParcelGallery.tsx`, `AllHoldingsView.tsx` |
| `/properties` | Properties | `properties/` — PropertiesView, PropertyDetailView, Add/EditPropertyModal, `propertyTypes.ts` |
| `/documents` | Documents | `DocumentsView.tsx`, `FilesPanel.tsx`, `driveFolders.ts`, `docTypes.ts`, `documentClassify.ts` |
| `/deeds` | Deeds | RegisteredDocsView, RegisteredDocDetailView (`RemoteApp.tsx`) |
| `/groups` | Groups | `family/` — GroupsListView, GroupDetailView, FamilyTree, UnifiedFamilyView, `genealogy.ts` |
| `/invitations` | Invitations | InvitationsView (`RemoteApp.tsx`) |
| `/notifications` | Notifications | `NotificationsView.tsx` |
| `/sro` | SRO Offices | ToolsView `sro` tab |
| `/stamp-duty` | Stamp Duty | ToolsView `stamp-duty` tab |
| `/market-value` | Market Value | ToolsView `market-value` tab |
| `/calculator` | Calculator | `Calculator.tsx`, `landcalc.ts`, `units.ts` (logic moves to `@pattadar/core`) |
| `/audit` | Audit | AuditView (`RemoteApp.tsx`) |
| `/admin` | Admin | AdminView (`RemoteApp.tsx`) + gateway super-admin AI/model settings |
| `/profile` | Profile | ProfileView (`RemoteApp.tsx`) |
| `/verify/:token` | Verify (public, outside shell) | VerifyView / `verifyBeneficiary` mutation — must work without login |

## Component replacements

| rhub component | Replacement |
| --- | --- |
| DataTable / AdvancedTable (Ant Design) | MUI X DataGrid — TODO(Phase 2). Lesson from rhub: AdvancedTable silently ignored `visible`/`disabled` on row actions; guard row-action availability inside `onClick`, not only via declarative props, and verify the grid honours whichever you use. |
| ExportMenu | Port with `exporters.ts` — jspdf + autotable + xlsx (lazy-imported); branded A4-landscape PDF with PATTADAR watermark and header/footer. |
| FileExplorer (My Drive) | Scoped v1: list/upload/preview/trash/star over the gateway S3 storage API. Versioning and sharing later. |
| GeoMap | TODO: evaluate MapLibre GL before porting parcel maps. |

Date formatting is centralised in `@pattadar/core` (`formatDate`), Indian
convention DD/MM/YYYY — do not format dates inline in components.
