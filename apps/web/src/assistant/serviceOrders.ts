/**
 * Request-a-service cards (D3, docs/specs/2026-10-04-assistant-write-actions.md).
 *
 * The service streams a `service_proposal` naming what the reader asked for
 * (free text) and which of their records it is for. Nothing here orders
 * anything: the card loads the real catalogue and prices with the W360 hooks,
 * preselects the offers that match the request, and only "Place request"
 * files them — through the reader's own session, keyed so a double click, a
 * retry or a reload replays the first answer instead of ordering twice.
 */
import { apiFetch, gql } from '../api/client';
import type { ServiceOffer } from '../w360/api';
import { ASSISTANT_BASE } from './format';
import type {
  ServiceOrderRef, ServiceProposal, ServiceProposalResult, ServiceProposalStatus,
} from './types';

const STATUSES = new Set<ServiceProposalStatus>(['draft', 'ordered', 'partial', 'dismissed']);

const str = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

function parseOrder(raw: unknown): ServiceOrderRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id).slice(0, 64);
  if (!id) return null;
  return { id, ref: str(r.ref).slice(0, 40), kind: str(r.kind).slice(0, 40), title: str(r.title).slice(0, 120) };
}

function parseResult(raw: unknown): ServiceProposalResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const recordId = str(r.record_id).slice(0, 64);
  if (!recordId) return null;
  return {
    record_id: recordId,
    kinds: Array.isArray(r.kinds) ? r.kinds.map(str).filter(Boolean).slice(0, 12) : [],
    batch_id: str(r.batch_id).slice(0, 64) || null,
    batch_ref: str(r.batch_ref).slice(0, 40) || null,
    orders: Array.isArray(r.orders) ? r.orders.map(parseOrder).filter((o): o is ServiceOrderRef => o !== null).slice(0, 12) : [],
    error: str(r.error).slice(0, 300) || null,
  };
}

/** True for anything that is a service card rather than an add-records card. */
export function isServiceProposal(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return r.type === 'service_proposal' || r.kind === 'service' || r.kind === 'service_order';
}

/**
 * A service card from a `service_proposal` event or a reloaded conversation.
 * A stored one may carry its draft under `draft` and its outcome under
 * `results`, so a placed card can never be placed again.
 */
export function parseServiceProposal(raw: unknown): ServiceProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const draft = r.draft && typeof r.draft === 'object' ? (r.draft as Record<string, unknown>) : r;
  const id = str(r.id) || str(draft.id);
  if (!id) return null;
  const rawRecords = Array.isArray(draft.records) ? draft.records : Array.isArray(r.records) ? r.records : [];
  const records: ServiceProposal['records'] = [];
  for (const item of rawRecords.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const recordId = str(rec.record_id).slice(0, 64);
    if (!recordId || records.some((existing) => existing.record_id === recordId)) continue;
    records.push({ record_id: recordId, title: str(rec.title).slice(0, 160) });
  }
  const rawRequested = Array.isArray(draft.requested) ? draft.requested : Array.isArray(r.requested) ? r.requested : [];
  const requested = rawRequested.map(str).map((text) => text.trim().slice(0, 120)).filter(Boolean).slice(0, 8);
  const status = str(r.status) as ServiceProposalStatus;
  return {
    id: id.slice(0, 64),
    status: STATUSES.has(status) ? status : 'draft',
    records,
    requested,
    note: (str(draft.note) || str(r.note)).slice(0, 500),
    // The service stores one row per order placed (`orders`, flat); a card
    // updated in this window carries per-record `results`.
    results: Array.isArray(r.orders)
      ? resultsFromOrders(r.orders)
      : Array.isArray(r.results)
        ? r.results.map(parseResult).filter((item): item is ServiceProposalResult => item !== null)
        : [],
  };
}

/** One stored row: {index, record_id, service, order_id, order_ref, error} (C4). */
export interface ServiceOrderRow {
  index: number;
  record_id: string;
  service: string | null;
  order_id: string | null;
  order_ref: string | null;
  error: string | null;
}

/** Per-record outcomes → the flat rows the service stores (≤ 80, index unique). */
export function ordersFromResults(results: ServiceProposalResult[]): ServiceOrderRow[] {
  const rows: ServiceOrderRow[] = [];
  const push = (row: Omit<ServiceOrderRow, 'index'>) => {
    if (rows.length < 80) rows.push({ index: rows.length, ...row });
  };
  for (const result of results) {
    const service = result.kinds.join('+').slice(0, 120) || null;
    if (result.error) {
      push({ record_id: result.record_id, service, order_id: null, order_ref: null, error: result.error.slice(0, 300) });
    } else if (result.orders.length) {
      for (const order of result.orders) {
        push({
          record_id: result.record_id,
          service: (order.title || order.kind).slice(0, 120) || null,
          order_id: order.id.slice(0, 64),
          order_ref: order.ref.slice(0, 64) || null,
          error: null,
        });
      }
    } else {
      // Placed, but the refs could not be read back: keep the batch ref.
      push({ record_id: result.record_id, service, order_id: null, order_ref: result.batch_ref, error: null });
    }
  }
  return rows;
}

