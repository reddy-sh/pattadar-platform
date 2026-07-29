/** Server-URL override scheme validation (H-8b) — `bun run scripts/url-scheme-tests.ts`. */
import { isAllowedApiUrl } from '../apps/mobile/src/lib/urlScheme';

let failures = 0;
const check = (name: string, got: boolean, want: boolean) => {
  if (got !== want) { failures += 1; console.error(`FAIL: ${name} — got ${got}, want ${want}`); }
};

// https is always allowed, dev or prod, any host.
check('https prod', isAllowedApiUrl('https://pattadar.com/api', false), true);
check('https dev', isAllowedApiUrl('https://pattadar.com/api', true), true);
check('https local dev', isAllowedApiUrl('https://192.168.1.5:8080', true), true);

// http is rejected outside dev regardless of host.
check('http prod, public host', isAllowedApiUrl('http://example.com', false), false);
check('http prod, localhost', isAllowedApiUrl('http://localhost:8080', false), false);
check('http prod, RFC-1918', isAllowedApiUrl('http://192.168.1.5:8080', false), false);

// http is allowed in dev, but only to localhost / RFC-1918.
check('http dev, localhost', isAllowedApiUrl('http://localhost:8080', true), true);
check('http dev, 127.0.0.1', isAllowedApiUrl('http://127.0.0.1:8080', true), true);
check('http dev, 10.x', isAllowedApiUrl('http://10.0.2.2:8080', true), true);
check('http dev, 172.16-31.x', isAllowedApiUrl('http://172.20.0.5:8080', true), true);
check('http dev, 172.x out of range', isAllowedApiUrl('http://172.40.0.5:8080', true), false);
check('http dev, 192.168.x', isAllowedApiUrl('http://192.168.1.5:8080', true), true);
check('http dev, public host', isAllowedApiUrl('http://example.com', true), false);
check('http dev, public IP', isAllowedApiUrl('http://93.184.216.34', true), false);

// Garbage is always rejected.
check('garbage, dev', isAllowedApiUrl('not a url', true), false);
check('garbage, prod', isAllowedApiUrl('not a url', false), false);
check('ftp scheme', isAllowedApiUrl('ftp://192.168.1.5', true), false);

// Empty clears the override — always allowed.
check('empty, dev', isAllowedApiUrl('', true), true);
check('empty, prod', isAllowedApiUrl('   ', false), true);

console.log(failures === 0 ? 'URL SCHEME TESTS PASS' : `URL SCHEME TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
