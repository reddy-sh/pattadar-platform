/**
 * Narrow a party search without asking the model again (contracts C5/C6).
 *
 * The same person is usually found in many places; a place plus a name is
 * what finds their properties. The reader ticks villages and an SRO from the
 * facets the service counted over EVERY match, picks how sure the name match
 * must be and which side of the deed, and the browser posts the refinement to
 * /api/records/party-search. The answer is appended to the chat as a new reply
 * with its own refine panel, so refinements chain.
 */
import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { FacetCount, PartySearchRequest, PartySide, RecordView } from '../types';

const MAX_VILLAGES = 10;
const VILLAGES_SHOWN = 6;
const SROS_SHOWN = 4;

const CONFIDENCE = [
  { value: 1, label: '100% exact' },
  { value: 0.9, label: '≥ 90%' },
  { value: 0.7, label: '≥ 70%' },
  { value: 0.6, label: 'Any ≥ 60%' },
] as const;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function nearestConfidence(min: number | undefined): number {
  if (typeof min !== 'number') return 1;
  return CONFIDENCE.reduce((best, option) => (Math.abs(option.value - min) < Math.abs(best - min) ? option.value : best), 1 as number);
}

/** Only a party-search view carries the search it answers and the facets to narrow it. */
export function canRefine(view: RecordView): boolean {
  return Boolean(view.kind === 'table' && view.query?.name && view.facets);
}

/** Words for the refinement, used as the reader's side of the exchange. */
export function describeRefinement(request: PartySearchRequest): string {
  const parts = [`Refine “${request.name}”`];
  if (request.villages?.length) parts.push(`in ${request.villages.join(', ')}`);
  if (request.sro) parts.push(`at SRO ${request.sro}`);
  if (typeof request.min_similarity === 'number') {
    parts.push(request.min_similarity >= 1 ? 'exact name only' : `with a name match of ≥${Math.round(request.min_similarity * 100)}%`);
  }
  if (request.side) parts.push(request.side === 'claimant' ? 'as buyer' : 'as seller');
  return `${parts.join(' ')}.`;
}

export interface RefinePanelProps {
  view: RecordView;
  /** True while a reply streams or another refinement runs. */
  disabled: boolean;
  /** Start opened (the newest reply) or folded (history). */
  defaultOpen?: boolean;
  /** Posts the refinement and appends its answer; rejects with a sentence on failure. */
  onRefine: (request: PartySearchRequest) => Promise<void>;
}

function FacetChecks({ items, picked, onToggle, shown, disabled, label }: {
  items: FacetCount[]; picked: string[]; onToggle: (name: string) => void; shown: number; disabled: boolean; label: string;
}) {
  const [more, setMore] = useState(false);
  const visible = more ? items : items.slice(0, shown);
  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', flexDirection: 'column' }}>
      {visible.map((item) => (
        <FormControlLabel
          key={item.name}
          disabled={disabled}
          sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8125rem', minWidth: 0 } }}
          control={<Checkbox size="small" checked={picked.some((name) => sameName(name, item.name))} onChange={() => onToggle(item.name)} sx={{ p: 0.5 }} />}
          label={(
            <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'baseline' }}>
              <span>{item.name}</span>
              <Typography component="span" variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.count.toLocaleString('en-IN')}
              </Typography>
            </Box>
          )}
        />
      ))}
      {items.length > shown && (
        <Button size="small" onClick={() => setMore((value) => !value)} sx={{ alignSelf: 'flex-start', px: 0.5, minWidth: 0 }}>
          {more ? 'Fewer' : `${items.length - shown} more`}
        </Button>
      )}
    </Box>
  );
}

