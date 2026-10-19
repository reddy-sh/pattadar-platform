import { expect, test } from 'bun:test';

import {
  catalogueRole, factError, groupTypeDef, missingFacts, panWarn, parseFacts, pickFacts, shareLabel,
  visibleFields,
} from './familiesData';
import { COUNTRY_CODES, countryName } from '../../lib/countries';

const company = groupTypeDef('company');
const keys = (fs: { key: string }[]) => fs.map((f) => f.key);
const field = (type: string, key: string) => groupTypeDef(type).fields.find((f) => f.key === key)!;

test('stored facts read defensively', () => {
  expect(parseFacts('')).toEqual({});
  expect(parseFacts(undefined)).toEqual({});
  expect(parseFacts('not json')).toEqual({});
  expect(parseFacts('[1]')).toEqual({});
  expect(parseFacts('{"pan":"AAACA1234A","x":{}}')).toEqual({ pan: 'AAACA1234A' });
});

test('an Indian company asks for a CIN, an LLP for an LLPIN, abroad for neither', () => {
  expect(keys(visibleFields(company.fields, { sub_kind: 'Private limited' }))).toContain('cin');
  const llp = keys(visibleFields(company.fields, { sub_kind: 'LLP' }));
  expect(llp).toContain('llpin');
  expect(llp).not.toContain('cin');
  const us = keys(visibleFields(company.fields, { country: 'US', sub_kind: 'Private limited' }));
  expect(us).toEqual(expect.arrayContaining(['reg_no', 'tax_id']));
  expect(us).not.toContain('cin');
  expect(us).not.toContain('pan');
});

test('required means required while visible', () => {
  const miss = keys(missingFacts(company.fields, { sub_kind: 'LLP' }));
  expect(miss).toContain('llpin');
  expect(miss).not.toContain('cin');
  expect(keys(missingFacts(groupTypeDef('partnership').fields, { registered: 'No' }))).not.toContain('reg_no');
});

test('a stale value behind a hidden field reveals nothing', () => {
  const trust = groupTypeDef('trust').fields;
  // sanction is hidden for a private trust, so its stale "Yes" must not show the authority.
  const shown = keys(visibleFields(trust, { sub_kind: 'Private trust', sanction: 'Yes' }));
  expect(shown).not.toContain('sanction');
  expect(shown).not.toContain('sanction_authority');
});

test('format errors block; a personal PAN is refused; the 4th letter only warns', () => {
  const pan = field('company', 'pan');
  expect(factError(pan, 'aaaca1234a')).toBe('');
  expect(factError(pan, 'AAAC1234A')).toContain('PAN does not look right');
  expect(factError(pan, 'ABCPE1234F')).toBe("This is a personal PAN; enter the company's PAN.");
  expect(panWarn(pan, 'AAAFA1234A', { sub_kind: 'Private limited' })).toContain('usually C');
  expect(panWarn(pan, 'AAAFA1234A', { sub_kind: 'LLP' })).toBe('');
  expect(panWarn(pan, 'AAAFA1234A', { sub_kind: 'Other' })).toBe('');
  expect(factError(field('company', 'incorporated_on'), '20240101')).toContain('does not look right');
  expect(factError(field('company', 'incorporated_on'), '2999-01-01')).toContain('cannot be in the future');
  expect(factError(field('company', 'sub_kind'), 'Nonsense')).toContain('does not look right');
  expect(factError(field('company', 'address'), 'x'.repeat(201))).toBe('Registered office is too long.');
});

test('only visible, non-empty facts are sent, normalised', () => {
  const out = JSON.parse(pickFacts(company.fields, {
    country: 'IN', sub_kind: 'LLP', cin: 'U01100TG2015PTC123456', llpin: 'aab-1234', address: '  Plot 4,  Hyderabad ', status: '',
  }));
  expect(out).toEqual({ country: 'IN', sub_kind: 'LLP', llpin: 'AAB-1234', address: 'Plot 4, Hyderabad' });
});

test('member fields follow the role and the group country', () => {
  const m = company.memberFields;
  expect(keys(visibleFields(m, {}, 'Director'))).toContain('din');
  expect(keys(visibleFields(m, {}, 'Shareholder'))).not.toContain('din');
  expect(keys(visibleFields(m, {}, 'Director', { country: 'GB' }))).not.toContain('din');
  const llpSign = visibleFields(m, {}, 'Authorized Signatory', { sub_kind: 'LLP' }).filter((f) => f.key === 'resolution_on');
  expect(llpSign.map((f) => f.label)).toEqual(["Partners' resolution date"]);
  // The group's facts steer the member's, but are never saved on the member.
  expect(JSON.parse(pickFacts(m, { din: '01234567' }, 'Director', { country: 'IN' }))).toEqual({ din: '01234567' });
});

test('roles: default, catalogue spelling, share labels', () => {
  expect(groupTypeDef('company').defaultRole).toBe('Director');
  expect(groupTypeDef('partnership').defaultRole).toBe('Partner');
  expect(catalogueRole('partnership', '  sleeping   PARTNER ')).toBe('Sleeping partner');
  expect(catalogueRole('partnership', 'Advisor')).toBe('Advisor');
  expect(shareLabel('company', 'Shareholder')).toBe('Shareholding %');
  expect(shareLabel('company', 'Director')).toBe('');
});

test('the country list is ISO alpha-2 and names fall back to the code', () => {
  expect(COUNTRY_CODES.length).toBeGreaterThan(240);
  expect(COUNTRY_CODES).toContain('IN');
  expect(COUNTRY_CODES.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
  expect(countryName('')).toBe('');
  expect(countryName('IN').length).toBeGreaterThan(1);
});
