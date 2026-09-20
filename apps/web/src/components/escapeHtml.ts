/**
 * HTML escaping for the strings that end up inside Leaflet popups/tooltips.
 *
 * Leaflet's bindPopup/bindTooltip take an HTML string (innerHTML), so every
 * record field interpolated into one — owner names, survey numbers, labels
 * prefilled from a document reading — has to be escaped at the point it is
 * concatenated, not at the sink.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
