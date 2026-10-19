/**
 * Families & groups (pages/Groups.tsx): the rules the screen draws by, kept
 * pure so they are unit-tested (groupsView.test.ts) instead of being read off
 * JSX.
 *
 *  · The inactivity safeguard: its stage word, the StatusChip state that word
 *    is drawn in, and the status its tab carries ("! needs action" / "✓ set").
 *  · The notifier editor: the one contact-gap sentence the tab and the editor
 *    share, who can be added to the order, and the failed-save wording.
 *  · The Members table's filter: the facets offered over the rows on screen,
 *    and which rows a selection keeps.
 *
 * The Relationship word is one rule (`memberRelationWord`) used by both the
 * table cell and the filter, so a filter option always reads exactly as the
 * column it narrows.
 */
import { memberStatusChip, relMeta, roleWord } from '../pages/families/familiesData';
import type { GroupMember } from '../pages/families/familiesData';
import type { GroupRow } from './groupsData';
import { num, plural } from './ui';
import type { FacetFilterGroup, TabStripStatus } from './ui';

// ── The inactivity safeguard ───────────────────────────────────────────

export const SAFEGUARD_STAGE: Record<string, string> = {
  active: 'Active',
  reminder_1: 'First reminder sent',
  reminder_2: 'Second reminder sent',
  final_reminder: 'Final reminder sent',
  family_selected: 'Notifying selected family',
  family_all: 'Family email complete',
  family_exhausted: 'Everyone on the list has been emailed',
  delivery_attention: 'An email may not have arrived. Check the list.',
  closed_head: 'Confirmed by the head',
  closed_family: 'Acknowledged by family',
};

export type SafeguardState = 'good' | 'warn' | 'bad' | 'unknown';

/** The StatusChip state each stage is drawn in. A routine reminder is a
 *  warning, not a danger: only a delivery the server could not confirm is
 *  `bad`. A closed cycle is neither good nor a problem, so `unknown`. */
export const SAFEGUARD_STATE: Record<string, SafeguardState> = {
  active: 'good',
  reminder_1: 'warn',
  reminder_2: 'warn',
  final_reminder: 'warn',
  family_selected: 'warn',
  family_all: 'warn',
  family_exhausted: 'warn',
  delivery_attention: 'bad',
  closed_head: 'unknown',
  closed_family: 'unknown',
};

type SafeguardFields = Pick<GroupRow, 'inactivityStage' | 'inactiveContactGaps'>;

/** The stage as a word and a state. An empty or unrecognised stage reads
 *  "Monitoring", as the screen always has. */
export function safeguardStage(g: SafeguardFields): { word: string; state: SafeguardState } {
  return {
    word: SAFEGUARD_STAGE[g.inactivityStage] || 'Monitoring',
    state: SAFEGUARD_STATE[g.inactivityStage] ?? 'unknown',
  };
}

/** Reddy's rule: a member without a verified email, a delivery problem, or
 *  any stage other than `active` needs action. */
export function safeguardNeedsAction(g: SafeguardFields): boolean {
  return (g.inactiveContactGaps || 0) > 0
    || g.inactivityStage === 'delivery_attention'
    || g.inactivityStage !== 'active';
}

/** The Safeguard tab's status: the glyph it draws beside its label, and the
 *  word that is the glyph's tooltip and the end of the tab's accessible name. */
export function safeguardTabStatus(g: SafeguardFields): TabStripStatus {
  return safeguardNeedsAction(g)
    ? { glyph: '!', word: 'needs action', state: 'warn' }
    : { glyph: '✓', word: 'set', state: 'good' };
}

// ── The notifier editor ────────────────────────────────────────────────

/** The one sentence for the contact gap, drawn in a warn StatusChip on the
 *  Safeguard tab and in the notifier editor alike. `gaps` is always the
 *  server's `inactiveContactGaps`: a non-self adult family member with no
 *  email, an unverified email, or no safeguard-email consent. The server's
 *  count includes consent, so the sentence says so (naming standard 4.1:
 *  "a confirmed email and must agree to safeguard emails"). */
export function contactGapSentence(gaps: number): string {
  return `${gaps === 1 ? '1 member needs' : `${gaps} members need`} a confirmed email and must `
    + 'agree to safeguard emails before everyone can be reached.';
}

