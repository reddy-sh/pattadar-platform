/**
 * Route table.
 *
 * Public: "/" landing, "/login", "/signup", "/forgot-password" (native
 * in-app auth pages — customers never leave pattadar.com), "/privacy",
 * "/terms", "/auth/callback" (social-login return), and "/verify/:token"
 * (beneficiary verification must work WITHOUT login — invitees follow this
 * link before they have accounts).
 *
 * App: everything under "/app/*", gated by RequireAuth. The section paths
 * mirror the current rhub pattadar app exactly:
 *   dashboard(index) · passbooks · parcels (Land & Properties, merged) ·
 *   documents · groups (Families & Groups) · invitations · notifications ·
 *   wallet · tools · audit · admin · profile
 * Legacy routes redirect INTO that structure — /app/properties into the
 * Properties tab of Land & Properties, /app/deeds into Documents, and the
 * four old tool routes into the matching Tools tab.
 *
 * THIS FILE IS FINAL for the rebuild: later parts fill their page files
 * (DocumentsPage, FamiliesGroupsPage, InvitationsPage, NotificationsPage,
 * ToolsPage, AuditLogPage, AdminRefDataPage, ProfilePage) and never touch
 * routes again.
 *
 * Every route component is React.lazy so the initial chunk stays small: the
 * landing page is its own chunk and the app shell + pages load only after
 * sign-in (this also quiets Vite's large-chunk warning).
 */
import { Suspense, lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { RequireAuth } from './auth/RequireAuth';

// Public chunks.
const LandingPage = lazy(() =>
  import('./pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const PrivacyPage = lazy(() =>
  import('./pages/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() => import('./pages/legal/TermsPage').then((m) => ({ default: m.TermsPage })));
const AuthCallbackPage = lazy(() =>
  import('./auth/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage })),
);
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() =>
  import('./pages/auth/SignupPage').then((m) => ({ default: m.SignupPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const VerifyPage = lazy(() => import('./pages/VerifyPage').then((m) => ({ default: m.VerifyPage })));

// Record-360 app (screens W01–W15) — the current design, mounted at /app.
// Its data model and API contract are docs/specs/2026-08-15-web-360-design.md.
const W360Shell = lazy(() => import('./w360/Shell').then((m) => ({ default: m.Shell })));
const W360Dashboard = lazy(() => import('./w360/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const W360Properties = lazy(() => import('./w360/pages/Properties').then((m) => ({ default: m.Properties })));
const W360MapFind = lazy(() => import('./w360/pages/MapFind').then((m) => ({ default: m.MapFind })));
const W360Record = lazy(() => import('./w360/pages/Record').then((m) => ({ default: m.Record })));
const W360Papers = lazy(() => import('./w360/pages/RecordPapers').then((m) => ({ default: m.RecordPapers })));
const W360Features = lazy(() => import('./w360/pages/RecordFeatures').then((m) => ({ default: m.RecordFeatures })));
const W360People = lazy(() => import('./w360/pages/RecordPeople').then((m) => ({ default: m.RecordPeople })));
const W360Money = lazy(() => import('./w360/pages/RecordMoney').then((m) => ({ default: m.RecordMoney })));
const W360Expenses = lazy(() => import('./w360/pages/RecordExpenses').then((m) => ({ default: m.RecordExpenses })));
const W360Boundary = lazy(() => import('./w360/pages/RecordBoundary').then((m) => ({ default: m.RecordBoundary })));
const W360Photos = lazy(() => import('./w360/pages/RecordPhotos').then((m) => ({ default: m.RecordPhotos })));
const W360Vault = lazy(() => import('./w360/pages/Vault').then((m) => ({ default: m.Vault })));
const W360Reader = lazy(() => import('./w360/pages/Reader').then((m) => ({ default: m.Reader })));
const W360Shared = lazy(() => import('./w360/pages/Shared').then((m) => ({ default: m.Shared })));
const W360RecordServices = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.RecordServices })));
const W360RecordHistory = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.RecordHistory })));
const W360Assigned = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.Assigned })));
const W360Services = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.Services })));
const W360Section = lazy(() => import('./w360/pages/Section').then((m) => ({ default: m.Section })));

