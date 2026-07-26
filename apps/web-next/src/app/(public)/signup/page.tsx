'use client';

/**
 * /signup — native account creation on OUR page (zero redirects), in two
 * steps: (1) email + password, (2) "check your email" confirmation code with
 * resend. /login also lands here (confirm step) when an unconfirmed account
 * tries to sign in. After confirmation the user is signed in automatically.
 *
 * Ported from apps/web/src/pages/auth/SignupPage.tsx. Deviation: react-router
 * passed `email`/`confirmPending` via router location state; the App Router
 * has no equivalent for client navigations, so they travel as
 * `?email=`/`?confirmPending=1` query params instead.
 */
import { Suspense, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { RouterLink } from 'src/routes/components';
import { useRouter, useSearchParams } from 'src/routes/hooks';
import { useAuth } from 'src/auth/AuthProvider';
import { AuthError, confirmSignUp, resendCode, signUp } from 'src/auth/cognitoNative';
import { AuthLayout } from '../_components/AuthLayout';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PASSWORD_HINT =
  'At least 8 characters, with upper and lower case letters, a number and a symbol.';

// useSearchParams() opts a page into client-side rendering unless wrapped in
// Suspense (Next.js App Router requirement — no react-router equivalent).
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading" />
        </Box>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, signInWithPassword } = useAuth();
  const initialEmail = searchParams.get('email') ?? '';
  const confirmPending = searchParams.get('confirmPending') === '1';

  const [step, setStep] = useState<'form' | 'confirm'>(confirmPending ? 'confirm' : 'form');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    confirmPending
      ? 'This account has not been confirmed yet. Enter the code from your email, or resend it.'
      : null,
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/app');
  }, [isAuthenticated, router]);
  if (isAuthenticated) return null;

  const onSignUp = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const emailErr = !trimmed
      ? 'Enter your email address.'
      : !EMAIL_RE.test(trimmed)
        ? 'Enter a valid email address.'
        : null;
    const passwordErr = !password
      ? 'Choose a password.'
      : password.length < 8
        ? 'Password must be at least 8 characters.'
        : null;
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await signUp(trimmed, password);
      setNotice(`We have emailed a confirmation code to ${trimmed}. Enter it below.`);
      setStep('confirm');
    } catch (err) {
      if (err instanceof AuthError && err.code === 'USER_EXISTS') {
        setEmailError(err.message);
      } else if (err instanceof AuthError && err.code === 'WEAK_PASSWORD') {
        setPasswordError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirm = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setCodeError('Enter the code from your email.');
      return;
    }
    setCodeError(null);
    setSubmitting(true);
    setFormError(null);
    try {
      await confirmSignUp(email.trim(), trimmedCode);
      if (password) {
        // Fresh sign-up: we still have the password — sign in right away.
        try {
          await signInWithPassword(email.trim(), password);
          router.replace('/app');
          return;
        } catch {
          // Fall through to the sign-in page.
        }
      }
      router.replace(
        `/login?notice=${encodeURIComponent('Your email is confirmed. Please sign in.')}`,
      );
    } catch (err) {
      if (err instanceof AuthError && (err.code === 'CODE_MISMATCH' || err.code === 'CODE_EXPIRED')) {
        setCodeError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Confirmation failed. Please try again.');
      }
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      await resendCode(email.trim());
      setNotice(`We have sent a new code to ${email.trim()}.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'confirm') {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="Enter the confirmation code we sent you to finish creating your account."
      >
        {notice && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}
        <Box component="form" noValidate onSubmit={(e) => void onConfirm(e)}>
          <Stack spacing={2}>
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!confirmPending && email !== ''}
            />
            <TextField
              label="Confirmation code"
              autoComplete="one-time-code"
              fullWidth
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={codeError !== null}
              helperText={codeError}
            />
            <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
              {submitting ? 'Confirming…' : 'Confirm'}
            </Button>
            <Button variant="text" fullWidth disabled={submitting} onClick={() => void onResend()}>
              Resend code
            </Button>
          </Stack>
        </Box>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Keep your family's land records safe, in one place.">
      {formError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {formError}
        </Alert>
      )}
      <Box component="form" noValidate onSubmit={(e) => void onSignUp(e)}>
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
            autoComplete="new-password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError !== null}
            helperText={passwordError ?? PASSWORD_HINT}
          />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </Stack>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        Already have an account?{' '}
        <Link component={RouterLink} href="/login">
          Sign in
        </Link>
      </Typography>
    </AuthLayout>
  );
}
