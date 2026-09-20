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
 *   wallet · tools · audit · profile
 * Legacy routes redirect INTO that structure — /app/properties into the
 * Properties tab of Land & Properties, /app/deeds into Documents, and the
 * four old tool routes into the matching Tools tab.
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
const VerifyPage = lazy(() => import('./pages/VerifyPage').then((m) => ({ default: m.VerifyPage })));
const ActivePage = lazy(() => import('./pages/ActivePage').then((m) => ({ default: m.ActivePage })));
const RecipientAccess = lazy(() => import('./w360/pages/RecipientAccess'));
const AccountDataPage = lazy(() => import('./pages/AccountDataPage').then(m=>({default:m.AccountDataPage})));
const PaymentsCheckout = lazy(() => import('./pages/PaymentsCheckout').then(m=>({default:m.PaymentsCheckout})));

// Record-360 app (screens W01–W15) — the current design, mounted at /app.
// Its data model and API contract are docs/specs/2026-08-15-web-360-design.md.
const W360Shell = lazy(() => import('./w360/Shell').then((m) => ({ default: m.Shell })));
const W360Dashboard = lazy(() => import('./w360/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const W360Properties = lazy(() => import('./w360/pages/Properties').then((m) => ({ default: m.Properties })));
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
const W360Section = lazy(() => import('./w360/pages/Section').then((m) => ({ default: m.Section })));
const W360Audit = lazy(() => import('./w360/pages/Audit').then((m) => ({ default: m.Audit })));
const W360Groups = lazy(() => import('./w360/pages/Groups').then((m) => ({ default: m.Groups })));
const W360Ticket = lazy(() => import('./w360/pages/Ticket').then((m) => ({ default: m.Ticket })));
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

// Previous app shell + pages. Still routed, under /legacy, for the sections the
// W01–W15 handover did not redraw (groups, invitations, tools, audit, admin,
// profile) — nothing that worked has been deleted, and /legacy/wallet stays
// reachable now that /app/wallet is its own screen.
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

/** Same as `suspended`, for a lazy component that takes props (the shared
 *  Section page, which is told which section it is rendering). */
function suspendedWith<P extends object>(Component: LazyExoticComponent<ComponentType<P>>, props: P) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Component {...props} />
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
function NotFound({ home = '/app', label = 'your dashboard' }: { home?: string; label?: string }) {
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
      <p className="lede" style={{ maxWidth: '40rem' }}>
        Nothing is wrong with your records — the link is wrong, or it points at a part of
        Pattadar that has moved.
      </p>
      <p className="note mono" style={{ margin: 'var(--space-md) 0', overflowWrap: 'anywhere' }}>
        {pathname}
      </p>
      <Link className="btn primary" to={home}>Go to {label}</Link>
    </main>
  );
}

/** The sections no design has arrived for yet. Each renders the shared Section
 *  page and links to its still-working /legacy screen. Wallet left this list
 *  in W16: money set aside on a job has a real screen now.
 *
 *  `admin` left it with the desk. Its stub said "not yet redrawn" and pointed
 *  at /legacy/admin — a real screen, still reachable at that address — but the
 *  word Admin in this app now means the desk, and two admin-shaped entries in
 *  one rail with one of them dead is worse than either alone.
 *
 *  `groups` left it next, and for the reason the stubs are a bad answer at
 *  all: its only control was a button reading "Open Families & Groups" that
 *  navigated out of this app into /legacy/groups — same tab, different chrome,
 *  different rail, and an address bar that suddenly said /legacy. It is drawn
 *  at /app/groups now (w360/pages/Groups.tsx). /legacy/groups still exists and
 *  still works; nothing in /app points at it any more. */
const UNDRAWN = ['invitations', 'notifications', 'tools', 'profile'] as const;

export const router = createBrowserRouter([
  { path: '/', element: suspended(LandingPage) },
  { path: '/pricing', element: suspended(PricingPage) },
  { path: '/login', element: suspended(LoginPage) },
  { path: '/signup', element: suspended(SignupPage) },
  { path: '/forgot-password', element: suspended(ForgotPasswordPage) },
  { path: '/privacy', element: suspended(PrivacyPage) },
  { path: '/terms', element: suspended(TermsPage) },
  { path: '/auth/callback', element: suspended(AuthCallbackPage) },
  { path: '/verify/:token', element: suspended(VerifyPage) },
  { path: '/active/:token', element: suspended(ActivePage) },
  { path: '/share/:token', element: suspended(RecipientAccess) },
  { path: '/work/:token', element: suspended(RecipientAccess) },
  {
    // The current design (W01–W15). Record-first: one faceted Properties list,
    // and every record opens a 360 with six hangers.
    path: '/app',
    element: <RequireAuth>{suspended(W360Shell)}</RequireAuth>,
    children: [
      { index: true, element: suspended(W360Dashboard) },
      { path: 'properties', element: suspended(W360Properties) },
      { path: 'map', element: suspended(W360MapFind) },
      { path: 'villages', element: suspended(W360VillageMaps) },
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
      ...UNDRAWN.map((id) => ({ path: id, element: suspendedWith(W360Section, { id }) })),
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
