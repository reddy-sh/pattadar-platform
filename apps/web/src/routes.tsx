/**
 * Route table.
 *
 * Public: "/" landing, "/login", "/signup", "/forgot-password" (native
 * in-app auth pages — customers never leave pattadar.com), "/privacy",
 * "/terms", "/auth/callback" (social-login return), and "/verify/:token"
 * (beneficiary verification must work WITHOUT login — invitees follow this
 * link before they have accounts).
 *
 * App: every signed-in screen sits at the top level with no prefix, gated by
 * RequireAuth through one pathless layout route (`id: 'app'`): "/home" is the
 * dashboard, "/properties" the list and "/properties/:id/<tab>" one Pattadar
 * property, whose tab segments are the tab names (site-features, location,
 * media, activity…). Old addresses are not redirected: nothing was deployed
 * under them (no legacy link support).
 *
 * Every route component is React.lazy so the initial chunk stays small: the
 * landing page is its own chunk and the app shell + pages load only after
 * sign-in (this also quiets Vite's large-chunk warning).
 */
import { Suspense, lazy, useEffect } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { Link, Navigate, createBrowserRouter, useLocation, useMatches } from 'react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { RequireAuth } from './auth/RequireAuth';
import { useAuth } from './auth/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

// Public chunks.
const LandingPage = lazy(() =>
  import('./pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const PricingPage = lazy(() =>
  import('./pages/pricing/PricingPage').then((m) => ({ default: m.PricingPage })),
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
// One landing for every invitation link: /i/:token, and /verify/:token, which
// is in messages already sent. /r/:code remembers a referral and goes to sign-up.
const InvitePage = lazy(() => import('./pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const ReferralLanding = lazy(() => import('./pages/InvitePage').then((m) => ({ default: m.ReferralLanding })));
const TrainingCertificatePage = lazy(() =>
  import('./pages/TrainingCertificatePage').then((m) => ({ default: m.TrainingCertificatePage })),
);
const ActivePage = lazy(() => import('./pages/ActivePage').then((m) => ({ default: m.ActivePage })));
const RecipientAccess = lazy(() => import('./w360/pages/RecipientAccess'));
const AccountDataPage = lazy(() => import('./pages/AccountDataPage').then(m=>({default:m.AccountDataPage})));
const PaymentsCheckout = lazy(() => import('./pages/PaymentsCheckout').then(m=>({default:m.PaymentsCheckout})));

// Record-360 app (screens W01–W15) — the current design, mounted at the top level.
// Its data model and API contract are docs/specs/2026-08-15-web-360-design.md.
const W360Shell = lazy(() => import('./w360/Shell').then((m) => ({ default: m.Shell })));
const W360Dashboard = lazy(() => import('./w360/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const W360Properties = lazy(() => import('./w360/pages/Properties').then((m) => ({ default: m.Properties })));
// Holdings: several records an owner holds as one piece of ground.
// A separate route family from `records/:id` on purpose — a holding is not a
// legal record and must not inherit Share / Order / Archive, which all act on
// a parcel or property row. See Holding.tsx.
const W360Holdings = lazy(() => import('./w360/pages/Holdings').then((m) => ({ default: m.Holdings })));
const W360Holding = lazy(() =>
  import('./w360/pages/Holding').then((m) => ({ default: m.Holding })),
);
const W360HoldingOverview = lazy(() =>
  import('./w360/pages/Holding').then((m) => ({ default: m.HoldingOverview })),
);
const W360HoldingSurveys = lazy(() =>
  import('./w360/pages/Holding').then((m) => ({ default: m.HoldingSurveys })),
);
const W360HoldingFmb = lazy(() =>
  import('./w360/pages/HoldingFmb').then((m) => ({ default: m.HoldingFmbTab })),
);
const W360HoldingPapers = lazy(() =>
  import('./w360/pages/HoldingLedger').then((m) => ({ default: m.HoldingPapersTab })),
);
const W360HoldingExpenses = lazy(() =>
  import('./w360/pages/HoldingLedger').then((m) => ({ default: m.HoldingExpensesTab })),
);
const W360HoldingServices = lazy(() =>
  import('./w360/pages/HoldingLedger').then((m) => ({ default: m.HoldingServicesTab })),
);
const W360MapFind = lazy(() => import('./w360/pages/MapFind').then((m) => ({ default: m.MapFind })));
const W360VillageMaps = lazy(() => import('./w360/pages/VillageMaps').then((m) => ({ default: m.VillageMaps })));
const W360Record = lazy(() => import('./w360/pages/Record').then((m) => ({ default: m.Record })));
const W360Papers = lazy(() => import('./w360/pages/RecordPapers').then((m) => ({ default: m.RecordPapers })));
const W360Overview = lazy(() => import('./w360/pages/RecordOverview').then((m) => ({ default: m.RecordOverview })));
const W360Features = lazy(() => import('./w360/pages/RecordFeatures').then((m) => ({ default: m.RecordFeatures })));
const W360People = lazy(() => import('./w360/pages/RecordPeople').then((m) => ({ default: m.RecordPeople })));
const W360Money = lazy(() => import('./w360/pages/RecordMoney').then((m) => ({ default: m.RecordMoney })));
const W360Notes = lazy(() => import('./w360/pages/RecordNotes').then((m) => ({ default: m.RecordNotes })));
const W360Expenses = lazy(() => import('./w360/pages/RecordExpenses').then((m) => ({ default: m.RecordExpenses })));
const W360Boundary = lazy(() => import('./w360/pages/RecordBoundary').then((m) => ({ default: m.RecordBoundary })));
const W360Photos = lazy(() => import('./w360/pages/RecordPhotos').then((m) => ({ default: m.RecordPhotos })));
const W360OrderLand = lazy(() => import('./w360/pages/OrderLand').then((m) => ({ default: m.OrderLand })));
const W360Request = lazy(() => import('./w360/pages/RequestWork').then((m) => ({ default: m.RequestWork })));
const W360Vault = lazy(() => import('./w360/pages/Vault').then((m) => ({ default: m.Vault })));
const W360Reader = lazy(() => import('./w360/pages/Reader').then((m) => ({ default: m.Reader })));
const W360Shelf = lazy(() => import('./w360/pages/Shelf').then((m) => ({ default: m.Shelf })));
const W360Shared = lazy(() => import('./w360/pages/Shared').then((m) => ({ default: m.Shared })));
const W360RecordServices = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.RecordServices })));
const W360RecordHistory = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.RecordHistory })));
const W360Assigned = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.Assigned })));
const W360Services = lazy(() => import('./w360/pages/Orders').then((m) => ({ default: m.Services })));
const W360Invitations = lazy(() => import('./w360/pages/Invitations').then((m) => ({ default: m.Invitations })));
const W360Heir = lazy(() => import('./w360/pages/Heir').then((m) => ({ default: m.Heir })));
const W360Refer = lazy(() => import('./w360/pages/Refer').then((m) => ({ default: m.Refer })));
const W360Help = lazy(() => import('./w360/pages/Help').then((m) => ({ default: m.Help })));
const W360Audit = lazy(() => import('./w360/pages/Audit').then((m) => ({ default: m.Audit })));
const W360Notifications = lazy(() => import('./w360/pages/Notifications').then((m) => ({ default: m.Notifications })));
const W360Groups = lazy(() => import('./w360/pages/Groups').then((m) => ({ default: m.Groups })));
const W360GroupPage = lazy(() => import('./w360/pages/Groups').then((m) => ({ default: m.GroupPage })));
const W360Ticket = lazy(() => import('./w360/pages/Ticket').then((m) => ({ default: m.Ticket })));
const W360Tools = lazy(() => import('./w360/pages/Tools').then((m) => ({ default: m.Tools })));
const W360Profile = lazy(() => import('./w360/pages/Profile').then((m) => ({ default: m.Profile })));
const W360Wallet = lazy(() => import('./w360/pages/Wallet').then((m) => ({ default: m.Wallet })));
const W360NotFound = lazy(() => import('./w360/pages/NotFound').then((m) => ({ default: m.NotFound })));
const W360ServicesAdmin = lazy(() =>
  import('./w360/pages/ServicesAdmin').then((m) => ({ default: m.ServicesAdmin })),
);
const W360ComplianceAdmin = lazy(() =>
  import('./w360/pages/ComplianceAdmin').then((m) => ({ default: m.ComplianceAdmin })),
);
const W360IntelligenceAdmin = lazy(() =>
  import('./w360/pages/IntelligenceAdmin').then((m) => ({ default: m.IntelligenceAdmin })),
);

