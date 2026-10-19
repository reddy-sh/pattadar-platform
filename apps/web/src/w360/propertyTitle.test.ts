import { expect, test } from 'bun:test';
import { propertyTabTitle } from './propertyTitle';

const rec = { title: 'Mango orchard', surveyNo: '262/1', extent: 2.4, extentUnit: 'ac' };

test('tab title names the LP and the extent in words', () => {
  expect(propertyTabTitle(rec)).toBe('LP 262/1 · 2.40 acres');
  expect(propertyTabTitle({ ...rec, extent: 1 })).toBe('LP 262/1 · 1.00 acre');
  expect(propertyTabTitle({ ...rec, extent: 1450, extentUnit: 'sq.yd' })).toBe('LP 262/1 · 1,450 sq yds');
  expect(propertyTabTitle({ ...rec, extent: 900, extentUnit: 'sq.ft' })).toBe('LP 262/1 · 900 sq ft');
});

test('no survey number falls back to the title; no extent drops the extent', () => {
  expect(propertyTabTitle({ ...rec, surveyNo: '' })).toBe('Mango orchard · 2.40 acres');
  expect(propertyTabTitle({ ...rec, extent: 0 })).toBe('LP 262/1');
});