type NotifierCandidate = Pick<
  GroupMember, 'isSelf' | 'isMinor' | 'email' | 'emailVerified' | 'inactivityEmailConsent'
>;

/** Who can be ADDED to the notifier order: the server's own rule for an
 *  eligible notifier (services/api/src/main.py `notifiers` and the
 *  `setNotifiers` validation) — an adult other than the head, with an email
 *  that is verified and safeguard-email consent. The `notifiers` query returns
 *  only configured rows once an order exists, so the editor still has to list
 *  the rest itself. This only lists people; it never counts the gap — that is
 *  `inactiveContactGaps`, from the server, through contactGapSentence. */
export function isEligibleNotifier(m: NotifierCandidate): boolean {
  return !m.isSelf && !m.isMinor && !!(m.email || '').trim() && m.emailVerified
    && m.inactivityEmailConsent;
}

/** The subject of the toast when saving the editor fails, worded for the mode
 *  that was saved: no ids is "everyone together", as the success toast says. */
export function notifierSaveFailedText(memberIds: readonly string[]): string {
  return memberIds.length === 0
    ? 'Contacting all verified family emails together could not be saved.'
    : 'That notifier order could not be saved.';
}

// ── The Members table ──────────────────────────────────────────────────

export const cap = (s?: string) => {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

type MemberFields = Pick<GroupMember, 'isSelf' | 'role' | 'relation'>;

/** The Relationship (or, without a family tree, Role) cell, word for word. */
export function memberRelationWord(m: MemberFields, hasTree: boolean): string {
  return m.isSelf && m.role ? roleWord(cap(m.role)) : hasTree ? relMeta(m.relation).label : roleWord(m.role) || '—';
}

type FacetMember = MemberFields & Pick<GroupMember, 'status' | 'inviteStatus' | 'inviteToken'>;

const statusWordOf = (m: FacetMember) => memberStatusChip(m).label;

function count(words: string[]) {
  const seen = new Map<string, number>();
  for (const w of words) if (w && w !== '—') seen.set(w, (seen.get(w) ?? 0) + 1);
  return [...seen].map(([w, n]) => ({ key: w, label: w, count: n }));
}

/** The facets over the rows on screen. Each option is a word the table
 *  prints; an option nobody carries is not offered, and a group with no
 *  options is omitted. */
export function memberFacets(members: readonly FacetMember[], hasTree: boolean): FacetFilterGroup[] {
  const groups: FacetFilterGroup[] = [
    {
      key: 'rel',
      label: hasTree ? 'Relationship' : 'Role',
      options: count(members.map((m) => memberRelationWord(m, hasTree))),
    },
    { key: 'status', label: 'Status', options: count(members.map(statusWordOf)) },
  ];
  return groups.filter((g) => g.options.length > 0);
}

/** Options OR within a group, AND across groups; nothing selected keeps all. */
export function matchesMember(
  m: FacetMember,
  selected: Record<string, readonly string[]>,
  hasTree: boolean,
): boolean {
  const rel = selected.rel ?? [];
  const status = selected.status ?? [];
  if (rel.length > 0 && !rel.includes(memberRelationWord(m, hasTree))) return false;
  if (status.length > 0 && !status.includes(statusWordOf(m))) return false;
  return true;
}

// ── Many families and groups ───────────────────────────────────────────

/** The order types stack in: families first — your own, your parents',
 *  your in-laws' are what most accounts hold — then the other ways land is
 *  held together. */
export const TYPE_ORDER = ['family', 'huf', 'partnership', 'company', 'trust'] as const;

/** A type as a plural noun, for the Type filter. */
export const TYPE_SECTION_WORD: Record<string, string> = {
  family: 'Families',
  huf: 'HUFs',
  partnership: 'Partnerships',
  company: 'Companies & LLPs',
  trust: 'Trusts & societies',
};

type PickerGroup = Pick<GroupRow, 'id' | 'type' | 'name'>;
type ListGroup = Pick<GroupRow, 'id' | 'type' | 'name' | 'parcelCount' | 'propertyCount' | 'createdAt'>;

const typeRank = (t: string) => {
  const i = (TYPE_ORDER as readonly string[]).indexOf(t);
  return i < 0 ? TYPE_ORDER.length : i;
};

/** The list's Type filter, counted over the whole list, in TYPE_ORDER. A type
 *  this build does not know is offered as "Other groups", never dropped. */
export function groupTypeFacet(groups: readonly Pick<GroupRow, 'type'>[]): FacetFilterGroup {
  const n = new Map<string, number>();
  for (const g of groups) n.set(g.type, (n.get(g.type) ?? 0) + 1);
  return {
    key: 'type',
    label: 'Type',
    options: [...n.keys()]
      .sort((a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b))
      .map((t) => ({ key: t, label: TYPE_SECTION_WORD[t] ?? 'Other groups', count: n.get(t)! })),
  };
}

export type GroupSortKey = 'type' | 'name' | 'properties' | 'newest';

export const GROUP_SORTS: Array<{ key: GroupSortKey; label: string }> = [
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'properties', label: 'Most properties' },
  { key: 'newest', label: 'Newest first' },
];