// The Pattadar desk. Six operator screens: the jobs nobody is on, one of those
// jobs with the people who could take it, the roster, one associate, adding
// somebody, and where the roster has holes. Every one of them is guarded on
// the server by `_is_admin` — these routes are lazy chunks like any other and
// carry no authority of their own, so the rail simply does not draw them for
// anybody else (Shell.tsx) and the queries behind them answer nothing.
const W360Desk = lazy(() => import('./w360/pages/Desk').then((m) => ({ default: m.Desk })));
const W360DeskJob = lazy(() => import('./w360/pages/DeskJob').then((m) => ({ default: m.DeskJob })));
const W360DeskAssociates = lazy(() =>
  import('./w360/pages/DeskAssociates').then((m) => ({ default: m.DeskAssociates })),
);
const W360DeskAssociate = lazy(() =>
  import('./w360/pages/DeskAssociate').then((m) => ({ default: m.DeskAssociate })),
);
const W360DeskEnrol = lazy(() =>
  import('./w360/pages/DeskEnrol').then((m) => ({ default: m.DeskEnrol })),
);
const W360DeskCoverage = lazy(() =>
  import('./w360/pages/DeskCoverage').then((m) => ({ default: m.DeskCoverage })),
);
const W360GeographyAdmin = lazy(() =>
  import('./w360/pages/GeographyAdmin').then((m) => ({ default: m.GeographyAdmin })),
);

