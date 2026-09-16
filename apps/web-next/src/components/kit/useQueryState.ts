'use client';

/**
 * Tab, view, search and filter state that lives in the URL.
 *
 * Extracted from `src/views/LandPropertiesPage.tsx` — the three raw params at
 * :116-118, the tab initializer at :119-121 where `?pb=` outranks `?tab=`, the
 * `fGroup` / `fPb` initializers at :128-132, `activeFilters` at :254 and
 * `clearFilters` at :255-261 — and written to delete the bug sitting between
 * them. At :227-229 the screen resolves `?group=<id>` to a family NAME during
 * render and calls `setFGroup` there:
 *
 *     const g0Name = g0 ? gname.get(g0) : undefined;
 *     if (g0Name && !fGroup) setFGroup(g0Name);
 *
 * which means "Clear all" cannot clear it: the moment the filter goes back to
 * `undefined` the condition is true again and the next render re-applies it.
 * The deep link is not a starting point, it is a cage.
 *
 * The fix is not "move it into an effect" — that only makes the loop slower.
 * The real problem is that one line is doing two unrelated jobs, so this hook
 * ships two mechanisms and refuses to merge them:
 *
 *  - `seed` is SYNCHRONOUS PRECEDENCE. It answers "which param wins when the
 *    URL contradicts itself" (`?pb=` implies the Parcels tab whatever `?tab=`
 *    says). It needs nothing but the query string, so it runs exactly once,
 *    pure, inside the `useState` initializer — never during a later render, and
 *    never gated on data it does not need.
 *  - `seedOnce` is an ASYNCHRONOUS LOOKUP. `?group=<id>` cannot become a filter
 *    until the groups query lands, so it is safe to call from a bare effect on
 *    every render: a lookup that returns `undefined` stays PENDING and is asked
 *    again next render, and only a resolved value is applied, recorded and
 *    retired. Its param is declared in `seedOnlyKeys`, which is what keeps the
 *    raw id out of `values` while the lookup is still pending.
 *
 * Two refs carry the whole correctness argument. `seededRef` is why an alias
 * applies once instead of every render. `touchedRef` is why "Clear all" finally
 * sticks: once the user has touched a key, the alias is dead to it permanently,
 * so clearing a deep-linked filter is a decision the screen respects rather
 * than a state it bounces out of.
 *
 * Write-back is debounced and `replace` by default, because a filter is not a
 * destination: Back must still mean "the previous page", not "the previous
 * checkbox". Params the hook does not own are preserved untouched — a screen
 * shares its URL with whatever else the app puts there — and a key sitting at
 * its default is deleted rather than written, so a URL worth copying stays
 * short enough to read. The one exception is an alias param (`seedOnlyKeys`):
 * it is never written and never deleted, because the hook cannot spell an id
 * it did not resolve, and the deep link must survive the copy.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'src/routes/hooks';
import type { QueryHistoryMode, QueryStateShape } from './types';

/** Long enough to swallow a burst of clicks, short enough to survive a copy of the URL. */
const DEFAULT_WRITE_DELAY_MS = 150;

export interface QueryStateOptions<S extends QueryStateShape> {
  /** state key -> query param name. A key omitted here is local-only, never in the URL. */
  params: Partial<Record<keyof S, string>>;
  /** Values when the URL says nothing. A key equal to its default is REMOVED from the query. */
  defaults: S;
  /**
   * Cross-field precedence, evaluated ONCE against the mount-time query string.
   * Pure: it must not call setState and must not read anything asynchronous.
   * Properties: (raw) => (raw.pb ? { tab: 'parcels', passbook: raw.pb } : {})
   */
  seed?: (raw: Readonly<Record<string, string>>, parsed: S) => Partial<S>;
  /** 'replace' (default) keeps Back meaning "previous page"; 'push' for tab changes. */
  history?: QueryHistoryMode;
  /** Keys read from the URL but never written back. Rare — `seedOnlyKeys` already are. */
  readOnlyKeys?: (keyof S)[];
  /**
   * Keys whose param carries an ALIAS — an id — rather than a state value. The
   * raw string is still read into the mount snapshot, so `rawParam` and
   * `seedOnce` both see it, but it is NEVER overlaid into `values`: the key
   * keeps its default until the asynchronous lookup resolves the real value.
   * Without this, `?group=g-123` would filter on an id no row carries and the
   * screen would answer "No matches" over a full dataset — permanently, if the
   * id is stale or the lookup query fails. Such a param is also never WRITTEN:
   * it is an id, the resolved value is a name, and putting one where the other
   * is expected makes the URL the app itself produces a dead deep link. The
   * alias the reader arrived on is left in the query byte for byte — which is
   * also what the reference screen did, having never rewritten the query.
   * Properties: ['group']
   */
  seedOnlyKeys?: (keyof S)[];
  /**
   * The values a key may legally hold when it arrives from the URL. A param
   * outside its list is ignored and the key keeps its default. REQUIRED for any
   * key whose type is a literal union: the URL is a bag of strings, and a tab
   * value the strip has no `<Tab>` for renders no selection and no indicator at
   * all while MUI logs an invalid-value warning.
   * Properties: { tab: ['all', 'parcels', 'properties'], view: ['list', 'grid'] }
   */
  allow?: Partial<Record<keyof S, readonly string[]>>;
  /**
   * The subset of keys that are FILTERS. `activeCount` counts only these, and
   * `reset()` with no arguments clears only these — so a tab, a view mode or a
   * search box is neither badged as a filter nor thrown away by "Clear all".
   * Defaults to every key the hook owns.
   * Properties: ['kind', 'status', 'stake', 'group', 'pb']
   */
  filterKeys?: (keyof S)[];
  /** Debounce before the URL is rewritten. Default 150ms. */
  writeDelayMs?: number;
}

