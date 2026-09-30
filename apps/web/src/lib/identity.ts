/**
 * Who a person is, in words — and what is NOT a name.
 *
 * The API seeds `users.name` with the principal id on first contact
 * (`me` in services/api/src/main.py), so a fresh account's "name" is a
 * string like `subject_f3fc…`. Every screen that prints a name, and every
 * place that decides whether a name still needs filling in, asks here.
 */

/** A principal id, a bare uid or blank is not a person's name. */
export function personName(name: string | null | undefined, id?: string): string {
  const n = (name || '').trim();
  if (!n || (id && n === id) || /^subject_[0-9a-f]{64}$/i.test(n)) return '';
  return n;
}

/** Only an https image from the identity provider is drawn as a face. A
 *  `picture` claim is provider-supplied text; anything else is ignored. */
export function safePicture(url: string | null | undefined): string {
  const u = (url || '').trim();
  try {
    return new URL(u).protocol === 'https:' ? u : '';
  } catch {
    return '';
  }
}
