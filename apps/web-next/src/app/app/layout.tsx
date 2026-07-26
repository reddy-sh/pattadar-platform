'use client';

// Guards everything under /app: unauthenticated visitors bounce to /login.
// The real dashboard shell (nav, header, settings drawer) lands in B5 — until
// then this is a plain passthrough <main>.
import type { ReactNode } from 'react';
import { RequireAuth } from 'src/auth/RequireAuth';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <main>{children}</main>
    </RequireAuth>
  );
}