export interface QueryState<S extends QueryStateShape> {
  values: S;
  /** Merge a patch. `undefined` clears that key. Marks every patched key touched. */
  set: (patch: Partial<S>) => void;
  /**
   * Reset the listed keys — or, with no argument, every non-default key within
   * `filterKeys` (all keys when it is not declared) — to their defaults.
   * Marks them touched.
   */
  reset: (keys?: (keyof S)[]) => void;
  /**
   * Apply a deep-linked value ONCE, after an async lookup resolves.
   * Safe to call from an effect on EVERY render. Semantics:
   *  - value === undefined  -> the alias stays PENDING and is retried next render
   *  - already applied      -> no-op
   *  - user touched the key -> no-op, permanently
   *  - otherwise            -> applies, marks consumed, strips the source param
   */
  seedOnce: <K extends keyof S>(key: K, value: S[K] | undefined) => void;
  /** The MOUNT-TIME raw query value for a param — the input to a seedOnce lookup. */
  rawParam: (param: string) => string | undefined;
  /**
   * Keys differing from their default, counted over `filterKeys` when declared.
   * A Filters badge should prefer `activeFilterCount(values)` from FilterBar.
   */
  activeCount: number;
  /** False until the first paint has reconciled the URL; scaffolds skip write-back until true. */
  hydrated: boolean;
}

/** What the hook computes once, at mount, and never again. */
interface Boot<S extends QueryStateShape> {
  raw: Record<string, string>;
  values: S;
}

/**
 * The query string as a plain object, first occurrence wins — the same answer
 * `searchParams.get()` gives, frozen at the URL the user actually arrived on so
 * write-back cannot rewrite the evidence an alias is still waiting to resolve.
 */
function snapshot(search: string): Record<string, string> {
  const raw: Record<string, string> = {};
  new URLSearchParams(search).forEach((value, key) => {
    if (!(key in raw)) raw[key] = value;
  });
  return raw;
}

/**
 * Every key the hook owns: `defaults` declares the shape, but a key mapped in
 * `params` and nowhere else must still round-trip rather than vanish.
 */
function stateKeys<S extends QueryStateShape>(options: QueryStateOptions<S>): (keyof S)[] {
  const seen = new Set<string>();
  const keys: (keyof S)[] = [];
  for (const key of [...Object.keys(options.defaults), ...Object.keys(options.params)]) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key as keyof S);
  }
  return keys;
}

/**
 * URL-addressable screen state: tab, view, search and every filter, readable
 * from the query string, written back to it, and deep-linkable in both the
 * synchronous (`seed`) and the asynchronous (`seedOnce`) sense.
 */
