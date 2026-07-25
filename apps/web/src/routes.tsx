import { createBrowserRouter } from 'react-router';
import { AppShell } from './layout/AppShell';
import { AdminPage } from './pages/AdminPage';
import { AuditPage } from './pages/AuditPage';
import { CalculatorPage } from './pages/CalculatorPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeedsPage } from './pages/DeedsPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { InvitationsPage } from './pages/InvitationsPage';
import { MarketValuePage } from './pages/MarketValuePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ParcelsPage } from './pages/ParcelsPage';
import { PassbooksPage } from './pages/PassbooksPage';
import { ProfilePage } from './pages/ProfilePage';
import { PropertiesPage } from './pages/PropertiesPage';
import { SroPage } from './pages/SroPage';
import { StampDutyPage } from './pages/StampDutyPage';
import { VerifyPage } from './pages/VerifyPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: DashboardPage },
      { path: 'passbooks', Component: PassbooksPage },
      { path: 'parcels', Component: ParcelsPage },
      { path: 'properties', Component: PropertiesPage },
      { path: 'documents', Component: DocumentsPage },
      { path: 'deeds', Component: DeedsPage },
      { path: 'groups', Component: GroupsPage },
      { path: 'invitations', Component: InvitationsPage },
      { path: 'notifications', Component: NotificationsPage },
      { path: 'sro', Component: SroPage },
      { path: 'stamp-duty', Component: StampDutyPage },
      { path: 'market-value', Component: MarketValuePage },
      { path: 'calculator', Component: CalculatorPage },
      { path: 'audit', Component: AuditPage },
      { path: 'admin', Component: AdminPage },
      { path: 'profile', Component: ProfilePage },
    ],
  },
  // PUBLIC route, outside the shell: beneficiary verification landing must
  // work WITHOUT login (invitees follow this link before they have accounts).
  { path: '/verify/:token', Component: VerifyPage },
]);
