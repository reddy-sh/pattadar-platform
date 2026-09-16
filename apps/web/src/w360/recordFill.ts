/** What is still blank on a record, and which blank to close first.
 *
 *  A land record in this system is nine parts, and the ones that matter most
 *  are the ones the owner cannot produce from memory in a phone call: where
 *  the land actually is, what it looks like, and who is standing on it. The
 *  header prints this as a count and a bar because an owner's real question on
 *  arriving at a record is not "what is here" but "what is missing" — and
 *  until now the answer was spread across nine tabs, each of which had to be
 *  opened to find out it was empty.
 *
 *  Two orders live here, deliberately:
 *
 *   - the array order is the DISPLAY order, and the bar's segments are drawn
 *     in it, so the bar does not reshuffle itself as parts get filled in;
 *   - `rank` is the URGENCY order, and it drives both the words the meter
 *     prints ("no pin · no photos · nobody assigned") and the one action the
 *     header offers. A pin outranks an extent because an extent can be read
 *     off the deed later, and nobody can be sent to the land without a pin.
 *
 *  Kept free of React and of the query layer so the rule can be tested on its
 *  own: this is the sentence the header asserts about someone's property, and
 *  getting it wrong ("9 of 9" on a record with no boundary) is worse than not
 *  printing it.
 */
import type { RecordDetail } from './api';

export interface FillPart {
  key: string;
  /** What is missing, in the words the meter prints: "no pin". Lower case —
   *  it is read as a run inside a sentence, not as a heading. */
  gap: string;
  /** The header button's promise when this is the next thing to do:
   *  "Next: place a pin". A verb, because the button does something. */
  next: string;
  /** Where that button goes, under `/app/records/:id`. '' is the Papers tab. */
  to: string;
  /** Urgency. 1 is the most pressing; see the note above on the two orders. */
  rank: number;
  done: boolean;
}

export interface RecordFill {
  parts: FillPart[];
  done: number;
  total: number;
  /** The unfilled parts, most pressing first. */
  gaps: FillPart[];
  /** The single thing the header offers to do, or null on a full record. */
  next: FillPart | null;
}

/** A pin at 0,0 is not a pin — it is the Gulf of Guinea, and this app has
 *  printed it as a location before. Same rule as `coords` in ui.tsx, which
 *  returns '' for the same reason; duplicated rather than imported so this
 *  module stays free of React. */
function hasPin(lat: number, lon: number): boolean {
  return !!(lat || lon);
}

/** A ring is a flat [lat,lon,…]; three corners is the fewest that enclose
 *  anything, so six numbers is the floor for calling a boundary drawn. */
function hasBoundary(ring: number[]): boolean {
  return (ring?.length ?? 0) >= 6;
}

export function recordFill(rec: RecordDetail): RecordFill {
  const parts: FillPart[] = [
    {
      key: 'papers',
      gap: 'no papers',
      next: 'file a paper',
      to: '',
      rank: 5,
      done: rec.paperCount > 0,
    },
    {
      key: 'extent',
      gap: 'no extent',
      next: 'record the extent',
      to: '',
      rank: 8,
      done: rec.extent > 0,
    },
    {
      key: 'place',
      gap: 'no village',
      next: 'name the village',
      to: '',
      rank: 9,
      // The village is what every map lookup and every desk assignment keys
      // off. `placeLine` is built from it on the server, so either answers.
      done: !!(rec.village || rec.placeLine).trim(),
    },
    {
      key: 'pin',
      gap: 'no pin',
      next: 'place a pin',
      to: 'map',
      rank: 1,
      done: hasPin(rec.lat, rec.lon),
    },
    {
      key: 'boundary',
      gap: 'no boundary',
      next: 'draw the boundary',
      to: 'map',
      rank: 4,
      done: hasBoundary(rec.ring),
    },
    {
      key: 'photos',
      gap: 'no photos',
      next: 'add a photo',
      to: 'photos',
      rank: 2,
      done: rec.photoCount > 0,
    },
    {
      key: 'features',
      gap: 'nothing on the land',
      next: 'add a feature',
      to: 'features',
      rank: 7,
      done: rec.featureCount > 0,
    },
    {
      key: 'people',
      gap: 'nobody assigned',
      next: 'assign someone',
      to: 'people',
      rank: 3,
      done: rec.peopleCount > 0,
    },
    {
      key: 'money',
      // Either half counts: a record can know what it cost, or what it is
      // worth now, and only one of those is on the deed.
      gap: 'no money recorded',
      next: 'record what it cost',
      to: 'money',
      rank: 6,
      done: !!rec.boughtYear || rec.marketValue > 0,
    },
  ];
  const gaps = parts.filter((p) => !p.done).sort((a, b) => a.rank - b.rank);
  return {
    parts,
    done: parts.filter((p) => p.done).length,
    total: parts.length,
    gaps,
    next: gaps[0] ?? null,
  };
}
