import { expect, test } from 'bun:test';
import { mergeUploads, recordInVillage, resolveVillage } from './villageResolve';

const row = (village: string, district: string, mandal: string, key: string) =>
  ({ village, district, mandal, key, state: 'Andhra Pradesh' });

const ROWS = [
  row('MYLAVARAM', 'BAPATLA', 'ADDANKI', 'ap/bapatla/adanki/mylavaram'),
  row('MYLAVARAM', 'PRAKASAM', 'CHIMAKURTHI', 'ap/prakasam/chimakurti/mylavaram'),
  row('CHINTHAGUNTA', 'MARKAPURAM', 'KONAKANAMITLA', 'ap/markapuram/konakanamitla/chintagunta'),
];

test('a village of its own is found by name alone, in any spelling', () => {
  expect(resolveVillage(ROWS, 'Chintagunta')?.key).toBe('ap/markapuram/konakanamitla/chintagunta');
});

test('a full key is an exact match', () => {
  expect(resolveVillage(ROWS, 'ap/prakasam/chimakurti/mylavaram')?.mandal).toBe('CHIMAKURTHI');
  expect(resolveVillage(ROWS, 'ap/prakasam/nowhere/mylavaram')).toBeNull();
});

test('a shared name is settled by the mandal the record names', () => {
  expect(resolveVillage(ROWS, 'Mylavaram', ['Chimakurthi', 'Prakasam'])?.district).toBe('PRAKASAM');
  expect(resolveVillage(ROWS, 'Mylavaram', ['Addanki'])?.district).toBe('BAPATLA');
});

test('then by the district', () => {
  expect(resolveVillage(ROWS, 'Mylavaram', ['Bapatla'])?.mandal).toBe('ADDANKI');
});

test('a shared name the record cannot settle gets no map rather than a guess', () => {
  expect(resolveVillage(ROWS, 'Mylavaram')).toBeNull();
  expect(resolveVillage(ROWS, 'Mylavaram', ['Ongole'])).toBeNull();
});

test('an upload replaces the one shipped village of its name and takes its place', () => {
  const up = { village: 'Chintagunta', key: 'chintagunta', uploaded: true };
  const merged = mergeUploads(ROWS, [up]);
  expect(merged.find((r) => r.key === 'ap/markapuram/konakanamitla/chintagunta')).toBeUndefined();
  const got = merged.find((r) => r.key === 'chintagunta');
  expect(got?.mandal).toBe('KONAKANAMITLA');
  expect(merged).toHaveLength(3);
});

test('an upload whose name is shared replaces neither', () => {
  const merged = mergeUploads(ROWS, [{ village: 'Mylavaram', key: 'mylavaram', uploaded: true }]);
  expect(merged).toHaveLength(4);
  expect(merged.find((r) => r.key === 'mylavaram')?.mandal).toBeUndefined();
});

test('a record matches an open village by name; a shared name needs the mandal too', () => {
  const open = ROWS[0];
  expect(recordInVillage({ village: 'Chintagunta', mandal: 'Konakalamitla' }, ROWS[2])).toBe(true);
  expect(recordInVillage({ village: 'Mylavaram', mandal: 'Chimakurthi' }, open, true)).toBe(false);
  expect(recordInVillage({ village: 'Mylavaram', mandal: 'Addanki' }, open, true)).toBe(true);
  expect(recordInVillage({ village: 'Mylavaram', mandal: '' }, open, true)).toBe(true);
  expect(recordInVillage({ village: 'Other' }, open)).toBe(false);
});
