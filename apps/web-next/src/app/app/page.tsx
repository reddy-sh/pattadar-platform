// Minimal boot-only page for B3 — proves RequireAuth/mock-mode wiring works.
// The real dashboard (nav, header, widgets) lands in B5.
'use client';

import { useAuth } from 'src/auth/AuthProvider';

export default function AppHomePage() {
  const { user } = useAuth();
  return <p>Signed in as {user?.email} — dashboard shell lands in B5.</p>;
}