export function RefinePanel({ view, disabled, defaultOpen = false, onRefine }: RefinePanelProps) {
  const query = view.query!;
  const facets = view.facets ?? {};
  const villageFacets = facets.villages ?? [];
  const sroFacets = facets.sros ?? [];
  const confidence = facets.confidence;
  const [open, setOpen] = useState(defaultOpen);
  // Fold an older reply's panel once a newer reply takes over, so a chain of
  // refinements leaves one open filter form, not one per reply.
  useEffect(() => { if (!defaultOpen) setOpen(false); }, [defaultOpen]);
  const [villages, setVillages] = useState<string[]>(() => query.villages ?? []);
  const [sro, setSro] = useState<string>(() => query.sro ?? '');
  const [minSimilarity, setMinSimilarity] = useState(() => nearestConfidence(query.min_similarity));
  const [side, setSide] = useState<'' | PartySide>(() => (query.side === 'claimant' || query.side === 'executant' ? query.side : ''));
  const [place, setPlace] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  // Places the reader typed (or an earlier refinement chose) that the facets do not list.
  const extraVillages = useMemo(
    () => villages.filter((name) => !villageFacets.some((facet) => sameName(facet.name, name))),
    [villages, villageFacets],
  );

  // The first few SROs, plus the chosen one wherever it sits; the rest fold away.
  const sroTop = sroFacets.slice(0, SROS_SHOWN);
  if (sro && !sroTop.some((facet) => sameName(facet.name, sro))) {
    sroTop.push(sroFacets.find((facet) => sameName(facet.name, sro)) ?? { name: sro, count: -1 });
  }
  const sroRest = sroFacets.filter((facet) => !sroTop.some((top) => sameName(top.name, facet.name)));

  // The options sit on the service's own bucket edges (exact / ≥0.9 / ≥0.7 /
  // the rest), so every one can be counted. "Any ≥ 60%" adds the low bucket,
  // which is only bounded at 60% when the search itself ran at ≥ 60%.
  const searchedFrom = typeof query.min_similarity === 'number' ? query.min_similarity : 0.6;
  const countFor = (value: number): number | null => {
    if (!confidence) return null;
    if (value >= 1) return confidence.exact;
    if (value >= 0.9) return confidence.exact + confidence.high;
    if (value >= 0.7) return confidence.exact + confidence.high + confidence.medium;
    if (searchedFrom >= 0.6) return confidence.exact + confidence.high + confidence.medium + confidence.low;
    return null;
  };

  const toggleVillage = (name: string) => setVillages((previous) => (
    previous.some((item) => sameName(item, name))
      ? previous.filter((item) => !sameName(item, name))
      : previous.length >= MAX_VILLAGES ? previous : [...previous, name]
  ));

  const addPlace = () => {
    const name = place.trim().slice(0, 80);
    if (!name) return;
    if (!villages.some((item) => sameName(item, name)) && villages.length < MAX_VILLAGES) {
      setVillages((previous) => [...previous, name]);
    }
    setPlace('');
  };

  async function refine() {
    if (running || disabled) return;
    const request: PartySearchRequest = { name: query.name, min_similarity: minSimilarity };
    if (villages.length) request.villages = villages;
    if (sro) request.sro = sro;
    if (side) request.side = side;
    setRunning(true);
    setError('');
    try {
      await onRefine(request);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The refinement could not run.');
    } finally {
      setRunning(false);
    }
  }

  const locked = disabled || running;

  return (
    <Box
      component="section"
      aria-label={`Refine ${view.title}`}
      sx={{ mt: 0.75, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden', whiteSpace: 'normal' }}
    >
      <Button
        size="small"
        fullWidth
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        sx={{ justifyContent: 'space-between', px: 1.25, borderRadius: 0, textTransform: 'none' }}
      >
        <span>Narrow by place and confidence</span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </Button>
      {open && (
        <Box sx={{ px: 1.25, pb: 1.25, display: 'grid', gap: 1.25 }}>
          <Typography variant="caption" color="text.secondary">
            The same name turns up in many places. Pick the places you know to find this person’s properties.
            Numbers count the current results; Refine searches again with your choices.
          </Typography>
          {facets.sampled && (
            <Typography variant="caption" role="note" sx={{ color: 'warning.main' }}>
              This name is very common, so these places come from a sample of its matches and may leave out
              where the person is. Add the place you know below.
            </Typography>
          )}

          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(200px, 1fr))' } }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>Villages</Typography>
              {villageFacets.length > 0 ? (
                <FacetChecks items={villageFacets} picked={villages} onToggle={toggleVillage} shown={VILLAGES_SHOWN} disabled={locked} label="Villages" />
              ) : (
                <Typography variant="caption" color="text.secondary">No villages counted.</Typography>
              )}
              {extraVillages.map((name) => (
                <FormControlLabel
                  key={name}
                  disabled={locked}
                  sx={{ mr: 0, display: 'flex', '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
                  control={<Checkbox size="small" checked onChange={() => toggleVillage(name)} sx={{ p: 0.5 }} />}
                  label={name}
                />
              ))}
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                <TextField
                  size="small"
                  placeholder="Add a place"
                  value={place}
                  disabled={locked || villages.length >= MAX_VILLAGES}
                  onChange={(event) => setPlace(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addPlace(); } }}
                  slotProps={{ htmlInput: { 'aria-label': 'Add a village', maxLength: 80 } }}
                  sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-input': { fontSize: '0.8125rem', py: 0.5 } }}
                />
                <Button size="small" disabled={locked || !place.trim() || villages.length >= MAX_VILLAGES} onClick={addPlace}>Add</Button>
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>SRO</Typography>
              <RadioGroup value={sro} onChange={(event) => setSro(event.target.value)} aria-label="SRO">
                <FormControlLabel
                  value="" disabled={locked}
                  sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
                  control={<Radio size="small" sx={{ p: 0.5 }} />} label="Any SRO"
                />
                {sroTop.map((facet) => (
                    <FormControlLabel
                      key={facet.name} value={facet.name} disabled={locked}
                      sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
                      control={<Radio size="small" sx={{ p: 0.5 }} />}
                      label={(
                        <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'baseline' }}>
                          <span>{facet.name}</span>
                          {facet.count >= 0 && (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {facet.count.toLocaleString('en-IN')}
                            </Typography>
                          )}
                        </Box>
                      )}
                    />
                  ))}
              </RadioGroup>
              {sroRest.length > 0 && (
                <SroMore items={sroRest} value={sro} onPick={setSro} disabled={locked} />
              )}
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>Name match</Typography>
              <RadioGroup value={String(minSimilarity)} onChange={(event) => setMinSimilarity(Number(event.target.value))} aria-label="Name match">
                {CONFIDENCE.map((option) => {
                  const count = countFor(option.value);
                  return (
                    <FormControlLabel
                      key={option.value} value={String(option.value)} disabled={locked}
                      sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
                      control={<Radio size="small" sx={{ p: 0.5 }} />}
                      label={(
                        <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'baseline' }}>
                          <span>{option.label}</span>
                          {count !== null && (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {count.toLocaleString('en-IN')}
                            </Typography>
                          )}
                        </Box>
                      )}
                    />
                  );
                })}
              </RadioGroup>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mt: 0.75, mb: 0.25 }}>Side of the deed</Typography>
              <ToggleButtonGroup
                exclusive size="small" value={side} disabled={locked} aria-label="Side of the deed"
                onChange={(_, next: '' | PartySide | null) => { if (next !== null) setSide(next); }}
                sx={{ '& .MuiToggleButton-root': { textTransform: 'none', py: 0.25, px: 1, fontSize: '0.8125rem' } }}
              >
                <ToggleButton value="">Any</ToggleButton>
                <ToggleButton value="claimant">Buyer</ToggleButton>
                <ToggleButton value="executant">Seller</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small" variant="contained" disableElevation disabled={locked} onClick={() => void refine()}
              startIcon={running ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {running ? 'Refining…' : 'Refine results'}
            </Button>
            {(villages.length > 0 || sro) && !running && (
              <Button size="small" color="inherit" disabled={locked} onClick={() => { setVillages([]); setSro(''); }}>Clear places</Button>
            )}
            <Typography variant="caption" color="text.secondary">Searched directly in the public records.</Typography>
          </Box>
          {error && <Typography variant="caption" role="alert" color="error.main">{error}</Typography>}
        </Box>
      )}
    </Box>
  );
}

/** The SROs past the first few, as a folded list of the same radio choice. */
function SroMore({ items, value, onPick, disabled }: {
  items: FacetCount[]; value: string; onPick: (name: string) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <RadioGroup value={value} onChange={(event) => onPick(event.target.value)} aria-label="More SROs">
          {items.map((facet) => (
            <FormControlLabel
              key={facet.name} value={facet.name} disabled={disabled}
              sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
              control={<Radio size="small" sx={{ p: 0.5 }} />}
              label={`${facet.name} · ${facet.count.toLocaleString('en-IN')}`}
            />
          ))}
        </RadioGroup>
      )}
      <Button size="small" onClick={() => setOpen((v) => !v)} sx={{ px: 0.5, minWidth: 0 }}>
        {open ? 'Fewer' : `${items.length} more`}
      </Button>
    </>
  );
}
