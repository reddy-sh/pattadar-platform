import { expect, test } from 'bun:test';
import { surveyNumber } from './surveyNumber';

test('survey matching preserves every subdivision', () => {
  expect(surveyNumber('Sy 262/1')).toBe('262/1');
  expect(surveyNumber('Survey No. 0262 / 01A')).toBe('262/1a');
  expect(surveyNumber('Plot 262-1')).toBe('262/1');
  expect(surveyNumber('262')).toBe('262');
  expect(surveyNumber('Sy 262/1')).not.toBe(surveyNumber('262'));
});

test('an unrelated number in a title does not claim a survey plot', () => {
  for (const title of ['Farm bought 2018', 'Flat 4B', 'Khata 262', '262 and 263', '']) {
    expect(surveyNumber(title)).toBe('');
  }
});
