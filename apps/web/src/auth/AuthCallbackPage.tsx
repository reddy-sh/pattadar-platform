/**
 * /auth/callback — completes the Cognito hosted-UI redirect (exchanges the
 * authorization code via PKCE), then continues to the path the user aimed at.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { completeSignIn, isAuthMocked } from './AuthProvider';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // StrictMode mounts effects twice in dev; the authorization code can only
  // be redeemed once, so guard the exchange.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (isAuthMocked) {
      navigate('/app', { replace: true });
      return;
    }
    completeSignIn()
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Sign-in could not be completed.');
      });
  }, [navigate]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        p: 3,
      }}
    >
      {error ? (
        <Box>
          <Typography variant="h6" gutterBottom>
            Sign-in could not be completed
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button variant="contained" onClick={() => navigate('/', { replace: true })}>
            Back to home
          </Button>
        </Box>
      ) : (
        <Box>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography color="text.secondary">Signing you in…</Typography>
        </Box>
      )}
    </Box>
  );
}
