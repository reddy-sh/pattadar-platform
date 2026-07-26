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

// App shell + pages: loaded only after sign-in.
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
    path: '/app',
    element: <RequireAuth>{suspended(AppShell)}</RequireAuth>,
    children: [
      { index: true, element: suspended(DashboardPage) },
      { path: 'passbooks', element: suspended(PassbooksPage) },
      { path: 'parcels', element: suspended(LandPropertiesPage) },
      { path: 'documents', element: suspended(DocumentsPage) },
      { path: 'groups', element: suspended(FamiliesGroupsPage) },
      { path: 'invitations', element: suspended(InvitationsPage) },
      { path: 'notifications', element: suspended(NotificationsPage) },
      { path: 'wallet', element: suspended(WalletPage) },
      { path: 'tools', element: suspended(ToolsPage) },
      { path: 'audit', element: suspended(AuditLogPage) },
      { path: 'admin', element: suspended(AdminRefDataPage) },
      { path: 'profile', element: suspended(ProfilePage) },
      // Legacy routes → the new structure (kept working, like the rhub app).
      { path: 'properties', element: <Navigate to="/app/parcels?tab=properties" replace /> },
      { path: 'deeds', element: <Navigate to="/app/documents" replace /> },
      { path: 'sro', element: <Navigate to="/app/tools?tab=sro" replace /> },
      { path: 'stamp-duty', element: <Navigate to="/app/tools?tab=stamp-duty" replace /> },
      { path: 'market-value', element: <Navigate to="/app/tools?tab=market-value" replace /> },
      { path: 'calculator', element: <Navigate to="/app/tools?tab=calculator" replace /> },
    ],
  },
]);
