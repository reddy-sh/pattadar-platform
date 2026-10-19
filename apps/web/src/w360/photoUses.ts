/** What deleting one photo or clip also takes away (W14 — one file, several
 *  jobs).
 *
 *  A photo row can be a feature's current condition (`featureId`), the
 *  evidence on an order (`orderRef`) and the property's cover (`isCover`) at
 *  once, and the gallery is only one of those places. delete_photo removes the
 *  ROW (web360.py), so every one of those uses goes with it — which is exactly
 *  what the owner has to be told before pressing Delete, not after. */
export interface PhotoUseFacts {
  featureId?: string;
  orderRef?: string;
  isCover?: boolean;
}

export function photoUses(p: PhotoUseFacts): string[] {
  return [
    p.isCover ? 'this property’s cover' : '',
    p.featureId ? 'a feature’s current condition on the Site features tab' : '',
    p.orderRef ? `the evidence on order ${p.orderRef}` : '',
  ].filter(Boolean);
}

const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('')
  : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The delete confirmation's body. */
export function deleteBody(p: PhotoUseFacts, kind: string): string {
  const uses = photoUses(p);
  const kept = 'It is kept for 30 days, then deleted for good.';
  if (!uses.length) return kept;
  return `This ${kind} is also ${joinAnd(uses)}. One file, saved once: deleting it here `
    + `takes it off ${uses.length === 1 ? 'there' : 'all of them'} too. ${kept}`;
}

/** The bulk confirmation's body: the same uses, gathered over the selection,
 *  so deleting a selection that holds the cover or an order's evidence says
 *  so as the single delete does. */
export function bulkDeleteBody(items: PhotoUseFacts[]): string {
  const kept = `${items.length === 1 ? 'It is' : 'They are'} kept for 30 days, then deleted for good.`;
  const uses = [...new Set(items.flatMap(photoUses))];
  if (!uses.length) return kept;
  const them = items.length === 1 ? 'it' : 'them';
  return `${items.length === 1 ? 'This item is' : 'These items are'} also ${joinAnd(uses)}. `
    + `Deleting ${them} here takes ${them} off ${uses.length === 1 ? 'there' : 'all of them'} too. ${kept}`;
}
