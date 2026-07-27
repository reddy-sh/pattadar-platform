'use client';

// Route skeleton stub (task B5) — Phase C ports the real property (non-ag
// holding) detail view. No nav entry — reached from Land & Properties.
import EmptyContent from 'src/components/empty-content';
import { PageHeader } from 'src/components/PageHeader';

export default function PropertyDetailPage() {
  return (
    <>
      <PageHeader title="Property" />
      <EmptyContent title="Coming soon" description="This page is coming soon." filled />
    </>
  );
}
