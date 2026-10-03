/**
 * The activity feed is the only place an owner can check what happened to their
 * papers, and it is also the compliance surface, so its copy rules are load
 * bearing: a raw UUID is never shown, a destructive verb always reads as one,
 * reading an Aadhaar number is a security event rather than activity, and a row
 * never says the same thing twice ("Delete registered document · Deleted
 * registered document").
 *
 * Every case was read off the implementation. Three pin behaviour that is
 * arguably wrong and say so where they sit:
 *   - relativeTime and dayHeading render old rows as "18 Jul" / "25 Dec 2025",
 *     which is not the DD/MM/YYYY of invariant 6, and the day number is the
 *     READER's local day
 *   - a timestamp in the future reads "just now" and files under "Today"
 *   - countedActionLabel pluralises the tail of a possessive phrase
 */
import { describe, expect, test } from 'bun:test';

import {
  actionLabel,
  collapseAuditBursts,
  countedActionLabel,
  dayHeading,
  dedupeAuditEvents,
  eventEntity,
  humanEntity,
  humanizeTokens,
  isDestructiveAction,
  isSecurityAction,
  LOW_SIGNAL_ACTIONS,
  parseAuditTime,
  relativeTime,
} from './audit';

/** A synthetic id of the right shape; humanEntity only cares about the shape. */
const UUID = '3c8f1a2e-1111-4222-8333-444455556666';

