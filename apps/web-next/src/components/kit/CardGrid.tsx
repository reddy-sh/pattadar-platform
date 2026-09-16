'use client';

/**
 * The grid view: the card, the band of media above it, and the one fetch that
 * feeds forty of them.
 *
 * Four separate defects made this file necessary, and each of them is the same
 * mistake — a decision taken per card instead of once.
 *
 * The breakpoints are the mildest. `LandPropertiesPage.tsx:608` declares
 * `xs 1 / sm 2 / lg 3 / xl 4` inline; `Skeletons.tsx:59` declares the same grid
 * and stops at `lg`, so the loading state has three columns and the grid that
 * replaces it has four, and the page visibly reflows the moment data lands.
 * `CardGrid` renders `tokens.cardGridSx` — the object the skeleton also
 * renders — so the two literally cannot drift again. `minItemWidth` is the
 * escape hatch for a grid that measures itself (the `repeat(${Math.min(3,
 * shown.length)}, 1fr)` at `MarketValueTool.tsx:95`), and it is spelled
 * `minmax(min(100%, N), 1fr)` rather than `minmax(Npx, 1fr)` because a bare
 * pixel minimum is wider than a 400px phone and takes the page's horizontal
 * scrollbar with it.
 *
 * The card is the serious one. Today it is a `Card role="link" tabIndex={0}`
 * whose `onKeyDown` fires on `Enter` only (`:616-618`). A control announced as
 * a link that ignores `Space` is a control half the keyboard cannot operate,
 * and `clickableCardSx` (`holdingCards.tsx:95-114`) shipped no `:focus-visible`
 * at all, so the tab stop it created was invisible — worse than not being
 * focusable, because focus disappears into it. `ClickableCard` owns `Enter`
 * AND `Space` (with the `preventDefault` that stops `Space` scrolling the page
 * out from under the card), keeps the `e.target === e.currentTarget` guard so
 * a key pressed on a chip inside the card does not also open the card, and
 * takes its ring from `tokens.focusRingSx` through `clickableSurfaceSx`.
 * Selection is a tint plus an INSET ring: `FamiliesGroupsPage.tsx:144-148`
 * expresses it as `borderWidth: 1 → 2`, which moves every word in the card one
 * pixel when you pick it, and the card announces the selection that page never
 * announced. WHICH announcement is a structural decision, not a preference:
 * `role="option"` is only legal inside a `listbox`, which is why `CardGrid`
 * takes `role` at all, and ARIA makes an option's children presentational — so
 * a selector card that carries its own `ActionMenu` (the `FamiliesGroupsPage`
 * grid, contract `:2745`/`:2862`) must be `role="button"` with `aria-pressed`,
 * the one spelling that keeps that menu button in the accessibility tree.
 *
 * `CardHero`'s docblock promised "a layered emerald gradient" and painted
 * `#144E8C → #1976D2 → #4D9BE0` (`holdingCards.tsx:148`) — the predecessor
 * app's blue, hard-coded, in an emerald product, in every scheme. Here the
 * gradient resolves from `primary.dark / main / light`, so it is emerald in
 * light, emerald in dark, and legal in highContrast with no second definition.
 * The overlay pills were `Box`es mixed against a literal `#FFFFFF`
 * (`:77-88`) — the bug the founder named, because a colour mixed against a
 * hard white stays a light-mode colour forever — and were capped at exactly
 * two, `pill` and `pill2`, for no reason but the parameter list. They are now
 * an array of real `StatusChip`s, each on its own small scrim — over an opaque
 * ground in the dark scheme, where the status containers are translucent by
 * design — so a status stays legible over an arbitrary photograph rather than
 * over whatever the cover happens to be.
 *
 * `useMediaRef` replaces `useBlobUrl` (`holdingCards.tsx:47-74`), which issues
 * one uncached `fetch` per card and revokes the object URL on every unmount:
 * a forty-card grid is forty requests, and scrolling back up is forty more.
 * The cache is module-level and deliberately outlives the components — N cards
 * asking for one `fileRef` share one in-flight promise, the URL survives an
 * unmount, and `revokeObjectURL` happens on LRU eviction (60 covers) instead.
 * The resolver itself arrives through `MediaRefProvider`, because
 * `/api/gateway/storage/files/{ref}/content` is a fact about this app's
 * gateway and not about cards; the kit must not know it.
 *
 * The one rule in `MediaCard` that looks cosmetic and is not: the location row
 * renders ALWAYS, with the place icon and the em-dash when there is no place.
 * Omitting it — the obvious "improvement" — makes cards of two different
 * heights, and a grid of cards of two different heights has no baseline
 * anywhere across a row.
 *
 * Extracted from `views/LandPropertiesPage.tsx:608` (the grid), `:610-620`
 * (the clickable card), `:621-685` (the whole card anatomy, in this order) and
 * `components/holdingCards.tsx:47-74` / `:95-114` / `:122-194` (`useBlobUrl`,
 * `clickableCardSx`, `CardHero`).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

import { CardActionsTrigger } from './ActionMenu';
import { StatusChip } from './StatusChip';
import { dash } from './format';
import { GAP, RADIUS, cardGridSx, clickableSurfaceSx, stateLayer } from './tokens';
import type { ActionItem, MediaRefState, MediaResolver, MediaSource, PillSpec } from './types';

/**
 * MUI's own sx-composition idiom (the same helper `Section.tsx:82` factors
 * out). A token like `clickableSurfaceSx` is typed `SxProps<Theme>` — a union
 * that already admits the callback and array forms — so it cannot be spread
 * into an object literal without being flattened first, and copying it instead
 * is how a token stops being the single definition of a surface.
 */
