/**
 * The world a sealed test runs inside.
 *
 * `World` is a switchboard, not data: it maps one GraphQL root field (or one
 * REST path) to the answer the browser will get for it, and lets a test change
 * any single one of those answers without disturbing the rest. The default
 * answers live in `seed.ts`; this file is the mechanism that serves them.
 *
 * Why a root-field key and not an operation name: `Q_PORTFOLIO` in
 * apps/web/src/w360/api.ts is an ANONYMOUS query (`{ web { portfolio { … } } }`),
 * so half the surface has no operation name to switch on. Every query and every
 * mutation on that surface does, however, open with `web { <field>`, because
 * the whole W360 API hangs off `Query.web` / `Mutation.web`. That field is the
 * one stable, complete key — all 67 of them.
 *
 * An answer can be any of:
 *   value                      — sent as `{ data: { web: { <field>: value } } }`
 *   (vars, query) => value     — computed per call, so a test can vary by id
 *   World.gqlError('…')        — a GraphQL `errors[]`, which `gql()` throws on
 *   World.httpError(503)       — a transport failure, a different code path
 *   World.slow(ms, value)      — answers, late; for loading and deadline tests
 *   World.never()              — never answers; the screen stays in `isLoading`
 *
 * Anything the app asks for that the world has no answer for is a LOUD failure,
 * never an empty object: a screen that quietly renders nothing because a new
 * field was added to a query is exactly the regression this suite exists to
 * catch, and a permissive default would hide it.
 */
import type { Page, Route } from '@playwright/test';

export const GRAPHQL_PATH = '/api/gateway/pattadar/graphql';

/**
 * Every request the app makes under /api goes through the seal.
 *
 * Matched on the PATH rather than anywhere in the URL, and that is not a
 * refinement: Vite dev serves the app's own modules by their source path, so
 * `/api/` as a substring also matches `/src/api/client.ts`. Refusing that with
 * a 501 does not seal the API — it stops the bundle loading at all, and the
 * symptom is a blank page with one unexplained console error.
 */
const isApi = (url: URL) => url.pathname.startsWith('/api/');
const isGraphql = (url: URL) => url.pathname === GRAPHQL_PATH;

// ── Answer kinds ───────────────────────────────────────────────────────

const KIND = Symbol('answer-kind');

export interface GqlErrorAnswer { [KIND]: 'gql-error'; message: string }
export interface HttpErrorAnswer { [KIND]: 'http-error'; status: number; body?: unknown }
export interface SlowAnswer { [KIND]: 'slow'; ms: number; value: unknown }
export interface NeverAnswer { [KIND]: 'never' }
type SpecialAnswer = GqlErrorAnswer | HttpErrorAnswer | SlowAnswer | NeverAnswer;

export type AnswerFn = (
  vars: Record<string, unknown>,
  query: string,
) => unknown | Promise<unknown>;
export type Answer = unknown | AnswerFn | SpecialAnswer;

function isSpecial(value: unknown): value is SpecialAnswer {
  return typeof value === 'object' && value !== null && KIND in (value as object);
}

/** One thing the browser asked for, kept so a test can assert it was asked. */
export interface Call {
  field: string;
  vars: Record<string, unknown>;
  query: string;
  at: number;
}

/** One REST exchange the seal answered. */
export interface RestCall {
  method: string;
  url: string;
  path: string;
  body: string | null;
  at: number;
}

export interface RestAnswer {
  status?: number;
  contentType?: string;
  body?: string | Buffer;
  json?: unknown;
  headers?: Record<string, string>;
  /** Answer late, to exercise a spinner or a deadline. */
  delayMs?: number;
}
export type RestHandler = (route: Route, call: RestCall) => RestAnswer | Promise<RestAnswer>;

// ── The world ──────────────────────────────────────────────────────────

export class World {
  private answers = new Map<string, Answer>();
  private rest: Array<{ pattern: RegExp; handler: RestHandler }> = [];
  private seen: Call[] = [];
  private restSeen: RestCall[] = [];
  private escaped: string[] = [];
  private counter = 0;

  constructor(seed: Record<string, Answer> = {}) {
    for (const [field, answer] of Object.entries(seed)) this.answers.set(field, answer);
  }

  // -- authoring -------------------------------------------------------

  /** Answer `field` with `answer` for the rest of this test. */
  set(field: string, answer: Answer): this {
    this.answers.set(field, answer);
    return this;
  }

