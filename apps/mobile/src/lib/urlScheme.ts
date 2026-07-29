/**
 * Which server-URL overrides are safe to accept (H-8b).
 *
 * HTTPS is always allowed. Cleartext HTTP is allowed ONLY in a dev build, and
 * only to localhost or an RFC-1918 private address — the addresses a
 * simulator or a phone on the same LAN actually uses to reach a local dev
 * server. A release build (the 7-tap debug panel included) must never accept
 * an http:// host: the app ships x-user-id and other PII in cleartext, so
 * repointing it at an arbitrary http:// host is a full PII-exfiltration path.
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

/**
 * Empty clears the override (always allowed — falls back to the build's own
 * address). Anything else must be a well-formed URL whose scheme passes the
 * rule above.
 */
export function isAllowedApiUrl(url: string, isDev: boolean): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  return parsed.protocol === 'http:' && isDev && isPrivateOrLocalHost(parsed.hostname);
}
