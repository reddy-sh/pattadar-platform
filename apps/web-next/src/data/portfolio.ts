/**
 * Pure portfolio computations for the Land Portfolio dashboard — information
 * design rebuilt from the predecessor app's dashboard.ts (records health, succession
 * cover, tax compliance, member verification, attention items, gains).
 * No React imports.
 */
import { toAcres, unitKey } from '@pattadar/core';
import type { Group, Invitation, Member, Parcel, Passbook, Property } from '@pattadar/core';

export type DashParcel = Pick<
  Parcel,
  | 'id'
  | 'passbookId'
  | 'surveyNo'
  | 'extent'
  | 'unit'
  | 'classification'
  | 'status'
  | 'label'
  | 'litigation'
  | 'taxPaidUpto'
  | 'ecStatus'
  | 'ecDate'
  | 'marketValue'
  | 'guidelineValue'
  | 'purchasePrice'
  | 'loanAmount'
>;
export type DashProperty = Pick<
  Property,
  | 'id'
  | 'type'
  | 'label'
  | 'city'
  | 'landArea'
  | 'landUnit'
  | 'builtupArea'
  | 'builtupUnit'
  | 'currentValue'
  | 'marketValue'
  | 'guidelineValue'
  | 'purchasePrice'
  | 'litigation'
  | 'taxPaidUpto'
  | 'ecStatus'
  | 'ecDate'
  | 'attributes'
>;
export type DashPassbook = Pick<Passbook, 'id' | 'village' | 'groupId' | 'photo'>;
export type DashGroup = Pick<Group, 'id' | 'totalShare'>;
export type DashMember = Pick<Member, 'isSelf' | 'status'>;
export type DashInvitation = Pick<Invitation, 'id' | 'status'>;

export function parcelValue(p: DashParcel): number {
  return p.marketValue || p.guidelineValue || 0;
}
export function propertyValue(p: DashProperty): number {
  return p.currentValue || p.marketValue || p.guidelineValue || p.purchasePrice || 0;
}

export function totalPortfolioValue(parcels: DashParcel[], properties: DashProperty[]) {
  const farm = parcels.reduce((s, p) => s + parcelValue(p), 0);
  const prop = properties.reduce((s, p) => s + propertyValue(p), 0);
  return { farm, prop, total: farm + prop };
}

/** Gain vs purchase — only assets with both a purchase record and a value. */
export function gainSincePurchase(parcels: DashParcel[], properties: DashProperty[]) {
  let cost = 0;
  let now = 0;
  let counted = 0;
  const consider = (value: number, purchase: number) => {
    if (purchase > 0 && value > 0) {
      cost += purchase;
      now += value;
      counted++;
    }
  };
  parcels.forEach((p) => consider(parcelValue(p), p.purchasePrice || 0));
  properties.forEach((p) =>
    consider(p.currentValue || p.marketValue || p.guidelineValue || 0, p.purchasePrice || 0),
  );
  const gain = now - cost;
  return {
    gain,
    pct: cost > 0 ? Math.round((gain / cost) * 100) : 0,
    counted,
    total: parcels.length + properties.length,
  };
}

export function totalExtentAcres(parcels: DashParcel[]): number {
  return parcels.reduce((s, p) => s + toAcres(p.extent || 0, unitKey(p.unit)), 0);
}

