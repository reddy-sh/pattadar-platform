/**
 * A parcel's survey number, owner and address are typed by whoever entered the
 * record. Leaflet binds popups and tooltips with `innerHTML`, so anything that
 * survives this file as markup executes in the browser of everyone the record
 * is shared with.
 */
import { describe, expect, test } from 'bun:test';

import { escapeHtml, labelHtml } from './mapLabel';

describe('escapeHtml', () => {
  test('neutralizes every character that can open a tag or attribute', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
    expect(escapeHtml("' onmouseover='alert(1)")).toBe('&#39; onmouseover=&#39;alert(1)');
    expect(escapeHtml('Rao & Sons')).toBe('Rao &amp; Sons');
  });

  test('leaves ordinary record text alone', () => {
    expect(escapeHtml('Sy. No. 120/3 · 2.50 acres')).toBe('Sy. No. 120/3 · 2.50 acres');
    expect(escapeHtml('')).toBe('');
  });
});

describe('labelHtml', () => {
  test('a plain-text label is text, never markup', () => {
    expect(labelHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('a card escapes its title and every row', () => {
    const html = labelHtml({
      title: 'Survey <script>alert(1)</script>',
      lines: ['Owner: "><img src=x onerror=alert(1)>', null, '', false, '📍 Mangalakunta'],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<div>📍 Mangalakunta</div>');
    // empty / null / false rows produce no row at all
    expect(html.match(/<div>/g)?.length).toBe(2);
  });

  test('a card with nothing in it is still a well-formed container', () => {
    expect(labelHtml({})).toBe('<div style="min-width:190px;line-height:1.55"></div>');
  });
});
