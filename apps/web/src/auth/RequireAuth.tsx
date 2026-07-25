/**
 * Route guard for /app/*: unauthenticated visitors are sent to OUR /login
 * page (never an external URL) with the attempted path preserved, so they
 * land back where they aimed after signing in.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Checking sign-in" />
      </Box>
    );
  }
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}
