import { expect, test } from 'bun:test';
import {
  GROUP_ACTION_WORD, SAFEGUARD_OUTCOME_WORD, SAFEGUARD_STAGE, TYPE_ORDER, TYPE_SECTION_WORD, cap,
  contactGapSentence, groupLandTile, groupPeopleLine, groupTypeFacet,
  isEligibleNotifier, matchesMember, memberFacets, memberRelationWord, movableProperties,
  notifierSaveFailedText, shareWhere, wordFor,
  safeguardNeedsAction, safeguardStage, safeguardTabStatus, sameNameNote,
  sameNamedGroup, sortGroups,
} from './groupsView';

const g = (inactivityStage: string, inactiveContactGaps = 0) => ({ inactivityStage, inactiveContactGaps });

test('every stage has its word and a StatusChip state; reminders warn, only delivery is bad', () => {
  const want: Record<string, string> = {
    active: 'good',
    reminder_1: 'warn', reminder_2: 'warn', final_reminder: 'warn',
    family_selected: 'warn', family_all: 'warn', family_exhausted: 'warn',
    delivery_attention: 'bad',
    closed_head: 'unknown', closed_family: 'unknown',
  };
  for (const [stage, state] of Object.entries(want)) {
    expect(safeguardStage(g(stage))).toEqual({ word: SAFEGUARD_STAGE[stage], state: state as never });
  }
  expect(safeguardStage(g(''))).toEqual({ word: 'Monitoring', state: 'unknown' });
  expect(safeguardStage(g('something_new'))).toEqual({ word: 'Monitoring', state: 'unknown' });
});

test('the tab needs action for a contact gap, a delivery problem or any non-active stage', () => {
  const needs = { glyph: '!', word: 'needs action', state: 'warn' };
  expect(safeguardTabStatus(g('active', 1))).toEqual(needs);
  expect(safeguardTabStatus(g('delivery_attention'))).toEqual(needs);
  for (const s of ['reminder_1', 'reminder_2', 'final_reminder', 'closed_head', '']) {
    expect(safeguardNeedsAction(g(s))).toBe(true);
  }
});

test('the tab reads set when the stage is active and every contact is verified', () => {
  expect(safeguardNeedsAction(g('active'))).toBe(false);
  expect(safeguardTabStatus(g('active'))).toEqual({ glyph: '✓', word: 'set', state: 'good' });
});

test('the contact gap is one sentence, singular or plural, and names consent', () => {
  expect(contactGapSentence(1)).toBe(
    '1 member needs a confirmed email and must agree to safeguard emails before everyone can be reached.',
  );
  expect(contactGapSentence(3)).toBe(
    '3 members need a confirmed email and must agree to safeguard emails before everyone can be reached.',
  );
});

test('the stage words name what happened, not the pipeline', () => {
  expect(SAFEGUARD_STAGE.family_exhausted).toBe('Everyone on the list has been emailed');
  expect(SAFEGUARD_STAGE.delivery_attention).toBe('An email may not have arrived. Check the list.');
});

test('only an adult other than the head, verified and consenting, can be added as a notifier', () => {
  const adult = { isSelf: false, isMinor: false, email: 'a@b.in', emailVerified: true, inactivityEmailConsent: true };
  expect(isEligibleNotifier(adult)).toBe(true);
  expect(isEligibleNotifier({ ...adult, isSelf: true })).toBe(false);
  expect(isEligibleNotifier({ ...adult, isMinor: true })).toBe(false);
  expect(isEligibleNotifier({ ...adult, email: '  ' })).toBe(false);
  expect(isEligibleNotifier({ ...adult, emailVerified: false })).toBe(false);
  expect(isEligibleNotifier({ ...adult, inactivityEmailConsent: false })).toBe(false);
});

test('a failed notifier save is worded for the mode that was saved', () => {
  expect(notifierSaveFailedText([])).toBe('Contacting all verified family emails together could not be saved.');
  expect(notifierSaveFailedText(['m'])).toBe('That notifier order could not be saved.');
});

