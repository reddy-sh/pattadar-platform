import { useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { usd } from '../format';
import type { UsageSummary } from '../types';

/** Spend and credit state, always visible so a failure is never a mystery. */
export function UsageFooter({ usage, incognitoSpend, chatSpend = null, refreshing, checkedAt, onRefresh, onSetBalance }: {
  usage: UsageSummary | null;
  incognitoSpend: number;
  /** What the open chat has cost so far; null when no chat is open. */
  chatSpend?: number | null;
  refreshing: boolean;
  checkedAt: Date | null;
  onRefresh: () => void;
  onSetBalance: (balance: number) => Promise<void>;
}) {
  const [editor, setEditor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState('');
  const [saveError, setSaveError] = useState('');
  if (!usage) return null;
  const hasBalance = typeof usage.balance_usd === 'number';
  const balanceSetAt = usage.balance_set_at ? new Date(usage.balance_set_at).toLocaleString() : '';
  const openEditor = (target: HTMLElement) => {
    setDraft(hasBalance ? String(Math.max(0, usage.balance_usd ?? 0).toFixed(2)) : '');
    setSaveError('');
    setEditor(target);
  };
  const save = async () => {
    const value = Number(draft.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(value) || value < 0) {
      setSaveError('Enter the balance in US dollars, e.g. 18.40');
      return;
    }
    try {
      await onSetBalance(value);
      setEditor(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The balance could not be saved.');
    }
  };
  const exhausted = usage.credit_status === 'exhausted';
  const checked = checkedAt ? checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  return (
    <Box
      aria-label="Assistant spend"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.72rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
    >
      {/* A local database sum — refreshing it never calls Anthropic or costs anything. */}
      <Box
        component="button"
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh assistant spend"
        title={`${usage.requests_today} ${usage.requests_today === 1 ? 'request' : 'requests'} today${checked ? ` · updated ${checked}` : ''} · click to refresh`}
        sx={{
          all: 'unset', cursor: refreshing ? 'progress' : 'pointer', display: 'inline-flex', gap: 1,
          opacity: refreshing ? 0.55 : 1, borderRadius: 1, '&:hover': { color: 'text.primary' },
          '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineStyle: 'solid' },
        }}
      >
        {chatSpend !== null && (
          <>
            <span title="Every reply in this chat, including earlier visits">This chat {chatSpend === 0 ? '$0.00' : usd(chatSpend)}</span>
            <span>·</span>
          </>
        )}
        <span>Today {usd(usage.today_usd)}</span>
        <span>·</span>
        <span>This month {usd(usage.month_usd)}</span>
      </Box>
      {incognitoSpend > 0 && (
        <>
          <span>·</span>
          <span title="Incognito replies are not stored, so they are counted only in this window">+{usd(incognitoSpend)} incognito</span>
        </>
      )}
      <span>·</span>
      <Box
        component="button"
        type="button"
        onClick={(event: ReactMouseEvent<HTMLElement>) => openEditor(event.currentTarget)}
        aria-label={hasBalance ? 'Estimated credit balance — update' : 'Set the credit balance'}
        title={exhausted
          ? 'The last request was refused because the Anthropic credit balance is empty.'
          : hasBalance
            ? `Estimate: the balance entered ${balanceSetAt} minus every reply's cost since. Click to update it from the billing page.`
            : 'Anthropic does not report the balance to an API key. Enter it once from the billing page and it is counted down from there.'}
        sx={{
          all: 'unset', cursor: 'pointer', borderRadius: 1, textDecoration: 'underline', textUnderlineOffset: 2,
          color: exhausted || (hasBalance && (usage.balance_usd ?? 0) < 1) ? 'error.main' : 'inherit',
          fontWeight: exhausted ? 700 : 400,
          '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineStyle: 'solid' },
        }}
      >
        {exhausted ? 'Credits ran out — top up' : hasBalance ? `≈ ${usd(usage.balance_usd)} credit left` : 'Set credit balance'}
      </Box>
      <Popover
        open={Boolean(editor)}
        anchorEl={editor}
        onClose={() => setEditor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Box
          component="form"
          onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }}
          sx={{ p: 1.5, width: 280, display: 'grid', gap: 1 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>Anthropic credit balance</Typography>
          <Typography variant="caption" color="text.secondary">
            Copy the balance from{' '}
            <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer">the billing page</a>.
            Each reply's cost is then subtracted here, so the figure is an estimate between visits.
          </Typography>
          <InputBase
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. 18.40"
            inputProps={{ 'aria-label': 'Credit balance in US dollars', inputMode: 'decimal' }}
            startAdornment={<Box component="span" sx={{ mr: 0.5, color: 'text.secondary' }}>$</Box>}
            sx={{ px: 1, py: 0.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}
          />
          {saveError && <Typography variant="caption" color="error.main">{saveError}</Typography>}
          <Button type="submit" size="small" variant="contained">Save balance</Button>
        </Box>
      </Popover>
    </Box>
  );
}
