/** Missing details on Home: what the properties you own are missing, worked
 *  out from facts the property list's cards already carry. Types only from the
 *  API module, so its test never loads the query client. */
import type { RecordCard, WaitingItem } from './api';

export interface Gap { label: string; fix: string; to: string }

/**
 * What a property is missing, from facts the card already carries.
 *
 * Only gaps the owner can close from this app are listed. A deed number is
 * not: `deedLine` reads parcels.reg_doc_no, which nothing in W360 writes, so
 * "No deed recorded" would be a nag with no way to act on it. EC and tax
 * checks are not on the card at all and are not guessed at.
 */
export function gapsOf(r: RecordCard): Gap[] {
  const out: Gap[] = [];
  const land = r.classification === 'agri' || r.classification === 'open_plot';
  // _located() already falls back to the boundary's centre, so 0,0 here means
  // neither a pin nor a boundary.
  if (!r.lat && !r.lon) {
    out.push({ label: 'Not on the map', fix: 'Set location', to: `/app/records/${r.id}/map` });
  } else if (land && r.ring.length < 6) {
    out.push({ label: 'No boundary', fix: 'Draw boundary', to: `/app/records/${r.id}/map` });
  }
  // Not "Add document": that is the Add document shortcut's label, and the
  // shortcut's add flow (/app/papers?do=add) cannot be opened for one property
  // — no route mounts the property's own add drawer. Not "Open Documents"
  // either: on Home that already opens the Documents page (the shared-link
  // reminder, whereTo in Dashboard.tsx), and one label must not lead to two
  // places in one card. "Open record" is Home's word for this destination;
  // the record opens on its Documents tab.
  if (r.paperCount === 0) {
    out.push({ label: 'No documents', fix: 'Open record', to: `/app/records/${r.id}` });
  }
  return out;
}

/** A property you own and what it is missing. */
export interface Incomplete { r: RecordCard; gaps: Gap[] }

/** Missing details, worked out once for For you. `open` is every owned
 *  property with a gap and is what the counts say; `listed` is the part of it
 *  no reminder already names, which is what the disclosure lists. `tally` is,
 *  per kind of gap, how many properties carry it, in first-seen order. */
export interface Missing {
  owned: number;
  open: Incomplete[];
  listed: Incomplete[];
  tally: { label: string; n: number }[];
}

/** An account that holds nothing has nothing missing. */
export const NOTHING_MISSING: Missing = { owned: 0, open: [], listed: [], tally: [] };

/** Properties you own that are missing a location, a boundary or documents.
 *  Managed and watched land is somebody else's to complete. A property a
 *  reminder names is still counted, and is left out of `listed` only: the
 *  reminder row is where it is acted on. */
export function missingOf(cards: RecordCard[], waiting: WaitingItem[]): Missing {
  const owned = cards.filter((c) => c.stake === 'owned');
  const open = owned.map((r) => ({ r, gaps: gapsOf(r) })).filter((x) => x.gaps.length > 0);
  const named = new Set(waiting.map((w) => w.recordId).filter(Boolean));
  const tally = new Map<string, number>();
  for (const { gaps } of open) for (const g of gaps) tally.set(g.label, (tally.get(g.label) ?? 0) + 1);
  return {
    owned: owned.length,
    open,
    listed: open.filter((x) => !named.has(x.r.id)),
    tally: [...tally].map(([label, n]) => ({ label, n })),
  };
}