/** The list in one of GROUP_SORTS. Ties fall back to the name, so two
 *  orders never disagree about which of two equal rows comes first. */
export function sortGroups<G extends ListGroup>(groups: readonly G[], key: GroupSortKey): G[] {
  const byName = (a: G, b: G) => a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' });
  const held = (g: G) => g.parcelCount + g.propertyCount;
  const cmp: Record<GroupSortKey, (a: G, b: G) => number> = {
    type: (a, b) => typeRank(a.type) - typeRank(b.type) || byName(a, b),
    name: byName,
    properties: (a, b) => held(b) - held(a) || byName(a, b),
    newest: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || byName(a, b),
  };
  return [...groups].sort(cmp[key]);
}

const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Another group already called this, ignoring case and spacing — two
 *  "Reddy Family" rows are indistinguishable in every picker. `exceptId` is
 *  the group being renamed, which may keep its own name. */
export function sameNamedGroup<G extends PickerGroup>(
  name: string,
  groups: readonly G[],
  exceptId = '',
): G | undefined {
  const k = nameKey(name);
  if (!k) return undefined;
  return groups.find((g) => g.id !== exceptId && nameKey(g.name) === k);
}

/** The words under a name that clashes. A note, not a refusal: the server
 *  allows it, and the owner may mean it. */
export function sameNameNote(type: string): string {
  return type === 'family'
    ? 'You already have a group with this name. Add whose family it is, such as “Reddy Family (parents)” or “Reddy Family (in-laws)”, so the two are easy to tell apart.'
    : 'You already have a group with this name. A distinguishing word will make the two easy to tell apart.';
}

// ── Moving a property in (setting its holder) ─────────────────────────

/** What can be moved INTO `groupId`: every property in your own name or held
 *  by another of your groups, never what this group already holds. Personal
 *  first, then by group in the order `groups` lists them. `holder` is the
 *  label the row carries: "In your own name" or "In <group name>". */
export function movableProperties<C extends { groupId: string }>(
  cards: readonly C[],
  groupId: string,
  groups: readonly PickerGroup[],
): Array<C & { holder: string }> {
  const order = new Map(groups.map((g, i) => [g.id, i] as const));
  const name = new Map(groups.map((g) => [g.id, g.name] as const));
  return cards
    .filter((c) => c.groupId !== groupId && (!c.groupId || order.has(c.groupId)))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ra = a.c.groupId ? (order.get(a.c.groupId)! + 1) : 0;
      const rb = b.c.groupId ? (order.get(b.c.groupId)! + 1) : 0;
      return ra - rb || a.i - b.i;
    })
    .map(({ c }) => ({ ...c, holder: c.groupId ? `In ${name.get(c.groupId)}` : 'In your own name' }));
}

// ── The group page: people line, land tile ────────────────────────────
//
// Decision memo 06/10/2026, section 4.2, and the founder's "one pattern"
// (08/10/2026). A family or group says WHO holds land; a holding says WHICH
// properties make one piece of ground. The group page leads with people; its
// land is counted ONCE — the properties the group holds, from the same
// `properties(groups: [id])` read Properties makes — and that one number is
// the facts line, the tab badge and the tile. Its Properties tab is the
// Properties List view's own table (PropertyTable), never a list of khatas.

