'use client';

// Route skeleton stub (task B5) — Phase C ports the real invitations list.
import EmptyContent from 'src/components/empty-content';
import { PageHeader } from 'src/components/PageHeader';

export default function InvitationsPage() {
  return (
    <>
      <PageHeader title="Invitations" />
      <EmptyContent title="Coming soon" description="This page is coming soon." filled />
    </>
  );
}