// Previous app shell + pages. Still routed, under /legacy, for the sections the
// W01–W15 handover did not redraw (groups, invitations, wallet, tools, audit,
// admin, profile) — nothing that worked has been deleted.
const AppShell = lazy(() => import('./layout/AppShell').then((m) => ({ default: m.AppShell })));
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const PassbooksPage = lazy(() =>
  import('./pages/PassbooksPage').then((m) => ({ default: m.PassbooksPage })),
);
const LandPropertiesPage = lazy(() =>
  import('./pages/LandPropertiesPage').then((m) => ({ default: m.LandPropertiesPage })),
);
const DocumentsPage = lazy(() =>
  import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const FamiliesGroupsPage = lazy(() =>
  import('./pages/FamiliesGroupsPage').then((m) => ({ default: m.FamiliesGroupsPage })),
);
const InvitationsPage = lazy(() =>
  import('./pages/InvitationsPage').then((m) => ({ default: m.InvitationsPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const WalletPage = lazy(() => import('./pages/WalletPage').then((m) => ({ default: m.WalletPage })));
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((m) => ({ default: m.ToolsPage })));
const AuditLogPage = lazy(() =>
  import('./pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
);
const AdminRefDataPage = lazy(() =>
  import('./pages/AdminRefDataPage').then((m) => ({ default: m.AdminRefDataPage })),
);
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
// Record detail views (parcel 360 / property 360 / passbook record).
const ParcelDetailPage = lazy(() =>
  import('./pages/detail/ParcelDetailPage').then((m) => ({ default: m.ParcelDetailPage })),
);
const PropertyDetailPage = lazy(() =>
  import('./pages/detail/PropertyDetailPage').then((m) => ({ default: m.PropertyDetailPage })),
);
const PassbookDetailPage = lazy(() =>
  import('./pages/detail/PassbookDetailPage').then((m) => ({ default: m.PassbookDetailPage })),
);

function RouteFallback() {
  return (
    <Box sx={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}

function suspended(Component: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Component />
    </Suspense>
  );
}

/** Same as `suspended`, for a lazy component that takes props (the shared
 *  Section page, which is told which section it is rendering). */
function suspendedWith<P extends object>(Component: LazyExoticComponent<ComponentType<P>>, props: P) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Component {...props} />
    </Suspense>
  );
}

/** The eight sections the W01–W15 handover did not draw. Each renders the
 *  shared Section page and links to its still-working /legacy screen. */
const UNDRAWN = ['groups', 'invitations', 'notifications', 'wallet', 'tools', 'audit', 'admin', 'profile'] as const;

export const router = createBrowserRouter([
  { path: '/', element: suspended(LandingPage) },
  { path: '/login', element: suspended(LoginPage) },
  { path: '/signup', element: suspended(SignupPage) },
  { path: '/forgot-password', element: suspended(ForgotPasswordPage) },
  { path: '/privacy', element: suspended(PrivacyPage) },
  { path: '/terms', element: suspended(TermsPage) },
  { path: '/auth/callback', element: suspended(AuthCallbackPage) },
  { path: '/verify/:token', element: suspended(VerifyPage) },
  { path: '/active/:token', element: suspended(VerifyPage) },
  {
    // The current design (W01–W15). Record-first: one faceted Properties list,
    // and every record opens a 360 with six hangers.
    path: '/app',
    element: <RequireAuth>{suspended(W360Shell)}</RequireAuth>,
    children: [
      { index: true, element: suspended(W360Dashboard) },
      { path: 'properties', element: suspended(W360Properties) },
      { path: 'map', element: suspended(W360MapFind) },
      { path: 'shared', element: suspended(W360Shared) },
      { path: 'assigned', element: suspended(W360Assigned) },
      { path: 'services', element: suspended(W360Services) },
      { path: 'papers', element: suspended(W360Vault) },
      { path: 'papers/:id', element: suspended(W360Reader) },
      {
        path: 'records/:id',
        element: suspended(W360Record),
        children: [
          { index: true, element: suspended(W360Papers) },
          { path: 'features', element: suspended(W360Features) },
          { path: 'people', element: suspended(W360People) },
          { path: 'services', element: suspended(W360RecordServices) },
          { path: 'money', element: suspended(W360Money) },
          { path: 'expenses', element: suspended(W360Expenses) },
          { path: 'history', element: suspended(W360RecordHistory) },
          { path: 'map', element: suspended(W360Boundary) },
          { path: 'photos', element: suspended(W360Photos) },
        ],
      },
      ...UNDRAWN.map((id) => ({ path: id, element: suspendedWith(W360Section, { id }) })),
      // The old vocabulary still resolves: a bookmarked parcel or document URL
      // lands on the same thing under its new name.
      { path: 'parcels', element: <Navigate to="/app/properties?kind=parcel" replace /> },
      { path: 'parcels/:id', element: <Navigate to="/app/properties" replace /> },
      { path: 'documents', element: <Navigate to="/app/papers" replace /> },
      { path: 'passbooks', element: <Navigate to="/app/properties?kind=parcel" replace /> },
    ],
  },
  {
    // The previous app, intact. Reachable for the sections not yet redrawn.
    path: '/legacy',
    element: <RequireAuth>{suspended(AppShell)}</RequireAuth>,
    children: [
      { index: true, element: suspended(DashboardPage) },
      { path: 'passbooks', element: suspended(PassbooksPage) },
      { path: 'passbooks/:id', element: suspended(PassbookDetailPage) },
      { path: 'parcels', element: suspended(LandPropertiesPage) },
      { path: 'parcels/:id', element: suspended(ParcelDetailPage) },
      { path: 'properties/:id', element: suspended(PropertyDetailPage) },
      { path: 'documents', element: suspended(DocumentsPage) },
      { path: 'groups', element: suspended(FamiliesGroupsPage) },
      { path: 'invitations', element: suspended(InvitationsPage) },
      { path: 'notifications', element: suspended(NotificationsPage) },
      { path: 'wallet', element: suspended(WalletPage) },
      { path: 'tools', element: suspended(ToolsPage) },
      { path: 'audit', element: suspended(AuditLogPage) },
      { path: 'admin', element: suspended(AdminRefDataPage) },
      { path: 'profile', element: suspended(ProfilePage) },
      // Within the legacy app, its own older aliases still resolve.
      { path: 'properties', element: <Navigate to="/legacy/parcels?tab=properties" replace /> },
      { path: 'deeds', element: <Navigate to="/legacy/documents" replace /> },
      { path: 'sro', element: <Navigate to="/legacy/tools?tab=sro" replace /> },
      { path: 'stamp-duty', element: <Navigate to="/legacy/tools?tab=stamp-duty" replace /> },
      { path: 'market-value', element: <Navigate to="/legacy/tools?tab=market-value" replace /> },
      { path: 'calculator', element: <Navigate to="/legacy/tools?tab=calculator" replace /> },
    ],
  },
]);
