'use client';

// Route skeleton stub (task B5) — Phase C ports the real dashboard (hero,
// health rings, category holdings) from apps/web/src/pages/DashboardPage.tsx.
import EmptyContent from 'src/components/empty-content';
import { PageHeader } from 'src/components/PageHeader';

export default function AppHomePage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <EmptyContent title="Your dashboard is on its way" description="This page is coming soon." filled />
    </>
  );
}
