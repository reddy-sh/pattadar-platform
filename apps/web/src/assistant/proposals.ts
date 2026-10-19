/**
 * Add-to-your-properties proposals (docs/specs/2026-10-04-assistant-write-actions.md).
 *
 * The service builds a proposal from the public record and streams it as a
 * `proposal` event; nothing here writes until the reader clicks Save on the
 * card. The write goes through the reader's own session (gql → gateway → api),
 * with an idempotency key per item so a double click, a retry or a reload
 * replays the first answer instead of adding the deed twice.
 */
import { apiFetch, gql } from '../api/client';
import { ASSISTANT_BASE } from './format';
import type { Proposal, ProposalItem, ProposalStatus, Stake } from './types';

export const STAKES: Array<{ key: Stake; label: string }> = [
  { key: 'owned', label: 'Owned' },
  { key: 'managed', label: 'Managed' },
  { key: 'watch', label: 'Watching' },
];

/** Your stake: Owned · Managed · Watching, the words every screen uses (naming standard 2.3). */
export const STAKE_WORD: Record<Stake, string> = { owned: 'Owned', managed: 'Managed', watch: 'Watching' };

const STATUSES = new Set<ProposalStatus>(['draft', 'saved', 'partial', 'dismissed']);
const STAKE_KEYS = new Set<Stake>(['owned', 'managed', 'watch']);
const UNITS = new Set(['ac', 'sq.yd', 'sq.ft']);

const str = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function parseItem(raw: unknown, fallbackIndex: number): ProposalItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rid = str(r.rid);
  if (!rid) return null;
  const unit = str(r.extent_unit);
  return {
    index: typeof r.index === 'number' ? r.index : fallbackIndex,
    rid,
    s_no: typeof r.s_no === 'string' || typeof r.s_no === 'number' ? r.s_no : null,
    kind: r.kind === 'parcel' ? 'parcel' : 'property',
    title: str(r.title),
    village: str(r.village),
    mandal: str(r.mandal),
    district: str(r.district),
    survey_no: str(r.survey_no),
    extent: num(r.extent),
    extent_unit: UNITS.has(unit) ? (unit as ProposalItem['extent_unit']) : null,
    doc_no: str(r.doc_no),
    sro: str(r.sro),
    reg_date: str(r.reg_date),
    consideration: num(r.consideration),
    // The draft now names it govt_value; older stored cards say market_value.
    market_value: num(r.govt_value) ?? num(r.market_value),
    txn_class: str(r.txn_class).toUpperCase(),
    exec_date: str(r.exec_date),
    plot_no: str(r.plot_no),
    house_no: str(r.house_no),
    land_class: str(r.land_class),
    boundary_north: str(r.boundary_north),
    boundary_south: str(r.boundary_south),
    boundary_east: str(r.boundary_east),
    boundary_west: str(r.boundary_west),
    seller_name: str(r.seller_name),
    buyer_name: str(r.buyer_name),
    source_ref: str(r.source_ref).slice(0, 64),
    buyer_matches_user: typeof r.buyer_matches_user === 'boolean' ? r.buyer_matches_user : null,
    record_id: str(r.record_id) || null,
    error: str(r.error) || null,
    ...(STAKE_KEYS.has(str(r.saved_stake) as Stake) ? { saved_stake: str(r.saved_stake) as Stake } : {}),
  };
}

/**
 * A proposal from a `proposal` event or from a reloaded conversation. A stored
 * one may carry its draft under `draft` and its outcome under `results`; the
 * outcome is merged onto the items so a saved card can never be saved again.
 */
export function parseProposal(raw: unknown): Proposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const draft = r.draft && typeof r.draft === 'object' ? (r.draft as Record<string, unknown>) : r;
  const id = str(r.id) || str(draft.id);
  if (!id) return null;
  const rawItems = Array.isArray(draft.items) ? draft.items : Array.isArray(r.items) ? r.items : [];
  const items = rawItems.slice(0, 10).map(parseItem).filter((item): item is ProposalItem => item !== null);
  if (!items.length) return null;
  if (Array.isArray(r.results)) {
    for (const result of r.results) {
      if (!result || typeof result !== 'object') continue;
      const res = result as Record<string, unknown>;
      const item = items.find((candidate) => candidate.index === res.index);
      if (!item) continue;
      item.record_id = str(res.record_id) || null;
      item.error = str(res.error) || null;
      if (STAKE_KEYS.has(str(res.stake) as Stake)) item.saved_stake = str(res.stake) as Stake;
    }
  }
  const status = str(r.status) as ProposalStatus;
  const stake = (str(r.stake) || str(draft.stake)) as Stake;
  const holdingId = str(r.holding_id) || str(draft.holding_id);
  return {
    id,
    status: STATUSES.has(status) ? status : 'draft',
    stake: STAKE_KEYS.has(stake) ? stake : null,
    items,
    ...(holdingId ? { holding_id: holdingId.slice(0, 64) } : {}),
  };
}

