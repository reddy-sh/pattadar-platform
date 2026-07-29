/**
 * WCAG relative luminance helper — `bun run scripts/contrast-helper-tests.ts`.
 *
 * PersonAvatar picks black or white initials against a per-name generated
 * background (H-9): the wrong branch reads as illegible initials on a light
 * avatar hue. Pure, no react-native import — runs directly under bun.
 */
import { relLuminance } from '../apps/mobile/src/lib/contrast';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const LIGHT = '#f0f0a0';
const DARK = '#2e2e2e';

const light = relLuminance(LIGHT);
const dark = relLuminance(DARK);

check('light background has high relative luminance', light > 0.5, `${light}`);
check('dark background has low relative luminance', dark < 0.5, `${dark}`);

// The exact ternary PersonAvatar uses to pick initials color.
const fg = (hex: string) => (relLuminance(hex) > 0.5 ? '#000' : '#fff');

check('light background flips to black initials', fg(LIGHT) === '#000', fg(LIGHT));
check('dark background flips to white initials', fg(DARK) === '#fff', fg(DARK));

console.log(failures === 0 ? 'CONTRAST HELPER TESTS PASS' : `CONTRAST HELPER TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
