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
import { memberStatusChip, relMeta } from '../pages/families/familiesData';
import type { GroupMember } from '../pages/families/familiesData';
import type { GroupRow } from './groupsData';
import type { FacetFilterGroup, TabStripStatus } from './ui';

// ── The inactivity safeguard ───────────────────────────────────────────

export const SAFEGUARD_STAGE: Record<string, string> = {
  active: 'Active',
  reminder_1: 'First reminder sent',
  reminder_2: 'Second reminder sent',
  final_reminder: 'Final reminder sent',
  family_selected: 'Notifying selected family',
  family_all: 'Family email complete',
  family_exhausted: 'Notifier order complete',
  delivery_attention: 'Delivery needs review',
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
 *  count includes consent, so the sentence says so, in the server's own words
 *  ("a verified email and safeguard-email consent"). */
export function contactGapSentence(gaps: number): string {
  return `${gaps === 1 ? '1 member needs' : `${gaps} members need`} a verified email and `
    + 'safeguard-email consent before everyone can be contacted.';
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
  return m.isSelf && m.role ? cap(m.role) : hasTree ? relMeta(m.relation).label : m.role || '—';
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
