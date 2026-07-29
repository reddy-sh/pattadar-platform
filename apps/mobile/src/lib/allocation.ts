/**
 * Estate allocation (CL-457).
 *
 * Shares are only meaningful as a SET — one member's percentage is a statement
 * about everyone else's. So the whole allocation is edited together, validated
 * as a whole, and written as one atomic change.
 */
import { equalSplit } from './family';

export interface AllocRow {
  id: string;
  name: string;
  relation: string;
  photo?: string;
  isSelf: boolean;
  pct: number;
}

/** Hindu Succession Act Class I heirs — spouse and children share equally. */
const CLASS_I = new Set(['spouse', 'wife', 'husband', 'son', 'daughter', 'mother']);

export function isClassI(relation: string): boolean {
  return CLASS_I.has((relation || '').trim().toLowerCase());
}

export function totalPct(rows: AllocRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (Number(r.pct) || 0), 0) * 10) / 10;
}

/** Everyone in the group, equally. */
export function splitEqually(rows: AllocRow[]): AllocRow[] {
  const shares = equalSplit(rows.length);
  return rows.map((r, i) => ({ ...r, pct: shares[i] ?? 0 }));
}

/**
 * The statutory default: Class I heirs share equally, everyone else gets 0.
 * Falls back to an equal split when nobody is a recognised Class I heir, so
 * the button never silently does nothing.
 */
export function splitStatutory(rows: AllocRow[]): AllocRow[] {
  const eligible = rows.filter((r) => isClassI(r.relation));
  if (eligible.length === 0) return splitEqually(rows);
  const shares = equalSplit(eligible.length);
  let i = 0;
  return rows.map((r) => (isClassI(r.relation) ? { ...r, pct: shares[i++] ?? 0 } : { ...r, pct: 0 }));
}

export function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

export function stepPct(current: number, delta: number): number {
  return clampPct((Number(current) || 0) + delta);
}

export interface AllocWarning {
  kind: 'zero' | 'majority' | 'total';
  message: string;
}

/** What the user must knowingly confirm before this is written. */
export function allocationWarnings(rows: AllocRow[]): AllocWarning[] {
  const out: AllocWarning[] = [];
  const total = totalPct(rows);
  if (total !== 100) {
    out.push({
      kind: 'total',
      message:
        total < 100
          ? `Shares total ${total}% — ${Math.round((100 - total) * 10) / 10}% is unallocated.`
          : `Shares total ${total}% — that is more than the whole estate.`,
    });
  }
  const zeroed = rows.filter((r) => !r.isSelf && (Number(r.pct) || 0) === 0);
  if (zeroed.length > 0 && rows.some((r) => (Number(r.pct) || 0) > 0)) {
    out.push({
      kind: 'zero',
      message: `${zeroed.map((r) => r.name).join(', ')} would inherit nothing.`,
    });
  }
  const major = rows.find((r) => (Number(r.pct) || 0) > 50);
  if (major && rows.length > 1) {
    out.push({ kind: 'majority', message: `${major.name} would take ${major.pct}% of the estate.` });
  }
  return out;
}

/** "100% · 15 Ac 16 C" — a percentage means nothing without the land. */
export function shareInLand(pct: number, formatted: string): string {
  return `${Math.round((Number(pct) || 0) * 10) / 10}%${formatted ? ` · ${formatted}` : ''}`;
}
