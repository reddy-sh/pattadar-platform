/**
 * Which village map a record means, when the village name alone is not an
 * address.
 *
 * Shipped maps are keyed `state/district/mandal/village` (`mapKey`) because the
 * name repeats: the 2021 Prakasam archive has MYLAVARAM in Addanki and in
 * Chimakurthi and POTHAVARAM in four mandals. A record carries its village,
 * mandal and district as free text — typed, or read off a deed — so the lookup
 * narrows by what the record says and refuses to guess:
 *
 *   1. a full key is an exact match;
 *   2. one village of that name anywhere is that village (every village a
 *      flat index could find is still found);
 *   3. several: the one whose mandal the record names, then the one whose
 *      district it names;
 *   4. still several, or none: no map. Another mandal's plots under a parcel
 *      are worse than no plots — the owner would fence the wrong field.
 *
 * Pure, so the rule is testable without a network.
 */
import { villageKey } from '@pattadar/core';

export interface Placed {
  village: string;
  key: string;
  mandal?: string;
  district?: string;
  uploaded?: boolean;
}

export function resolveVillage<T extends Placed>(rows: T[], ref: string, within: string[] = []): T | null {
  if (!ref) return null;
  if (ref.includes('/')) return rows.find((r) => r.key === ref) ?? null;
  const want = villageKey(ref);
  if (!want) return null;
  const named = rows.filter((r) => villageKey(r.village) === want);
  if (named.length <= 1) return named[0] ?? null;
  const said = new Set(within.map(villageKey).filter(Boolean));
  const inMandal = named.filter((r) => r.mandal && said.has(villageKey(r.mandal)));
  if (inMandal.length === 1) return inMandal[0];
  const pool = inMandal.length ? inMandal : named;
  const inDistrict = pool.filter((r) => r.district && said.has(villageKey(r.district)));
  return inDistrict.length === 1 ? inDistrict[0] : null;
}

/**
 * Shipped rows and uploaded rows as one list. An upload is keyed by the folded
 * village name alone (the upload route predates mandals), so it replaces the
 * shipped village of that name only when there is exactly one — and then takes
 * that village's place, mandal and district with it, which is how re-uploading
 * still corrects a village. An upload whose name has several shipped villages
 * cannot say which it corrects, so it is listed on its own, unplaced, and the
 * shipped ones stay.
 */
export function mergeUploads<T extends Placed & { state?: string }>(shipped: T[], uploads: T[]): T[] {
  const out = new Map(shipped.map((s) => [s.key, s]));
  for (const up of uploads) {
    const want = villageKey(up.village);
    const same = shipped.filter((s) => villageKey(s.village) === want);
    if (same.length === 1) {
      const s = same[0];
      out.delete(s.key);
      out.set(up.key, { ...up, state: s.state, district: s.district, mandal: s.mandal });
    } else {
      out.set(up.key, up);
    }
  }
  return [...out.values()];
}

/** Whether a record's own village and mandal agree with an open village map.
 *
 *  When the name is unique the village alone decides, as it always has —
 *  records spell mandals their own way ("Konakalamitla" for Konakanamitla) and
 *  that must not cost a parcel its plot. Only when another shipped village
 *  shares the name (`ambiguous`) does the mandal have to agree; a record with
 *  no mandal is then still offered, so an owner can place it by hand. */
export function recordInVillage(
  rec: { village?: string; mandal?: string },
  entry: { village: string; mandal?: string } | null | undefined,
  ambiguous = false,
): boolean {
  if (!entry) return false;
  if (villageKey(rec.village ?? '') !== villageKey(entry.village)) return false;
  if (!ambiguous) return true;
  const rm = villageKey(rec.mandal ?? '');
  const em = villageKey(entry.mandal ?? '');
  return !rm || !em || rm === em;
}
