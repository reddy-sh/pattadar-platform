/**
 * "Add to your properties" — the confirmation card for a `proposal` event
 * (docs/specs/2026-10-04-assistant-write-actions.md §3).
 *
 * The ONLY code that writes is Save's click handler. Every item is sent
 * through the reader's own session with `x-idempotency-key:
 * asst:<proposalId>:<index>`, in sequence, behind a ref lock, so a double
 * click, a retry or a reload replays the first answer instead of adding the
 * deed twice. Deed and model text is rendered as text, never HTML.
 */
import { useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AssistantLeaveContext, CardLink } from './CardLink';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { GraphQLHttpError, GraphQLRequestError, SESSION_ENDED_MESSAGE } from '../../api/client';
import { useMe, useRefreshW360 } from '../../w360/api';
import { useToast } from '../../w360/Toast';
import {
  HOLDING_NAME_MAX, STAKES, STAKE_WORD, buyerMatchesUser, defaultHoldingName, groupAsHolding, lookAlikes,
  reportProposal, saveProposalItem,
} from '../proposals';
import type { Proposal, ProposalItem, ProposalStatus, Stake } from '../types';
import { inrCompact, shortDate } from './SummaryCards';

export interface ProposalCardProps {
  proposal: Proposal;
  /** The card never renders in incognito: nothing may be written from there. */
  incognito: boolean;
  /** Told whenever the proposal's items or status change, so the message keeps them. */
  onChange?: (proposal: Proposal) => void;
}

type Phase = 'draft' | 'saving' | 'done' | 'dismissed' | 'form';
type GroupState = 'idle' | 'naming' | 'busy' | 'done' | 'failed';

const IN_FLIGHT_WAIT_MS = 2_000;
const NETWORK_TEXT = 'Could not reach the server. Retry sends the same request, so nothing is added twice.';
const REFUSED_TEXT = 'Could not save. Nothing was changed.';

const pause = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

function phaseFor(status: ProposalStatus): Phase {
  if (status === 'saved' || status === 'partial') return 'done';
  if (status === 'dismissed') return 'dismissed';
  return 'draft';
}

function deedLine(item: ProposalItem): string {
  const parts: string[] = [];
  if (item.doc_no) parts.push(`Deed ${item.doc_no}`);
  if (item.sro) parts.push(`SRO ${item.sro}`);
  if (item.reg_date) parts.push(`Registered ${shortDate(item.reg_date)}`);
  return parts.join(' · ');
}

function boundaryLine(item: ProposalItem): string {
  return [
    ['N', item.boundary_north], ['S', item.boundary_south], ['E', item.boundary_east], ['W', item.boundary_west],
  ].filter(([, value]) => value).map(([side, value]) => `${side}: ${value}`).join(' · ');
}

function itemLabel(item: ProposalItem): string {
  return item.title || (item.survey_no ? `Sy ${item.survey_no}` : item.doc_no ? `Deed ${item.doc_no}` : 'This property');
}

/** One request, with the single 409 retry the design asks for. */
async function saveOne(proposalId: string, item: ProposalItem, stake: Stake): Promise<{ id: string } | { error: string; session?: boolean }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const id = await saveProposalItem(proposalId, item, stake);
      return id ? { id } : { error: REFUSED_TEXT };
    } catch (error) {
      if (error instanceof GraphQLHttpError && error.status === 409) {
        if (attempt === 0) { await pause(IN_FLIGHT_WAIT_MS); continue; }
        return { error: 'Still saving in another tab — try again in a moment.' };
      }
      if (error instanceof Error && error.message === SESSION_ENDED_MESSAGE) {
        return { error: 'Sign in again — your draft is kept.', session: true };
      }
      if (error instanceof GraphQLRequestError) return { error: error.message || REFUSED_TEXT };
      if (error instanceof GraphQLHttpError) return { error: `${REFUSED_TEXT} (server ${error.status})` };
      return { error: NETWORK_TEXT };
    }
  }
}

const fieldSx = { '& .MuiInputBase-input': { fontSize: '0.8125rem' } } as const;

