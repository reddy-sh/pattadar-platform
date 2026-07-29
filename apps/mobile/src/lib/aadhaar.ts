/**
 * Aadhaar helpers. Aadhaar is the most sensitive identifier this app touches:
 * the number is only ever SENT to our own API (which stores it masked and
 * returns `aadhaarMasked` on read), the card image is never copied into the
 * app's local file store, and nothing is guessed — an unreadable scan leaves
 * the field empty rather than inventing digits.
 */

/** "123412341234" → "1234 1234 1234" (input formatting, max 12 digits). */
export function formatAadhaar(v?: string): string {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(0, 12)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export function aadhaarDigits(v?: string): string {
  return String(v || '').replace(/\D/g, '');
}

/** Empty is allowed (optional field); anything present must be exactly 12. */
export function isValidAadhaar(v?: string): boolean {
  const d = aadhaarDigits(v);
  return d.length === 0 || d.length === 12;
}

/** Display form once stored — "XXXX XXXX 1234". */
export function maskAadhaar(v?: string): string {
  const d = aadhaarDigits(v);
  return d.length === 12 ? `XXXX XXXX ${d.slice(8)}` : '';
}

export interface AadhaarFields {
  name?: string;
  dob?: string;
  gender?: string;
  aadhaar?: string;
  address?: string;
  confidence?: string;
}

/** What the scan produced, in the form the member form consumes. Fields the
 * model couldn't read stay empty so they never overwrite typed input. */
export function aadhaarPrefill(f: AadhaarFields): {
  name: string;
  dob: string;
  gender: string;
  aadhaar: string;
  address: string;
  lowConfidence: boolean;
  readAnything: boolean;
} {
  const name = String(f.name ?? '').trim();
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(String(f.dob ?? '').trim()) ? String(f.dob).trim() : '';
  const genderRaw = String(f.gender ?? '').trim().toLowerCase();
  const gender = ['male', 'female', 'other'].includes(genderRaw) ? genderRaw : '';
  const digits = aadhaarDigits(f.aadhaar);
  const aadhaar = digits.length === 12 ? formatAadhaar(digits) : '';
  const address = String(f.address ?? '').trim();
  return {
    name,
    dob,
    gender,
    aadhaar,
    address,
    lowConfidence: String(f.confidence ?? '').toLowerCase() === 'low',
    readAnything: Boolean(name || dob || gender || aadhaar || address),
  };
}
