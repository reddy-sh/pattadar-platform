/**
 * /forgot-password — native password reset on OUR page (zero redirects), in
 * two steps: (1) email — Cognito sends a code, (2) code + new password.
 * Ends back at /login with a success notice.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../auth/AuthProvider';
import { AuthError, confirmForgotPassword, forgotPassword } from '../../auth/cognitoNative';
import { AuthLayout } from './AuthLayout';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PASSWORD_HINT =
  'At least 8 characters, with upper and lower case letters, a number and a symbol.';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (includes mock mode) — same behaviour as /login.
  if (isAuthenticated) return <Navigate to="/app" replace />;

  const onRequest = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const emailErr = !trimmed
      ? 'Enter your email address.'
      : !EMAIL_RE.test(trimmed)
        ? 'Enter a valid email address.'
        : null;
    setEmailError(emailErr);
    if (emailErr) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await forgotPassword(trimmed);
      setNotice(`We have emailed a code to ${trimmed}. Enter it below with your new password.`);
      setStep('reset');
    } catch (err) {
      if (err instanceof AuthError && err.code === 'USER_NOT_FOUND') {
        setEmailError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    const codeErr = trimmedCode ? null : 'Enter the code from your email.';
    const passwordErr = !newPassword
      ? 'Choose a new password.'
      : newPassword.length < 8
        ? 'Password must be at least 8 characters.'
        : null;
    setCodeError(codeErr);
    setPasswordError(passwordErr);
    if (codeErr || passwordErr) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await confirmForgotPassword(email.trim(), trimmedCode, newPassword);
      navigate('/login', {
        state: { notice: 'Your password has been changed. Sign in with the new password.' },
        replace: true,
      });
    } catch (err) {
      if (err instanceof AuthError && (err.code === 'CODE_MISMATCH' || err.code === 'CODE_EXPIRED')) {
        setCodeError(err.message);
      } else if (err instanceof AuthError && err.code === 'WEAK_PASSWORD') {
        setPasswordError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        step === 'request'
          ? 'Enter the email you signed up with and we will send you a code.'
          : 'Enter the code from your email and choose a new password.'
      }
    >
      {notice && step === 'reset' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {formError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {formError}
        </Alert>
      )}
      {step === 'request' ? (
        <Box component="form" noValidate onSubmit={(e) => void onRequest(e)}>
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
            <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
              {submitting ? 'Sending code…' : 'Send code'}
            </Button>
          </Stack>
        </Box>
      ) : (
        <Box component="form" noValidate onSubmit={(e) => void onReset(e)}>
          <Stack spacing={2}>
            <TextField label="Email" type="email" fullWidth value={email} disabled />
            <TextField
              label="Code"
              autoComplete="one-time-code"
              fullWidth
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={codeError !== null}
              helperText={codeError}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={passwordError !== null}
              helperText={passwordError ?? PASSWORD_HINT}
            />
            <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
              {submitting ? 'Changing password…' : 'Change password'}
            </Button>
          </Stack>
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        Remembered it?{' '}
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      </Typography>
    </AuthLayout>
  );
}
