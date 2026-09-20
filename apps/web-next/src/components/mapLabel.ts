/**
 * Popup and tooltip text for the Leaflet map.
 *
 * Leaflet's `bindPopup`/`bindTooltip` insert a string as `innerHTML`, so a
 * survey number, an owner name or an address typed into a record is markup the
 * moment it reaches one. Every string bound to the map goes through here: the
 * engine never receives markup a screen concatenated, only the card this file
 * builds out of escaped text.
 */

/** Map popup/tooltip content: plain text, or a small card of plain-text rows. */
export type MapLabel = string | { title?: string; lines?: Array<string | null | undefined | false> };

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** The markup for a label — escaped text, or an escaped title-and-rows card. */
export function labelHtml(label: MapLabel): string {
  if (typeof label === 'string') return escapeHtml(label);
  const title = label.title
    ? `<div style="font-weight:600;font-size:13px">${escapeHtml(label.title)}</div>`
    : '';
  const rows = (label.lines || [])
    .filter((line): line is string => !!line)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');
  return `<div style="min-width:190px;line-height:1.55">${title}${rows}</div>`;
}
