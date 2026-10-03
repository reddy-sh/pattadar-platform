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
 *   wallet · tools · audit · profile · help
 * Legacy routes redirect INTO that structure — /app/properties into the
 * Properties tab of Land & Properties, /app/deeds into Documents, and the
 * four old tool routes (and /legacy/tools) into the matching Tools tab.
 *
 * That rebuild is done and this file stopped changing with it. The one thing
 * that reopens it is a subsystem the rebuild did not have: "/app/desk" is the
 * Pattadar desk (docs/specs/2026-09-13-associates-marketplace.md), the six
 * screens an operator uses to put a real person on a placed job. It is not a
 * redraw of an existing section, so it arrives as six new paths rather than a
 * page file filling in behind one — and it takes over "/app/admin", which is
 * why that path is a redirect below and no longer a section of its own.
 *
 * Every route component is React.lazy so the initial chunk stays small: the
 * landing page is its own chunk and the app shell + pages load only after
 * sign-in (this also quiets Vite's large-chunk warning).
 */
import { Suspense, lazy, useEffect } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { Link, Navigate, createBrowserRouter, useLocation, useParams } from 'react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { RequireAuth } from './auth/RequireAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { holdingsPathFrom } from './w360/holdingPath';

// Public chunks.
const LandingPage = lazy(() =>
  import('./pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const PricingPage = lazy(() =>
  import('./pages/pricing/PricingPage').then((m) => ({ default: m.PricingPage })),
);
const ThemeSamplesPage = lazy(() =>
  import('./pages/landing/ThemeSamplesPage').then((m) => ({ default: m.ThemeSamplesPage })),
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

// Record-360 app (screens W01–W15) — the current design, mounted at /app.
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
const W360Features = lazy(() => import('./w360/pages/RecordFeatures').then((m) => ({ default: m.RecordFeatures })));
const W360People = lazy(() => import('./w360/pages/RecordPeople').then((m) => ({ default: m.RecordPeople })));
const W360Money = lazy(() => import('./w360/pages/RecordMoney').then((m) => ({ default: m.RecordMoney })));
const W360Notes = lazy(() => import('./w360/pages/RecordNotes').then((m) => ({ default: m.RecordNotes })));
const W360Expenses = lazy(() => import('./w360/pages/RecordExpenses').then((m) => ({ default: m.RecordExpenses })));
const W360Boundary = lazy(() => import('./w360/pages/RecordBoundary').then((m) => ({ default: m.RecordBoundary })));
const W360Photos = lazy(() => import('./w360/pages/RecordPhotos').then((m) => ({ default: m.RecordPhotos })));
const W360Order = lazy(() => import('./w360/pages/OrderService').then((m) => ({ default: m.OrderService })));
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
const W360Ticket = lazy(() => import('./w360/pages/Ticket').then((m) => ({ default: m.Ticket })));
const W360Tools = lazy(() => import('./w360/pages/Tools').then((m) => ({ default: m.Tools })));
const W360Profile = lazy(() => import('./w360/pages/Profile').then((m) => ({ default: m.Profile })));
const W360Wallet = lazy(() => import('./w360/pages/Wallet').then((m) => ({ default: m.Wallet })));
const W360ComplianceAdmin = lazy(() =>
  import('./w360/pages/ComplianceAdmin').then((m) => ({ default: m.ComplianceAdmin })),
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
// is drawn under /app now. Tools, Profile and Invitations went furthest: each
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

/** An old detail URL, carried through with its id instead of thrown away.
 *
 *  `parcels/:id` used to be `<Navigate to="/app/properties">`, which discarded
 *  the matched id and dumped anyone following a bookmark or a shared link for
 *  ONE parcel onto the unfiltered list of everything they own, with nothing on
 *  screen to say the link had named a record at all.
 *
 *  Generic rather than parcel-specific: the W360 `record(id)` resolver serves
 *  one id space for both parcels and built properties, and `/app/properties/:id`
 *  was a real pre-W360 URL that matched no route at all after the rebuild.
 *  A dead id lands on Record.tsx's "That record is not in your portfolio",
 *  which is the correct answer and already written. */
function ToRecord() {
  const { id } = useParams();
  return <Navigate to={`/app/records/${id}`} replace />;
}

/** The old address for one ordered service.
 *
 *  This redirect is permanent and is not housekeeping. `ServicesScreen.swift`
 *  builds `https://pattadar.com/app/tickets/<id>/pay` and that is in a SHIPPED
 *  iOS binary — the phone cannot be told a new path. Every link already sent
 *  out by SMS or email is in the same position. The word changed; the address
 *  people already hold did not. */
function ToService({ pay }: { pay?: boolean }) {
  const { id } = useParams();
  return <Navigate to={`/app/services/${id}${pay ? '/pay' : ''}`} replace />;
}

/** A passbook id is a `passbooks.id`, not a record id, so `record(id)` returns
 *  null for it and the 360 would say it is not in your portfolio — which is
 *  false. The legacy screen still renders these properly. */
function ToLegacyPassbook() {
  const { id } = useParams();
  return <Navigate to={`/legacy/passbooks/${id}`} replace />;
}

/** A URL that matches nothing.
 *
 *  Without a catch-all, react-router's data router renders its own
 *  `DefaultErrorComponent` — unstyled black text reading "Unexpected
 *  Application Error!" over an italic "404 Not Found", with no nav, no
 *  wordmark and no way back. `/app/dashboard` did this, and so did every
 *  mistyped record path. This says which URL failed and offers the way out.
 *
 *  `noindex` because CloudFront serves the SPA shell with HTTP 200, so a
 *  crawler that finds a soft-404 would otherwise index it as a real page. */
function NotFound({ home = '/app', label = 'Home' }: { home?: string; label?: string }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex';
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
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

/** /legacy/tools and its four older aliases, carried into /app/tools with the
 *  tab they named. The query string rides along, so a bookmarked
 *  `/legacy/tools?tab=calculator` still opens the calculator. */
function ToTools({ tab }: { tab?: string }) {
  const { search } = useLocation();
  return <Navigate to={tab ? `/app/tools?tab=${tab}` : `/app/tools${search}`} replace />;
}

/** `/app/combined…` was the Holdings address until 03/10/2026. Bookmarks and
 *  shared links keep working: the id, the tab, the query and the hash ride along. */
function FromCombined() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${holdingsPathFrom(pathname)}${search}${hash}`} replace />;
}

export const router = createBrowserRouter([
  { path: '/', element: suspended(LandingPage) },
  { path: '/pricing', element: suspended(PricingPage) },
  { path: '/theme-samples', element: suspended(ThemeSamplesPage) },
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
    // The current design (W01–W15). Record-first: one faceted Properties list,
    // and every record opens a 360 with nine hangers.
    path: '/app',
    element: <RequireAuth>{suspended(W360Shell)}</RequireAuth>,
    children: [
      { index: true, element: suspended(W360Dashboard) },
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
      // The old Holdings address; see FromCombined.
      { path: 'combined', element: <FromCombined /> },
      { path: 'combined/*', element: <FromCombined /> },
      { path: 'map', element: suspended(W360MapFind) },
      { path: 'maps', element: suspended(W360VillageMaps) },
      // Bookmarks and links sent before the cadastral naming change still land
      // on the same screen; /app/maps is the canonical, shorter route.
      { path: 'villages', element: <Navigate to="/app/maps" replace /> },
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
      // Ordering begins by choosing the land, because an order is always
      // against exactly one piece of it. This screen composes nothing: it
      // picks the record, then hands off to the flow under it. The old
      // ?record= form is still honoured here and redirected into the path.
      { path: 'order', element: suspended(W360OrderLand) },
      { path: 'papers', element: suspended(W360Vault) },
      // Before 'papers/:id', or the Reader would claim /app/papers/shelf and
      // ask the API for a document whose id is the word "shelf".
      { path: 'papers/shelf/:key', element: suspended(W360Shelf) },
      { path: 'papers/:id', element: suspended(W360Reader) },
      { path: 'wallet', element: suspended(W360Wallet) },
      { path: 'account', element: suspended(AccountDataPage) },
      { path: 'admin/compliance', element: suspended(W360ComplianceAdmin) },
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
        path: 'records/:id',
        element: suspended(W360Record),
        children: [
          { index: true, element: suspended(W360Papers) },
          { path: 'features', element: suspended(W360Features) },
          { path: 'people', element: suspended(W360People) },
          { path: 'services', element: suspended(W360RecordServices) },
          { path: 'money', element: suspended(W360Money) },
          { path: 'notes', element: suspended(W360Notes) },
          { path: 'expenses', element: suspended(W360Expenses) },
          { path: 'history', element: suspended(W360RecordHistory) },
          { path: 'map', element: suspended(W360Boundary) },
          { path: 'photos', element: suspended(W360Photos) },
          { path: 'order', element: suspended(W360Order) },
          { path: 'request', element: suspended(W360Request) },
        ],
      },
      // Families & Groups: the real screen, in this app's own chrome. The
      // selected group rides in `?g=<id>` rather than a `:id` child route, so
      // there is one read behind the whole screen and a linkable group.
      { path: 'groups', element: suspended(W360Groups) },
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
      // The old vocabulary still resolves: a bookmarked parcel or document URL
      // lands on the same thing under its new name.
      { path: 'parcels', element: <Navigate to="/app/properties?kind=parcel" replace /> },
      { path: 'parcels/:id', element: <ToRecord /> },
      { path: 'properties/:id', element: <ToRecord /> },
      { path: 'documents', element: <Navigate to="/app/papers" replace /> },
      { path: 'tickets/:id', element: <ToService /> },
      { path: 'tickets/:id/pay', element: <ToService pay /> },
      // The header comment above has always promised this one; it was never routed.
      { path: 'deeds', element: <Navigate to="/app/papers" replace /> },
      { path: 'dashboard', element: <Navigate to="/app" replace /> },
      // /app/admin was the rail's Admin entry and is in six months of
      // bookmarks and screenshots. It keeps working and lands where Admin now
      // is. The reference data it used to introduce — districts, mandals, SRO
      // offices, the fee schedule — is untouched at /legacy/admin.
      { path: 'admin', element: <Navigate to="/app/desk" replace /> },
      { path: 'passbooks', element: <Navigate to="/app/properties?kind=parcel" replace /> },
      { path: 'passbooks/:id', element: <ToLegacyPassbook /> },
      // Keeps the shell and the rail around an unknown /app URL, rather than
      // dropping the user onto a bare error page with no way back.
      { path: '*', element: <NotFound /> },
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
      // Drawn at /app/invitations; the MUI screen is deleted.
      { path: 'invitations', element: <Navigate to="/app/invitations" replace /> },
      { path: 'notifications', element: suspended(NotificationsPage) },
      { path: 'wallet', element: suspended(WalletPage) },
      { path: 'tools', element: <ToTools /> },
      { path: 'audit', element: suspended(AuditLogPage) },
      { path: 'admin', element: suspended(AdminRefDataPage) },
      { path: 'profile', element: <Navigate to="/app/profile" replace /> },
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
  // Everything else — a typo, a stale bookmark, a link from an old email. Last,
  // so it shadows nothing above it. Home is the public root because whoever
  // followed this link may not be signed in.
  { path: '*', element: <NotFound home="/" label="the front page" /> },
]);
