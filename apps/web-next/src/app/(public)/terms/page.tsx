'use client';

// Route skeleton stub (task B5) — Phase C ports the real terms of service.
// Linked from AuthLayout's footer on /login, /signup, /forgot-password.
import EmptyContent from 'src/components/empty-content';
import { PageHeader } from 'src/components/PageHeader';

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Terms" />
      <EmptyContent title="Coming soon" description="This page is coming soon." filled />
    </>
  );
}
