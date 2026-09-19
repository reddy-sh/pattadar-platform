import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useParams } from 'react-router';

import { gql } from '../api/client';
import '../styles/site.css';

type State = 'ready' | 'saving' | 'done' | 'invalid' | 'failed';

/** Public, capability-scoped inactivity acknowledgement.
 *
 * It never submits on mount: email security scanners follow links, and a GET
 * must not confirm activity or close a family escalation on somebody's behalf.
 */
export function ActivePage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<State>(token ? 'ready' : 'invalid');
  const [withdrew, setWithdrew] = useState(false);

  const acknowledge = async (withdraw: boolean) => {
    if (!token || state === 'saving') return;
    setState('saving');
    try {
      const result = await gql<{ acknowledgeInactivity: boolean }>(
        'mutation AcknowledgeActivity($token:String!,$withdraw:Boolean!){ acknowledgeInactivity(token:$token,withdraw:$withdraw) }',
        { token, withdraw },
      );
      setWithdrew(withdraw && result.acknowledgeInactivity);
      setState(result.acknowledgeInactivity ? 'done' : 'invalid');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="dark site">
      <main className="legalMain">
        <Stack spacing={3} sx={{ maxWidth: '36rem' }}>
          <Typography variant="h4">Confirm this safeguard message</Typography>
          <Typography color="text.secondary">
            Confirming stops the current reminder sequence. It does not transfer account access,
            property control, ownership, or inheritance rights.
          </Typography>

          {state === 'done' && (
            <Alert severity="success">
              {withdrew
                ? 'This reminder is closed and future safeguard email to you is turned off.'
                : 'Thank you. This reminder sequence is now closed.'}
            </Alert>
          )}
          {state === 'invalid' && (
            <Alert severity="warning">This confirmation link is invalid, expired, or has already been used.</Alert>
          )}
          {state === 'failed' && (
            <Alert severity="error">Pattadar could not record this confirmation. Nothing changed. Try again.</Alert>
          )}

          {state !== 'done' && state !== 'invalid' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Button
                variant="contained"
                disabled={state === 'saving'}
                onClick={() => void acknowledge(false)}
                sx={{ minHeight: 44 }}
              >
                {state === 'saving' ? 'Confirming…' : 'Confirm this message'}
              </Button>
              <Button
                variant="outlined"
                disabled={state === 'saving'}
                onClick={() => void acknowledge(true)}
                sx={{ minHeight: 44 }}
              >
                Stop future safeguard email
              </Button>
            </Stack>
          )}
        </Stack>
      </main>
    </div>
  );
}