export function useQueryState<S extends QueryStateShape>(
  options: QueryStateOptions<S>,
): QueryState<S> {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = searchParams.toString();

  // Held in a ref and read inside the callbacks, so a caller passing the inline
  // object literal this hook is designed for cannot re-seed, re-subscribe or
  // churn a handler on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // The router, path and live query are read at the moment a write fires, not
  // at the moment the write was scheduled — a debounced rewrite must never
  // navigate to where the page used to be.
  const routerRef = useRef(router);
  routerRef.current = router;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const searchRef = useRef(search);
  searchRef.current = search;

  const [boot] = useState<Boot<S>>(() => {
    const raw = snapshot(search);
    const parsedPatch: Partial<S> = {};
    const seedOnly = new Set((options.seedOnlyKeys ?? []).map((key) => String(key)));
    for (const key of stateKeys(options)) {
      const param = options.params[key];
      if (param === undefined) continue;
      const value = raw[param];
      // `?group=` with nothing after it is not a filter — matching the
      // `searchParams.get('group') || undefined` the screen has always used.
      if (value === undefined || value === '') continue;
      // An alias param names something the hook cannot resolve on its own
      // (`?group=<id>` is an id; the filter matches a group NAME). It stays in
      // `boot.raw` for `rawParam` and `seedOnce` to work from, but it must
      // never masquerade as the value itself — an id in the filter slot matches
      // no row and answers "No matches" over a full dataset.
      if (seedOnly.has(String(key))) continue;
      // The URL is a bag of strings while `S` may narrow a key to a literal
      // union ('all' | 'parcels'). `allow` is that key's per-key schema, and it
      // is REQUIRED wherever the type is a union: a value outside the list is
      // dropped so the key keeps its default, because a tab no `<Tab>` matches
      // renders no selection at all. Keys with no `allow` widen as before — a
      // screen deep-linked with nonsense gets its own nonsense back and its own
      // predicate decides what that means.
      const allowed = options.allow?.[key];
      if (allowed !== undefined && !allowed.includes(value)) continue;
      parsedPatch[key] = value as S[keyof S];
    }
    const parsed: S = Object.assign({ ...options.defaults }, parsedPatch);
    // Precedence runs here — once, pure, before anything has rendered — which
    // is the entire reason it can never fight the user the way :227-229 does.
    const seeded = options.seed ? options.seed(raw, parsed) : undefined;
    return { raw, values: seeded ? Object.assign(parsed, seeded) : parsed };
  });

  const [values, setValues] = useState<S>(boot.values);
  const [hydrated, setHydrated] = useState(false);

  const rawRef = useRef(boot.raw);
  /** Keys an alias has already applied — the guard against applying it twice. */
  const seededRef = useRef<Record<string, true>>({});
  /** Keys the user has moved — the guard that makes "Clear all" permanent. */
  const touchedRef = useRef<Record<string, true>>({});
  const valuesRef = useRef<S>(values);
  valuesRef.current = values;

  const set = useCallback((patch: Partial<S>) => {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    for (const key of keys) touchedRef.current[key] = true;
    setValues((prev) => Object.assign({ ...prev }, patch));
  }, []);

  const reset = useCallback((keys?: (keyof S)[]) => {
    const { defaults } = optionsRef.current;
    const current = valuesRef.current;
    // No argument means "Clear all", and that clears FILTERS — never the tab
    // the reader is on or the view mode they chose (LandPropertiesPage.tsx:255-261).
    const target =
      keys ??
      (optionsRef.current.filterKeys ?? stateKeys(optionsRef.current)).filter(
        (key) => current[key] !== defaults[key],
      );
    if (target.length === 0) return;
    const patch: Partial<S> = {};
    for (const key of target) {
      touchedRef.current[String(key)] = true;
      patch[key] = defaults[key];
    }
    setValues((prev) => Object.assign({ ...prev }, patch));
  }, []);

  const seedOnce = useCallback(<K extends keyof S>(key: K, value: S[K] | undefined) => {
    // Pending, not consumed: the lookup this alias depends on has not landed
    // yet, and the caller will ask again on the next render.
    if (value === undefined) return;
    const name = String(key);
    if (seededRef.current[name] || touchedRef.current[name]) return;
    seededRef.current[name] = true;
    const param = optionsRef.current.params[key];
    // The alias has been spent; `rawParam` must stop offering it to anyone else.
    if (param !== undefined) delete rawRef.current[param];
    const patch: Partial<S> = {};
    patch[key] = value;
    setValues((prev) => Object.assign({ ...prev }, patch));
  }, []);

  const rawParam = useCallback((param: string) => rawRef.current[param], []);

  // The first commit is the point at which state and URL are known to agree;
  // before it, write-back would race the very query string it is reading.
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const delay = optionsRef.current.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS;
    const timer = setTimeout(() => {
      const opts = optionsRef.current;
      const current = searchRef.current;
      const next = new URLSearchParams(current);
      const readOnly = new Set((opts.readOnlyKeys ?? []).map((key) => String(key)));
      // An alias param is read-only in BOTH directions. Written, it would carry
      // the resolved name under a param that means an id, and the next load
      // would look that name up in an id-keyed map, get `undefined`, and sit
      // PENDING for a lookup that can never land — a dead deep link the app
      // produced itself. Deleted — which is what "equals its default" asks for
      // while the lookup is still in flight — it would be gone from the address
      // bar before it was ever used. So the arriving id stays exactly as it
      // came, which is also what the reference screen did: it read `?group=` and
      // never wrote the query back at all.
      for (const key of opts.seedOnlyKeys ?? []) readOnly.add(String(key));
      for (const key of stateKeys(opts)) {
        const param = opts.params[key];
        if (param === undefined || readOnly.has(String(key))) continue;
        const value = values[key];
        // A key at its default is deleted, never written — clean URLs stay clean.
        if (typeof value === 'string' && value !== opts.defaults[key]) next.set(param, value);
        else next.delete(param);
      }
      const query = next.toString();
      if (query === current) return;
      const url = query ? `${pathRef.current}?${query}` : pathRef.current;
      // `scroll: false` — changing a filter must not throw the reader back to
      // the top of a list they were half way down.
      if (opts.history === 'push') routerRef.current.push(url, { scroll: false });
      else routerRef.current.replace(url, { scroll: false });
    }, delay);
    return () => clearTimeout(timer);
  }, [values, hydrated]);

  const defaults = options.defaults;
  let activeCount = 0;
  // Filters only when the screen has declared them; a tab, a view mode and a
  // search box are not filters and must never reach the Filters badge.
  for (const key of options.filterKeys ?? stateKeys(options)) {
    if (values[key] !== defaults[key]) activeCount += 1;
  }

  return useMemo(
    () => ({ values, set, reset, seedOnce, rawParam, activeCount, hydrated }),
    [values, set, reset, seedOnce, rawParam, activeCount, hydrated],
  );
}
