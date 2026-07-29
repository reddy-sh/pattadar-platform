/**
 * CL-257 (client-side stopgap): TOKEN-level canonicalization for person names.
 * Whole-name edit distance can't catch "Telukatla Saraswathi" vs
 * "Telukutla Nasarureddy" sharing one misspelled surname — tokens can.
 * Display of legal names is NEVER rewritten; this powers grouping keys and
 * the data-quality flag only. True merge happens in the backend.
 */
import { canonicalizeVillages } from './villages';

/** Map each full name to its token-canonicalized form. */
export function canonicalizeNameTokens(names: string[]): Map<string, string> {
  const tokens: string[] = [];
  for (const n of names) for (const t of n.split(/\s+/)) if (t.length > 3) tokens.push(t);
  const tokenCanon = canonicalizeVillages(tokens);
  const out = new Map<string, string>();
  for (const n of names) {
    out.set(
      n,
      n
        .split(/\s+/)
        .map((t) => (t.length > 3 ? (tokenCanon.get(t) ?? t) : t))
        .join(' '),
    );
  }
  return out;
}

/** First (variant, canonical) token pair that differs — for the attention flag. */
export function nameVariantPair(names: string[]): [string, string] | null {
  const tokens: string[] = [];
  for (const n of names) for (const t of n.split(/\s+/)) if (t.length > 3) tokens.push(t);
  const tokenCanon = canonicalizeVillages(tokens);
  for (const [raw, canon] of tokenCanon.entries()) {
    if (raw.trim() && raw.trim() !== canon) return [raw, canon];
  }
  return null;
}
