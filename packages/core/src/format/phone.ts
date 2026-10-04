/**
 * Indian mobile numbers as the Pattadar Network interest form accepts them.
 *
 * Client mirror of `services/api/src/network.py` `_normalise_phone`; the server
 * rule is authoritative and both sides share the same test vectors
 * (phone.test.ts and services/api/tests/test_network_interest.py).
 */

/** ASCII digits only — mirrors network.py. A number typed in Devanagari,
 * Telugu or full-width digits is invalid, so the stored form and the dedup key
 * are always the one ASCII `+91XXXXXXXXXX`. */
const INDIAN_MOBILE = /^(?:\+91|91|0)?([6-9][0-9]{9})$/;

/** Longest raw input accepted before stripping separators. */
export const PHONE_MAX_RAW = 20;

/** `+91` followed by the ten-digit mobile, or `null` when `raw` is not an
 * Indian mobile number. Spaces, `-`, `(` and `)` are ignored. */
export function normalizeIndianMobile(raw: string): string | null {
  if (raw.length > PHONE_MAX_RAW) return null;
  const m = INDIAN_MOBILE.exec(raw.replace(/[ \-()]/g, ''));
  return m ? `+91${m[1]}` : null;
}