/** Visually hidden, still read by screen readers. */
const srOnly = {
  position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;

type FieldKey = 'reg_date' | 'deed' | 'party';

/** Which field a W360 refusal is about (web360._check_record_input's sentences),
 *  so it is shown next to that field instead of only under the card. */
export function fieldOfError(error: string | null): FieldKey | null {
  if (!error) return null;
  if (/registration date/i.test(error)) return 'reg_date';
  if (/party name/i.test(error)) return 'party';
  if (/deed field/i.test(error)) return 'deed';
  return null;
}

function Field({ label, value, onChange, disabled, type, grow, error }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean; type?: string; grow?: boolean; error?: string | null;
}) {
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      type={type}
      disabled={disabled}
      error={Boolean(error)}
      helperText={error || undefined}
      onChange={(event) => onChange(event.target.value)}
      slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined}
      sx={{ ...fieldSx, gridColumn: grow ? '1 / -1' : undefined }}
    />
  );
}

/** The editable facts of one deed. */
function ItemEditor({ item, stake, locked, onEdit }: {
  item: ProposalItem; stake: Stake | null; locked: boolean; onEdit: (patch: Partial<ProposalItem>) => void;
}) {
  const [deedOpen, setDeedOpen] = useState(false);
  const errorField = item.record_id ? null : fieldOfError(item.error);
  // A refusal about a deed field opens the deed details, where it is shown.
  useEffect(() => { if (errorField) setDeedOpen(true); }, [errorField]);
  const deed = deedLine(item);
  const bounds = boundaryLine(item);
  const watching = stake === 'watch';
  const numberOrNull = (value: string): number | null => {
    if (!value.trim()) return null;
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Field label="Name" value={item.title} onChange={(title) => onEdit({ title })} disabled={locked} grow />
        <TextField
          select size="small" label="Kind" value={item.kind} disabled={locked} sx={fieldSx}
          onChange={(event) => onEdit({ kind: event.target.value === 'parcel' ? 'parcel' : 'property' })}
        >
          <MenuItem value="parcel">Farm land (parcel)</MenuItem>
          <MenuItem value="property">Plot, house or flat</MenuItem>
        </TextField>
        <Field label="Survey number" value={item.survey_no} onChange={(survey_no) => onEdit({ survey_no })} disabled={locked} />
        <Field label="Village" value={item.village} onChange={(village) => onEdit({ village })} disabled={locked} />
        <Field label="Mandal" value={item.mandal} onChange={(mandal) => onEdit({ mandal })} disabled={locked} />
        <Field label="District" value={item.district} onChange={(district) => onEdit({ district })} disabled={locked} />
        <Box sx={{ display: 'flex', gap: 0.5, gridColumn: '1 / -1' }}>
          <TextField
            size="small" label="Extent" value={item.extent ?? ''} disabled={locked} sx={{ ...fieldSx, flex: 1, minWidth: 0 }}
            inputMode="decimal"
            onChange={(event) => onEdit({ extent: numberOrNull(event.target.value) })}
          />
          <TextField
            select size="small" label="Unit" value={item.extent_unit ?? (item.kind === 'parcel' ? 'ac' : 'sq.yd')}
            disabled={locked} sx={{ ...fieldSx, width: 92, flex: 'none' }}
            onChange={(event) => onEdit({ extent_unit: event.target.value as ProposalItem['extent_unit'] })}
          >
            <MenuItem value="ac">acres</MenuItem>
            <MenuItem value="sq.yd">sq.yd</MenuItem>
            <MenuItem value="sq.ft">sq.ft</MenuItem>
          </TextField>
        </Box>
      </Box>
      {!deedOpen ? (
        <Box sx={{ display: 'grid', gap: 0.25 }}>
          {deed && <Typography variant="caption">{deed}</Typography>}
          {(item.consideration !== null || item.market_value !== null) && (
            <Typography variant="caption">
              {item.consideration !== null && !watching ? `Amount in the deed ${inrCompact(item.consideration)}` : ''}
              {item.consideration !== null && !watching && item.market_value !== null ? ' · ' : ''}
              {item.market_value !== null ? `Government value ${inrCompact(item.market_value)}` : ''}
            </Typography>
          )}
          {bounds && <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>Boundaries {bounds}</Typography>}
          {!watching && (item.seller_name || item.buyer_name) && (
            <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
              Seller → Buyer · {item.seller_name || '—'} → {item.buyer_name || '—'}
            </Typography>
          )}
          {watching && (item.seller_name || item.buyer_name) && (
            <Typography variant="caption" color="text.secondary">
              Watching keeps the property facts only; the parties’ names are not copied.
            </Typography>
          )}
          {!locked && (
            <Button size="small" onClick={() => setDeedOpen(true)} sx={{ justifySelf: 'start', px: 0.5, minWidth: 0 }}>
              Edit deed details
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {errorField === 'deed' && (
            <Typography variant="caption" color="error.main" sx={{ gridColumn: '1 / -1' }}>{item.error}</Typography>
          )}
          <Field label="Deed number" value={item.doc_no} onChange={(doc_no) => onEdit({ doc_no })} disabled={locked} />
          <Field label="SRO" value={item.sro} onChange={(sro) => onEdit({ sro })} disabled={locked} />
          <Field label="Registered" type="date" value={item.reg_date.slice(0, 10)} onChange={(reg_date) => onEdit({ reg_date })} disabled={locked} error={errorField === 'reg_date' ? item.error : null} />
          {!watching && (
            <TextField
              size="small" label="Amount in the deed ₹" value={item.consideration ?? ''} disabled={locked} sx={fieldSx} inputMode="decimal"
              onChange={(event) => onEdit({ consideration: numberOrNull(event.target.value) })}
            />
          )}
          <TextField
            size="small" label="Government value ₹" value={item.market_value ?? ''} disabled={locked} sx={fieldSx} inputMode="decimal"
            onChange={(event) => onEdit({ market_value: numberOrNull(event.target.value) })}
          />
          <Field label="North" value={item.boundary_north} onChange={(boundary_north) => onEdit({ boundary_north })} disabled={locked} />
          <Field label="South" value={item.boundary_south} onChange={(boundary_south) => onEdit({ boundary_south })} disabled={locked} />
          <Field label="East" value={item.boundary_east} onChange={(boundary_east) => onEdit({ boundary_east })} disabled={locked} />
          <Field label="West" value={item.boundary_west} onChange={(boundary_west) => onEdit({ boundary_west })} disabled={locked} />
          {!watching && (
            <>
              <Field label="Seller" value={item.seller_name} onChange={(seller_name) => onEdit({ seller_name })} disabled={locked} grow error={errorField === 'party' ? item.error : null} />
              <Field label="Buyer" value={item.buyer_name} onChange={(buyer_name) => onEdit({ buyer_name })} disabled={locked} grow />
            </>
          )}
          <Button size="small" onClick={() => setDeedOpen(false)} sx={{ justifySelf: 'start', px: 0.5, minWidth: 0 }}>
            Done
          </Button>
        </Box>
      )}
    </Box>
  );
}

function StakeChoice({ value, onChange, disabled, label }: {
  value: Stake | null; onChange: (stake: Stake) => void; disabled: boolean; label: string;
}) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(_, next: Stake | null) => { if (next) onChange(next); }}
      sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', py: 0.25, px: 1.25, fontSize: '0.8125rem' } }}
    >
      {STAKES.map((stake) => <ToggleButton key={stake.key} value={stake.key}>{stake.label}</ToggleButton>)}
    </ToggleButtonGroup>
  );
}

