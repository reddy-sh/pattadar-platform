/**
 * "Request services" — the confirmation card for a `service_proposal` event
 * (D3, docs/specs/2026-10-04-assistant-write-actions.md).
 *
 * The model only names what the reader asked for and which records it is for.
 * This card loads the real catalogue and prices for each record with the W360
 * hooks (the same `servicesOffered` the Services page reads), preselects the
 * offers whose names match the request, and orders nothing until the reader
 * clicks Place request. That click files one `orderServiceBatch` per record,
 * through the reader's own session, keyed `asst:<id>:<recordId>:<kind>`, in
 * sequence behind a ref lock. Model text is rendered as text, never HTML.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { GraphQLRequestError, SESSION_ENDED_MESSAGE } from '../../api/client';
import { useOrderServiceBatch, useOrders, useRecord, useRefreshW360, useServicesOffered } from '../../w360/api';
import { useToast } from '../../w360/Toast';
import { CardLink } from './CardLink';
import type { ServiceOffer } from '../../w360/api';
import { inr } from '../../w360/ui';
import { orderHref } from '../../w360/orderFlow';
import {
  matchOffers, needsDetails, ordersInBatch, reportServiceProposal, serviceOrderKey,
} from '../serviceOrders';
import type { ServiceProposal, ServiceProposalResult, ServiceProposalStatus } from '../types';

export interface ServiceOrderCardProps {
  proposal: ServiceProposal;
  /** The card never renders in incognito: nothing may be ordered from there. */
  incognito: boolean;
  onChange?: (proposal: ServiceProposal) => void;
}

type Phase = 'draft' | 'placing' | 'done' | 'dismissed';

/** What one record's catalogue looks like once loaded. */
interface RecordCatalogue {
  offers: ServiceOffer[];
  /** kind → the open order already running for it on this record. */
  running: Record<string, string>;
  loading: boolean;
  failed: boolean;
  /** The record is not one of the reader's own (the model named an id it
   *  does not hold): nothing is offered or priced for it. */
  notYours: boolean;
  /** The record's own title, when the card was given none. */
  title: string;
}

const PAY_NOTE = 'You pay only after you accept the work.';
const NETWORK_TEXT = 'Could not reach Pattadar. Retry sends the same request, so nothing is ordered twice.';
const REFUSED_TEXT = 'Not placed. One of these may already be on order. Nothing was ordered for this property.';
const SESSION_TEXT = 'Sign in again — nothing else was ordered.';
const NOT_YOURS_TEXT = 'This is not one of your properties, so nothing can be ordered for it here.';
/** Failures that the same request can fix on a retry (nothing was refused). */
const RETRYABLE = new Set([NETWORK_TEXT, SESSION_TEXT]);