  /** Answer several fields at once. */
  setAll(answers: Record<string, Answer>): this {
    for (const [field, answer] of Object.entries(answers)) this.answers.set(field, answer);
    return this;
  }

  /** Keep the seeded shape, replace only the named keys inside it. Fails if the
   *  seed for that field is not a plain object, so a typo cannot silently
   *  produce a half-built answer. */
  patch(field: string, patch: Record<string, unknown>): this {
    const current = this.answers.get(field);
    if (typeof current !== 'object' || current === null || Array.isArray(current) || isSpecial(current)) {
      throw new Error(`world.patch('${field}') needs an object seed to patch; found ${describe(current)}. Use world.set() instead.`);
    }
    this.answers.set(field, { ...(current as object), ...patch });
    return this;
  }

  /** The seeded answer for a field, for a test that wants to derive from it. */
  seedOf<T = Record<string, unknown>>(field: string): T {
    const current = this.answers.get(field);
    if (current === undefined) throw new Error(`No seeded answer for '${field}'.`);
    if (isSpecial(current) || typeof current === 'function') {
      throw new Error(`world.seedOf('${field}') is only for plain seeded data; this one is ${describe(current)}.`);
    }
    return structuredClone(current) as T;
  }

  /** The field answers with a GraphQL error — what a refused operation does. */
  static gqlError(message: string): GqlErrorAnswer {
    return { [KIND]: 'gql-error', message };
  }

  /** The field answers with a transport failure — a different branch from the
   *  one above, because `gql()` throws a different sentence for each. */
  static httpError(status = 500, body?: unknown): HttpErrorAnswer {
    return { [KIND]: 'http-error', status, body };
  }

  /** The field answers, eventually. Use for spinners; keep well under the
   *  20s deadline in apps/web/src/api/client.ts unless that is the point. */
  static slow(ms: number, value: unknown): SlowAnswer {
    return { [KIND]: 'slow', ms, value };
  }

  /** The field never answers. The screen must stay in its loading state and
   *  must not claim there is nothing there. */
  static never(): NeverAnswer {
    return { [KIND]: 'never' };
  }

  /** Answer a non-GraphQL path — storage bytes, capabilities, consent, the
   *  assistant stream. Registered later wins, so a test can override the seed. */
  route(pattern: RegExp, handler: RestHandler): this {
    this.rest.unshift({ pattern, handler });
    return this;
  }

  // -- assertions ------------------------------------------------------

  /** Every call to a field, oldest first. Empty means the screen never asked. */
  calls(field: string): Call[] {
    return this.seen.filter((c) => c.field === field);
  }

  /** The variables the app sent the last time it asked for `field`. */
  lastVars(field: string): Record<string, unknown> {
    const calls = this.calls(field);
    if (!calls.length) throw new Error(`'${field}' was never asked for. Fields asked: ${[...new Set(this.seen.map((c) => c.field))].join(', ') || '(none)'}`);
    return calls[calls.length - 1].vars;
  }

  /** True once the app has asked for the field at least once. */
  asked(field: string): boolean {
    return this.seen.some((c) => c.field === field);
  }

  /** Every field the app asked for, in first-asked order. */
  askedFields(): string[] {
    return [...new Set(this.seen.map((c) => c.field))];
  }

  /** Every REST exchange, for asserting an upload happened (or did not). */
  restCalls(pattern?: RegExp): RestCall[] {
    return pattern ? this.restSeen.filter((c) => pattern.test(c.url)) : [...this.restSeen];
  }

  /** Requests that reached the seal with nothing to answer them. A non-empty
   *  list is a bug in the test OR a new call the app started making. */
  escapes(): string[] {
    return [...this.escaped];
  }

  /** Forget what has been asked so far, keeping the answers. Useful after a
   *  navigation, when only the calls from here on are interesting. */
  clearCalls(): this {
    this.seen = [];
    this.restSeen = [];
    return this;
  }

  // -- wiring ----------------------------------------------------------

  /** @internal — called by the harness. */
  async install(page: Page): Promise<void> {
    // Registered widest-first: Playwright consults handlers in reverse order
    // of registration, so the catch-all below is only reached when neither the
    // GraphQL router nor a REST handler claimed the request.
    await page.route(isApi, (route) => this.escape(route));
    await page.route(isApi, (route) => this.serveRest(route));
    await page.route(isGraphql, (route) => this.serveGraphql(route));
  }

