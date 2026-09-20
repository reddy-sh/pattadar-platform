/**
 * The third state the legacy screens were missing. A read that failed and an
 * account that really is empty are not the same thing: without this, an outage
 * or an ended session renders "No invitations yet" and the owner acts on it.
 */
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';

import { EmptyState } from './EmptyState';

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<CloudOffOutlinedIcon />}
        title={`${what} could not be loaded`}
        description="Nothing has been lost — the app could not reach the server. Your records are untouched."
        action={
          <Button variant="contained" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </Card>
  );
}