const self = { id: 's', isSelf: true, role: 'head', relation: 'self', status: '', inviteStatus: '', inviteToken: '' };
const wife = { id: 'w', isSelf: false, role: '', relation: 'spouse', status: 'verified', inviteStatus: '', inviteToken: '' };
const son = { id: 'n', isSelf: false, role: '', relation: 'son', status: 'pending', inviteStatus: '', inviteToken: 't' };
const son2 = { id: 'n2', isSelf: false, role: '', relation: 'son', status: '', inviteStatus: '', inviteToken: '' };
const rows = [self, wife, son, son2];

test('the self row reads its own role, capitalised, whatever the group type', () => {
  expect(memberRelationWord(self, true)).toBe('Head');
  expect(memberRelationWord(self, false)).toBe('Head');
  expect(cap('  partner')).toBe('Partner');
  expect(memberRelationWord({ isSelf: false, role: '', relation: '' }, false)).toBe('—');
});

test('stored roles read through the naming standard, the self row too', () => {
  expect(memberRelationWord({ isSelf: true, role: 'Managing Partner', relation: '' }, false)).toBe('Managing partner');
  expect(memberRelationWord({ isSelf: false, role: 'Authorized Signatory', relation: '' }, false)).toBe('Authorised signatory');
  expect(memberRelationWord({ isSelf: false, role: 'Advisor', relation: '' }, false)).toBe('Advisor');
});

test('facets are counted over the rows and offer only words someone carries', () => {
  const facets = memberFacets(rows, true);
  expect(facets.map((f) => f.label)).toEqual(['Relationship', 'Status']);
  const rel = facets[0].options;
  expect(rel.map((o) => o.count)).toEqual([1, 1, 2]);
  expect(rel[0].label).toBe('Head');
  expect(rel.some((o) => o.label === '—')).toBe(false);
  expect(facets[1].options).toEqual([
    { key: 'Active', label: 'Active', count: 1 },
    { key: 'Invited', label: 'Invited', count: 1 },
  ]);
});

test('a group without a family tree filters by Role, and an empty group is omitted', () => {
  const partner = { ...wife, role: 'partner', relation: '' };
  const noStatus = [{ ...self }, { ...partner, status: '' }];
  const facets = memberFacets(noStatus, false);
  expect(facets.map((f) => f.label)).toEqual(['Role']);
  expect(facets[0].options.map((o) => o.label)).toEqual(['Head', 'partner']);
});

test('options OR within a group and AND across groups; nothing selected keeps everyone', () => {
  const rel = memberFacets(rows, true)[0].options;
  const spouse = rel.find((o) => o.key !== 'Head' && o.count === 1)!.key;
  const sons = rel.find((o) => o.count === 2)!.key;
  const keep = (sel: Record<string, string[]>) => rows.filter((m) => matchesMember(m, sel, true)).map((m) => m.id);
  expect(keep({})).toEqual(['s', 'w', 'n', 'n2']);
  expect(keep({ rel: [spouse, sons] })).toEqual(['w', 'n', 'n2']);
  expect(keep({ rel: [sons], status: ['Invited'] })).toEqual(['n']);
  expect(keep({ rel: [spouse], status: ['Invited'] })).toEqual([]);
});

// ── Many families and groups ───────────────────────────────────────────

const grp = (id: string, type: string, name = id) => ({ id, type, name });
const MANY = [
  grp('firm', 'partnership', 'Reddy & Sons'),
  grp('own', 'family', 'Telukutla Family'),
  grp('huf', 'huf', 'Telukutla HUF'),
  grp('parents', 'family', 'Telukutla Family (parents)'),
  grp('trust', 'trust', 'Temple Trust'),
  grp('odd', 'something_new', 'Odd one'),
  grp('inlaws', 'family', 'Kondapalli Family'),
];

test('the Type filter counts every type, families first, and keeps a type it does not know', () => {
  const f = groupTypeFacet(MANY);
  expect(f.options.map((o) => o.label)).toEqual(['Families', 'HUFs', 'Partnerships', 'Trusts & societies', 'Other groups']);
  expect(f.options[0].count).toBe(3);
  expect(f.options.reduce((n, o) => n + (o.count ?? 0), 0)).toBe(MANY.length);
});

