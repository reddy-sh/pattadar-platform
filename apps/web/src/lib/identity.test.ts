import { describe, expect, test } from 'bun:test';

import { personName, safePicture } from './identity';

describe('personName', () => {
  const id = `subject_${'f3'.repeat(32)}`;

  test('a principal id is not a name, whoever it belongs to', () => {
    expect(personName(id, id)).toBe('');
    expect(personName(`subject_${'ab'.repeat(32)}`)).toBe('');
  });

  test('the bare uid and blanks are not names', () => {
    expect(personName('shankarreddy.t', 'shankarreddy.t')).toBe('');
    expect(personName('   ')).toBe('');
    expect(personName(undefined)).toBe('');
  });

  test('a real name survives, trimmed', () => {
    expect(personName('  Sankara Telukutla ', id)).toBe('Sankara Telukutla');
    expect(personName('subject_matter')).toBe('subject_matter');
  });
});

describe('safePicture', () => {
  test('an https photo address is kept', () => {
    const url = 'https://lh3.googleusercontent.com/a/abc=s96-c';
    expect(safePicture(url)).toBe(url);
  });

  test('anything that is not https is dropped', () => {
    expect(safePicture('http://example.com/a.png')).toBe('');
    expect(safePicture('javascript:alert(1)')).toBe('');
    expect(safePicture('data:image/png;base64,AAAA')).toBe('');
    expect(safePicture('not a url')).toBe('');
    expect(safePicture(undefined)).toBe('');
  });
});