function composeSx(...parts: SxProps<Theme>[]): SxProps<Theme> {
  return parts.flatMap((part) => (Array.isArray(part) ? part : [part]));
}

/**
 * `customShadows` entries are all optional in the theme's type, and a
 * `box-shadow` list containing the word `undefined` — or the word `none` —
 * invalidates the WHOLE declaration, taking the inset selection ring down with
 * it. Joining through a filter is what lets the ring and the card's resting
 * shadow coexist in every scheme, including highContrast where the card's own
 * shadow is `none`.
 */
function shadowList(...parts: (string | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== 'none' && part !== '').join(', ');
}

/* ── CardGrid ────────────────────────────────────────────────────────── */

export interface CardGridProps {
  children: ReactNode;
  /** Switches to repeat(auto-fit, minmax(min(100%, N), 1fr)). Omit for fixed columns. */
  minItemWidth?: number;
  /**
   * Gives the grid a container role. Omit for a plain grid of links — which is
   * what the reference screen renders (`LandPropertiesPage.tsx:608` is a bare
   * `Box`) and what every navigation grid should keep.
   *
   * 'listbox' is the ONLY spelling offered, because it is the only one this
   * file can honour: it is what makes `ClickableCard role="option"` legal at
   * all. `role="list"` is deliberately absent — a list owns `listitem`
   * children, `ClickableCard` has no such spelling, and the grid's children
   * arrive as bare cards (`ListScreen.tsx:474-476` wraps them in a keyed
   * `Fragment`, which is no element), so it would announce "list, 0 items"
   * and orphan every card's semantics.
   */
  role?: 'listbox';
  /** Names the container. Required in practice once `role` is set. */
  ariaLabel?: string;
  /** listbox only: announces that more than one option may be selected. */
  multiSelectable?: boolean;
}

/**
 * The role the nearest enclosing `CardGrid` published, or `null` outside one.
 * The same registry mechanism `ActionRegion` uses (`Action.tsx:116`): the
 * container declares, the child reads, and the dev-time error lives with the
 * child that can actually be wrong. Always provided — including as `null` —
 * so a plain grid nested inside a listbox cannot inherit its role.
 */
export const CardGridRoleContext = createContext<'listbox' | null>(null);

/**
 * THE grid: xs 1 / sm 2 / lg 3 / xl 4, gap 24 — declared once in
 * tokens.cardGridSx.
 *
 * `role` exists because `role="option"` is not a property of a card: an option
 * has to be positioned within a set, and only its container can own that set.
 * Without `role="listbox"` here, an option card below is an orphan, and
 * `ClickableCard` says so in development.
 */
