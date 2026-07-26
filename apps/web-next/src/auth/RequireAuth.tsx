'use client';

/**
 * Route guard for /app/*: unauthenticated visitors are sent to OUR /login
 * page (never an external URL) with the attempted path preserved, so they
 * land back where they aimed after signing in.
 *
 * Deviation from apps/web/src/auth/RequireAuth.tsx: react-router's
 * `<Navigate state={{ returnTo }}>` has no App Router equivalent, so the
 * return path travels as a `?returnTo=` query param instead, and the redirect
 * itself happens via `router.replace()` in an effect (Next has no
 * render-time redirect for client components without throwing).
 */
import { Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { usePathname, useRouter, useSearchParams } from 'src/routes/hooks';
import { useAuth } from './AuthProvider';

function LoadingSpinner() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="Checking sign-in" />
    </Box>
  );
}

// useSearchParams() opts a page into client-side rendering unless wrapped in
// Suspense (Next.js App Router requirement — no react-router equivalent).
export function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <RequireAuthInner>{children}</RequireAuthInner>
    </Suspense>
  );
}

function RequireAuthInner({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    const query = searchParams.toString();
    const returnTo = query ? `${pathname}?${query}` : pathname;
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [isLoading, isAuthenticated, pathname, searchParams, router]);

  if (isLoading) {
    return <LoadingSpinner />;
  }
  if (!isAuthenticated) {
    // Redirect is in flight (effect above) — render nothing in the meantime.
    return null;
  }
  return <>{children}</>;
}
