import { expect, test } from 'bun:test';
import {
  SAFEGUARD_STAGE, cap, contactGapSentence, isEligibleNotifier, matchesMember, memberFacets,
  memberRelationWord, notifierSaveFailedText, safeguardNeedsAction, safeguardStage, safeguardTabStatus,
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

test('the contact gap is one sentence, singular or plural, and names consent as the server does', () => {
  expect(contactGapSentence(1)).toBe(
    '1 member needs a verified email and safeguard-email consent before everyone can be contacted.',
  );
  expect(contactGapSentence(3)).toBe(
    '3 members need a verified email and safeguard-email consent before everyone can be contacted.',
  );
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
