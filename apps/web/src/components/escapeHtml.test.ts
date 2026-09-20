import { expect, test } from 'bun:test';
import { escapeHtml } from './escapeHtml';

test('markup in a record field becomes text in a map popup, never a tag', () => {
  // The owner name a deed reading can prefill is the one an attacker steers.
  expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
  );
  expect(escapeHtml("'\"><script>fetch('/steal')</script>")).toBe(
    '&#39;&quot;&gt;&lt;script&gt;fetch(&#39;/steal&#39;)&lt;/script&gt;',
  );
  expect(escapeHtml('Rao & Sons')).toBe('Rao &amp; Sons');
});

test('ordinary record text survives unchanged', () => {
  expect(escapeHtml('123/2A')).toBe('123/2A');
  expect(escapeHtml('Mangalakunta, Kadapa, Andhra Pradesh')).toBe('Mangalakunta, Kadapa, Andhra Pradesh');
});