  private escape(route: Route): Promise<void> {
    const request = route.request();
    const line = `${request.method()} ${new URL(request.url()).pathname}`;
    this.escaped.push(line);
    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({
        errors: [{ message: `Sealed: nothing in the test world answers ${line}. Add a world.route() for it.` }],
      }),
    });
  }

  private async serveRest(route: Route): Promise<void> {
    const request = route.request();
    const url = request.url();
    const match = this.rest.find((entry) => entry.pattern.test(url));
    if (!match) return this.escape(route);

    const call: RestCall = {
      method: request.method(),
      url,
      path: new URL(url).pathname,
      body: request.postData(),
      at: this.counter++,
    };
    this.restSeen.push(call);

    const answer = await match.handler(route, call);
    if (answer.delayMs) await sleep(answer.delayMs);
    await route.fulfill({
      status: answer.status ?? 200,
      contentType: answer.contentType ?? (answer.json !== undefined ? 'application/json' : 'text/plain'),
      headers: answer.headers,
      body: answer.json !== undefined ? JSON.stringify(answer.json) : (answer.body ?? ''),
    });
  }

  private async serveGraphql(route: Route): Promise<void> {
    const raw = route.request().postData() ?? '';
    let parsed: { query?: string; variables?: Record<string, unknown> };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Sealed: the app posted a body that is not JSON.' }] }) });
    }

    const query = parsed.query ?? '';
    const vars = parsed.variables ?? {};
    const field = rootField(query);
    if (!field) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: `Sealed: no 'web { <field>' in this document, so the world cannot route it:\n${query.slice(0, 400)}` }] }),
      });
    }

    this.seen.push({ field, vars, query, at: this.counter++ });

    if (!this.answers.has(field)) {
      this.escaped.push(`graphql ${field}`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: `Sealed: the world has no answer for 'web.${field}'. Seed it in fixtures/seed.ts, or set it in this test with world.set('${field}', …).` }],
        }),
      });
    }

    let answer = this.answers.get(field) as Answer;
    if (isSpecial(answer)) {
      switch (answer[KIND]) {
        case 'never':
          // Hang, deliberately. The page's own 20s deadline (api/client.ts)
          // decides what the screen does about it; the test teardown cuts the
          // handler off well before this resolves.
          await sleep(600_000);
          return;
        case 'slow':
          await sleep(answer.ms);
          answer = answer.value;
          break;
        case 'gql-error':
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: null, errors: [{ message: answer.message }] }),
          });
        case 'http-error':
          return route.fulfill({
            status: answer.status,
            contentType: 'application/json',
            body: JSON.stringify(answer.body ?? { errors: [{ message: `Sealed: ${field} answered HTTP ${answer.status}.` }] }),
          });
      }
    }

    const value = typeof answer === 'function' ? await (answer as AnswerFn)(vars, query) : answer;
    // A function answer is allowed to escalate too — `id => notFound ? null :
    // record` is the common case, but so is "this id makes the server fall
    // over", and that must not have to be wired a second way.
    if (isSpecial(value)) {
      this.answers.set(field, value);
      const saved = this.answers.get(field);
      await this.serveGraphqlWith(route, field, value);
      this.answers.set(field, saved as Answer);
      return;
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { web: { [field]: value === undefined ? null : value } } }),
    });
  }

  private async serveGraphqlWith(route: Route, field: string, answer: SpecialAnswer): Promise<void> {
    switch (answer[KIND]) {
      case 'never':
        await sleep(600_000);
        return;
      case 'slow':
        await sleep(answer.ms);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { web: { [field]: answer.value ?? null } } }),
        });
      case 'gql-error':
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null, errors: [{ message: answer.message }] }) });
      case 'http-error':
        return route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body ?? { errors: [{ message: `Sealed: ${field} answered HTTP ${answer.status}.` }] }) });
    }
  }
}

// ── helpers ────────────────────────────────────────────────────────────

/**
 * The first field selected inside `web { … }`.
 *
 * Tolerates every spelling the app actually uses: a named query with
 * variables, an anonymous document, a mutation, and any amount of whitespace
 * or newline between the brace and the field.
 */
export function rootField(query: string): string | null {
  return /\bweb\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(query)?.[1] ?? null;
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (isSpecial(value)) return `a ${String((value as Record<symbol, string>)[KIND])} answer`;
  if (typeof value === 'function') return 'a function answer';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
