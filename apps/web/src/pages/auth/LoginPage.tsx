/**
 * /login — native email/password sign-in on OUR page (SRP, zero redirects).
 * Social buttons (shown only for providers listed in VITE_SOCIAL_PROVIDERS)
 * are the single exception: OAuth requires a redirect, which goes to the
 * custom domain (auth.pattadar.com) and returns to /auth/callback.
 */
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AppleIcon from '@mui/icons-material/Apple';
import FacebookIcon from '@mui/icons-material/Facebook';
import GoogleIcon from '@mui/icons-material/Google';
import { enabledSocialProviders, useAuth } from '../../auth/AuthProvider';
import type { SocialProvider } from '../../auth/AuthProvider';
import { AuthError } from '../../auth/cognitoNative';
import { AuthLayout } from './AuthLayout';

const SOCIAL_ICONS: Record<SocialProvider, ReactElement> = {
  Google: <GoogleIcon />,
  Facebook: <FacebookIcon />,
  SignInWithApple: <AppleIcon />,
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface LoginLocationState {
  returnTo?: string;
  /** One-off success notice, e.g. after a password reset. */
  notice?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, signInWithPassword, signInSocial } = useAuth();
  const state = (location.state as LoginLocationState | null) ?? {};
  const returnTo = state.returnTo ?? '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (includes mock mode) — continue to where they aimed.
  if (isAuthenticated) return <Navigate to={returnTo} replace />;

  const socials = enabledSocialProviders();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const emailErr = !trimmed
      ? 'Enter your email address.'
      : !EMAIL_RE.test(trimmed)
        ? 'Enter a valid email address.'
        : null;
    const passwordErr = password ? null : 'Enter your password.';
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await signInWithPassword(trimmed, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      if (err instanceof AuthError && err.code === 'USER_NOT_CONFIRMED') {
        // Account exists but the email was never confirmed — finish that step.
        navigate('/signup', { state: { email: trimmed, confirmPending: true } });
        return;
      }
      setFormError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in to see your land records.">
      {state.notice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {state.notice}
        </Alert>
      )}
      {formError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {formError}
        </Alert>
      )}
      <Box component="form" noValidate onSubmit={(e) => void onSubmit(e)}>
        <Stack spacing={2}>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            fullWidth
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError !== null}
            helperText={emailError}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError !== null}
            helperText={passwordError}
          />
          <Box sx={{ textAlign: 'right' }}>
            <Link component={RouterLink} to="/forgot-password" variant="body2">
              Forgot password?
            </Link>
          </Box>
          <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </Box>
      {socials.length > 0 && (
        <>
          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              or continue with
            </Typography>
          </Divider>
          <Stack spacing={1.5}>
            {socials.map((s) => (
              <Button
                key={s.provider}
                variant="outlined"
                fullWidth
                startIcon={SOCIAL_ICONS[s.provider]}
                onClick={() => void signInSocial(s.provider, returnTo)}
              >
                Continue with {s.label}
              </Button>
            ))}
          </Stack>
        </>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        New to Pattadar?{' '}
        <Link component={RouterLink} to="/signup">
          Create an account
        </Link>
      </Typography>
    </AuthLayout>
  );
}