/** "3 Jul" for an instant in a named zone, read off Intl and not off the code. */
const dayMonthIn = (timeZone: string, instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(instant);

/** The zone this process is in. `bun test` uses UTC unless TZ says otherwise. */
const RUNNER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Row = { actor: string; action: string; target: string; timestamp: string };
const row = (action: string, target: string, timestamp: string, actor = 'owner-1'): Row => ({
  actor,
  action,
  target,
  timestamp,
});

describe('actionLabel', () => {
  test('a known verb gets its agreed copy', () => {
    expect(actionLabel('create_passbook')).toBe('Created a passbook');
    expect(actionLabel('upload_document')).toBe('Uploaded a document');
    expect(actionLabel('update_parcel_geo')).toBe("Set a parcel's location");
  });

  test('CL-557: a registered document is just a document to the owner', () => {
    expect(actionLabel('create_registered_document')).toBe(actionLabel('create_document'));
    expect(actionLabel('create_registered_document')).toBe('Added a document');
    expect(actionLabel('delete_registered_document')).toBe('Deleted a document');
  });

  test("a property's own tabs have agreed copy, and a burst of them counts", () => {
    // The property's Activity tab and Account → Activity word these the same.
    expect(actionLabel('add_feature')).toBe('Added a site feature');
    expect(actionLabel('add_paper')).toBe('Filed a document');
    expect(actionLabel('record.corrected')).toBe('Corrected a field');
    expect(actionLabel('add_note')).toBe('Added a note');
    expect(countedActionLabel('add_feature', 3)).toBe('Added 3 site features');
    expect(countedActionLabel('add_person', 2)).toBe('Added someone ×2');
    // Owners count properties; "record" stays for a holding's members.
    expect(actionLabel('archive_record')).toBe('Archived a property');
  });

  test('an unlisted verb is humanised rather than shown raw', () => {
    // The day a new mutation ships it still reads as English, not as a key.
    expect(actionLabel('some_new_action')).toBe('Some new action');
    expect(actionLabel('reindex')).toBe('Reindex');
    // A dotted v2 action with no phrase still reads as words, not "Area.verb".
    expect(actionLabel('widget.was_moved')).toBe('Widget was moved');
  });

  test('an empty action yields an empty label, not a stray capital', () => {
    expect(actionLabel('')).toBe('');
  });

  test('the lookup is case-sensitive and the fallback only strips underscores', () => {
    // Worth knowing: an upper-case action from a different producer would miss
    // the table entirely and reach the screen shouting.
    expect(actionLabel('CREATE_PASSBOOK')).toBe('CREATE PASSBOOK');
    // A leading underscore becomes a leading space, since ^\w cannot match it.
    expect(actionLabel('_odd')).toBe(' odd');
  });
});

describe('isDestructiveAction', () => {
  test('the three destructive verbs are recognised by prefix', () => {
    expect(isDestructiveAction('delete_passbook')).toBe(true);
    expect(isDestructiveAction('remove_member')).toBe(true);
    expect(isDestructiveAction('revoke_share')).toBe(true);
  });

  test('CL-551: a delete_* that nobody has listed yet is still destructive', () => {
    expect(isDestructiveAction('delete_something_invented_today')).toBe(true);
  });

  test('constructive verbs are left alone', () => {
    for (const ok of ['create_parcel', 'add_note', 'update_profile', 'archive_record']) {
      expect(isDestructiveAction(ok)).toBe(false);
    }
  });

  test('the verb has to lead and to be followed by an underscore', () => {
    expect(isDestructiveAction('delete')).toBe(false);
    expect(isDestructiveAction('deleted')).toBe(false);
    expect(isDestructiveAction('soft_delete_note')).toBe(false);
    expect(isDestructiveAction('')).toBe(false);
  });
});

describe('isSecurityAction', () => {
  test('CL-526: reading identity data is a security event, not activity', () => {
    expect(isSecurityAction('reveal_aadhaar')).toBe(true);
    expect(isSecurityAction('apply_my_kyc')).toBe(true);
  });

  test('ordinary activity is not', () => {
    for (const ok of ['create_parcel', 'delete_passbook', 'update_profile', '']) {
      expect(isSecurityAction(ok)).toBe(false);
    }
  });

  test('a self-evident no-op is low signal rather than security', () => {
    expect(LOW_SIGNAL_ACTIONS).toEqual(['update_profile']);
    expect(isSecurityAction('update_profile')).toBe(false);
    expect(isDestructiveAction('update_profile')).toBe(false);
  });
});

describe('humanEntity', () => {
  test('a human detail wins over the reference', () => {
    expect(humanEntity(UUID, 'Sy 71-2')).toBe('Sy 71-2');
    expect(humanEntity('Parcel A', 'Sy 71-2')).toBe('Sy 71-2');
  });

  test('a reference is used when there is no detail', () => {
    expect(humanEntity('Parcel A', null)).toBe('Parcel A');
    expect(humanEntity('Parcel A', '')).toBe('Parcel A');
    expect(humanEntity('  padded  ', '   ')).toBe('padded');
  });

  test('a raw id is never user-facing copy, in either field or either case', () => {
    expect(humanEntity(UUID, UUID)).toBe('');
    expect(humanEntity(UUID.toUpperCase(), null)).toBe('');
    expect(humanEntity(UUID, null)).toBe('');
  });

  test('a detail that merely contains an id is rejected whole', () => {
    // The ref is used instead — the id is not surgically removed.
    expect(humanEntity('Parcel A', `document ${UUID}`)).toBe('Parcel A');
    expect(humanEntity(UUID, `document ${UUID}`)).toBe('');
  });

  test('nothing available means an empty string, never a placeholder', () => {
    expect(humanEntity()).toBe('');
    expect(humanEntity(null, null)).toBe('');
    expect(humanEntity(undefined, undefined)).toBe('');
    expect(humanEntity('', '')).toBe('');
  });
});

describe('humanizeTokens', () => {
  test('schema vocabulary becomes a sentence', () => {
    expect(humanizeTokens('open_plot')).toBe('Open plot');
    expect(humanizeTokens('a_b_c')).toBe('A b c');
    expect(humanizeTokens('agri_land and open_plot')).toBe('Agri land and Open plot');
  });

  test('text that is already human is left untouched', () => {
    expect(humanizeTokens('Sy 71-2')).toBe('Sy 71-2');
    expect(humanizeTokens('')).toBe('');
    // Only lower-case tokens are matched, so a shouting constant survives.
    expect(humanizeTokens('MIXED_CASE_TOKEN')).toBe('MIXED_CASE_TOKEN');
  });
});

describe('eventEntity', () => {
  test('CL-546: a detail that only restates the action is dropped', () => {
    expect(eventEntity('delete_registered_document', UUID, 'Deleted registered document')).toBe('');
    expect(eventEntity('delete_note', null, 'Deleted note')).toBe('');
    expect(eventEntity('create_passbook', null, 'Passbook')).toBe('');
    expect(eventEntity('add_member', null, 'member')).toBe('');
  });

  test('a detail that names the object survives', () => {
    expect(eventEntity('create_parcel', null, 'Sy 71-2')).toBe('Sy 71-2');
    expect(eventEntity('create_passbook', null, 'Passbook 12345')).toBe('Passbook 12345');
    expect(eventEntity('unknown_action', null, 'something specific')).toBe('something specific');
  });

  test('the surviving detail is humanised on the way out', () => {
    expect(eventEntity('create_property', null, 'open_plot')).toBe('Open plot');
  });

  test('a row that can only offer ids says nothing', () => {
    expect(eventEntity('create_document', UUID, UUID)).toBe('');
    expect(eventEntity('create_document', null, '')).toBe('');
    expect(eventEntity('create_document', null, '   ')).toBe('');
    expect(eventEntity('create_document', null, null)).toBe('');
  });

  test('a target is used when the detail is missing', () => {
    expect(eventEntity('create_parcel', 'Sy 71-2', null)).toBe('Sy 71-2');
  });
});

describe('parseAuditTime', () => {
  test('a bare API timestamp is read as UTC, not as local time', () => {
    // The API writes datetime.utcnow().isoformat() with no zone marker. Read as
    // local it landed hours in the future and pushed rows onto the wrong day.
    expect(parseAuditTime('2026-07-25T10:30:00').toISOString()).toBe('2026-07-25T10:30:00.000Z');
  });

  test('a timestamp that states its zone is believed', () => {
    expect(parseAuditTime('2026-07-25T10:30:00Z').toISOString()).toBe('2026-07-25T10:30:00.000Z');
    expect(parseAuditTime('2026-07-25T10:30:00+05:30').toISOString()).toBe('2026-07-25T05:00:00.000Z');
    expect(parseAuditTime('2026-07-25T10:30:00-07:00').toISOString()).toBe('2026-07-25T17:30:00.000Z');
  });

  test('a date-only value becomes UTC midnight', () => {
    expect(parseAuditTime('2026-07-25').toISOString()).toBe('2026-07-25T00:00:00.000Z');
  });

  test('an empty or unparseable value is an invalid Date, not a guess', () => {
    for (const bad of ['', '   ', 'garbage']) {
      expect(Number.isNaN(parseAuditTime(bad).getTime())).toBe(true);
    }
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-25T12:00:00Z');

  test('the first minute reads "just now"', () => {
    expect(relativeTime('2026-07-25T12:00:00', now)).toBe('just now');
    expect(relativeTime('2026-07-25T11:59:30', now)).toBe('just now');
  });

  test('minutes, then hours, then a named day', () => {
    expect(relativeTime('2026-07-25T11:59:00', now)).toBe('1m ago');
    expect(relativeTime('2026-07-25T11:45:00', now)).toBe('15m ago');
    expect(relativeTime('2026-07-25T11:01:00', now)).toBe('59m ago');
    expect(relativeTime('2026-07-25T11:00:00', now)).toBe('1h ago');
    expect(relativeTime('2026-07-24T13:00:00', now)).toBe('23h ago');
    expect(relativeTime('2026-07-24T12:00:00', now)).toBe('Yesterday');
    expect(relativeTime('2026-07-22T12:00:00', now)).toBe('3d ago');
    expect(relativeTime('2026-07-19T12:00:00', now)).toBe('6d ago');
  });

  test('at a week old it switches to a calendar date, not DD/MM/YYYY', () => {
    // FINDING against invariant 6: the feed's own idiom is "18 Jul". It is a
    // deliberate relative-time format, but it is not the India date shape, and
    // nothing outside this test says so.
    const iso = '2026-07-18T12:00:00';
    const shown = relativeTime(iso, now);
    expect(shown).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
    // The day is the reader's (next test), so the exact value comes from the
    // oracle; read in India, where the owners are, it is "18 Jul".
    expect(shown).toBe(dayMonthIn(RUNNER_ZONE, parseAuditTime(iso)));
    expect(dayMonthIn('Asia/Kolkata', parseAuditTime(iso))).toBe('18 Jul');
  });

  test('that calendar date is the READER’s day, not the owner’s', () => {
    // FINDING: an event 00:30 UTC reads "3 Jul" in India and "2 Jul" in
    // California — the same class of defect as the London-timezone filename.
    const iso = '2026-07-03T00:30:00';
    const instant = parseAuditTime(iso);
    expect(relativeTime(iso, now)).toBe(dayMonthIn(RUNNER_ZONE, instant));
    expect(dayMonthIn('Asia/Kolkata', instant)).toBe('3 Jul');
    expect(dayMonthIn('America/Los_Angeles', instant)).toBe('2 Jul');
  });

  test('an older year is not distinguished here', () => {
    // relativeTime omits the year (dayHeading adds it) — December 2025 reads the
    // same as December would next year.
    const iso = '2025-12-25T12:00:00';
    const shown = relativeTime(iso, now);
    expect(shown).not.toMatch(/\d{4}/);
    expect(shown).toBe(dayMonthIn(RUNNER_ZONE, parseAuditTime(iso)));
    expect(dayMonthIn('Asia/Kolkata', parseAuditTime(iso))).toBe('25 Dec');
  });

  test('an unparseable timestamp is echoed rather than faked', () => {
    expect(relativeTime('garbage', now)).toBe('garbage');
    expect(relativeTime('', now)).toBe('');
  });

  test('a timestamp in the future reads "just now"', () => {
    // FINDING: the elapsed minutes go negative and fall into the < 1 branch, so
    // clock skew between the API and the reader is shown as fresh activity.
    expect(relativeTime('2026-08-01T12:00:00', now)).toBe('just now');
  });
});

describe('dayHeading', () => {
  const now = new Date('2026-07-25T12:00:00Z');

  test('today and yesterday are named', () => {
    // The heading compares LOCAL calendar days, so the instants are built from
    // local components (as CL-549 below does) and the case holds in any zone.
    // Fixed UTC instants flip at UTC-10 and UTC+12: 09:00Z and 12:00Z straddle
    // local midnight there.
    const localNoon = new Date(2026, 6, 25, 12, 0);
    expect(dayHeading(new Date(2026, 6, 25, 9, 0).toISOString(), localNoon)).toBe('Today');
    expect(dayHeading(new Date(2026, 6, 24, 12, 0).toISOString(), localNoon)).toBe('Yesterday');
  });

  test('CL-549: the heading is a calendar day, not elapsed hours', () => {
    // Twenty minutes apart, either side of local midnight: the late-evening row
    // must not sit under "Today" the next morning. Built from local components
    // so the case holds in whatever zone the runner is in.
    const justAfterMidnight = new Date(2026, 6, 26, 0, 10);
    const lateEvening = new Date(2026, 6, 25, 23, 50);
    expect(dayHeading(lateEvening.toISOString(), justAfterMidnight)).toBe('Yesterday');
    expect(relativeTime(lateEvening.toISOString(), justAfterMidnight)).toBe('20m ago');
  });

  test('anything older than yesterday gets a date, and a past year gets its year', () => {
    // No "3d ago" here, unlike relativeTime: two days back is already a date.
    const localNoon = new Date(2026, 6, 25, 12, 0);
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0).toISOString();
    expect(dayHeading(at(2026, 6, 22), localNoon)).toBe('22 Jul');
    expect(dayHeading(at(2026, 6, 18), localNoon)).toBe('18 Jul');
    expect(dayHeading(at(2025, 11, 25), localNoon)).toBe('25 Dec 2025');
  });

  test('an unparseable timestamp files under "Earlier"', () => {
    expect(dayHeading('garbage', now)).toBe('Earlier');
    expect(dayHeading('', now)).toBe('Earlier');
  });

  test('a timestamp in the future files under "Today"', () => {
    // FINDING: the day difference is negative and the <= 0 branch claims it.
    expect(dayHeading('2026-08-01T12:00:00', now)).toBe('Today');
  });
});

describe('dedupeAuditEvents', () => {
  test('CL-8: identical consecutive events collapse into one counted row', () => {
    const merged = dedupeAuditEvents([
      row('upload_document', 'doc-a', '2026-07-25T11:04:00'),
      row('upload_document', 'doc-a', '2026-07-25T11:02:00'),
      row('upload_document', 'doc-a', '2026-07-25T11:00:00'),
      row('upload_document', 'doc-a', '2026-07-25T10:30:00'),
    ]);
    expect(merged.map((e) => e.count)).toEqual([3, 1]);
    // The row keeps the newest timestamp of its group.
    expect(merged[0].timestamp).toBe('2026-07-25T11:04:00');
    expect(merged[1].timestamp).toBe('2026-07-25T10:30:00');
  });

  test('the window is measured from the group’s newest event, not chained', () => {
    // Three rows four minutes apart span eight minutes, so the oldest starts a
    // new group even though each is within five minutes of its neighbour.
    const merged = dedupeAuditEvents([
      row('add_note', 'n1', '2026-07-25T11:00:00'),
      row('add_note', 'n1', '2026-07-25T10:56:00'),
      row('add_note', 'n1', '2026-07-25T10:52:00'),
    ]);
    expect(merged.map((e) => e.count)).toEqual([2, 1]);
  });

  test('the window boundary is inclusive to the millisecond', () => {
    const atFive = dedupeAuditEvents([
      row('add_note', 'n1', '2026-07-25T11:05:00'),
      row('add_note', 'n1', '2026-07-25T11:00:00'),
    ]);
    expect(atFive).toHaveLength(1);
    const justOver = dedupeAuditEvents([
      row('add_note', 'n1', '2026-07-25T11:05:00.001'),
      row('add_note', 'n1', '2026-07-25T11:00:00'),
    ]);
    expect(justOver).toHaveLength(2);
  });

  test('a different actor or a different target stays its own row', () => {
    expect(
      dedupeAuditEvents([
        row('delete_document', 'doc-b', '2026-07-25T11:02:00'),
        row('delete_document', 'doc-a', '2026-07-25T11:00:00'),
      ]),
    ).toHaveLength(2);
    expect(
      dedupeAuditEvents([
        row('add_note', 'n1', '2026-07-25T11:02:00', 'owner-1'),
        row('add_note', 'n1', '2026-07-25T11:00:00', 'owner-2'),
      ]),
    ).toHaveLength(2);
  });

  test('the caller’s window is honoured and the input is not mutated', () => {
    const input = [
      row('add_note', 'n1', '2026-07-25T11:02:00'),
      row('add_note', 'n1', '2026-07-25T11:00:00'),
    ];
    const snapshot = JSON.stringify(input);
    expect(dedupeAuditEvents(input, 60_000)).toHaveLength(2);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test('an empty feed produces an empty feed and extra fields survive', () => {
    expect(dedupeAuditEvents([])).toEqual([]);
    const withId = [{ ...row('add_note', 'n1', '2026-07-25T11:00:00'), id: 'row-1' }];
    expect(dedupeAuditEvents(withId)[0].id).toBe('row-1');
  });
});

describe('collapseAuditBursts', () => {
  test('CL-125: same actor and action collapse even across targets', () => {
    const merged = collapseAuditBursts([
      row('delete_document', 'doc-b', '2026-07-25T11:02:00'),
      row('delete_document', 'doc-a', '2026-07-25T11:00:00'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].count).toBe(2);
    // The target is blanked rather than guessed, because it was two papers.
    expect(merged[0].target).toBe('');
  });

  test('a shared target is kept', () => {
    const merged = collapseAuditBursts([
      row('add_note', 'n1', '2026-07-25T11:02:00'),
      row('add_note', 'n1', '2026-07-25T11:00:00'),
    ]);
    expect(merged[0].target).toBe('n1');
    expect(merged[0].count).toBe(2);
  });

  test('a different actor never collapses', () => {
    expect(
      collapseAuditBursts([
        row('add_note', 'n1', '2026-07-25T11:02:00', 'owner-1'),
        row('add_note', 'n1', '2026-07-25T11:00:00', 'owner-2'),
      ]),
    ).toHaveLength(2);
  });

  test('outside the window it is two rows again', () => {
    expect(
      collapseAuditBursts([
        row('delete_document', 'doc-b', '2026-07-25T11:06:00'),
        row('delete_document', 'doc-a', '2026-07-25T11:00:00'),
      ]),
    ).toHaveLength(2);
    expect(collapseAuditBursts([])).toEqual([]);
  });
});

describe('countedActionLabel', () => {
  test('one event reads exactly like the single label', () => {
    expect(countedActionLabel('delete_document', 1)).toBe('Deleted a document');
    expect(countedActionLabel('delete_document', 0)).toBe('Deleted a document');
  });

  test('several events pluralise the noun and drop the article', () => {
    expect(countedActionLabel('delete_document', 3)).toBe('Deleted 3 documents');
    expect(countedActionLabel('create_passbook', 4)).toBe('Created 4 passbooks');
    expect(countedActionLabel('send_notification', 2)).toBe('Sent 2 notifications');
    // "an" is handled as well as "a".
    expect(countedActionLabel('reveal_aadhaar', 2)).toBe('Viewed 2 Aadhaar numbers');
  });

  test('a label with no article falls back to a multiplier', () => {
    expect(countedActionLabel('apply_my_kyc', 2)).toBe('Updated your identity from Aadhaar ×2');
    expect(countedActionLabel('assign_land_to_group', 2)).toBe('Assigned land to a group ×2');
    expect(countedActionLabel('some_new_action', 2)).toBe('Some new action ×2');
  });

  test('a possessive label pluralises its tail', () => {
    // FINDING: the noun is everything after the article, so the plural lands on
    // the wrong word. Reachable from a real burst of parcel-location edits.
    expect(countedActionLabel('update_parcel_geo', 2)).toBe("Set 2 parcel's locations");
  });
});
