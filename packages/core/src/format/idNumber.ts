/**
 * A twelve-digit run (any separators) in free text looks like an Aadhaar
 * number; the Network interest form refuses it in name, district, mandal and
 * note.
 *
 * ASCII-only, UX-only mirror of `services/api/src/aadhaar.py` `_AADHAAR_LIKE`.
 * The server is authoritative and stricter: Python's `\d` also matches other
 * digit scripts, so the server may reject a run this accepts. In JavaScript
 * `\d` is `[0-9]` and `[\W_]` is `[^0-9A-Za-z]`, so this pattern needs no
 * change to stay ASCII-only.
 */
const AADHAAR_LIKE = /(?<!\d)(?:\d[\W_]*){11}\d(?!\d)/u;

export function looksLikeAadhaar(text: string): boolean {
  return AADHAAR_LIKE.test(text);
}