// Previous app shell + pages, still routed under /legacy. Every rail section
// is drawn in the signed-in app now. Tools, Profile and Invitations went furthest: each
// old MUI screen is deleted and its /legacy address is only a redirect below.
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
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const WalletPage = lazy(() => import('./pages/WalletPage').then((m) => ({ default: m.WalletPage })));
const AuditLogPage = lazy(() =>
  import('./pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
);
const AdminRefDataPage = lazy(() =>
  import('./pages/AdminRefDataPage').then((m) => ({ default: m.AdminRefDataPage })),
);
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

/* The boundary goes OUTSIDE the Suspense, not inside it.
 *
 * Every screen here is behind React.lazy. When a chunk fails to download — a
 * deploy rotated the hashed filenames under an open tab, or a phone dropped
 * signal between two screens — the lazy promise rejects and re-throws during
 * render. That throw does not travel through the router, so `errorElement`
 * never sees it; with no boundary above the Suspense it unmounted the whole
 * app and left a white page. Wrapping each route's Suspense means the failure
 * is contained to the one screen that could not load. */
function suspended(Component: LazyExoticComponent<ComponentType>) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

/** A URL that matches nothing.
 *
 *  Without a catch-all, react-router's data router renders its own
 *  `DefaultErrorComponent` — unstyled black text reading "Unexpected
 *  Application Error!" over an italic "404 Not Found", with no nav, no
 *  wordmark and no way back. `/dashboard` did this, and so did every
 *  mistyped record path. This says which URL failed and offers the way out.
 *
 *  `noindex` because CloudFront serves the SPA shell with HTTP 200, so a
 *  crawler that finds a soft-404 would otherwise index it as a real page. */
function useNoIndex() {
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex';
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
}

/** Signed in: inside the shell, on the shared page head (w360/pages/NotFound). */
function AppNotFound() {
  useNoIndex();
  return suspended(W360NotFound);
}

/** Under /legacy and outside both apps, which have no page head of their own. */
function NotFound({ home, label }: { home: string; label: string }) {
  const { pathname } = useLocation();
  useNoIndex();
  return (
    <main style={{ padding: 'var(--space-xl)' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>There is no page at that address</h1>
      <p className="note mono" style={{ margin: 'var(--space-md) 0', overflowWrap: 'anywhere' }}>
        {pathname}
      </p>
      <Link className="btn primary" to={home}>Go to {label}</Link>
    </main>
  );
}

/* There used to be an UNDRAWN list here: sections with no design yet, each
 * rendered by a shared Section.tsx stub linking into /legacy. Wallet, admin,
 * groups, notifications, tools, audit and profile left it one by one;
 * invitations was the last, and the stub went with it. Every rail entry opens
 * a screen drawn in this app now. */

/** /legacy/tools and its four older aliases, carried into /tools with the
 *  tab they named. The query string rides along, so a bookmarked
 *  `/legacy/tools?tab=calculator` still opens the calculator. */
function ToTools({ tab }: { tab?: string }) {
  const { search } = useLocation();
  return <Navigate to={tab ? `/tools?tab=${tab}` : `/tools${search}`} replace />;
}

/** The signed-in frame. An unknown address is the one route a signed-out
 *  visitor may reach here: they get the public 404, not the sign-in page. */
function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const strayVisitor = useMatches().some((m) => m.id === 'not-found');
  if (strayVisitor && !isLoading && !isAuthenticated) return <NotFound home="/" label="the front page" />;
  return <RequireAuth>{suspended(W360Shell)}</RequireAuth>;
}

export const router = createBrowserRouter([
  { path: '/', element: suspended(LandingPage) },
  { path: '/pricing', element: suspended(PricingPage) },
  { path: '/login', element: suspended(LoginPage) },
  { path: '/signup', element: suspended(SignupPage) },
  { path: '/forgot-password', element: suspended(ForgotPasswordPage) },
  { path: '/privacy', element: suspended(PrivacyPage) },
  { path: '/terms', element: suspended(TermsPage) },
  { path: '/auth/callback', element: suspended(AuthCallbackPage) },
  { path: '/verify/:token', element: suspended(InvitePage) },
  { path: '/i/:token', element: suspended(InvitePage) },
  { path: '/r/:code', element: suspended(ReferralLanding) },
  { path: '/certificate/:code', element: suspended(TrainingCertificatePage) },
  { path: '/active/:token', element: suspended(ActivePage) },
  { path: '/share/:token', element: suspended(RecipientAccess) },
  { path: '/work/:token', element: suspended(RecipientAccess) },
  {
    // The current design (W01–W15). Property-first: one faceted Properties list,
    // and every Pattadar property opens a 360 with nine tabs.
    // Pathless: the signed-in screens are top-level addresses, and `id` is the
    // anchor the route guards (shared-components-tests SC-H10) read.
    id: 'app',
    element: <AppLayout />,
    children: [
      { path: 'home', element: suspended(W360Dashboard) },
      { path: 'properties', element: suspended(W360Properties) },
      // Holdings: several records held as one property. `holdings/:id` is a
      // frame with six tabs of its own, like a record — but it is an aggregate,
      // so its members' own screens stay under `records/:id` and everything
      // here links there rather than editing a survey in two places.
      { path: 'holdings', element: suspended(W360Holdings) },
      {
        path: 'holdings/:id',
        element: suspended(W360Holding),
        children: [
          { index: true, element: suspended(W360HoldingOverview) },
          { path: 'surveys', element: suspended(W360HoldingSurveys) },
          { path: 'papers', element: suspended(W360HoldingPapers) },
          { path: 'fmb', element: suspended(W360HoldingFmb) },
          { path: 'expenses', element: suspended(W360HoldingExpenses) },
          { path: 'services', element: suspended(W360HoldingServices) },
        ],
      },
      { path: 'map', element: suspended(W360MapFind) },
      { path: 'maps', element: suspended(W360VillageMaps) },
      { path: 'shared', element: suspended(W360Shared) },
      { path: 'assigned', element: suspended(W360Assigned) },
      { path: 'services', element: suspended(W360Services) },
      // One ordered service, reached from a Services row the way a paper is
      // reached from the Papers list — not as a seventh hanger on the record.
      // It is a SERVICE and not a "ticket": that was internal vocabulary that
      // reached the address bar, and an owner who ordered a patta copy is not
      // raising a support ticket.
      { path: 'services/:id', element: suspended(W360Ticket) },
      { path: 'services/:id/pay', element: suspended(PaymentsCheckout) },
      // Ordering is one flow: properties, then services, then review.
      { path: 'order', element: suspended(W360OrderLand) },
      { path: 'papers', element: suspended(W360Vault) },
      // Before 'papers/:id', or the Reader would claim /papers/shelf and
      // ask the API for a document whose id is the word "shelf".
      { path: 'papers/shelf/:key', element: suspended(W360Shelf) },
      { path: 'papers/:id', element: suspended(W360Reader) },
      { path: 'wallet', element: suspended(W360Wallet) },
      { path: 'account', element: suspended(AccountDataPage) },
      { path: 'admin/catalogue', element: suspended(W360ServicesAdmin) },
      { path: 'admin/compliance', element: suspended(W360ComplianceAdmin) },
      { path: 'admin/intelligence', element: suspended(W360IntelligenceAdmin) },
      { path: 'admin/geography', element: suspended(W360GeographyAdmin) },
      { path: 'admin/members', element: suspended(W360DeskAssociates) },
      { path: 'admin/members/enrol', element: suspended(W360DeskEnrol) },
      { path: 'admin/members/:id', element: suspended(W360DeskAssociate) },
      // The desk. Inside the same shell as everything else on purpose: the
      // operator is also an owner with their own land, and a second shell
      // would mean a second wordmark, a second search box and a sign-out in a
      // different corner for the one person who uses the app most.
      { path: 'desk', element: suspended(W360Desk) },
      { path: 'desk/jobs/:id', element: suspended(W360DeskJob) },
      { path: 'desk/associates', element: suspended(W360DeskAssociates) },
      { path: 'desk/associates/:id', element: suspended(W360DeskAssociate) },
      { path: 'desk/enrol', element: suspended(W360DeskEnrol) },
      { path: 'desk/coverage', element: suspended(W360DeskCoverage) },
      {
        path: 'properties/:id',
        element: suspended(W360Record),
        children: [
          { index: true, element: suspended(W360Overview) },
          { path: 'documents', element: suspended(W360Papers) },
          { path: 'site-features', element: suspended(W360Features) },
          { path: 'people', element: suspended(W360People) },
          { path: 'services', element: suspended(W360RecordServices) },
          { path: 'money', element: suspended(W360Money) },
          { path: 'notes', element: suspended(W360Notes) },
          { path: 'expenses', element: suspended(W360Expenses) },
          { path: 'activity', element: suspended(W360RecordHistory) },
          { path: 'location', element: suspended(W360Boundary) },
          { path: 'media', element: suspended(W360Photos) },
          { path: 'request', element: suspended(W360Request) },
        ],
      },
      // Families & groups: the list, and one page per group. The page reads
      // its row out of the same cached `groups` list the list drew.
      { path: 'groups', element: suspended(W360Groups) },
      { path: 'groups/:id', element: suspended(W360GroupPage) },
      // Audit is drawn in this design now (w360/pages/Audit.tsx) — the owner's
      // centralized trail — so it left UNDRAWN the same way `groups` and
      // `admin` did. /legacy/audit stays reachable for the old export view.
      { path: 'audit', element: suspended(W360Audit) },
      { path: 'notifications', element: suspended(W360Notifications) },
      // Tools: the four land utilities, drawn here; ?tab= picks the tool.
      { path: 'tools', element: suspended(W360Tools) },
      // Profile: name, contact, address, interests and Aadhaar, drawn here.
      { path: 'profile', element: suspended(W360Profile) },
      // Invitations the owner has sent: send, revoke, delete, export.
      { path: 'invitations', element: suspended(W360Invitations) },
      // Help & support, from the foot of the rail.
      { path: 'help', element: suspended(W360Help) },
      // The heir's own view of how they were listed, after claiming an invite.
      { path: 'heir/:id', element: suspended(W360Heir) },
      // Invite & earn: the account's referral link.
      { path: 'refer', element: suspended(W360Refer) },
      // Any other address. Signed in, it keeps the shell and the rail rather
      // than dropping the user onto a bare page; signed out, AppLayout shows
      // the front-page 404 instead of asking a stranger to sign in.
      { id: 'not-found', path: '*', element: <AppNotFound /> },
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
      // Drawn at /invitations; the MUI screen is deleted.
      { path: 'invitations', element: <Navigate to="/invitations" replace /> },
      { path: 'notifications', element: suspended(NotificationsPage) },
      { path: 'wallet', element: suspended(WalletPage) },
      { path: 'tools', element: <ToTools /> },
      { path: 'audit', element: suspended(AuditLogPage) },
      { path: 'admin', element: suspended(AdminRefDataPage) },
      { path: 'profile', element: <Navigate to="/profile" replace /> },
      // Within the legacy app, its own older aliases still resolve.
      { path: 'properties', element: <Navigate to="/legacy/parcels?tab=properties" replace /> },
      { path: 'deeds', element: <Navigate to="/legacy/documents" replace /> },
      { path: 'sro', element: <ToTools tab="sro" /> },
      { path: 'stamp-duty', element: <ToTools tab="stamp-duty" /> },
      { path: 'market-value', element: <ToTools tab="market-value" /> },
      { path: 'calculator', element: <ToTools tab="calculator" /> },
      // Unknown /legacy URLs keep the legacy shell and its nav rather than
      // falling through to the top-level page, which has neither.
      { path: '*', element: <NotFound home="/legacy" label="the previous app" /> },
    ],
  },
]);