export function ProposalCard({ proposal, incognito, onChange }: ProposalCardProps) {
  const navigate = useNavigate();
  const leave = useContext(AssistantLeaveContext);
  const toast = useToast();
  const refresh = useRefreshW360();
  const me = useMe();
  const [items, setItems] = useState<ProposalItem[]>(() => proposal.items.map((item) => ({ ...item })));
  const [selected, setSelected] = useState<Set<number>>(() => new Set(proposal.items.map((item) => item.index)));
  const [phase, setPhase] = useState<Phase>(() => phaseFor(proposal.status));
  const [status, setStatus] = useState<ProposalStatus>(proposal.status);
  const [stake, setStake] = useState<Stake | null>(proposal.stake);
  const [eachSeparately, setEachSeparately] = useState(false);
  const [stakes, setStakes] = useState<Record<number, Stake | null>>({});
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set());
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const [holdingId, setHoldingId] = useState(proposal.holding_id ?? '');
  const [group, setGroup] = useState<GroupState>(proposal.holding_id ? 'done' : 'idle');
  // The api's own sentence when it refuses a holding (D1: one stake, not
  // already in another holding, …); '' for a network failure.
  const [groupError, setGroupError] = useState('');
  // null until the reader types: the default name follows the records chosen.
  const [groupName, setGroupName] = useState<string | null>(null);
  // The name the holding actually has (a reused holding keeps its own name).
  const [madeName, setMadeName] = useState('');
  // null until the reader ticks or unticks: managed land is grouped by default.
  const [groupWanted, setGroupWanted] = useState<boolean | null>(null);
  // "Not now" can be undone until the chat is closed; a reloaded dismissed
  // card is final.
  const [dismissedHere, setDismissedHere] = useState(false);
  // The outcome, read out by a polite live region (the buttons that caused it
  // unmount), and focus moved onto the card's body so keyboard users keep
  // their place.
  const [announcement, setAnnouncement] = useState('');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const refocus = useRef(false);
  const lock = useRef(false);
  const groupLock = useRef(false);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    bodyRef.current?.focus();
  }, [phase]);

  if (incognito) return null;

  const multi = items.length > 1;
  const chosen = items.filter((item) => selected.has(item.index));
  const stakeOf = (item: ProposalItem): Stake | null => (multi && eachSeparately ? stakes[item.index] ?? null : stake);
  const missingStake = chosen.some((item) => !stakeOf(item));
  const missingName = chosen.some((item) => !item.title.trim() && !item.survey_no.trim());
  const pending = chosen.filter((item) => !item.record_id);
  const userName = me.data?.name;

  // One holding keeps one stake (rule 3, amended 2026-10-04): all owned or all
  // managed, never watched, never mixed.
  const chosenStakes = new Set(chosen.map(stakeOf));
  const onlyStake = chosenStakes.size === 1 ? [...chosenStakes][0] : null;
  const holdingStake: Stake | null = chosen.length >= 2 && onlyStake && onlyStake !== 'watch' ? onlyStake : null;
  const groupOn = Boolean(holdingStake) && (groupWanted ?? holdingStake === 'managed');
  const holdingName = (groupName ?? (holdingStake ? defaultHoldingName(chosen, holdingStake) : '')).slice(0, HOLDING_NAME_MAX);

  // Unselected, unsaved rows go back as "not added", so the stored outcome
  // reads true — and every report of this card sends the same rows, or the
  // service would see a finished card change.
  const asReported = (list: ProposalItem[]) => list.map((item) => (
    selected.has(item.index) || item.record_id ? item : { ...item, error: 'Not added' }));

  const publish = (next: ProposalItem[], nextStatus: ProposalStatus, holding = holdingId) => {
    onChange?.({ id: proposal.id, status: nextStatus, stake, items: next, ...(holding ? { holding_id: holding } : {}) });
  };

  const edit = (index: number, patch: Partial<ProposalItem>) => {
    setItems((previous) => previous.map((item) => (item.index === index ? { ...item, ...patch } : item)));
  };

  async function save() {
    if (lock.current || missingStake || missingName) return;
    lock.current = true;
    setPhase('saving');
    setNotice('');
    setProgress(0);
    let working = items.map((item) => ({ ...item }));
    const targets = working.filter((item) => selected.has(item.index) && !item.record_id);
    let done = 0;
    let sessionEnded = false;
    const madeHere: Record<number, Stake> = {};
    try {
      for (const target of targets) {
        const itemStake = stakeOf(target)!;
        const outcome = await saveOne(proposal.id, target, itemStake);
        working = working.map((item) => {
          if (item.index !== target.index) return item;
          return 'id' in outcome
            ? { ...item, record_id: outcome.id, error: null, saved_stake: itemStake }
            : { ...item, error: outcome.error };
        });
        if ('id' in outcome) {
          madeHere[target.index] = itemStake;
          done += 1;
          setProgress(done);
        } else if (outcome.session) {
          sessionEnded = true;
          break;
        }
        setItems(working);
      }
    } finally {
      setItems(working);
      lock.current = false;
    }
    const picked = working.filter((item) => selected.has(item.index));
    const savedCount = picked.filter((item) => item.record_id).length;
    const nextStatus: ProposalStatus = savedCount === 0 ? 'draft'
      : savedCount === picked.length ? 'saved' : 'partial';
    if (done) refresh();
    const failed = picked.filter((item) => !item.record_id && item.error);
    if (sessionEnded) setNotice('Your session has ended. Sign in again — this draft is kept.');
    if (failed.length) {
      toast.bad(failed.length === 1 ? `${itemLabel(failed[0])} could not be saved.` : `${failed.length} records could not be saved.`, failed[0].error);
    }
    setAnnouncement(nextStatus === 'draft'
      ? (sessionEnded ? 'Your session has ended. Nothing was saved.' : 'Nothing was saved.')
      : nextStatus === 'saved'
        ? (picked.length === 1 ? `Saved ${itemLabel(picked[0])}.` : `All ${picked.length} saved.`)
        : `${savedCount} of ${picked.length} saved. ${failed.length} could not be saved.`);
    refocus.current = true;
    setStatus(nextStatus);
    setPhase(nextStatus === 'draft' ? 'draft' : 'done');
    const reported = asReported(working);
    publish(reported, nextStatus);
    // Reported after every save that saved anything — a retry that is still
    // partial changes which rows hold a record even though the status does not.
    if (nextStatus !== 'draft') {
      reportProposal(proposal.id, nextStatus, reported).catch(() => undefined);
    }
    // The holding step runs only once every chosen record is saved, so it is
    // made once with all of them; a failure leaves the records saved and
    // offers "Create holding" again.
    if (nextStatus === 'saved' && groupOn && holdingStake && !holdingId) {
      const members = picked.filter((item) => item.record_id && (madeHere[item.index] ?? item.saved_stake ?? stakeOf(item)) === holdingStake);
      if (members.length >= 2) {
        setGroupName(holdingName);
        await makeHolding(holdingName, members.map((item) => item.record_id!), reported, nextStatus);
      }
    }
  }

  function dismiss() {
    if (lock.current) return;
    refocus.current = true;
    setDismissedHere(true);
    setAnnouncement('Not added. Nothing was saved.');
    setPhase('dismissed');
    setStatus('dismissed');
    publish(items, 'dismissed');
    reportProposal(proposal.id, 'dismissed', items).catch(() => undefined);
  }

  function undoDismiss() {
    refocus.current = true;
    setAnnouncement('Back to the draft. Nothing is saved until you choose Save.');
    setPhase('draft');
    setStatus('draft');
    publish(items, 'draft');
  }

  function openFullForm() {
    // The add drawer has no seeding path yet, so this opens it empty; the card
    // writes nothing once the reader has moved to the form.
    setPhase('form');
    navigate('/properties?new=1');
    leave();
  }

  // Saved rows that can share one holding: two or more, all one non-watch
  // stake — the stake each was SAVED with (stored with the outcome, so a
  // reloaded card still knows), not the model's draft stake.
  const savedRows = items.filter((item) => item.record_id);
  const savedStakes = new Set(savedRows.map((item) => item.saved_stake ?? stakeOf(item) ?? proposal.stake));
  const savedStake = savedStakes.size === 1 ? [...savedStakes][0] : null;
  const groupable = savedRows.length >= 2 && (savedStake === 'owned' || savedStake === 'managed') ? savedRows : [];

  async function makeHolding(name: string, recordIds: string[], reported?: ProposalItem[], reportedStatus?: ProposalStatus) {
    const trimmed = name.trim();
    if (!trimmed || recordIds.length < 2 || groupLock.current) return;
    groupLock.current = true;
    setGroup('busy');
    setGroupError('');
    try {
      const made = await groupAsHolding(proposal.id, trimmed, recordIds);
      if (!made) { setGroup('failed'); return; }
      const id = made.id;
      setHoldingId(id);
      setMadeName(made.name || trimmed);
      setGroup('done');
      setAnnouncement(`Combined into one holding: ${made.name || trimmed}.`);
      refresh();
      const finalItems = reported ?? asReported(items);
      const finalStatus = reportedStatus ?? status;
      publish(finalItems, finalStatus, id);
      if (finalStatus === 'saved' || finalStatus === 'partial') {
        reportProposal(proposal.id, finalStatus, finalItems, id).catch(() => undefined);
      }
    } catch (error) {
      toast.bad('That holding could not be saved. Your properties are saved.', error);
      setGroupError(error instanceof GraphQLRequestError && error.message ? error.message : '');
      setGroup('failed');
    } finally {
      groupLock.current = false;
    }
  }

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, minHeight: 40, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="body2" sx={{ fontWeight: 700, flexGrow: 1 }}>Add to your properties</Typography>
      {!multi && items[0]?.doc_no && (
        <Typography variant="caption" color="text.secondary" noWrap>from deed {items[0].doc_no}</Typography>
      )}
      {multi && (
        <Typography variant="caption" color="text.secondary">{items.length} deeds</Typography>
      )}
    </Box>
  );

  const shell = (children: ReactNode) => (
    <Box
      component="section"
      aria-label="Add to your properties"
      sx={{ mt: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden', whiteSpace: 'normal' }}
    >
      {header}
      <Box role="status" aria-live="polite" sx={srOnly}>{announcement}</Box>
      <Box ref={bodyRef} tabIndex={-1} sx={{ px: 1.25, py: 1, display: 'grid', gap: 1, outline: 'none' }}>{children}</Box>
    </Box>
  );

  if (phase === 'dismissed') {
    return shell(
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>Not added. Nothing was saved.</Typography>
        {dismissedHere && <Button size="small" onClick={undoDismiss}>Undo</Button>}
      </Box>,
    );
  }

  if (phase === 'form') {
    return shell(
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Continue in the form. Nothing was saved from here.
        </Typography>
        <Button size="small" onClick={() => { refocus.current = true; setPhase('draft'); }}>Back to this card</Button>
      </Box>,
    );
  }

  if (phase === 'done') {
    const picked = items.filter((item) => selected.has(item.index) || item.record_id);
    const savedPicked = picked.filter((item) => item.record_id);
    const failedRows = picked.filter((item) => !item.record_id && item.error && item.error !== 'Not added');
    return shell(
      <>
        {multi && (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {savedPicked.length} of {picked.length} saved
          </Typography>
        )}
        {savedPicked.map((item) => (
          <Box key={item.index} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 16, color: 'success.main' }} />
            <Typography variant="body2">
              Saved{item.saved_stake ? ` as ${STAKE_WORD[item.saved_stake]}` : ''} ·
            </Typography>
            <CardLink
              size="small"
              to={`/properties/${encodeURIComponent(item.record_id!)}`}
              sx={{ px: 0.5, minWidth: 0, textTransform: 'none', fontWeight: 700 }}
            >
              Open {itemLabel(item)}
            </CardLink>
          </Box>
        ))}
        {failedRows.map((item) => (
          <Box key={item.index} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
            <ErrorOutlineIcon aria-hidden sx={{ fontSize: 16, mt: 0.25, color: 'error.main' }} />
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{itemLabel(item)}: {item.error}</Typography>
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {status === 'partial' && failedRows.length > 0 && missingStake && (
            <StakeChoice value={stake} onChange={setStake} disabled={false} label="Your stake" />
          )}
          {status === 'partial' && failedRows.length > 0 && (
            <Button size="small" variant="contained" disableElevation disabled={missingStake} onClick={() => void save()}>Retry failed</Button>
          )}
          <CardLink size="small" to="/properties">View in Properties</CardLink>
        </Box>
        {group === 'done' && holdingId && (
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 16, color: 'success.main' }} />
            <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              Combined into one holding{(madeName || groupName || '').trim() ? ` · ${(madeName || groupName || '').trim()}` : ''}
            </Typography>
            <CardLink size="small" variant="outlined" to={`/holdings/${encodeURIComponent(holdingId)}`}>
              Open holding
            </CardLink>
          </Box>
        )}
        {group !== 'done' && groupable.length >= 2 && (
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1, display: 'grid', gap: 0.75 }}>
            {group === 'idle' ? (
              <Button
                size="small"
                onClick={() => {
                  if (groupName === null) setGroupName(defaultHoldingName(groupable, savedStake as Stake));
                  setGroup('naming');
                }}
                sx={{ justifySelf: 'start' }}
              >
                Group these as one holding?
              </Button>
            ) : (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                  size="small" label="Holding name" value={groupName ?? ''} sx={{ ...fieldSx, flex: 1, minWidth: 160 }}
                  disabled={group === 'busy'}
                  slotProps={{ htmlInput: { maxLength: HOLDING_NAME_MAX } }}
                  onChange={(event) => setGroupName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void makeHolding(groupName ?? '', groupable.map((item) => item.record_id!)); }}
                />
                <Button
                  size="small" variant="contained" disableElevation
                  disabled={!(groupName ?? '').trim() || group === 'busy'}
                  onClick={() => void makeHolding(groupName ?? '', groupable.map((item) => item.record_id!))}
                  startIcon={group === 'busy' ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                  {group === 'busy' ? 'Combining…' : group === 'failed' ? 'Combine again' : 'Combine'}
                </Button>
              </Box>
            )}
            {group === 'failed' && (
              <Typography variant="caption" color="error.main">
                Your properties are saved, but the holding was not made{groupError ? ` — ${groupError}` : ' — check your connection and try again.'}
              </Typography>
            )}
          </Box>
        )}
      </>,
    );
  }

  const saving = phase === 'saving';
  const alike = multi ? lookAlikes(items) : new Map<number, number>();
  const positionOf = (index: number) => items.findIndex((item) => item.index === index) + 1;
  const warnings = chosen.filter((item) => {
    // Watched or managed land is not claimed as the reader's own, so a buyer
    // with another name is expected there.
    const itemStake = stakeOf(item);
    if (itemStake === 'watch' || itemStake === 'managed' || !item.buyer_name) return false;
    const match = item.buyer_matches_user ?? buyerMatchesUser(item.buyer_name, userName);
    return match === false;
  });

  return shell(
    <>
      {!(multi && eachSeparately) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{multi ? 'Are these yours?' : 'Is this yours?'}</Typography>
          <StakeChoice value={stake} onChange={setStake} disabled={saving} label="Your stake" />
        </Box>
      )}
      {multi && (
        <FormControlLabel
          control={<Switch size="small" checked={eachSeparately} disabled={saving} onChange={(event) => setEachSeparately(event.target.checked)} />}
          label={<Typography variant="caption">Set each one separately</Typography>}
        />
      )}
      {multi ? (
        <Typography variant="caption" color="text.secondary">
          Watched land is never grouped into a holding; a holding keeps one stake, all yours or all managed. Only your own land is in your setup checklist.
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">Only your own land is in your setup checklist.</Typography>
      )}

      {multi ? (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {items.map((item) => {
            const open = openRows.has(item.index);
            return (
              <Box key={item.index} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5, display: 'grid', gap: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                  <Checkbox
                    size="small"
                    checked={selected.has(item.index)}
                    disabled={saving || Boolean(item.record_id)}
                    slotProps={{ input: { 'aria-label': `Include ${itemLabel(item)}` } }}
                    onChange={(event) => setSelected((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.add(item.index); else next.delete(item.index);
                      return next;
                    })}
                    sx={{ p: 0.5 }}
                  />
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={itemLabel(item)}>
                      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, mr: 0.5 }}>#{positionOf(item.index)}</Box>
                      {itemLabel(item)}
                    </Typography>
                    <Typography
                      variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap
                      title={[item.village, deedLine(item)].filter(Boolean).join(' · ')}
                    >
                      {[item.village, deedLine(item)].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                  {item.record_id && <CheckCircleOutlineIcon aria-label="Saved" sx={{ fontSize: 16, color: 'success.main' }} />}
                  <Button
                    size="small"
                    disabled={saving}
                    onClick={() => setOpenRows((previous) => {
                      const next = new Set(previous);
                      if (next.has(item.index)) next.delete(item.index); else next.add(item.index);
                      return next;
                    })}
                    sx={{ minWidth: 0, flexShrink: 0 }}
                  >
                    {open ? 'Close' : 'Edit'}
                  </Button>
                </Box>
                {eachSeparately && selected.has(item.index) && (
                  <StakeChoice
                    value={stakes[item.index] ?? null}
                    disabled={saving || Boolean(item.record_id)}
                    label={`Your stake in ${itemLabel(item)}`}
                    onChange={(next) => setStakes((previous) => ({ ...previous, [item.index]: next }))}
                  />
                )}
                {alike.has(item.index) && !item.record_id && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    <WarningAmberOutlinedIcon aria-hidden sx={{ fontSize: 15, color: 'warning.main' }} />
                    <Typography variant="caption">Looks like the same property as #{positionOf(alike.get(item.index)!)}</Typography>
                    {selected.has(item.index) && selected.has(alike.get(item.index)!) && (
                      <Button
                        size="small"
                        disabled={saving}
                        onClick={() => setSelected((previous) => {
                          const next = new Set(previous);
                          next.delete(item.index);
                          return next;
                        })}
                        sx={{ px: 0.5, minWidth: 0, textTransform: 'none' }}
                      >
                        Save only #{positionOf(alike.get(item.index)!)}
                      </Button>
                    )}
                  </Box>
                )}
                {open && <ItemEditor item={item} stake={stakeOf(item)} locked={saving || Boolean(item.record_id)} onEdit={(patch) => edit(item.index, patch)} />}
                {item.error && !item.record_id && (
                  <Typography variant="caption" color="error.main">{item.error}</Typography>
                )}
              </Box>
            );
          })}
        </Box>
      ) : items[0] ? (
        <>
          <ItemEditor item={items[0]} stake={stakeOf(items[0])} locked={saving} onEdit={(patch) => edit(items[0].index, patch)} />
          {items[0].error && <Typography variant="caption" color="error.main">{items[0].error}</Typography>}
        </>
      ) : null}

      {warnings.length > 0 && (
        <Box role="note" sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', px: 1, py: 0.75, borderRadius: 1, bgcolor: 'action.hover' }}>
          <WarningAmberOutlinedIcon aria-hidden sx={{ fontSize: 16, mt: 0.25, color: 'warning.main' }} />
          <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
            {warnings.length === 1 && !multi
              ? `Owner in deed is “${warnings[0].buyer_name}” — not you? Choose “Watching” or “Managed”.`
              : `The buyer in ${warnings.length === 1 ? 'one deed' : `${warnings.length} deeds`} is not you by name. Choose “Watching” or “Managed” if it is not yours.`}
          </Typography>
        </Box>
      )}

      {multi && chosen.length >= 2 && !holdingId && !holdingStake && chosenStakes.size > 0 && !missingStake && (
        <Typography variant="caption" color="text.secondary" data-testid="holding-not-offered">
          {onlyStake === 'watch'
            ? 'Not offered as one holding: watched land is never combined.'
            : 'Not offered as one holding: these have different stakes, and a holding keeps one.'}
        </Typography>
      )}

      {holdingStake && !holdingId && (
        <Box sx={{ display: 'grid', gap: 0.5, px: 1, py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={(
              <Checkbox
                size="small"
                checked={groupOn}
                disabled={saving}
                onChange={(event) => setGroupWanted(event.target.checked)}
                sx={{ p: 0.5 }}
              />
            )}
            label={<Typography variant="body2">Group as one holding</Typography>}
          />
          {groupOn && (
            <TextField
              size="small" label="Holding name" value={holdingName} disabled={saving} sx={fieldSx}
              slotProps={{ htmlInput: { maxLength: HOLDING_NAME_MAX } }}
              onChange={(event) => setGroupName(event.target.value)}
            />
          )}
          <Typography variant="caption" color="text.secondary">
            {holdingStake === 'managed'
              ? 'Land you manage for one person reads best as one holding: one place for its documents and expenses.'
              : 'Optional: combine these properties into one holding to see their documents and expenses together.'}
          </Typography>
        </Box>
      )}

      {notice && <Typography variant="body2" color="error.main">{notice}</Typography>}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          size="small"
          variant="contained"
          disableElevation
          disabled={saving || missingStake || missingName || pending.length === 0 || (groupOn && !holdingName.trim())}
          onClick={() => void save()}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {saving ? (multi ? `Saving ${progress} of ${pending.length}…` : 'Saving…') : 'Save'}
        </Button>
        {!saving && (
          <>
            <Button size="small" onClick={openFullForm}>Edit in full form</Button>
            <Button size="small" color="inherit" onClick={dismiss}>Not now</Button>
          </>
        )}
        {!saving && missingStake && (
          <Typography variant="caption" color="text.secondary">Choose Owned, Managed or Watching to save.</Typography>
        )}
        {!saving && !missingStake && missingName && (
          <Typography variant="caption" color="text.secondary">Give each property a name or survey number.</Typography>
        )}
      </Box>
    </>,
  );
}
