/**
 * updateMember writes every column of a member row, so a field the edit
 * document leaves out is not "unchanged" — it is blanked. These lock the two
 * halves of the round trip together: whatever the mutation can write, the
 * member read must return, or a client cannot echo it back and an edit made
 * from one screen destroys succession data entered on another.
 */
import { describe, expect, test } from 'bun:test';

import { ADD_MEMBER_MUTATION, GROUP_MEMBERS_QUERY, UPDATE_MEMBER_MUTATION } from './operations';

/** Names on the left of `arg: $var` inside the mutation's call. */
const args = (doc: string): string[] =>
  [...doc.slice(doc.indexOf('{', doc.indexOf(')'))).matchAll(/(\w+):\s*\$/g)].map((m) => m[1]);

/** Field names in a query's selection set. */
const selection = (doc: string): string[] =>
  [...doc.matchAll(/\{([^{}]*)\}/g)].flatMap((m) => m[1].trim().split(/\s+/)).filter(Boolean);

/** Written only, never read back: `id` addresses the row and the Aadhaar pair
 *  comes back masked as `aadhaarMasked`. */
const WRITE_ONLY = ['id', 'aadhaar', 'aadhaarCandidateId'];

describe('member write/read contract', () => {
  test('the edit carries every field add-member can set', () => {
    const addable = args(ADD_MEMBER_MUTATION).filter((a) => a !== 'groupId');
    expect(args(UPDATE_MEMBER_MUTATION).sort()).toEqual([...addable, 'id'].sort());
  });

  test('every field the edit writes is readable, so callers can echo it back', () => {
    const readable = selection(GROUP_MEMBERS_QUERY);
    const unreadable = args(UPDATE_MEMBER_MUTATION)
      .filter((a) => !WRITE_ONLY.includes(a))
      .filter((a) => !readable.includes(a));
    expect(unreadable).toEqual([]);
  });

  test('the succession fields a blank write would destroy are named in both', () => {
    for (const f of [
      'fatherId', 'motherId', 'spouseId', 'kind', 'parcelId', 'guardianName',
      'guardianContact', 'maritalStatus', 'spouseName', 'spouseContact', 'spouseStatus',
    ]) {
      expect(args(UPDATE_MEMBER_MUTATION)).toContain(f);
      expect(selection(GROUP_MEMBERS_QUERY)).toContain(f);
    }
  });
});