/** The stored flat rows → per-record outcomes, in first-seen order. */
export function resultsFromOrders(rows: unknown[]): ServiceProposalResult[] {
  const out: ServiceProposalResult[] = [];
  for (const raw of rows.slice(0, 80)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const recordId = str(row.record_id).slice(0, 64);
    if (!recordId) continue;
    let result = out.find((item) => item.record_id === recordId);
    if (!result) {
      result = { record_id: recordId, kinds: [], batch_id: null, batch_ref: null, orders: [], error: null };
      out.push(result);
    }
    const service = str(row.service).slice(0, 120);
    const error = str(row.error).slice(0, 300);
    const orderId = str(row.order_id).slice(0, 64);
    const ref = str(row.order_ref).slice(0, 40);
    if (error) { result.error = error; continue; }
    if (orderId) result.orders.push({ id: orderId, ref, kind: '', title: service });
    else if (ref) result.batch_ref = ref;
  }
  // A record with any order placed counts as placed.
  for (const result of out) if (result.orders.length || result.batch_ref) result.error = null;
  return out;
}

// ── Matching the request to the catalogue ──────────────────────────────

/**
 * The words people use for each service are the catalogue's (`offer.synonyms`).
 * Phrases too general to name a service on their own ("certified copy of the EC" is
 * the EC, not a deed copy). They only break a tie when nothing more specific matched.
 */
const GENERIC = new Set(['certified copy', 'document copy', 'deed']);

const STOP = new Set(['the', 'and', 'for', 'copy', 'copies', 'get', 'apply', 'order', 'request', 'my', 'all', 'of', 'a', 'an', 'certified', 'certificate']);

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').split(/\s+/).filter(Boolean);

function hasPhrase(haystack: string, phrase: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
  return pattern.test(haystack);
}

/** How well one request names one offer; 0 is no match. */
function score(request: string, offer: ServiceOffer): number {
  const asked = ` ${words(request).join(' ')} `;
  let best = 0;
  for (const phrase of offer.synonyms) {
    if (hasPhrase(asked, phrase)) best = Math.max(best, GENERIC.has(phrase) ? 2 : 10 + phrase.length);
  }
  if (hasPhrase(asked, offer.label.toLowerCase())) best = Math.max(best, 40);
  const label = new Set(words(offer.label).filter((word) => word.length >= 3 && !STOP.has(word)));
  const shared = words(request).filter((word) => word.length >= 3 && !STOP.has(word) && label.has(word)).length;
  if (shared) best = Math.max(best, 5 * shared);
  return best;
}

/** The catalogue keys a request names: the best match for each requested phrase. */
export function matchOffers(requested: string[], offers: ServiceOffer[]): string[] {
  const picked = new Set<string>();
  for (const request of requested) {
    let top = 0;
    let keys: string[] = [];
    for (const offer of offers) {
      const value = score(request, offer);
      if (value > top) { top = value; keys = [offer.key]; } else if (value && value === top) keys.push(offer.key);
    }
    for (const key of keys) picked.add(key);
  }
  return offers.filter((offer) => picked.has(offer.key)).map((offer) => offer.key);
}

/** An offer the batch can file as is: a required question needs the full order form. */
export const needsDetails = (offer: ServiceOffer) => offer.fields.some((field) => field.required);

// ── Keys and outcome ───────────────────────────────────────────────────

function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * `asst:<proposalId>:<recordId>:<kind>` — one record's request. With several
 * services in one batch the kinds are joined; the server keys a batch on its
 * content too, so a changed selection must carry a new key.
 */
export function serviceOrderKey(proposalId: string, recordId: string, kinds: string[]): string {
  const joined = [...kinds].sort().join('+');
  const key = `asst:${proposalId}:${recordId}:${joined}`;
  return key.length <= 128 ? key : `asst:${proposalId}:${recordId}:${shortHash(joined)}`.slice(0, 128);
}

/** Tell the assistant what the browser did (C4). A record, not an authorisation. */
export async function reportServiceProposal(
  proposalId: string,
  status: Exclude<ServiceProposalStatus, 'draft'>,
  results: ServiceProposalResult[],
): Promise<void> {
  const response = await apiFetch(`${ASSISTANT_BASE}/proposals/${encodeURIComponent(proposalId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, results: ordersFromResults(results) }),
  });
  if (!response.ok && response.status !== 404) throw new Error(`The order result could not be saved (code ${response.status}).`);
}

const BATCH_ORDERS = `query AO($recordId:String,$includeClosed:Boolean) { web {
  orders(recordId:$recordId,includeClosed:$includeClosed) { id ref kind title batchId } } }`;

/** The orders one batch filed, by the server's own refs — never derived here. */
export async function ordersInBatch(recordId: string, batchId: string): Promise<ServiceOrderRef[]> {
  const data = await gql<{ web: { orders: Array<ServiceOrderRef & { batchId: string }> } }>(
    BATCH_ORDERS, { recordId, includeClosed: true },
  );
  return (data.web.orders ?? [])
    .filter((order) => order.batchId === batchId)
    .map(({ id, ref, kind, title }) => ({ id, ref, kind, title }));
}
