import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { completeSignIn } from '../auth/AuthProvider';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    completeSignIn()
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Sign-in could not be completed.'));
  }, [navigate]);
  return (
    <main className="auth-callback">
      {error ? <><h1>Sign-in could not be completed</h1><p>{error}</p><button className="button button--primary" type="button" onClick={() => navigate('/')}>Back to University</button></> : <><span className="loading-spinner" aria-hidden="true" /><p>Signing you in…</p></>}
    </main>
  );
}