/** "4 members · shares 100% · 2 properties". Members counts your own row, as
 *  the Members tab does (`memberCount` is everyone you added). Shares only
 *  when any are given; properties only once they are counted and there are
 *  some. */
export function groupPeopleLine(
  g: Pick<GroupRow, 'memberCount' | 'totalShare'>,
  properties?: number,
): string {
  const share = Number(g.totalShare) || 0;
  return [
    plural(g.memberCount + 1, 'member'),
    share > 0 ? `shares ${num(share, share % 1 ? 1 : 0)}%` : '',
    properties ? plural(properties, 'property', 'properties') : '',
  ].filter(Boolean).join(' · ');
}

/** The one land tile: "4 properties · 30.00 ac". `acres` is the properties'
 *  extent on common ground (PropertyTable `inAcres`); a group of flats only
 *  has no acre part. */
export function groupLandTile(count: number, acres: number): string {
  return [plural(count, 'property', 'properties'), acres >= 0.005 ? `${num(acres, 2)} ac` : '']
    .filter(Boolean).join(' · ');
}

/** The fixed wording under the group's list (memo 4.6). It keeps a group from
 *  reading as a claim of title. */
export const GROUP_LAND_DISCLAIMER =
  'Your own record of who shares this land. It does not change the khata.';

// ── Members: shares ────────────────────────────────────────────────────

/** Shares are a percentage only, never turned into acres per person. */
export const SHARE_NOTE = "A share is of the group's land, not a right to a particular plot.";

/** What a share is of, under the percentage: "Sy 214/2" for a parcel, else
 *  "All properties". An HUF coparcener's share is notional until partition. */
export function shareWhere(groupType: string, surveyNo?: string): string {
  const what = (surveyNo || '').trim() ? `Sy ${surveyNo!.trim()}` : 'All properties';
  return groupType === 'huf' ? `${what} · notional until partition` : what;
}

// ── Words for raw server values ────────────────────────────────────────

/** The safeguard's last outcome, from inactivity_escalations.last_outcome. */
export const SAFEGUARD_OUTCOME_WORD: Record<string, string> = {
  activity_reset: 'You were active again',
  head_email_unavailable: 'The head has no email to remind',
  no_eligible_family_email: 'No family member could be emailed',
  no_eligible_ordered_notifier: 'No one on the list could be emailed',
  family_email_partial: 'Some family emails were not sent',
  family_email_complete: 'Every family email was sent',
  outcome_unknown: 'Not known yet',
  legacy_acknowledged: 'Acknowledged by family',
  head_acknowledged: 'Confirmed by the head',
  family_acknowledged: 'Acknowledged by family',
  sent: 'Email sent',
  queued: 'Email waiting to send',
  failed: 'Email not sent',
  skipped: 'Email skipped',
};

/** What happened, for the Activity tab. The fallback humanises an action this
 *  table does not know yet, so a new one still reads as words. */
export const GROUP_ACTION_WORD: Record<string, string> = {
  create_group: 'Group created',
  update_group: 'Details changed',
  delete_group: 'Group deleted',
  add_member: 'Member added',
  add_family_member: 'Member added',
  update_member: 'Member details changed',
  remove_member: 'Member removed',
  invite_member: 'Verification link sent',
  invite_family_member: 'Verification link sent',
  add_beneficiary: 'Heir added',
  delete_beneficiary: 'Heir removed',
  update_beneficiary_status: 'Heir status changed',
  set_notifiers: 'Notifiers saved',
  link_aadhaar_card: 'Aadhaar card linked',
  assign_land_to_group: 'Khata holder changed',
  assign_property_to_group: 'Property holder changed',
  create_passbook: 'Khata added',
  update_passbook: 'Khata details changed',
  delete_passbook: 'Khata deleted',
  create_parcel: 'Parcel added',
  update_parcel: 'Parcel details changed',
  delete_parcel: 'Parcel deleted',
  create_property: 'Property added',
  update_property: 'Property details changed',
  delete_property: 'Property deleted',
};

export const wordFor = (table: Record<string, string>, raw: string) =>
  table[raw] ?? cap((raw || '').replace(/_/g, ' '));
