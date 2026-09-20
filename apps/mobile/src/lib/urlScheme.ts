/**
 * Which server-URL overrides are safe to accept (H-8b).
 *
 * Two rules, both of which a release build must pass:
 *
 *  - Scheme. Cleartext HTTP is allowed ONLY in a dev build, and only to
 *    localhost or an RFC-1918 private address — the addresses a simulator or a
 *    phone on the same LAN actually uses to reach a local dev server. A release
 *    build (the 7-tap debug panel included) must never accept an http:// host:
 *    the app ships x-user-id and other PII in cleartext.
 *  - Host. A release build may only be repointed at a host we control. Every
 *    request that follows carries the live Cognito Bearer token, so an https
 *    address typed (or dictated to the user) by somebody else hands them that
 *    token plus every deed, passbook and Aadhaar upload. A dev build accepts
 *    any https host — the device-test loop points it at a fresh tunnel domain
 *    every run — and a release build can be given extra hosts at BUILD time
 *    through EXPO_PUBLIC_ALLOWED_API_HOSTS (comma-separated), which is how a
 *    TestFlight build reaches a tunnel without opening the door to every host.
 *
 * Kept free of any React Native import so it can run under plain `bun run` —
 * see scripts/url-scheme-tests.ts.
 */
function isPrivateOrLocalHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  if (octets.some((o) => o > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** The product's own domain, plus whatever this build was given. */
export function allowedApiHosts(): string[] {
  const extra = (process.env.EXPO_PUBLIC_ALLOWED_API_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/\.+$/, ''))
    .filter(Boolean);
  return ['pattadar.com', ...extra];
}

/** A host matches an entry when it IS that domain or sits under it — never
 * when it merely ends with the same letters (evilpattadar.com). */
function hostIsAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/\.+$/, '');
  return allowed.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Empty clears the override (always allowed — falls back to the build's own
 * address). Anything else must be a well-formed URL whose scheme and host pass
 * the rules above.
 */
export function isAllowedApiUrl(url: string, isDev: boolean, allowed = allowedApiHosts()): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return isDev || hostIsAllowed(parsed.hostname, allowed);
  return parsed.protocol === 'http:' && isDev && isPrivateOrLocalHost(parsed.hostname);
}

/** Why an address was refused, naming the rule it has to satisfy. */
export function allowedApiUrlHint(isDev: boolean, allowed = allowedApiHosts()): string {
  return isDev
    ? 'Only an https:// address, or http:// to localhost or your own network, is allowed here.'
    : `Only an https:// address on ${allowed.join(' or ')} is allowed here.`;
}
