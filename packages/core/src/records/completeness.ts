/**
 * Completeness scoring, restriction derivation and expiry horizon
 * (CL-292/293/295/297/298/301).
 *
 * The load-bearing rule: `unknown` is missing, `not_available` is answered.
 * A field the owner has deliberately marked N/A must never drag the score
 * down, or the score punishes people for telling the truth about their land.
 */
import { GROUP_ORDER, fieldsFor, type FieldGroup, type FieldSource, type FieldState, type HoldingKind } from './registry';

export interface FieldValue {
  key: string;
  state: FieldState;
  value?: string | null;
  source?: FieldSource;
  sourceRef?: string | null;
  verifiedAt?: string | null;
  expiresAt?: string | null;
  naReason?: string | null;
}

export interface GroupScore {
  group: FieldGroup;
  filled: number;
  total: number;
  missing: number;
}

export interface Completeness {
  pct: number;
  missing: number;
  criticalMissing: number;
  groups: GroupScore[];
  /** First Tier-1 gap — what the header ring jumps to (CL-293). */
  firstCriticalKey: string | null;
}

const stateOf = (values: Map<string, FieldValue>, key: string): FieldState =>
  values.get(key)?.state ?? 'unknown';

export function scoreRecord(kind: HoldingKind, values: FieldValue[]): Completeness {
  const byKey = new Map(values.map((v) => [v.key, v]));
  const defs = fieldsFor(kind);

  let earned = 0;
  let possible = 0;
  let missing = 0;
  let criticalMissing = 0;
  let firstCriticalKey: string | null = null;

  const groups = new Map<FieldGroup, GroupScore>();
  for (const def of defs) {
    const state = stateOf(byKey, def.key);
    const g = groups.get(def.group) ?? { group: def.group, filled: 0, total: 0, missing: 0 };
    // N/A leaves the denominator: an answered field is not an incomplete one.
    if (state !== 'not_available') {
      possible += def.weight;
      g.total += 1;
    }
    if (state === 'filled') {
      earned += def.weight;
      g.filled += 1;
    } else if (state === 'unknown') {
      missing += 1;
      g.missing += 1;
      if (def.tier === 1) {
        criticalMissing += 1;
        if (!firstCriticalKey) firstCriticalKey = def.key;
      }
    }
    groups.set(def.group, g);
  }

  return {
    pct: possible === 0 ? 100 : Math.round((earned / possible) * 100),
    missing,
    criticalMissing,
    groups: GROUP_ORDER.filter((g) => groups.has(g)).map((g) => groups.get(g)!),
    firstCriticalKey,
  };
}

export type RestrictionKind = 'assigned' | 'prohibited_22a' | 'agency_ltr';

export interface Restriction {
  kind: RestrictionKind;
  message: string;
}

/**
 * CL-298: restrictions override completeness — a fully documented assigned
 * parcel is still not freely sellable, so these are stated as facts about
 * transferability, not as gaps to fill.
 */
export function restrictionsFor(values: FieldValue[]): Restriction[] {
  const byKey = new Map(values.map((v) => [v.key, v]));
  const val = (k: string) =>
    byKey.get(k)?.state === 'filled' ? String(byKey.get(k)?.value ?? '') : '';
  const out: Restriction[] = [];
  const classification = val('land_classification');
  // CL-301: classification drives the flag; an explicit flag also stands alone.
  if (classification === 'assigned_dform' || val('assigned_restriction') === 'true') {
    out.push({
      kind: 'assigned',
      message: 'Assigned land — sale is restricted under the AP Assigned Lands Act.',
    });
  }
  if (val('prohibited_22a') === 'listed') {
    out.push({
      kind: 'prohibited_22a',
      message: 'Listed under Section 22A — registration is prohibited.',
    });
  }
  if (val('agency_area_ltr') === 'true') {
    out.push({
      kind: 'agency_ltr',
      message: 'Agency area — transfer is restricted to Scheduled Tribes (LTR).',
    });
  }
  return out;
}

/** True when `land_classification = assigned_dform` implies the restriction flag. */
export function derivedAssignedRestriction(classification: string): boolean {
  return classification === 'assigned_dform';
}

export interface ExpiryItem {
  key: string;
  expiresAt: string;
  daysLeft: number;
  /** 90 / 60 / 30 / 0 horizon bucket (CL-301). */
  bucket: 90 | 60 | 30 | 0;
}

/** CL-297/301: what Upcoming should show, bucketed by how near it is. */
export function expiringFields(values: FieldValue[], now: Date, horizonDays = 90): ExpiryItem[] {
  const day = 86_400_000;
  const out: ExpiryItem[] = [];
  for (const v of values) {
    if (!v.expiresAt || v.state !== 'filled') continue;
    const d = new Date(v.expiresAt);
    if (Number.isNaN(d.getTime())) continue;
    const daysLeft = Math.ceil((d.getTime() - now.getTime()) / day);
    if (daysLeft > horizonDays) continue;
    const bucket: 90 | 60 | 30 | 0 = daysLeft <= 0 ? 0 : daysLeft <= 30 ? 30 : daysLeft <= 60 ? 60 : 90;
    out.push({ key: v.key, expiresAt: v.expiresAt, daysLeft, bucket });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface Conflict {
  key: string;
  govtValue: string;
  manualValue: string;
}

/**
 * CL-299: a government pull must never silently overwrite what the owner
 * typed. Incoming values are upserted per (parcel, field); where they differ
 * from a manual entry the manual value is KEPT and a conflict is reported for
 * the owner to resolve.
 */
export function mergeGovtPayload(
  current: FieldValue[],
  incoming: { key: string; value: string; sourceRef?: string; verifiedAt?: string }[],
): { merged: FieldValue[]; conflicts: Conflict[] } {
  const byKey = new Map(current.map((v) => [v.key, { ...v }]));
  const conflicts: Conflict[] = [];
  for (const inc of incoming) {
    const existing = byKey.get(inc.key);
    if (existing && existing.state === 'filled' && existing.source === 'manual' && existing.value !== inc.value) {
      conflicts.push({ key: inc.key, govtValue: inc.value, manualValue: String(existing.value ?? '') });
      continue; // keep the owner's value
    }
    byKey.set(inc.key, {
      key: inc.key,
      state: 'filled',
      value: inc.value,
      source: 'govt_api',
      sourceRef: inc.sourceRef ?? null,
      verifiedAt: inc.verifiedAt ?? null,
      expiresAt: existing?.expiresAt ?? null,
      naReason: null,
    });
  }
  return { merged: [...byKey.values()], conflicts };
}

export const NA_REASONS = [
  'Not applicable',
  "Doesn't exist",
  'Lost',
  'Will obtain later',
] as const;
export type NaReason = (typeof NA_REASONS)[number];

/** CL-294: "Will obtain later" stays missing but is hushed in top prompts. */
export function suppressedFromPrompts(v: FieldValue): boolean {
  return v.state === 'not_available' || v.naReason === 'Will obtain later';
}
