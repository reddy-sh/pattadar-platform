/**
 * "My stake in this holding" — port of the rhub pattadar app's StakeModal:
 * record your relationship to a parcel/property (owned / managed / watch).
 */
import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { setStake } from '../../data/pattadarActions';

export type StakeTarget = { kind: 'parcel' | 'property'; id: string; title: string; stake?: string } | null;

const OPTIONS = [
  { value: 'owned', label: 'Owned', hint: 'The title is in your name — full management.' },
  {
    value: 'managed',
    label: 'Managed',
    hint: 'You operate it (taxes, records, leasing) but the title belongs to someone else.',
  },
  {
    value: 'watch',
    label: 'Watch',
    hint: "Visibility only — e.g. tracking a child's future inheritance or land pending partition.",
  },
];

export function StakeDialog({
  target,
  onClose,
  onDone,
  notify,
}: {
  target: StakeTarget;
  onClose: () => void;
  onDone: () => void;
  notify: (msg: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const [stake, setStakeValue] = useState('owned');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (target) setStakeValue(target.stake || 'owned');
  }, [target]);

  const save = async () => {
    if (!target) return;
    setSaving(true);
    const ok = await setStake(target.kind, target.id, stake);
    setSaving(false);
    if (ok) {
      notify('Stake updated', 'success');
      onDone();
      onClose();
    } else {
      notify("Couldn't update — try again", 'error');
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>My stake in this holding</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {target?.title}
        </Typography>
        <RadioGroup value={stake} onChange={(e) => setStakeValue(e.target.value)} sx={{ mt: 1.5, gap: 1 }}>
          {OPTIONS.map((o) => (
            <FormControlLabel
              key={o.value}
              value={o.value}
              control={<Radio />}
              label={
                <span>
                  <b>{o.label}</b>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {o.hint}
                  </Typography>
                </span>
              }
            />
          ))}
        </RadioGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
