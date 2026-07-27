'use client';

// Route skeleton stub (task B5) — Phase C ports the real privacy policy.
// Linked from AuthLayout's footer on /login, /signup, /forgot-password.
import EmptyContent from 'src/components/empty-content';
import { PageHeader } from 'src/components/PageHeader';

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy" />
      <EmptyContent title="Coming soon" description="This page is coming soon." filled />
    </>
  );
}
