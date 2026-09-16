/**
 * One question, asked once: is the portal actually there?
 *
 * This suite starts no servers — the founder's dev stack is theirs to run, and
 * a second Vite racing it for :5173 would take both down (that is why
 * `strictPort` is set in apps/web/vite.config.ts). The cost of not starting one
 * is that a stack which happens to be down produces a wall of identical
 * navigation timeouts, one per test, and none of them says the useful thing.
 *
 * So the useful thing is said here, first, and the run stops.
 */
import { WEB_URL } from '../playwright.config';

export default async function globalSetup(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${WEB_URL}/app`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'text/html' },
    });
  } catch (cause) {
    throw new Error(
      `Nothing is serving ${WEB_URL}. This suite drives the dev server you are already running and never starts one of its own.\n` +
        `  Start it:  ./scripts/start-local.sh\n` +
        `  Or point somewhere else:  APP_WEB_URL=http://localhost:5175 bun run test\n` +
        `  (cause: ${(cause as Error).message})`,
    );
  }
  if (!response.ok) {
    throw new Error(`${WEB_URL}/app answered HTTP ${response.status}. The SPA shell should answer 200 for every path under /app.`);
  }
  const html = await response.text();
  if (!/<div id="root">/.test(html)) {
    throw new Error(
      `${WEB_URL} answered, but it is not the pattadar SPA — no #root in the document. Check APP_WEB_URL is the web app and not the api or the gateway.`,
    );
  }
}
