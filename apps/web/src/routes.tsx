/**
 * Route table.
 *
 * Public: "/" landing, "/login", "/signup", "/forgot-password" (native
 * in-app auth pages — customers never leave pattadar.com), "/privacy",
 * "/terms", "/auth/callback" (social-login return), and "/verify/:token"
 * (beneficiary verification must work WITHOUT login — invitees follow this
 * link before they have accounts).
 *
 * App: everything under "/app/*", gated by RequireAuth.
 *
 * Every route component is React.lazy so the initial chunk stays small: the
 * landing page is its own chunk and the app shell + pages load only after
 * sign-in (this also quiets Vite's large-chunk warning).
 */
import { Suspense, lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { createBrowserRouter } from 'react-router';
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
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AuditPage = lazy(() => import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })));
const CalculatorPage = lazy(() =>
  import('./pages/CalculatorPage').then((m) => ({ default: m.CalculatorPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DeedsPage = lazy(() => import('./pages/DeedsPage').then((m) => ({ default: m.DeedsPage })));
const DocumentsPage = lazy(() =>
  import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const GroupsPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const InvitationsPage = lazy(() =>
  import('./pages/InvitationsPage').then((m) => ({ default: m.InvitationsPage })),
);
const MarketValuePage = lazy(() =>
  import('./pages/MarketValuePage').then((m) => ({ default: m.MarketValuePage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const ParcelsPage = lazy(() => import('./pages/ParcelsPage').then((m) => ({ default: m.ParcelsPage })));
const PassbooksPage = lazy(() =>
  import('./pages/PassbooksPage').then((m) => ({ default: m.PassbooksPage })),
);
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const PropertiesPage = lazy(() =>
  import('./pages/PropertiesPage').then((m) => ({ default: m.PropertiesPage })),
);
const SroPage = lazy(() => import('./pages/SroPage').then((m) => ({ default: m.SroPage })));
const WalletPage = lazy(() => import('./pages/WalletPage').then((m) => ({ default: m.WalletPage })));
const StampDutyPage = lazy(() =>
  import('./pages/StampDutyPage').then((m) => ({ default: m.StampDutyPage })),
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
      { path: 'parcels', element: suspended(ParcelsPage) },
      { path: 'properties', element: suspended(PropertiesPage) },
      { path: 'documents', element: suspended(DocumentsPage) },
      { path: 'deeds', element: suspended(DeedsPage) },
      { path: 'groups', element: suspended(GroupsPage) },
      { path: 'invitations', element: suspended(InvitationsPage) },
      { path: 'wallet', element: suspended(WalletPage) },
      { path: 'notifications', element: suspended(NotificationsPage) },
      { path: 'sro', element: suspended(SroPage) },
      { path: 'stamp-duty', element: suspended(StampDutyPage) },
      { path: 'market-value', element: suspended(MarketValuePage) },
      { path: 'calculator', element: suspended(CalculatorPage) },
      { path: 'audit', element: suspended(AuditPage) },
      { path: 'admin', element: suspended(AdminPage) },
      { path: 'profile', element: suspended(ProfilePage) },
    ],
  },
]);
