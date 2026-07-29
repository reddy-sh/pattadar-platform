/** Family-screen helpers — pure, testable (CL-61/63/80). */

export function pluralize(n: number, word: string): string {
  return `${n} ${n === 1 ? word : pluralOf(word)}`;
}

/**
 * English plurals, for the handful of shapes this app actually uses.
 *
 * Appending a bare "s" produced "propertys" the moment "holding" was replaced
 * with "property" — a consonant+y word needs -ies. Kept deliberately small:
 * these are our own nouns, not arbitrary input.
 */
export function pluralOf(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Plain count of everyone in the group, the owner included (CL-420). */
export function memberCountLabel(rowCount: number, includesSelf: boolean): string {
  if (includesSelf && rowCount === 1) return 'Just you';
  return pluralize(rowCount, 'member');
}

export type ShareTone = 'ok' | 'warn' | 'error';

/** CL-63: explicit validation state for heir share totals. */
export function shareState(totalPct: number): { tone: ShareTone; label: string } {
  const t = Math.round(totalPct * 10) / 10;
  if (t === 100) return { tone: 'ok', label: 'Heir shares total 100% ✓' };
  if (t > 100) return { tone: 'error', label: `Heir shares total ${t}% — over-allocated` };
  return { tone: 'warn', label: `Heir shares total ${t}% · ${Math.round((100 - t) * 10) / 10}% unallocated` };
}

/** CL-62: dedupe relation/role when they resolve to the same token. */
export function relationLine(relation: string, role: string): string {
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const r = cap(relation);
  const ro = cap(role);
  if (!r) return ro;
  if (!ro || ro.toLowerCase() === r.toLowerCase()) return r;
  return `${r} · ${ro}`;
}

/** CL-69: humanize uid-shaped names ("sankara.telukutla" → "Sankara Telukutla"). */
export function displayName(name: string): string {
  if (!name) return '—';
  if (/^[a-z0-9]+([._][a-z0-9]+)+$/.test(name)) {
    return name
      .split(/[._]/)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(' ');
  }
  return name;
}

/** CL-274: first TWO letters of the given name — Sankara/Swetha/Sloka become
 * SA/SW/SL (surname initials collide inside one family by definition). */
export function initialsFor(name: string): string {
  const n = displayName(name);
  const first = n.split(/\s+/).filter(Boolean)[0] ?? '';
  return first.slice(0, 2).toUpperCase() || '?';
}

// No alarm red — a person is not an error state (CL-364).
const AVATAR_PALETTE = ['#1565c0', '#2e7d32', '#6a1b9a', '#00838f', '#4e5b8f', '#8d6e63'];
/** Stable per-name color from a tiny hash. */
export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/** CL-269: an unallocated warning on a group with no holdings is noise. */
export function showShareWarning(heirCount: number, tone: ShareTone, landCount: number): boolean {
  return heirCount > 0 && tone !== 'ok' && landCount > 0;
}

/** CL-271/273: equal statutory split, integer-friendly (remainder to first). */
export function equalSplit(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(1000 / n) / 10;
  const shares = Array.from({ length: n }, () => base);
  shares[0] = Math.round((100 - base * (n - 1)) * 10) / 10;
  return shares;
}

/**
 * A 100% total says the arithmetic adds up, not that the allocation is sound.
 * One heir absorbing everything while other recorded members get nothing is a
 * succession worth questioning — especially after members are removed and the
 * survivor silently inherits the whole share.
 */
export function heirCoverageNote(memberCount: number, heirCount: number): string | null {
  const others = memberCount - 1; // the owner's own node is not an heir
  if (others <= 0 || heirCount === 0) return null;
  if (heirCount >= others) return null;
  return `${heirCount} of ${others} recorded ${others === 1 ? 'member is' : 'members are'} designated an heir`;
}

/**
 * A group that holds land but designates NO heirs is the most consequential
 * succession gap there is — and it is silent, because there are no shares to
 * add up. `showShareWarning` needs at least one heir before it says anything,
 * so this is the case it structurally cannot catch.
 */
export function noHeirsWarning(memberCount: number, heirCount: number, landCount: number): string | null {
  if (landCount <= 0 || heirCount > 0) return null;
  if (memberCount <= 1) return 'No one is recorded to inherit this land yet';
  return 'No heirs designated — this land has no succession record';
}