test('sorting: by type families first, by name, by most properties, newest first; ties by name', () => {
  const rows = [
    { id: 'a', type: 'trust', name: 'Zeta Trust', parcelCount: 1, propertyCount: 0, createdAt: '2026-01-01' },
    { id: 'b', type: 'family', name: 'beta Family', parcelCount: 0, propertyCount: 3, createdAt: '2026-03-01' },
    { id: 'c', type: 'family', name: 'Alpha Family', parcelCount: 2, propertyCount: 0, createdAt: '2026-02-01' },
  ];
  expect(sortGroups(rows, 'type').map((g) => g.id)).toEqual(['c', 'b', 'a']);
  expect(sortGroups(rows, 'name').map((g) => g.id)).toEqual(['c', 'b', 'a']);
  expect(sortGroups(rows, 'properties').map((g) => g.id)).toEqual(['b', 'c', 'a']);
  expect(sortGroups(rows, 'newest').map((g) => g.id)).toEqual(['b', 'c', 'a']);
  expect(rows.map((g) => g.id)).toEqual(['a', 'b', 'c']);
});

test('a name that matches another group, ignoring case and spacing, is found; your own name is not', () => {
  expect(sameNamedGroup('  telukutla   FAMILY ', MANY)?.id).toBe('own');
  expect(sameNamedGroup('Telukutla Family', MANY, 'own')).toBeUndefined();
  expect(sameNamedGroup('', MANY)).toBeUndefined();
  expect(sameNamedGroup('Telukutla Family (in-laws)', MANY)).toBeUndefined();
  expect(sameNameNote('family')).toMatch(/parents.*in-laws/);
  expect(sameNameNote('huf')).not.toMatch(/parents/);
});

test('what can move in: your own name first, then other groups in list order, never this group or a stranger\'s', () => {
  const cards = [
    { id: 'c1', groupId: 'parents' },
    { id: 'c2', groupId: '' },
    { id: 'c3', groupId: 'own' },
    { id: 'c4', groupId: 'firm' },
    { id: 'c5', groupId: '' },
    { id: 'c6', groupId: 'not-mine' },
  ];
  const out = movableProperties(cards, 'own', MANY);
  expect(out.map((c) => c.id)).toEqual(['c2', 'c5', 'c4', 'c1']);
  expect(out.map((c) => c.holder)).toEqual([
    'In your own name', 'In your own name', 'In Reddy & Sons', 'In Telukutla Family (parents)',
  ]);
});

test('Portfolio / Wallet is not a group type: no order, no filter word', () => {
  expect(TYPE_ORDER as readonly string[]).not.toContain('portfolio');
  expect(TYPE_SECTION_WORD.portfolio).toBeUndefined();
  expect(groupTypeFacet([{ type: 'portfolio' }]).options[0].label).toBe('Other groups');
});

test('the people line counts you, shares as a percentage, and the properties once counted', () => {
  expect(groupPeopleLine({ memberCount: 3, totalShare: 100 }, 2))
    .toBe('4 members · shares 100% · 2 properties');
  expect(groupPeopleLine({ memberCount: 0, totalShare: 0 }, 1)).toBe('1 member · 1 property');
  // Not counted yet, or none: no property part — never "0 properties", never khatas.
  expect(groupPeopleLine({ memberCount: 1, totalShare: 33.5 })).toBe('2 members · shares 33.5%');
  expect(groupPeopleLine({ memberCount: 0, totalShare: 0 }, 0)).toBe('1 member');
});

test('the land tile counts properties and prints acres only when there are some', () => {
  expect(groupLandTile(4, 30)).toBe('4 properties · 30.00 ac');
  expect(groupLandTile(1, 5)).toBe('1 property · 5.00 ac');
  expect(groupLandTile(2, 0)).toBe('2 properties');
});

test('a share names what it is of; an HUF share is notional until partition', () => {
  expect(shareWhere('family', '214/2')).toBe('Sy 214/2');
  expect(shareWhere('family', '')).toBe('All properties');
  expect(shareWhere('huf')).toBe('All properties · notional until partition');
});

test('raw server values go through word tables, with a humanised fallback', () => {
  expect(wordFor(GROUP_ACTION_WORD, 'assign_land_to_group')).toBe('Khata holder changed');
  expect(wordFor(GROUP_ACTION_WORD, 'something_new')).toBe('Something new');
  expect(wordFor(SAFEGUARD_OUTCOME_WORD, 'family_email_partial')).toBe('Some family emails were not sent');
});
