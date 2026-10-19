import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichText, prefixLines, richBlocks, wrapSelection } from './RichText';

const html = (t: string) => renderToStaticMarkup(<RichText text={t} />);

describe('richBlocks', () => {
  test('a plain note keeps its single line breaks as one paragraph', () => {
    expect(richBlocks('one\ntwo\n\nthree')).toEqual([
      { kind: 'p', lines: ['one', 'two'] }, { kind: 'p', lines: ['three'] },
    ]);
  });
  test('headings, bullets (including the AI note’s •) and numbered lists', () => {
    expect(richBlocks('### Boundary\n- a\n• b\n1. c\n2) d\nafter')).toEqual([
      { kind: 'h', text: 'Boundary' },
      { kind: 'ul', items: ['a', 'b'] },
      { kind: 'ol', items: ['c', 'd'], start: 1 },
      { kind: 'p', lines: ['after'] },
    ]);
  });
});

describe('RichText', () => {
  test('bold, italic and an http(s) link render as elements', () => {
    const out = html('**big** and *slant* see [deed](https://example.org/x)');
    expect(out).toContain('<strong>big</strong>');
    expect(out).toContain('<em>slant</em>');
    expect(out).toContain('href="https://example.org/x"');
    expect(out).toContain('rel="noreferrer noopener"');
  });
  test('raw HTML is text and a javascript: link is not a link', () => {
    const out = html('<script>alert(1)</script> [x](javascript:alert(1))');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('href=');
  });
});

describe('toolbar edits', () => {
  test('bold wraps the selection and keeps it selected', () => {
    expect(wrapSelection('a word b', 2, 6, '**')).toEqual({ value: 'a **word** b', start: 4, end: 8 });
  });
  test('a list toggles on every selected line, then off again', () => {
    const on = prefixLines('x\none\ntwo', 3, 8, 'ol');
    expect(on.value).toBe('x\n1. one\n2. two');
    expect(prefixLines(on.value, on.start, on.end, 'ol').value).toBe('x\none\ntwo');
  });
});

describe('review findings (13/10/2026)', () => {
  test('an asterisk between digits and underscores in names stay as typed', () => {
    expect(html('Plot 30*40 ft and 20*30 ft')).toContain('Plot 30*40 ft and 20*30 ft');
    expect(html('2*3*4')).toContain('2*3*4');
    expect(html('see sale_deed_2019.pdf and https://site/a_b_c')).toContain('sale_deed_2019.pdf and https://site/a_b_c');
    expect(html('a *real* word')).toContain('<em>real</em>');
  });
  test('italic inside bold, and a lone asterisk in plain text', () => {
    expect(html('**very *key* point**')).toContain('<strong>very <em>key</em> point</strong>');
    expect(html('a * b and *c*')).toContain('a * b and <em>c</em>');
  });
  test('numbered lists keep their numbers; a year stays a year', () => {
    expect(html('3. third')).toContain('<ol start="3"><li>third</li></ol>');
    expect(html('2019. Sold to Ravi')).toContain('start="2019"');
    expect(html('1. a\n2. b')).toContain('<ol><li>a</li><li>b</li></ol>');
  });
  test('a link with parentheses in its address', () => {
    expect(html('[wiki](https://en.wikipedia.org/wiki/Patta_(land))')).toContain('href="https://en.wikipedia.org/wiki/Patta_(land)"');
  });
  test('bold toggles off; italic on a bold word adds a mark', () => {
    expect(wrapSelection('**x**', 2, 3, '**')).toEqual({ value: 'x', start: 0, end: 1 });
    expect(wrapSelection('**x**', 2, 3, '*').value).toBe('***x***');
  });
  test('list buttons skip blank lines, respect a line-start selection end, and an empty first line', () => {
    expect(prefixLines('a\n\nb', 0, 4, 'ul').value).toBe('- a\n\n- b');
    expect(prefixLines('a\n\nb', 0, 4, 'ol').value).toBe('1. a\n\n2. b');
    expect(prefixLines('one\ntwo', 0, 4, 'ul').value).toBe('- one\ntwo');
    expect(prefixLines('\nrest', 0, 0, 'ul').value).toBe('- \nrest');
  });
});
