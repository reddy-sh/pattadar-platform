'use client';

// Guards everything under /app: unauthenticated visitors bounce to /login,
// then the Minimals-derived dashboard shell (nav, header, settings drawer,
// assistant) renders the routed page.
import type { ReactNode } from 'react';
import { RequireAuth } from 'src/auth/RequireAuth';
import { AppShell } from 'src/layout/AppShell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