const srOnly = {
  position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;

function phaseFor(status: ServiceProposalStatus): Phase {
  if (status === 'ordered' || status === 'partial') return 'done';
  if (status === 'dismissed') return 'dismissed';
  return 'draft';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Loads one record's offers and open orders and hands them up. */
function RecordLoader({ recordId, onLoaded }: { recordId: string; onLoaded: (recordId: string, value: RecordCatalogue) => void }) {
  // The owner-scoped read: null for an id that is not the reader's, which the
  // catalogue alone would still price (it falls back to the baseline offers).
  const record = useRecord(recordId);
  const offers = useServicesOffered('', '', true, recordId);
  const open = useOrders(recordId);
  const loading = offers.isLoading || open.isLoading || record.isLoading;
  const failed = Boolean(offers.error) || Boolean(record.error);
  const notYours = record.isSuccess && !record.data;
  const title = record.data?.title ?? '';
  const offerList = offers.data;
  const openList = open.data;
  useEffect(() => {
    const running: Record<string, string> = {};
    for (const order of openList ?? []) {
      if (order.recordId && order.recordId !== recordId) continue;
      running[order.serviceKey || order.kind] = order.id;
      running[order.kind] = order.id;
    }
    onLoaded(recordId, { offers: notYours ? [] : offerList ?? [], running, loading, failed, notYours, title });
  }, [recordId, offerList, openList, loading, failed, notYours, title, onLoaded]);
  return null;
}

export function ServiceOrderCard({ proposal, incognito, onChange }: ServiceOrderCardProps) {
  const placeBatch = useOrderServiceBatch(false);
  const refresh = useRefreshW360();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>(() => phaseFor(proposal.status));
  const [status, setStatus] = useState<ServiceProposalStatus>(proposal.status);
  const [results, setResults] = useState<ServiceProposalResult[]>(proposal.results);
  const [catalogue, setCatalogue] = useState<Record<string, RecordCatalogue>>({});
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});
  const [showAll, setShowAll] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState(0);
  const [dismissedHere, setDismissedHere] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const touched = useRef<Set<string>>(new Set());
  const lock = useRef(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const refocus = useRef(false);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    bodyRef.current?.focus();
  }, [phase]);

  // Stable, so each loader's effect runs only when its own data changes.
  const onLoaded = useMemo(() => (recordId: string, value: RecordCatalogue) => {
    setCatalogue((previous) => ({ ...previous, [recordId]: value }));
  }, []);

  // Preselect the offers the request names, once per record, until the reader
  // changes that record's ticks themselves.
  useEffect(() => {
    setPicked((previous) => {
      let next = previous;
      for (const record of proposal.records) {
        const loaded = catalogue[record.record_id];
        if (!loaded || loaded.loading || loaded.notYours || touched.current.has(record.record_id) || previous[record.record_id]) continue;
        const keys = matchOffers(proposal.requested, loaded.offers).filter((key) => {
          const offer = loaded.offers.find((item) => item.key === key);
          return offer && !needsDetails(offer) && !loaded.running[key];
        });
        if (next === previous) next = { ...previous };
        next[record.record_id] = new Set(keys);
      }
      return next;
    });
  }, [catalogue, proposal.records, proposal.requested]);

  if (incognito) return null;

  const placedFor = (recordId: string) => results.find((result) => result.record_id === recordId && !result.error);
  const failedFor = (recordId: string) => results.find((result) => result.record_id === recordId && result.error);
  const offerOf = (recordId: string, key: string) => catalogue[recordId]?.offers.find((offer) => offer.key === key);
  // What would actually be sent for a record: its ticks, less any offer that
  // is now running there (a refusal refreshes the open orders, so a retry
  // drops what blocked it) or that needs the full form.
  const kindsFor = (recordId: string): string[] => {
    const loaded = catalogue[recordId];
    if (!loaded || loaded.notYours) return [];
    return [...(picked[recordId] ?? [])].filter((key) => {
      const offer = offerOf(recordId, key);
      return offer && !loaded.running[key] && !needsDetails(offer);
    }).sort();
  };
  const pendingRecords = proposal.records.filter((record) => !placedFor(record.record_id) && kindsFor(record.record_id).length > 0);
  const total = pendingRecords.reduce((sum, record) => sum + kindsFor(record.record_id)
    .reduce((acc, key) => acc + (offerOf(record.record_id, key)?.price ?? 0), 0), 0);
  const serviceCount = pendingRecords.reduce((sum, record) => sum + kindsFor(record.record_id).length, 0);
  const stillLoading = proposal.records.some((record) => !catalogue[record.record_id] || catalogue[record.record_id].loading);
  const priceNotes = [...new Set(pendingRecords.flatMap((record) => kindsFor(record.record_id)
    .map((key) => offerOf(record.record_id, key)?.flatPriceNote ?? '')).filter(Boolean))];
  const unmatched = proposal.requested.filter((request) => proposal.records.every((record) => {
    const loaded = catalogue[record.record_id];
    return loaded && !loaded.loading && !loaded.notYours && matchOffers([request], loaded.offers).length === 0;
  }));

  const toggle = (recordId: string, key: string, on: boolean) => {
    touched.current.add(recordId);
    setPicked((previous) => {
      const next = new Set(previous[recordId] ?? []);
      if (on) next.add(key); else next.delete(key);
      return { ...previous, [recordId]: next };
    });
  };

  const publish = (nextStatus: ServiceProposalStatus, nextResults: ServiceProposalResult[]) => {
    onChange?.({ ...proposal, status: nextStatus, results: nextResults });
  };

  async function place() {
    if (lock.current || !pendingRecords.length) return;
    lock.current = true;
    setPhase('placing');
    setProgress(0);
    let working = results.filter((result) => !result.error);
    const note = `Ordered from the assistant${proposal.note ? `: ${proposal.note}` : ''}`.slice(0, 500);
    let sessionEnded = false;
    try {
      for (const record of pendingRecords) {
        const kinds = kindsFor(record.record_id);
        let outcome: ServiceProposalResult = {
          record_id: record.record_id, kinds, batch_id: null, batch_ref: null, orders: [], error: null,
        };
        try {
          const response = await placeBatch.mutateAsync({
            recordId: record.record_id,
            items: JSON.stringify(kinds.map((kind) => ({ kind, params: {} }))),
            note,
            idempotencyKey: serviceOrderKey(proposal.id, record.record_id, kinds),
          });
          const receipt = response.web.orderServiceBatch;
          if (!receipt) {
            outcome.error = REFUSED_TEXT;
          } else {
            outcome = { ...outcome, batch_id: receipt.batchId, batch_ref: receipt.ref };
            // The refs are the server's own; a failed read leaves the batch ref.
            outcome.orders = await ordersInBatch(record.record_id, receipt.batchId).catch(() => []);
          }
        } catch (error) {
          if (error instanceof Error && error.message === SESSION_ENDED_MESSAGE) {
            outcome.error = SESSION_TEXT;
            sessionEnded = true;
          } else if (error instanceof GraphQLRequestError) {
            outcome.error = error.message || REFUSED_TEXT;
          } else {
            outcome.error = NETWORK_TEXT;
          }
        }
        working = [...working.filter((result) => result.record_id !== record.record_id), outcome];
        setResults(working);
        setProgress((count) => count + 1);
        if (sessionEnded) break;
      }
    } finally {
      lock.current = false;
    }
    const wanted = proposal.records.filter((record) => working.some((result) => result.record_id === record.record_id)
      || kindsFor(record.record_id).length > 0);
    const placed = working.filter((result) => !result.error).length;
    const nextStatus: ServiceProposalStatus = placed === 0 ? 'draft' : placed >= wanted.length ? 'ordered' : 'partial';
    const failed = working.filter((result) => result.error);
    // A refusal is usually an open request this card did not know about:
    // reload the open orders so the card shows it and a retry leaves it out.
    if (failed.length || placed) refresh();
    if (failed.length) {
      toast.bad(failed.length === 1
        ? `${titleOf(failed[0].record_id)}: nothing was ordered.`
        : `${failed.length} properties: nothing was ordered.`, failed[0].error);
    }
    setAnnouncement(nextStatus === 'draft'
      ? 'Nothing was ordered.'
      : nextStatus === 'ordered'
        ? `Ordered for ${plural(placed, 'property', 'properties')}.`
        : `Ordered for ${placed} of ${wanted.length} properties. ${failed.length} could not be placed.`);
    refocus.current = true;
    setStatus(nextStatus);
    setPhase(nextStatus === 'draft' ? 'draft' : 'done');
    publish(nextStatus, working);
    if (nextStatus !== 'draft') reportServiceProposal(proposal.id, nextStatus, working).catch(() => undefined);
  }

  function dismiss() {
    if (lock.current) return;
    refocus.current = true;
    setDismissedHere(true);
    setAnnouncement('Not now. Nothing was ordered.');
    setPhase('dismissed');
    setStatus('dismissed');
    publish('dismissed', results);
    reportServiceProposal(proposal.id, 'dismissed', results).catch(() => undefined);
  }

  function undoDismiss() {
    refocus.current = true;
    setAnnouncement('Back to the order. Nothing is ordered until you choose Place the order.');
    setPhase('draft');
    setStatus('draft');
    publish('draft', results);
  }

  function titleOf(recordId: string): string {
    return proposal.records.find((record) => record.record_id === recordId)?.title || catalogue[recordId]?.title || 'This property';
  }

  const shell = (children: ReactNode) => (
    <Box
      component="section"
      aria-label="Order services"
      sx={{ mt: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden', whiteSpace: 'normal' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, minHeight: 40, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, flexGrow: 1 }}>Order services</Typography>
        <Typography variant="caption" color="text.secondary">{plural(proposal.records.length, 'property', 'properties')}</Typography>
      </Box>
      <Box role="status" aria-live="polite" sx={srOnly}>{announcement}</Box>
      <Box ref={bodyRef} tabIndex={-1} sx={{ px: 1.25, py: 1, display: 'grid', gap: 1, outline: 'none' }}>{children}</Box>
    </Box>
  );

  if (!proposal.records.length) {
    return shell(
      <Typography variant="body2" color="text.secondary">
        No saved properties to order this for. Save the properties first, then ask again.
      </Typography>,
    );
  }

  if (phase === 'dismissed') {
    return shell(
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>Not now. Nothing was ordered.</Typography>
        {dismissedHere && <Button size="small" onClick={undoDismiss}>Undo</Button>}
      </Box>,
    );
  }

  const loaders = proposal.records.map((record) => (
    <RecordLoader key={record.record_id} recordId={record.record_id} onLoaded={onLoaded} />
  ));

  if (phase === 'done') {
    const placed = results.filter((result) => !result.error);
    const failed = results.filter((result) => result.error);
    return shell(
      <>
        {loaders}
        {placed.map((result) => (
          <Box key={result.record_id} sx={{ display: 'grid', gap: 0.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 16, color: 'success.main' }} />
              <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                Ordered{result.batch_ref ? ` · ${result.batch_ref}` : ''} · {titleOf(result.record_id)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 2.75 }}>
              {result.orders.map((order) => (
                <CardLink
                  key={order.id}
                  size="small"
                  to={`/services/${encodeURIComponent(order.id)}`}
                  sx={{ px: 0.5, minWidth: 0, textTransform: 'none' }}
                >
                  {[order.ref, order.title].filter(Boolean).join(' · ') || 'Open order'}
                </CardLink>
              ))}
              {!result.orders.length && (
                <CardLink
                  size="small"
                  to={`/properties/${encodeURIComponent(result.record_id)}/services`}
                  sx={{ px: 0.5, minWidth: 0, textTransform: 'none' }}
                >
                  Track in Services
                </CardLink>
              )}
            </Box>
          </Box>
        ))}
        {failed.map((result) => (
          <Box key={result.record_id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
            <ErrorOutlineIcon aria-hidden sx={{ fontSize: 16, mt: 0.25, color: 'error.main' }} />
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{titleOf(result.record_id)}: {result.error}</Typography>
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary">{PAY_NOTE}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {status === 'partial' && failed.length > 0 && (failed.every((result) => RETRYABLE.has(result.error ?? '')) ? (
            // Nothing was refused: the same request, under the same key, can go through.
            <Button size="small" variant="contained" disableElevation disabled={!pendingRecords.length || stillLoading} onClick={() => void place()}>
              Retry failed
            </Button>
          ) : (
            // A refusal would only repeat: go back to the ticks, where what is
            // already running is shown and left out.
            <Button size="small" variant="contained" disableElevation onClick={() => { refocus.current = true; setPhase('draft'); }}>
              Change and retry
            </Button>
          ))}
          <CardLink size="small" to="/services">View in Services</CardLink>
        </Box>
      </>,
    );
  }

  const placing = phase === 'placing';

  return shell(
    <>
      {loaders}
      {proposal.requested.length > 0 && (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          You asked for: {proposal.requested.join(', ')}
        </Typography>
      )}
      {proposal.records.map((record) => {
        const loaded = catalogue[record.record_id];
        const done = placedFor(record.record_id);
        const failure = done ? undefined : failedFor(record.record_id);
        const matched = loaded ? matchOffers(proposal.requested, loaded.offers) : [];
        const expanded = showAll.has(record.record_id);
        const chosen = picked[record.record_id] ?? new Set<string>();
        const visible = loaded
          ? loaded.offers.filter((offer) => expanded || matched.includes(offer.key) || chosen.has(offer.key))
          : [];
        const subtotal = kindsFor(record.record_id).reduce((sum, key) => sum + (offerOf(record.record_id, key)?.price ?? 0), 0);
        const recordTitle = record.title || loaded?.title || 'This property';
        return (
          <Box key={record.record_id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1, py: 0.75, display: 'grid', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap title={recordTitle}>{recordTitle}</Typography>
              {!done && subtotal > 0 && (
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{inr(subtotal)}</Typography>
              )}
            </Box>
            {failure && (
              <Box role="alert" sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <ErrorOutlineIcon aria-hidden sx={{ fontSize: 15, mt: 0.25, color: 'error.main' }} />
                <Typography variant="caption" color="error.main" sx={{ overflowWrap: 'anywhere' }}>{failure.error}</Typography>
              </Box>
            )}
            {done ? (
              <Typography variant="caption" color="success.main">Ordered{done.batch_ref ? ` · ${done.batch_ref}` : ''}</Typography>
            ) : !loaded || loaded.loading ? (
              <Typography variant="caption" color="text.secondary">Loading services and prices…</Typography>
            ) : loaded.notYours ? (
              <Typography variant="caption" color="text.secondary">{NOT_YOURS_TEXT}</Typography>
            ) : loaded.failed ? (
              <Typography variant="caption" color="error.main">The services for this property could not be loaded.</Typography>
            ) : (
              <>
                {visible.length === 0 && (
                  <Typography variant="caption" color="text.secondary">No service matched — show all to pick one.</Typography>
                )}
                {visible.map((offer) => {
                  const runningId = loaded.running[offer.key];
                  const details = needsDetails(offer);
                  return (
                    <Box key={offer.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      <Checkbox
                        size="small"
                        checked={chosen.has(offer.key) && !runningId && !details}
                        disabled={placing || Boolean(runningId) || details}
                        slotProps={{ input: { 'aria-label': `${offer.label} for ${record.title || loaded.title || 'this property'}` } }}
                        onChange={(event) => toggle(record.record_id, offer.key, event.target.checked)}
                        sx={{ p: 0.5 }}
                      />
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography variant="body2" noWrap title={offer.label}>{offer.label}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {runningId ? 'Already on order' : details ? 'Needs a few answers first' : `about ${offer.days} days`}
                        </Typography>
                      </Box>
                      {runningId ? (
                        <CardLink size="small" sx={{ flexShrink: 0, textTransform: 'none' }} to={`/services/${encodeURIComponent(runningId)}`}>
                          Open order
                        </CardLink>
                      ) : details ? (
                        <CardLink
                          size="small"
                          sx={{ flexShrink: 0, textTransform: 'none' }}
                          // The one ordering flow; a property has no /order tab.
                          to={orderHref(record.record_id, { service: offer.key })}
                        >
                          Open the form
                        </CardLink>
                      ) : (
                        <Typography variant="body2" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{inr(offer.price)}</Typography>
                      )}
                    </Box>
                  );
                })}
                {loaded.offers.length > visible.length || expanded ? (
                  <Button
                    size="small"
                    disabled={placing}
                    aria-expanded={expanded}
                    onClick={() => setShowAll((previous) => {
                      const next = new Set(previous);
                      if (next.has(record.record_id)) next.delete(record.record_id); else next.add(record.record_id);
                      return next;
                    })}
                    sx={{ justifySelf: 'start', px: 0.5, minWidth: 0 }}
                  >
                    {expanded ? 'Show fewer' : `Show all services (${loaded.offers.length})`}
                  </Button>
                ) : null}
              </>
            )}
          </Box>
        );
      })}

      {unmatched.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          Nothing in the catalogue matched “{unmatched.join('”, “')}” — show all services to pick one.
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Total {inr(total)}
        </Typography>
        <Typography variant="caption" color="text.secondary">{plural(serviceCount, 'service')}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">{PAY_NOTE}</Typography>
      {priceNotes.map((note) => (
        <Typography key={note} variant="caption" color="text.secondary">{note}</Typography>
      ))}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          size="small"
          variant="contained"
          disableElevation
          disabled={placing || stillLoading || serviceCount === 0}
          onClick={() => void place()}
          startIcon={placing ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {placing
            ? (pendingRecords.length > 1 ? `Placing ${progress} of ${pendingRecords.length}…` : 'Placing…')
            : 'Place the order'}
        </Button>
        {!placing && <Button size="small" color="inherit" onClick={dismiss}>Not now</Button>}
        {!placing && !stillLoading && serviceCount === 0 && (
          <Typography variant="caption" color="text.secondary">Choose at least one service to order it.</Typography>
        )}
      </Box>
    </>,
  );
}
