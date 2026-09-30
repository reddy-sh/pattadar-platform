/**
 * Where an invitation link lands: /i/:token and the older /verify/:token.
 *
 * Public. It first asks `invitePreview`, which says only who invited you, for
 * what, and what is waiting — never the land, the share or the documents. Then:
 *  - signed in: one button claims the invitation for this account and takes
 *    you to what it left waiting (your heir profile, or Home);
 *  - signed out: create an account or sign in, with the link remembered so
 *    you come straight back here (Shell.tsx resumes it);
 *  - an heir can still confirm without an account, exactly as before.
 * If the preview cannot be read at all, the old verify-only form is offered,
 * so a link already in someone's inbox never dead-ends.
 */
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';

import { gql, GraphQLRequestError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { PENDING_INVITE, PENDING_REFERRAL, claimInvitation, fetchInvitePreview } from '../w360/growthData';
import type { InvitePreview } from '../w360/growthData';
import '../styles/site.css';

type Verify = 'ready' | 'saving' | 'done' | 'invalid' | 'failed';
const SPENT_LINK_CODES = new Set(['LINK_INVALID', 'LINK_EXPIRED', 'LINK_ALREADY_USED']);

const HEADLINE: Record<string, (who: string) => string> = {
  beneficiary: (who) => `${who} listed you as an heir`,
  family: (who) => `${who} added you to their family record`,
  co_manage: (who) => `${who} invited you to their land records`,
};

export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimed, setClaimed] = useState('');
  const [verify, setVerify] = useState<Verify>(token ? 'ready' : 'invalid');

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetchInvitePreview(token)
      .then((p) => { if (live) setPreview(p); })
      .catch(() => { if (live) setPreviewFailed(true); });
    return () => { live = false; };
  }, [token]);

  const remember = () => localStorage.setItem(PENDING_INVITE, token);
  const heir = preview?.purpose === 'beneficiary' || preview?.purpose === 'family';

  const claim = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      const r = await claimInvitation(token, consent);
      localStorage.removeItem(PENDING_INVITE);
      if (r.memberId) navigate(`/app/heir/${r.memberId}`, { replace: true });
      else setClaimed(r.message || 'Accepted.');
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : 'That invitation could not be accepted.');
    } finally {
      setClaiming(false);
    }
  };

  const verifyAnonymously = async () => {
    if (!token || verify === 'saving') return;
    setVerify('saving');
    try {
      const result = await gql<{ verifyBeneficiary: { id: string } | null }>(
        'mutation VerifyMember($token:String!,$consent:Boolean!){ verifyBeneficiary(token:$token,inactivityEmailConsent:$consent){ id } }',
        { token, consent },
      );
      setVerify(result.verifyBeneficiary ? 'done' : 'invalid');
    } catch (error) {
      const code = error instanceof GraphQLRequestError ? error.code : undefined;
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const spent = code ? SPENT_LINK_CODES.has(code) : /invalid|expired|already/.test(message);
      setVerify(spent ? 'invalid' : 'failed');
    }
  };

  const consentBox = (
    <FormControlLabel
      control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
      label="I agree to receive household inactivity safeguard emails at my verified address. I can withdraw from a safeguard email later."
    />
  );

  const dead = preview && preview.state !== 'live';

  return (
    <div className="dark site">
      <main className="legalMain">
        <Stack spacing={3} sx={{ maxWidth: '38rem' }}>
          {!preview && !previewFailed && token && <Typography role="status">Opening your invitation…</Typography>}

          {preview?.state === 'live' && (
            <>
              <Typography variant="overline">Invitation · expires {preview.expiresOn}</Typography>
              <Typography variant="h4">
                {(HEADLINE[preview.purpose] ?? HEADLINE.co_manage)(preview.inviter)}
              </Typography>
              {preview.forGuardian && (
                <Typography color="text.secondary">
                  You were named as the guardian who confirms on behalf of a minor.
                </Typography>
              )}
              <div>
                <Typography variant="subtitle1" component="h2">What is waiting on you</Typography>
                <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                  {preview.steps.map((s) => <li key={s}><Typography>{s}</Typography></li>)}
                </ol>
              </div>

              {claimed && <Alert severity="success">{claimed} <RouterLink to="/app">Go to Home</RouterLink></Alert>}
              {claimError && <Alert severity="error">{claimError}</Alert>}
              {verify === 'done' && <Alert severity="success">Your membership details are verified.</Alert>}

              {!claimed && verify !== 'done' && !isLoading && (
                <>
                  {heir && consentBox}
                  {isAuthenticated ? (
                    <Button variant="contained" disabled={claiming} onClick={() => void claim()}
                            sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
                      {claiming ? 'Accepting…' : 'Accept and continue'}
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      <Button variant="contained" component={RouterLink} to="/signup" onClick={remember}
                              sx={{ minHeight: 44 }}>
                        Create your account
                      </Button>
                      <Button variant="outlined" component={RouterLink} to="/login"
                              state={{ returnTo: `/i/${token}` }} onClick={remember} sx={{ minHeight: 44 }}>
                        I already have an account
                      </Button>
                    </Stack>
                  )}
                  {heir && !isAuthenticated && preview.canVerifyWithoutAccount && (
                    <Typography color="text.secondary">
                      Only want to confirm?{' '}
                      <Button variant="text" disabled={verify === 'saving'} onClick={() => void verifyAnonymously()}>
                        {verify === 'saving' ? 'Verifying…' : 'Verify membership without an account'}
                      </Button>
                      {verify === 'failed' && ' That did not work. Nothing changed. Try again.'}
                    </Typography>
                  )}
                </>
              )}
            </>
          )}

          {dead && (
            <>
              <Typography variant="h4">This invitation cannot be used</Typography>
              <Alert severity="warning">
                {preview.state === 'expired' ? 'It has expired.' : preview.state === 'used'
                  ? 'It has already been accepted.' : 'The link is invalid or has been withdrawn.'}{' '}
                Ask the person who invited you to send a new one.
              </Alert>
            </>
          )}

          {(previewFailed || !token) && (
            // The preview could not be read (an older server, or offline): the
            // original verify-only path still works for a heir's link.
            <>
              <Typography variant="h4">Verify membership</Typography>
              <Typography color="text.secondary">
                Confirm that this family or beneficiary record belongs to you. Verification does not
                grant access to the household's account, documents, or property.
              </Typography>
              {verify === 'done' && <Alert severity="success">Your membership details are verified.</Alert>}
              {verify === 'invalid' && (
                <Alert severity="warning">This verification link is invalid, expired, or has already been used.</Alert>
              )}
              {verify === 'failed' && (
                <Alert severity="error">Pattadar could not verify this membership. Nothing changed. Try again.</Alert>
              )}
              {verify !== 'done' && verify !== 'invalid' && (
                <>
                  {consentBox}
                  <Button variant="contained" disabled={verify === 'saving'} onClick={() => void verifyAnonymously()}
                          sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
                    {verify === 'saving' ? 'Verifying…' : 'Verify membership'}
                  </Button>
                </>
              )}
            </>
          )}
        </Stack>
      </main>
    </div>
  );
}

/** /r/:code — remember who referred this visitor, then send them to sign up. */
export function ReferralLanding() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    if (isLoading) return;
    const clean = code.trim().toUpperCase();
    if (/^[A-Z]{2,8}[0-9]{2,4}$/.test(clean)) localStorage.setItem(PENDING_REFERRAL, clean);
    navigate(isAuthenticated ? '/app' : '/signup', { replace: true });
  }, [code, isAuthenticated, isLoading, navigate]);
  return null;
}