export function CardGrid({
  children,
  minItemWidth,
  role,
  ariaLabel,
  multiSelectable,
}: CardGridProps) {
  const sx = useMemo<SxProps<Theme>>(() => {
    if (minItemWidth === undefined) return cardGridSx;
    // `min(100%, N)` and not `N`: a fixed track minimum wider than the viewport
    // is what puts a horizontal scrollbar on the whole page at 400px.
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minItemWidth}px), 1fr))`,
      gap: GAP.page,
    };
  }, [minItemWidth]);

  return (
    <CardGridRoleContext.Provider value={role ?? null}>
      <Box
        role={role}
        aria-label={ariaLabel}
        aria-multiselectable={role === 'listbox' && multiSelectable === true ? true : undefined}
        sx={sx}
      >
        {children}
      </Box>
    </CardGridRoleContext.Provider>
  );
}

/* ── ClickableCard ───────────────────────────────────────────────────── */

/**
 * Once per page load, not once per card: a 40-card grid makes the same mistake
 * 40 times, and 40 identical console errors bury the one that matters. These
 * module-level flags are the same shape `warnWithoutProvider` below uses.
 */
let warnedOrphanOption = false;
let warnedOptionWithControls = false;

function warnOrphanOption(): void {
  if (process.env.NODE_ENV === 'production' || warnedOrphanOption) return;
  warnedOrphanOption = true;
  console.error(
    'ClickableCard rendered role="option" with no listbox ancestor. An option has to be ' +
      'positioned within a set, and only the container owns one: give the enclosing <CardGrid> ' +
      'role="listbox", or use role="button" (aria-pressed) for a standalone selector card.',
  );
}

function warnOptionWithControls(): void {
  if (process.env.NODE_ENV === 'production' || warnedOptionWithControls) return;
  warnedOptionWithControls = true;
  console.error(
    'ClickableCard role="option" was given interactive children (an actions menu). ARIA makes an ' +
      "option's children presentational, so that trigger leaves the accessibility tree " +
      'entirely. Use role="button" (aria-pressed) for a selector card that carries its own ' +
      'actions.',
  );
}

export interface ClickableCardProps {
  /** Announced as the card's accessible name, e.g. "Open Sy 214/2". */
  ariaLabel: string;
  onOpen: () => void;
  /**
   * 'link' (default, adds aria-current); 'option' for a card inside a
   * `CardGrid role="listbox"` (adds aria-selected, children go presentational);
   * 'button' for a selector card that owns controls (adds aria-pressed).
   */
  role?: 'link' | 'option' | 'button';
  selected?: boolean;
  /**
   * True when the card contains its own focusable control (an ActionMenu).
   * Only used to catch the `role="option"` collision in development.
   */
  interactiveChildren?: boolean;
  children: ReactNode;
}

/**
 * The whole-card click target.
 *
 * `Space` is not a nicety: a `role="link"` that answers `Enter` only is
 * inconsistent with every other activatable thing on the page, and a keyboard
 * user who presses `Space` on it gets the page scrolled instead — hence the
 * `preventDefault`. The `e.target === e.currentTarget` guard is what keeps an
 * inner control's own `Enter` from bubbling up and opening the card behind the
 * dialog that control just opened.
 *
 * Selection paints a 16% primary state layer and an INSET ring, never a border
 * width: geometry that changes with state moves the content inside it.
 *
 * The three roles are not three spellings of one thing. `option` is the only
 * one with a structural prerequisite — an owning `listbox`, which is why
 * `CardGrid` takes `role` — and the only one whose children ARIA drops from the
 * accessibility tree, so an option card carrying a `CardActionsTrigger` ships a
 * button nobody can reach. `button` + `aria-pressed` is therefore the selector
 * spelling for any card with its own actions, and both mistakes are reported
 * once in development rather than left to an audit.
 */
export function ClickableCard({
  ariaLabel,
  onOpen,
  role = 'link',
  selected,
  interactiveChildren,
  children,
}: ClickableCardProps) {
  const gridRole = useContext(CardGridRoleContext);

  useEffect(() => {
    if (role !== 'option') return;
    if (gridRole !== 'listbox') warnOrphanOption();
    if (interactiveChildren === true) warnOptionWithControls();
  }, [role, gridRole, interactiveChildren]);

  const selectedSx: SxProps<Theme> = (t) => {
    const ring = `inset 0 0 0 2px ${(t.vars ?? t).palette.primary.main}`;
    return {
      backgroundColor: stateLayer('primary', 16)(t),
      boxShadow: shadowList(ring, t.customShadows.card),
      // Both states re-state the ring: `clickableSurfaceSx` replaces
      // `box-shadow` wholesale on hover and on press, which would drop it.
      '&:hover': { boxShadow: shadowList(ring, t.customShadows.z4) },
      '&:active': { boxShadow: ring },
    };
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      onOpen();
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      // Without this the page scrolls a viewport down behind the screen the
      // card is about to open.
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <Card
      role={role}
      tabIndex={0}
      aria-label={ariaLabel}
      aria-selected={role === 'option' ? selected === true : undefined}
      aria-pressed={role === 'button' ? selected === true : undefined}
      aria-current={role === 'link' && selected === true ? true : undefined}
      onClick={() => {
        onOpen();
      }}
      onKeyDown={handleKeyDown}
      sx={selected === true ? composeSx(clickableSurfaceSx, selectedSx) : clickableSurfaceSx}
    >
      {children}
    </Card>
  );
}

/* ── Media resolution ────────────────────────────────────────────────── */

const MediaRefContext = createContext<MediaResolver | null>(null);

/** Injects the storage resolver so the kit never hardcodes a gateway path. */
export function MediaRefProvider(props: { resolve: MediaResolver; children: ReactNode }) {
  return <MediaRefContext.Provider value={props.resolve}>{props.children}</MediaRefContext.Provider>;
}

/**
 * One entry per `fileRef`, shared by every card on the page. `refs` is the
 * live subscriber count and it is the only thing that makes the abort safe:
 * the first caller's effect owns the controller, so aborting on ITS unmount
 * would cancel the fetch four other cards are waiting on. Abort happens when
 * the count reaches zero and the request has not settled — a grid scrolled
 * past mid-flight — and never otherwise.
 */
interface MediaEntry {
  promise: Promise<string>;
  url: string;
  refs: number;
  controller: AbortController;
  settled: boolean;
}

/**
 * Module-level on purpose: the cache has to outlive the cards, or scrolling a
 * list back up re-fetches every cover it already paid for. `Map` iterates in
 * insertion order, so re-inserting on each hit is the whole LRU.
 */
const mediaCache = new Map<string, MediaEntry>();

/** Covers, not documents: 60 object URLs is a deep scroll, and each is bytes held in memory. */
const MEDIA_CACHE_LIMIT = 60;

const IDLE: MediaRefState = { status: 'idle', url: '' };
const LOADING: MediaRefState = { status: 'loading', url: '' };
const FAILED: MediaRefState = { status: 'failed', url: '' };

function evictMedia(): void {
  for (const [key, entry] of mediaCache) {
    if (mediaCache.size <= MEDIA_CACHE_LIMIT) return;
    // A cover something on screen is still showing is not a candidate at any
    // size — revoking its URL would blank a visible card.
    if (entry.refs > 0) continue;
    mediaCache.delete(key);
    if (entry.url !== '') URL.revokeObjectURL(entry.url);
  }
}

function acquireMedia(key: string, resolve: MediaResolver): MediaEntry {
  const cached = mediaCache.get(key);
  if (cached !== undefined) {
    cached.refs += 1;
    mediaCache.delete(key);
    mediaCache.set(key, cached);
    return cached;
  }

  const controller = new AbortController();
  const entry: MediaEntry = {
    promise: Promise.resolve(''),
    url: '',
    refs: 1,
    controller,
    settled: false,
  };

  // Failure resolves, never rejects: a cover is decoration, and one unreadable
  // photograph must not surface as an unhandled rejection on a working page.
  entry.promise = resolve(key, controller.signal)
    .then((blob) => {
      entry.settled = true;
      if (controller.signal.aborted) return '';
      entry.url = URL.createObjectURL(blob);
      return entry.url;
    })
    .catch(() => {
      entry.settled = true;
      return '';
    });

  mediaCache.set(key, entry);
  evictMedia();
  return entry;
}

function releaseMedia(key: string): void {
  const entry = mediaCache.get(key);
  if (entry === undefined) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (!entry.settled) {
    entry.controller.abort();
    mediaCache.delete(key);
    return;
  }
  evictMedia();
}

let warnedWithoutProvider = false;

function warnWithoutProvider(): void {
  if (process.env.NODE_ENV === 'production' || warnedWithoutProvider) return;
  warnedWithoutProvider = true;
  console.error(
    'useMediaRef was asked for a fileRef outside a <MediaRefProvider>, so every card cover ' +
      'will render its fallback. Mount the provider once in AppShell with the storage fetch ' +
      'as its `resolve`.',
  );
}

/** Cached and in-flight-deduped across every card on the page. */
export function useMediaRef(fileRef?: string): MediaRefState {
  const resolve = useContext(MediaRefContext);
  const [state, setState] = useState<MediaRefState>(IDLE);

  // The resolver is read through a ref so an app that rebuilds its `resolve`
  // closure on every render cannot re-run the effect below — which would
  // abort, drop and re-issue the very fetch it is waiting for, forever.
  const resolverRef = useRef<MediaResolver | null>(resolve);
  useEffect(() => {
    resolverRef.current = resolve;
  }, [resolve]);

  const hasResolver = resolve !== null;

  useEffect(() => {
    if (fileRef === undefined || fileRef === '') {
      setState(IDLE);
      return;
    }

    const resolver = resolverRef.current;
    if (resolver === null) {
      warnWithoutProvider();
      setState(IDLE);
      return;
    }

    let live = true;
    const entry = acquireMedia(fileRef, resolver);

    if (entry.url !== '') setState({ status: 'ready', url: entry.url });
    else if (entry.settled) setState(FAILED);
    else setState(LOADING);

    void entry.promise.then((url) => {
      if (!live) return;
      setState(url === '' ? FAILED : { status: 'ready', url });
    });

    return () => {
      live = false;
      releaseMedia(fileRef);
    };
  }, [fileRef, hasResolver]);

  return state;
}

/* ── CardHero ────────────────────────────────────────────────────────── */

export interface CardHeroProps {
  media: MediaSource;
  /** Zero to N chips over the media — not the current pill/pill2 pair. */
  pills?: PillSpec[];
  height?: number;
}

/**
 * The gradient the docblock always claimed. `primary.*` are read through
 * `t.vars` so the band follows the scheme; the highlight is `common.white`
 * through `alpha`, which is safe to parse precisely because `common` is the
 * one palette entry identical in every scheme (the same argument
 * `ActionMenu.tsx:300` makes about its scrim).
 */
function heroFallbackBackground(t: Theme): string {
  const palette = (t.vars ?? t).palette;
  const glow = alpha(t.palette.common.white, 0.2);
  const clear = alpha(t.palette.common.white, 0);
  return [
    `radial-gradient(120% 100% at 85% -20%, ${glow} 0%, ${clear} 55%)`,
    `linear-gradient(150deg, ${palette.primary.dark} 0%, ${palette.primary.main} 48%, ${palette.primary.light} 100%)`,
  ].join(', ');
}

/**
 * The media band: the cover photograph when there is one, else the gradient
 * with the fallback motif cropped bottom-right.
 *
 * A `fileRef` that fails resolves to no URL, so the band falls back to the
 * gradient rather than to a browser's broken-image glyph — the cover is
 * decorative and an outage in storage must not look like a defect in the card.
 */
export function CardHero({ media, pills, height = 140 }: CardHeroProps) {
  const direct = media.url !== undefined && media.url !== '';
  const resolved = useMediaRef(direct ? undefined : media.fileRef);
  const src = direct ? media.url : resolved.url;
  const icon = media.fallbackIcon;

  return (
    <Box
      sx={(t) => ({
        position: 'relative',
        height,
        flexShrink: 0,
        overflow: 'hidden',
        background: heroFallbackBackground(t),
      })}
    >
      {src !== undefined && src !== '' ? (
        <Box
          component="img"
          src={src}
          alt={media.alt ?? ''}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : icon !== undefined && icon !== null ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            position: 'absolute',
            right: -14,
            bottom: -22,
            fontSize: 96,
            lineHeight: 1,
            opacity: 0.35,
            pointerEvents: 'none',
            userSelect: 'none',
            color: 'common.white',
            '& svg': { fontSize: 96 },
          }}
        >
          {icon}
        </Box>
      ) : null}

      {/* The scrim exists so the pills and the ⋮ stay readable over a cover
          nobody chose for contrast. Black through `alpha`, never an rgba
          literal, so it is one colour decision and not three. */}
      <Box
        aria-hidden
        sx={(t) => ({
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${alpha(t.palette.common.black, 0.32)} 0%, ${alpha(
            t.palette.common.black,
            0.1,
          )} 32%, ${alpha(t.palette.common.black, 0)} 55%)`,
          pointerEvents: 'none',
        })}
      />

      {pills !== undefined && pills.length > 0 ? (
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            left: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: GAP.tight,
            // Room for the actions trigger at `right: 8`: an unbounded pill row
            // would slide under it now that the two-pill cap is gone.
            maxWidth: 'calc(100% - 68px)',
          }}
        >
          {pills.map((pill) => (
            /* The scrim is the contract's, and in light and highContrast it is
               all that is needed: those status containers are opaque, so the
               chip carries its own ground and the pad only separates it from
               the media.

               Dark is the exception, and it is a real one. Dark containers are
               TRANSLUCENT on purpose (`palette.ts:209-211` — "so one chip reads
               on paper, on default and over a card alike"); a cover photograph
               is none of those three, and a chip left to composite against a
               light photo lands `onContainer` ink at ~1.4:1. So in dark, and
               only in dark, the same scrim is painted over an opaque
               `background.paper` ground — the surface those colours WERE
               defined against — which the photograph can no longer reach. */
            <Box
              key={pill.label}
              sx={(t) => ({
                display: 'inline-flex',
                p: '2px',
                borderRadius: RADIUS.pill,
                bgcolor: alpha(t.palette.common.black, 0.25),
                ...t.applyStyles('dark', {
                  background: `linear-gradient(${alpha(t.palette.common.black, 0.25)}, ${alpha(
                    t.palette.common.black,
                    0.25,
                  )}), ${(t.vars ?? t).palette.background.paper}`,
                }),
              })}
            >
              <StatusChip label={pill.label} tone={pill.tone} hint={pill.hint} size="small" />
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/* ── MediaCard ───────────────────────────────────────────────────────── */

export interface MediaCardProps {
  ariaLabel: string;
  onOpen: () => void;
  media?: MediaSource;
  pills?: PillSpec[];
  actions?: ActionItem[];
  /** Accessible name for the card's overflow trigger. Default 'Card actions'. */
  actionsLabel?: string;
  title: string;
  titleChip?: ReactNode;
  subtitle?: string;
  /** ALWAYS rendered with the place icon; an absent value shows the em-dash. */
  location?: string;
  /** Metadata / filter-shortcut chips under the body. */
  chips?: ReactNode;
  /** The rule at the bottom: one figure (tnum) + one caption. */
  footer?: { figure: ReactNode; caption: ReactNode };
  /**
   * Forwarded to ClickableCard. 'link' (default) for a navigation grid;
   * 'button' for a selector grid — the only selector role that survives a card
   * with `actions`. 'option' needs a `CardGrid role="listbox"` above it.
   */
  role?: 'link' | 'option' | 'button';
  selected?: boolean;
}

/** The whole card anatomy, assembled. Screens pass DATA; the kit derives no pill. */
export function MediaCard({
  ariaLabel,
  onOpen,
  media,
  pills,
  actions,
  actionsLabel = 'Card actions',
  title,
  titleChip,
  subtitle,
  location,
  chips,
  footer,
  role,
  selected,
}: MediaCardProps) {
  const hasActions = actions !== undefined && actions.length > 0;
  return (
    <ClickableCard
      ariaLabel={ariaLabel}
      onOpen={onOpen}
      role={role}
      selected={selected}
      interactiveChildren={hasActions}
    >
      {hasActions ? (
        <CardActionsTrigger
          triggerLabel={actionsLabel}
          menuLabel={`Actions for ${title}`}
          items={actions}
        />
      ) : null}

      <CardHero media={media ?? {}} pills={pills} />

      <Box
        sx={{
          p: GAP.block,
          display: 'flex',
          flexDirection: 'column',
          gap: GAP.control,
          flexGrow: 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: GAP.control,
          }}
        >
          {/* `overflow: hidden` is what gives this a zero automatic minimum
              size, so a survey number with no break opportunity ellipses
              instead of widening its grid column past the viewport. */}
          <Typography
            sx={{
              fontSize: 17,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </Typography>
          {titleChip !== undefined && titleChip !== null ? (
            <Box sx={{ display: 'flex', flexShrink: 0 }}>{titleChip}</Box>
          ) : null}
        </Box>

        <Typography variant="body2" color="text.secondary" noWrap>
          {subtitle !== undefined && subtitle !== '' ? subtitle : dash}
        </Typography>

        {/* ALWAYS rendered, dash and all: a card that drops this row is shorter
            than the card beside it, and the row of cards loses its baseline. */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: GAP.tight,
            minWidth: 0,
            color: 'text.secondary',
          }}
        >
          <PlaceOutlinedIcon sx={{ fontSize: 16, ml: -0.25, flexShrink: 0 }} />
          <Typography variant="body2" color="text.secondary" noWrap>
            {location !== undefined && location !== '' ? location : dash}
          </Typography>
        </Box>

        {chips !== undefined && chips !== null ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.25 }}>{chips}</Box>
        ) : null}

        {footer !== undefined ? (
          <Box
            sx={{
              mt: 'auto',
              pt: GAP.cluster,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: GAP.control,
            }}
          >
            <Typography className="tnum" sx={{ fontSize: 17, fontWeight: 700 }} noWrap>
              {footer.figure}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {footer.caption}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </ClickableCard>
  );
}