// ── Name matching ───────────────────────────────────────────────────────

const HONORIFICS = new Set(['sri', 'shri', 'smt', 'srimati', 'kum', 'mr', 'mrs', 'ms', 'dr', 'late', 'w', 'o', 's', 'd', 'h', 'c', 'garu']);

function nameTokens(name: string): string[] {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !HONORIFICS.has(token));
}

/** At most one edit apart — transliteration differs ("Ramaiah" / "Ramaiahh"). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Whether any buyer in the deed could be the signed-in person. `null` when it
 * cannot be told (no profile name, no buyer) — then no warning is shown. Deeds
 * write names as "R. Ramaiah S/o Venkaiah", so a shared given name is enough:
 * this is a soft nudge, never a block.
 */
export function buyerMatchesUser(buyers: string, userName: string | undefined | null): boolean | null {
  const mine = nameTokens(userName ?? '');
  const theirs = nameTokens(buyers);
  if (!mine.length || !theirs.length) return null;
  return mine.some((token) => theirs.some((other) => nearlyEqual(token, other)));
}

// ── Saving ──────────────────────────────────────────────────────────────

/** The record a proposal item becomes (contract C1, camelCase on the wire). */
export interface ProposalRecordInput {
  kind: 'parcel' | 'property';
  title: string;
  /** Never sent: the corpus states no classification, and a card default
   *  would be filed as the owner's word. The server derives it (spec B4). */
  classification?: string;
  stake: Stake;
  ownerName?: string;
  village: string;
  mandal: string;
  district: string;
  extent?: number;
  extentUnit?: string;
  purchasePrice?: number;
  /** The registry's government value (spec §0.6: never the market estimate). */
  govtValue?: number;
  acquisitionMode?: string;
  execDate?: string;
  plotNo?: string;
  doorNo?: string;
  landClass?: string;
  surveyNo?: string;
  docNo?: string;
  sro?: string;
  regDate?: string;
  boundaryNorth?: string;
  boundarySouth?: string;
  boundaryEast?: string;
  boundaryWest?: string;
  sellerName?: string;
  buyerName?: string;
  sourceRef?: string;
  origin: 'assistant';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How the land was acquired, from the registry's transaction class. A class
 *  that transfers no title (mortgage, receipt, lease…) leaves it unset, so the
 *  Overview asks the owner (property-overview spec §0.5). */
export function modeOfTxn(txnClass: string): string {
  const t = txnClass.trim().toUpperCase();
  if (t === 'SALE') return 'sale';
  if (t === 'GIFT') return 'gift';
  if (t === 'PARTITION') return 'partition';
  if (t === 'SETTLEMENT') return 'settlement';
  if (t === 'AGREEMENT_OF_SALE' || t === 'AGREEMENT') return 'agreement';
  return '';
}

/** A plot or door number with no letter or digit in it ("()", "-") is no number. */
const cleanNo = (v: string) => (/[\p{L}\p{N}]/u.test(v) ? v.trim() : '');

/** The values sent for one item. Watching copies the property facts only —
 *  the parties' names stay out of the account (spec §5 question 6). */
export function recordInputFor(item: ProposalItem, stake: Stake): ProposalRecordInput {
  const keep = (value: string) => value.trim() || undefined;
  const unit = item.extent_unit ?? (item.kind === 'parcel' ? 'ac' : 'sq.yd');
  const input: ProposalRecordInput = {
    kind: item.kind,
    title: item.title.trim() || (item.survey_no.trim() ? `Sy ${item.survey_no.trim()}` : ''),
    stake,
    village: item.village.trim(),
    mandal: item.mandal.trim(),
    district: item.district.trim(),
    extentUnit: unit,
    surveyNo: keep(item.survey_no),
    docNo: keep(item.doc_no),
    sro: keep(item.sro),
    regDate: ISO_DATE.test(item.reg_date.trim()) ? item.reg_date.trim() : undefined,
    boundaryNorth: keep(item.boundary_north),
    boundarySouth: keep(item.boundary_south),
    boundaryEast: keep(item.boundary_east),
    boundaryWest: keep(item.boundary_west),
    sourceRef: keep(item.source_ref),
    origin: 'assistant',
  };
  if (item.extent !== null && item.extent > 0) input.extent = item.extent;
  if (item.market_value !== null && item.market_value > 0) input.govtValue = item.market_value;
  const mode = modeOfTxn(item.txn_class);
  if (mode) input.acquisitionMode = mode;
  if (ISO_DATE.test(item.exec_date.trim())) input.execDate = item.exec_date.trim();
  // A parcel has no plot or door number; the server refuses one on a parcel save.
  if (item.kind === 'property') {
    input.plotNo = keep(cleanNo(item.plot_no));
    input.doorNo = keep(cleanNo(item.house_no));
  }
  input.landClass = keep(item.land_class);
  if (stake !== 'watch') {
    if (item.consideration !== null && item.consideration > 0) input.purchasePrice = item.consideration;
    input.sellerName = keep(item.seller_name);
    input.buyerName = keep(item.buyer_name);
    input.ownerName = keep(item.buyer_name);
  }
  // Undefined keys are dropped by JSON.stringify, so an unknown fact is omitted, not blanked.
  return input;
}

const SAVE_RECORD = `mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }`;

/**
 * The idempotency key for one item's write. The stake is part of it: the
 * middleware replays the first answer for a key whatever the body says, so a
 * card reloaded as a draft and saved under another stake must reach the
 * server (which refuses a stake that differs from the deed's saved one)
 * instead of replaying the first record as if it were saved the new way.
 */
export function saveKey(proposalId: string, index: number, stake: Stake): string {
  return `asst:${proposalId}:${index}:${stake}`;
}

/** A short, stable hash of a request's content, to key retries of one exact request. */
function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** One item's write. Resolves to the record id; '' is a W360 refusal. */
export async function saveProposalItem(proposalId: string, item: ProposalItem, stake: Stake): Promise<string> {
  const data = await gql<{ web: { saveRecord: string } }>(
    SAVE_RECORD,
    { input: recordInputFor(item, stake) },
    { idempotencyKey: saveKey(proposalId, item.index, stake) },
  );
  return data.web.saveRecord ?? '';
}

const CREATE_HOLDING = `mutation CCP($name:String!,$recordIds:[String!]!,$note:String! = "") {
  web { createCombinedProperty(name:$name,recordIds:$recordIds,note:$note) } }`;

/** The longest holding name the api accepts (createCombinedProperty). */
export const HOLDING_NAME_MAX = 120;

const HOLDING_MEMBERS = `{ web { combinedProperties { id name members { recordId } } } }`;

export interface HoldingRef { id: string; name: string }

type HoldingRows = { web: { combinedProperties: Array<{ id: string; name: string; members: Array<{ recordId: string }> }> } };

/** The holding whose members are exactly these records (only an exact set,
 *  never a superset or subset), or null. */
export async function existingHoldingFor(recordIds: string[]): Promise<HoldingRef | null> {
  const data = await gql<HoldingRows>(HOLDING_MEMBERS);
  return exactHolding(data.web.combinedProperties ?? [], recordIds);
}

/** The holding whose members are exactly `recordIds` (order and repeats
 *  ignored), or null — a superset or subset is a different holding. */
export function exactHolding(
  holdings: Array<{ id: string; name?: string | null; members: Array<{ recordId: string }> }>,
  recordIds: string[],
): HoldingRef | null {
  const wanted = [...new Set(recordIds)].sort().join(',');
  const found = holdings.find(
    (holding) => [...new Set(holding.members.map((member) => member.recordId))].sort().join(',') === wanted,
  );
  return found ? { id: found.id, name: found.name ?? '' } : null;
}

/** Group records saved from one proposal (all one stake, D1); null means the
 *  server refused. A holding that already has exactly these members is reused
 *  (and keeps its own name, which is what is returned), so a retry, a reload
 *  or a second tab never makes two. The key carries the name and members: a
 *  refusal is memoized like any clean answer, so a changed request must not
 *  replay it. */
export async function groupAsHolding(proposalId: string, name: string, recordIds: string[]): Promise<HoldingRef | null> {
  const existing = await existingHoldingFor(recordIds).catch(() => null);
  if (existing) return existing;
  const data = await gql<{ web: { createCombinedProperty: string } }>(
    CREATE_HOLDING,
    { name, recordIds, note: '' },
    { idempotencyKey: `asst:${proposalId}:holding:${contentHash(`${name}\n${[...recordIds].sort().join(',')}`)}` },
  );
  const id = data.web.createCombinedProperty ?? '';
  if (!id) return null;
  // The server reuses an exact-membership holding it finds (a first press
  // whose answer was lost), without renaming it: read back the name it has.
  const stored = await existingHoldingFor(recordIds).catch(() => null);
  return { id, name: stored?.id === id && stored.name ? stored.name : name };
}

// ── Holding name and look-alikes (D2) ───────────────────────────────────

const titleCase = (text: string) => text.toLowerCase().replace(/(^|[\s.(/-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());

/** The first party in a deed's party list, without "S/o …" and the like. */
function firstParty(names: string): string {
  const first = names.split(/,|;|&|\band\b/i)[0] ?? '';
  return first.split(/\b[SWDC]\s*\/\s*O\b/i)[0].replace(/\s+/g, ' ').trim();
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, { value: string; count: number }>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1; else counts.set(key, { value, count: 1 });
  }
  let best = { value: '', count: 0 };
  for (const entry of counts.values()) if (entry.count > best.count) best = entry;
  return best.value;
}

/** "Chintalapudi Ranga Subba Reddy — Guntur (managed)": the most common party
 *  name and the main place, so the reader rarely has to type one. */
export function defaultHoldingName(items: ProposalItem[], stake: Stake): string {
  const party = mostCommon(items.map((item) => firstParty(item.buyer_name || item.seller_name)));
  const place = mostCommon(items.map((item) => item.village.trim()))
    || mostCommon(items.map((item) => item.mandal.trim()))
    || mostCommon(items.map((item) => item.district.trim()));
  const head = [party && titleCase(party), place && titleCase(place)].filter(Boolean).join(' — ') || 'Holding';
  const tail = stake === 'managed' ? ' (managed)' : '';
  return `${head.slice(0, HOLDING_NAME_MAX - tail.length).trim()}${tail}`;
}

const PLOT_NO = /\b(?:plot|house|h\.?\s*no|d\.?\s*no|door\s*no|flat|site)\.?\s*(?:no\.?)?\s*[:#-]?\s*([0-9][0-9a-z/-]*)/i;
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9/]/g, '');

/** The house no./plot of a deed, from its title ("Plot 96A, RAMANAYYAPETA"). */
export function plotNumber(item: ProposalItem): string {
  const match = PLOT_NO.exec(item.title);
  return match ? squash(match[1]) : '';
}

/**
 * Items that look like the same property as an earlier one: the same village
 * and the same house no./plot (and survey, when both have one); with no plot on
 * either, the same village and survey number. index → the earlier item's index.
 * A soft hint only — the reader decides.
 */
export function lookAlikes(items: ProposalItem[]): Map<number, number> {
  const out = new Map<number, number>();
  items.forEach((item, position) => {
    const village = squash(item.village);
    if (!village) return;
    const plot = plotNumber(item);
    const survey = squash(item.survey_no);
    for (const earlier of items.slice(0, position)) {
      if (squash(earlier.village) !== village) continue;
      const otherPlot = plotNumber(earlier);
      const otherSurvey = squash(earlier.survey_no);
      const same = plot || otherPlot
        ? plot === otherPlot && (!survey || !otherSurvey || survey === otherSurvey)
        : Boolean(survey) && survey === otherSurvey;
      if (same) { out.set(item.index, earlier.index); break; }
    }
  });
  return out;
}

/** Tell the assistant what the browser did (C4). A record, not an authorisation. */
export async function reportProposal(
  proposalId: string,
  status: Exclude<ProposalStatus, 'draft'>,
  items: ProposalItem[],
  holdingId?: string,
): Promise<void> {
  const response = await apiFetch(`${ASSISTANT_BASE}/proposals/${encodeURIComponent(proposalId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      results: items.map((item) => ({
        index: item.index, record_id: item.record_id, error: item.error,
        ...(item.record_id && item.saved_stake ? { stake: item.saved_stake } : {}),
      })),
      ...(holdingId ? { holding_id: holdingId } : {}),
    }),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Proposal outcome HTTP ${response.status}`);
}
