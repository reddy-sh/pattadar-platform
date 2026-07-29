/**
 * Member age, verification state and the minor→adult transition.
 *
 * Policy this encodes:
 *  - every member is invited on creation;
 *  - once they accept, mobile + SMS verification is mandatory;
 *  - minors are exempt — the guardian acts for them;
 *  - the day a minor turns 18 the exemption ends and the record must be
 *    verified by the member themselves, so it is flagged rather than left
 *    quietly relying on a guardian who no longer has standing.
 */

export const ADULT_AGE = 18;

/** Whole years, computed from the calendar date (no timezone drift). */
export function ageFromDob(dob?: string | null, now: Date = new Date()): number | null {
  const m = String(dob ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getFullYear() - y;
  const beforeBirthday =
    now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function isMinor(dob?: string | null, now: Date = new Date()): boolean {
  const age = ageFromDob(dob, now);
  return age !== null && age < ADULT_AGE;
}

export type MemberState =
  | 'self'
  | 'verified'
  | 'awaiting_verification'
  | 'invited'
  | 'not_invited'
  | 'minor_exempt'
  | 'newly_adult'
  | 'revoked';

export interface StateInput {
  isSelf: boolean;
  status: string;
  inviteStatus?: string;
  inviteToken?: string;
  dob?: string | null;
  phone?: string;
  phoneVerified?: boolean;
}

export interface StateResult {
  state: MemberState;
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'muted';
  /** Needs the owner to do something. */
  actionable: boolean;
}

export function memberState(m: StateInput, now: Date = new Date()): StateResult {
  if (m.isSelf) return { state: 'self', label: 'Owner', tone: 'muted', actionable: false };
  if (m.status === 'revoked') return { state: 'revoked', label: 'Revoked', tone: 'bad', actionable: false };

  const minor = isMinor(m.dob, now);
  // A guardian stands in for a minor, so no invite or SMS is expected.
  if (minor) return { state: 'minor_exempt', label: 'Minor · guardian acts', tone: 'muted', actionable: false };

  if (m.status === 'verified') {
    // Accepted while still a minor, now of age: the exemption has lapsed and
    // the member must verify in their own right.
    if (!m.phoneVerified && !m.phone) {
      return { state: 'newly_adult', label: 'Now an adult · needs mobile verification', tone: 'warn', actionable: true };
    }
    return { state: 'verified', label: 'Verified', tone: 'ok', actionable: false };
  }
  if (m.inviteStatus === 'joined') {
    return { state: 'awaiting_verification', label: 'Accepted · awaiting SMS verification', tone: 'warn', actionable: true };
  }
  if (m.inviteStatus === 'invited' || m.inviteToken) {
    return { state: 'invited', label: 'Invited', tone: 'warn', actionable: true };
  }
  return { state: 'not_invited', label: 'Not invited', tone: 'warn', actionable: true };
}

/** Mobile is mandatory for an adult member — that is how verification happens. */
export function missingMobile(m: StateInput, now: Date = new Date()): boolean {
  return !m.isSelf && !isMinor(m.dob, now) && !(m.phone ?? '').trim();
}
