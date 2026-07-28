'use client';

/**
 * PUBLIC route — beneficiary verification landing (must work WITHOUT login).
 * Serves both /verify/[token] and /active/[token] (source apps/web/src/pages/
 * VerifyPage.tsx + routes.tsx route the SAME component to both paths, with no
 * distinguishing prop — the two are functionally identical invite-link
 * variants, confirmed by tests/e2e-ux/specs/auth-pages.spec.ts expecting the
 * same "Verify membership" probe text on both routes).
 *
 * Fires the verifyBeneficiary mutation — the gateway's ONLY unauthenticated
 * carve-out (body-substring match on "verifyBeneficiary"; the verifyMember
 * alias is NOT carved out and 401s). The mutation string is shared from
 * @pattadar/core so the exact wire text stays canonical.
 */
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { VERIFY_BENEFICIARY_MUTATION } from '@pattadar/core';
import { useParams } from 'src/routes/hooks';
import { gql } from '../api/client';

type VerifyState = 'loading' | 'ok' | 'err';

export function VerifyPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<VerifyState>('loading');

  useEffect(() => {
    if (!token) {
      setState('err');
      return;
    }
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const data = await gql<{ verifyBeneficiary: { id: string; status: string } | null }>(
          VERIFY_BENEFICIARY_MUTATION,
          { token },
        );
        if (cancelled) return;
        setState(data?.verifyBeneficiary ? 'ok' : 'err');
      } catch {
        if (!cancelled) setState('err');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Card sx={{ maxWidth: 480, width: 1, p: 4, textAlign: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Verify membership
        </Typography>
        {state === 'loading' && (
          <>
            <CircularProgress aria-label="Verifying" sx={{ my: 2 }} />
            <Typography color="text.secondary">Confirming your invitation…</Typography>
          </>
        )}
        {state === 'ok' && (
          <Typography color="text.secondary">
            Thank you — your co-ownership on Pattadar is now verified. You can close this page.
          </Typography>
        )}
        {state === 'err' && (
          <Typography color="text.secondary">
            This verification link isn&apos;t valid, has already been used, or has expired. Ask the
            family head to send a fresh invite.
          </Typography>
        )}
      </Card>
    </Box>
  );
}
