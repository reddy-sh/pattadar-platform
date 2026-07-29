/**
 * CL-20/121 (client-side until the backend canonical table lands): merge
 * near-identical village spellings so charts never present a typo as a fact.
 * "Katragunta" / "Katraguntla" → one bucket named by the most frequent variant.
 */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Length-scaled merge threshold: longer locality names tolerate more edit
 * distance (CL-172: "Mahrajapuram"/"Markapuram" differ by 3 but are one
 * district). Short names never merge — they differ meaningfully. */
function mergeThreshold(len: number): number {
  if (len <= 4) return 0;
  if (len <= 9) return 2;
  return 3;
}

/** Map each input name to its canonical display spelling. */
export function canonicalizeVillages(names: string[]): Map<string, string> {
  const freq = new Map<string, { display: string; count: number }>();
  for (const raw of names) {
    const k = norm(raw);
    if (!k) continue;
    const e = freq.get(k);
    if (e) e.count += 1;
    else freq.set(k, { display: raw.trim(), count: 1 });
  }
  // Highest-frequency spellings become cluster anchors.
  //
  // The tie-break is NOT cosmetic. With one "Katragunta" and one "Katraguntla",
  // a count-only sort left the winner decided by input order — so the Passbooks
  // chip said one spelling while the parcel detail said the other, and the app
  // contradicted itself while warning the user about exactly that. Ties now
  // resolve on the name itself: shorter first, then alphabetical. Same inputs,
  // any order, same answer on every screen.
  const anchors: { key: string; display: string; count: number }[] = [];
  const sorted = [...freq.entries()].sort(
    (a, b) =>
      b[1].count - a[1].count ||
      a[0].length - b[0].length ||
      a[0].localeCompare(b[0]),
  );
  const assignment = new Map<string, string>();
  for (const [key, { display, count }] of sorted) {
    const hit = anchors.find(
      (a) => levenshtein(a.key, key) <= Math.min(mergeThreshold(a.key.length), mergeThreshold(key.length)),
    );
    if (hit) assignment.set(key, hit.display);
    else {
      anchors.push({ key, display, count });
      assignment.set(key, display);
    }
  }
  const out = new Map<string, string>();
  for (const raw of names) {
    const k = norm(raw);
    if (k) out.set(raw, assignment.get(k) ?? raw.trim());
  }
  return out;
}
