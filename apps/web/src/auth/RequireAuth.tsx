/**
 * Route guard for /app/*: unauthenticated visitors are redirected to sign-in
 * with the attempted path preserved, so they land back where they aimed.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void signIn(location.pathname + location.search);
    }
  }, [isAuthenticated, isLoading, location.pathname, location.search, signIn]);

  if (!isAuthenticated) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Checking sign-in" />
      </Box>
    );
  }
  return <>{children}</>;
}
