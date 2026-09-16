/**
 * The same gate, with the browser visible.
 *
 * Identical to playwright.config.ts in every way that affects a verdict — same
 * isolated API on :18080, same built bundle on :5175, same disposable database
 * — and different only in that you can watch it. Use it to SEE what a spec
 * does; use the headless one to decide whether it passes, because that is what
 * CI runs.
 *
 *   bun x playwright test --config=headed.config.ts -g "the vault"
 *
 * slowMo is the point of the file: without it Playwright drives faster than a
 * person can follow and the window is a blur of flashes.
 */
import base from './playwright.config';

export default {
  ...base,
  // A watched run is watched one browser at a time.
  workers: 1,
  // Slower steps mean a longer wall clock; the headless budget would trip.
  timeout: 180_000,
  reporter: [['list']],
  use: {
    ...(base as any).use,
    headless: false,
    launchOptions: { slowMo: Number(process.env.SLOW_MO || 400) },
  },
};