export function daysUntil(iso: string, today: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Ring 1 — Documents: parcels with a deed + passbooks with a photo. */
export function recordsHealth(
  parcels: DashParcel[],
  passbooks: DashPassbook[],
  documents: { parcelId: string }[],
) {
  const expected = parcels.length + passbooks.length;
  if (expected === 0) return null;
  const withDoc = new Set(documents.map((d) => d.parcelId).filter(Boolean));
  const missingDeed = parcels.filter((p) => !withDoc.has(p.id)).length;
  const missingPhoto = passbooks.filter((b) => !b.photo).length;
  const present = parcels.length - missingDeed + (passbooks.length - missingPhoto);
  const gaps: string[] = [];
  if (missingDeed) gaps.push(`${missingDeed} parcel${missingDeed > 1 ? 's' : ''} missing a deed`);
  if (missingPhoto) gaps.push(`${missingPhoto} passbook${missingPhoto > 1 ? 's' : ''} without a photo`);
  return { pct: Math.round((present / expected) * 100), gaps };
}

/** Ring 2 — Verification: family/group members verified vs pending. */
export function membersVerified(members: DashMember[]) {
  const real = members.filter((m) => !m.isSelf);
  if (real.length === 0) return null;
  const verified = real.filter((m) => m.status === 'verified').length;
  return {
    pct: Math.round((verified / real.length) * 100),
    pending: real.length - verified,
    total: real.length,
  };
}

/** Ring 3 — Tax / EC attention: holdings whose tax is current. */
export function taxCompliance(parcels: DashParcel[], properties: DashProperty[], today: Date) {
  const dated = [...parcels, ...properties]
    .map((a) => daysUntil(a.taxPaidUpto, today))
    .filter((d): d is number => d !== null);
  if (dated.length === 0) return null;
  const overdue = dated.filter((d) => d < 0).length;
  return { pct: Math.round(((dated.length - overdue) / dated.length) * 100), overdue };
}

/** Ring 4 — Family coverage: extent held via groups with nominated shares. */
export function successionCover(
  parcels: DashParcel[],
  passbooks: DashPassbook[],
  groups: DashGroup[],
) {
  if (parcels.length === 0) return null;
  const covered = new Set(groups.filter((g) => (g.totalShare || 0) > 0).map((g) => g.id));
  const groupOf = new Map(passbooks.map((b) => [b.id, b.groupId]));
  let total = 0;
  let ok = 0;
  let uncovered = 0;
  for (const p of parcels) {
    const acres = toAcres(p.extent || 0, unitKey(p.unit));
    total += acres;
    const gid = groupOf.get(p.passbookId) || '';
    if (gid && covered.has(gid)) ok += acres;
    else uncovered++;
  }
  return { pct: total > 0 ? Math.round((ok / total) * 100) : 0, uncovered };
}

/** Acres per village (top 4 + rest folded into "Other"). */
export function villageExtents(parcels: DashParcel[], passbooks: DashPassbook[]) {
  const villageOf = new Map(passbooks.map((b) => [b.id, b.village || '—']));
  const acc = new Map<string, number>();
  for (const p of parcels) {
    const v = villageOf.get(p.passbookId) || '—';
    acc.set(v, (acc.get(v) || 0) + toAcres(p.extent || 0, unitKey(p.unit)));
  }
  const rows = [...acc.entries()]
    .map(([name, acres]) => ({ name, acres }))
    .sort((a, b) => b.acres - a.acres);
  const top = rows.slice(0, 4);
  const rest = rows.slice(4);
  if (rest.length > 0) top.push({ name: 'Other', acres: rest.reduce((s, r) => s + r.acres, 0) });
  return top;
}

/** Category holdings — value grouped by asset class (donut segments). */
export interface HoldingCategory {
  key: string;
  label: string;
  value: number;
  count: number;
  detail: string;
}
export function holdingCategories(
  parcels: DashParcel[],
  properties: DashProperty[],
  docCount: number,
): HoldingCategory[] {
  const farm = totalPortfolioValue(parcels, []).farm;
  const acres = totalExtentAcres(parcels);
  const plots = properties.filter((p) => p.type === 'open_plot');
  const residential = properties.filter((p) =>
    ['flat', 'independent_house', 'villa'].includes(p.type),
  );
  const commercial = properties.filter((p) => ['commercial', 'rental', 'other'].includes(p.type));
  const sum = (list: DashProperty[]) => list.reduce((s, p) => s + propertyValue(p), 0);
  return [
    {
      key: 'farm',
      label: 'Agricultural land',
      value: farm,
      count: parcels.length,
      detail: `${parcels.length} parcel${parcels.length !== 1 ? 's' : ''} · ${acres.toFixed(2)} acres · ${docCount} document${docCount !== 1 ? 's' : ''} linked`,
    },
    {
      key: 'plots',
      label: 'Plots & sites',
      value: sum(plots),
      count: plots.length,
      detail: `${plots.length} plot${plots.length !== 1 ? 's' : ''}`,
    },
    {
      key: 'residential',
      label: 'Homes & flats',
      value: sum(residential),
      count: residential.length,
      detail: `${residential.length} propert${residential.length !== 1 ? 'ies' : 'y'}`,
    },
    {
      key: 'commercial',
      label: 'Commercial & rental',
      value: sum(commercial),
      count: commercial.length,
      detail: `${commercial.length} building${commercial.length !== 1 ? 's' : ''}`,
    },
  ].filter((c) => c.count > 0);
}

export interface AttentionItem {
  severity: 'red' | 'amber' | 'green';
  text: string;
  path?: string;
}

/** Ordered needs-attention feed: litigation & overdue first, then due-soon. */
export function attentionItems(
  input: {
    pendingInvites: number;
    membersPending: number;
    parcels: DashParcel[];
    properties: DashProperty[];
  },
  today: Date,
): AttentionItem[] {
  const red: AttentionItem[] = [];
  const amber: AttentionItem[] = [];
  const green: AttentionItem[] = [];
  const pLabel = (p: DashParcel) => `Sy ${p.surveyNo}`;
  const prLabel = (p: DashProperty) => [p.label || p.type, p.city].filter(Boolean).join(', ');

  for (const p of input.parcels) {
    if (p.litigation) red.push({ severity: 'red', text: `${pLabel(p)} — litigation flagged`, path: '/app/parcels' });
    const d = daysUntil(p.taxPaidUpto, today);
    if (d !== null && d < 0) red.push({ severity: 'red', text: `Land tax overdue — ${pLabel(p)}`, path: '/app/parcels' });
    else if (d !== null && d <= 60) amber.push({ severity: 'amber', text: `Tax due in ${d} days — ${pLabel(p)}`, path: '/app/parcels' });
    const ec = daysUntil(p.ecDate, today);
    if (p.ecDate && ec !== null && ec < -365)
      amber.push({ severity: 'amber', text: `EC check older than a year — ${pLabel(p)}`, path: '/app/parcels' });
  }
  for (const p of input.properties) {
    if (p.litigation) red.push({ severity: 'red', text: `${prLabel(p)} — litigation flagged`, path: '/app/properties' });
    const d = daysUntil(p.taxPaidUpto, today);
    if (d !== null && d < 0) red.push({ severity: 'red', text: `Property tax overdue — ${prLabel(p)}`, path: '/app/properties' });
    else if (d !== null && d <= 60) amber.push({ severity: 'amber', text: `Tax due in ${d} days — ${prLabel(p)}`, path: '/app/properties' });
  }
  if (input.pendingInvites > 0)
    amber.unshift({
      severity: 'amber',
      text: `${input.pendingInvites} invitation${input.pendingInvites > 1 ? 's' : ''} awaiting a response`,
      path: '/app/invitations',
    });
  if (input.membersPending > 0)
    amber.push({
      severity: 'amber',
      text: `${input.membersPending} family member${input.membersPending > 1 ? 's' : ''} not yet verified`,
      path: '/app/groups',
    });
  if (
    !input.parcels.some((p) => p.litigation) &&
    !input.properties.some((p) => p.litigation) &&
    input.parcels.length + input.properties.length > 0
  )
    green.push({ severity: 'green', text: 'No litigation on any holding' });
  if (red.length + amber.length === 0)
    green.unshift({ severity: 'green', text: 'All clear — nothing needs your attention' });
  return [...red, ...amber, ...green];
}

/** Friendly labels for audit actions in the activity feed. */
const ACTION_LABELS: Record<string, string> = {
  create_passbook: 'Created a passbook',
  delete_passbook: 'Deleted a passbook',
  create_parcel: 'Added a parcel',
  delete_parcel: 'Removed a parcel',
  update_parcel_geo: "Set a parcel's location",
  add_note: 'Added a note',
  delete_note: 'Deleted a note',
  create_document: 'Added a document',
  upload_document: 'Uploaded a document',
  delete_document: 'Deleted a document',
  set_passbook_photo: 'Updated a passbook photo',
  create_beneficiary: 'Added a family member',
  delete_beneficiary: 'Removed a family member',
  create_invitation: 'Sent an invitation',
  send_notification: 'Sent a notification',
};

export function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ||
    String(action || '')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}
