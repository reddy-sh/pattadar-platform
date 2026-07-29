/**
 * Dates of birth are entered and shown as DD/MM/YYYY (the Indian convention on
 * every ID the owner is copying from) but stored as ISO so sorting and the API
 * contract stay unambiguous.
 */

export function isoToDmy(iso?: string | null): string {
  const s = String(iso ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export function dmyToIso(dmy?: string | null): string {
  const s = String(dmy ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  const [, d, mo, y] = m;
  const day = Number(d);
  const mon = Number(mo);
  if (day < 1 || day > 31 || mon < 1 || mon > 12) return '';
  return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Format as the user types: 09061983 → 09/06/1983. */
export function maskDmyInput(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function isValidDmy(v?: string | null): boolean {
  const s = String(v ?? '').trim();
  if (!s) return true; // optional
  const iso = dmyToIso(s);
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
