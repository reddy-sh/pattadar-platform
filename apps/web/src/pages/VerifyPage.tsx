import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useParams } from 'react-router';

import { gql } from '../api/client';
import '../styles/site.css';

type State = 'ready' | 'saving' | 'done' | 'invalid' | 'failed';

/** Public membership verification with explicit, optional safeguard-email consent. */
export function VerifyPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<State>(token ? 'ready' : 'invalid');
  const [safeguardEmail, setSafeguardEmail] = useState(false);

  const verify = async () => {
    if (!token || state === 'saving') return;
    setState('saving');
    try {
      const result = await gql<{ verifyBeneficiary: { id: string } | null }>(
        'mutation VerifyMember($token:String!,$consent:Boolean!){ verifyBeneficiary(token:$token,inactivityEmailConsent:$consent){ id } }',
        { token, consent: safeguardEmail },
      );
      setState(result.verifyBeneficiary ? 'done' : 'invalid');
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      setState(/invalid|expired|already/.test(message) ? 'invalid' : 'failed');
    }
  };

  return (
    <div className="dark site">
      <main className="legalMain">
        <Stack spacing={3} sx={{ maxWidth: '38rem' }}>
          <Typography variant="h4">Verify membership</Typography>
          <Typography color="text.secondary">
            Confirm that this family or beneficiary record belongs to you. Verification does not
            grant access to the household's account, documents, or property.
          </Typography>

          {state === 'done' && <Alert severity="success">Your membership details are verified.</Alert>}
          {state === 'invalid' && (
            <Alert severity="warning">This verification link is invalid, expired, or has already been used.</Alert>
          )}
          {state === 'failed' && (
            <Alert severity="error">Pattadar could not verify this membership. Nothing changed. Try again.</Alert>
          )}

          {state !== 'done' && state !== 'invalid' && (
            <>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={safeguardEmail}
                    onChange={(event) => setSafeguardEmail(event.target.checked)}
                  />
                )}
                label="I agree to receive household inactivity safeguard emails at my verified address. I can withdraw from a safeguard email later."
              />
              <Button
                variant="contained"
                disabled={state === 'saving'}
                onClick={() => void verify()}
                sx={{ alignSelf: 'flex-start', minHeight: 44 }}
              >
                {state === 'saving' ? 'Verifying…' : 'Verify membership'}
              </Button>
            </>
          )}
        </Stack>
      </main>
    </div>
  );
}
