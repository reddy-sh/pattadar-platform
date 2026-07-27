'use client';

// Route skeleton stub (task B5) — Phase C ports the real profile page.
import EmptyContent from 'src/components/empty-content';
import { PageHeader } from 'src/components/PageHeader';

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" />
      <EmptyContent title="Coming soon" description="This page is coming soon." filled />
    </>
  );
}
