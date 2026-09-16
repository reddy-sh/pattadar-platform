'use client';

/**
 * One tab bar for the app, plus the tab-panel semantics that were never written
 * to go with it.
 *
 * Five screens spell `Tabs` five different ways today. Properties fixes the 38px
 * metrics and nothing else (`views/LandPropertiesPage.tsx:487-491`); Documents
 * (`:43`) and GroupDetail (`:247`) take MUI's defaults with two different bottom
 * margins; ParcelDetail (`:1027`) copies Properties' metrics and adds scrolling;
 * AdminRefData (`:201`) is the only one that asks for `variant="scrollable"`.
 * That last divergence is the expensive one — it is why four labels overflow at
 * 400px on every screen but one, and why Tools can nest a four-tab strip above
 * CalculatorTool's own four and have neither of them scroll. Scrolling stops
 * being a per-screen decision here: it is the only behaviour this file has.
 *
 * Two of the five paste the count into the label string — `States (12)`,
 * `Files (7)` — which makes the parenthesis part of the tab's accessible name
 * and welds a number inside a string a translator will one day have to move. A
 * `count` is data, so it renders as its own tonal badge beside the label. The
 * digits stay in the accessible name deliberately: the count is information, and
 * hiding it from assistive tech to tidy up the name would lose more than it
 * gains.
 *
 * None of the five renders a tab PANEL. Every tab body in the app is a bare
 * sibling of the strip (`LandPropertiesPage.tsx:607-758` is the reference), so a
 * screen reader announces "tab, selected" and then finds nothing that claims to
 * be the thing that was selected. `TabPanel` and `useTabPanelIds` close that
 * loop from both ends — one `idPrefix` generates the `id` / `aria-controls` /
 * `aria-labelledby` triple, and namespacing it is what lets Tools' strip and
 * Calculator's strip coexist on one page without colliding ids.
 *
 * What this file refuses to know is where the selected value lives. `value` and
 * `onChange` come from the screen, which is the only place that can hold rules
 * like "`?pb=` outranks `?tab=`"; a tab bar that owned its own URL state would
 * have to grow an escape hatch for every one of them.
 *
 * Extracted from `views/LandPropertiesPage.tsx:487-491` (the metrics), and from
 * the four competing spellings at `views/DocumentsPage.tsx:43`,
 * `views/families/GroupDetail.tsx:247`, `views/detail/ParcelDetailPage.tsx:1027`
 * and `views/AdminRefDataPage.tsx:201`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

import { GAP, RADIUS, TOUCH, focusRingSx, tonalSx } from './tokens';
import type { HeaderLevel, TabItem } from './types';

/**
 * Properties' 38px, now the only tab height in the app. It breaches two rules at
 * once: it is not a multiple of 4, and on its own it is 6px short of the 44x44
 * touch gate. Only one of those is an engineer's to fix. Raising the number
 * re-lays out the reference screen's toolbar row (`LandPropertiesPage.tsx:487`)
 * on every list screen, which is a founder decision and not a side effect of
 * extracting a component — so 38 stays, and the grid breach stays with it.
 *
 * The gate is closed instead by the mechanism the contract already blesses for
 * `Action size="compact"` (`Action.tsx:106-112`): an invisible `::after` band of
 * `TOUCH` height, centred on the tab and full-width, so the target is 44px while
 * nothing moves by a pixel. The 3px it overflows each side fits inside the
 * strip's own 12px bottom gap and the stat row's 16px above it, so it steals no
 * click from a neighbour.
 */
const TAB_MIN_H = 38;

/** The count badge: StatusChip's small size (24px) and pill radius. */
const BADGE_H = 24;

/**
 * The badge's shape and its fill are declared in two places on purpose.
 * `tonalSx` returns the whole `SxProps` union — which may itself be an array —
 * and the `sx` array form refuses to nest one, so merging the token with a
 * metrics object is not expressible without lying to the compiler. The fill
 * stays on the element as the token, the metrics ride this class hook from the
 * strip's own `sx` (the same trick the theme already uses for `.rowActions`),
 * and neither one restates the other.
 */
const BADGE_CLASS = 'kit-tab-count';

/**
 * `id` values reach the DOM through `aria-controls` and `aria-labelledby`, both
 * of which are space-separated ID lists — a tab value like `deed types` would
 * silently resolve to two broken references. Anything outside the safe set
 * collapses to a hyphen.
 */
function idSafe(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]+/g, '-');
}

/**
 * The single place the tab/panel id pair is derived, so the strip and a panel
 * rendered three components away cannot disagree about what they are pointing
 * at. Pure, so `TabStrip` can call it once per tab inside a map.
 */
function panelIds(idPrefix: string, value: string): { tabId: string; panelId: string } {
  const base = `${idSafe(idPrefix)}-${idSafe(value)}`;
  return { tabId: `${base}-tab`, panelId: `${base}-panel` };
}

export interface TabStripProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** REQUIRED. e.g. "Holdings view", "Document type". */
  ariaLabel: string;
  /** Namespaces the generated tab/panel ids so nested strips never collide. */
  idPrefix: string;
  /** Visual weight only — semantics are identical. Default 'page'. */
  level?: HeaderLevel;
}

export function TabStrip({
  items,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  level = 'page',
}: TabStripProps) {
  return (
    <Tabs
      value={value}
      onChange={(_event, next: string) => onChange(next)}
      aria-label={ariaLabel}
      /* Never `standard`. MUI's scroll buttons are `role={null}` / `tabIndex={null}`,
         so they are chrome rather than un-named icon buttons, and the tab list
         itself stays arrow-key navigable. */
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      sx={{
        minHeight: TAB_MIN_H,
        /* A scrollable strip is usually a flex item (Properties sits it beside
           the search cluster), and a flex item's `min-width: auto` is what turns
           "the tabs scroll" into "the page scrolls" at 400px. */
        minWidth: 0,
        maxWidth: '100%',
        /* The only thing `level` changes. A strip nested inside a card reads
           quieter by losing its gap, not by growing a second set of metrics. */
        mb: level === 'section' ? 0 : GAP.cluster,
        '& .MuiTab-root': {
          minHeight: TAB_MIN_H,
          py: GAP.tight,
          /* Anchors the hit box below; the tab itself keeps its 38px box. */
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: '50% 0 0 0',
            transform: 'translateY(-50%)',
            height: TOUCH,
          },
        },
        '& .MuiTab-root:focus-visible': focusRingSx,
        '& .MuiTabs-indicator': { borderRadius: RADIUS.pill },
        [`& .${BADGE_CLASS}`]: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: BADGE_H,
          minWidth: BADGE_H,
          px: GAP.control,
          borderRadius: RADIUS.pill,
          typography: 'caption',
          fontVariantNumeric: 'tabular-nums',
        },
      }}
    >
      {items.map((item) => {
        const { tabId, panelId } = panelIds(idPrefix, item.value);
        return (
          <Tab
            key={item.value}
            value={item.value}
            id={tabId}
            aria-controls={panelId}
            disabled={item.disabled}
            label={
              item.count === undefined ? (
                item.label
              ) : (
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: GAP.control }}
                >
                  {item.label}
                  <Box component="span" className={BADGE_CLASS} sx={tonalSx('neutral')}>
                    {item.count}
                  </Box>
                </Box>
              )
            }
          />
        );
      })}
    </Tabs>
  );
}

export interface TabPanelProps {
  idPrefix: string;
  value: string;
  active: string;
  children: ReactNode;
  /** Keep mounted when inactive (preserves scroll / a half-typed search). Default false. */
  keepMounted?: boolean;
}

export function TabPanel({ idPrefix, value, active, children, keepMounted = false }: TabPanelProps) {
  const { tabId, panelId } = panelIds(idPrefix, value);
  const isActive = value === active;

  /* Unmounting is the default because most bodies fetch; `keepMounted` trades
     that for a preserved scroll position and an unfinished search box, and
     hides the panel with the `hidden` attribute so it leaves the a11y tree and
     the tab order rather than merely going invisible. */
  if (!isActive && !keepMounted) return null;

  return (
    <Box
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!isActive}
      /* Focusable so the panel is reachable from the tab it belongs to — which
         is the whole point of the role, and useless without a visible ring. */
      tabIndex={0}
      sx={{ '&:focus-visible': focusRingSx }}
    >
      {children}
    </Box>
  );
}

/**
 * For a screen that renders the tab body itself instead of wrapping it in
 * `TabPanel` — `RecordScreen` and `TabbedScreen` both need the pair to wire
 * their own containers, and reimplementing the string concatenation at each
 * call site is how the two ends drift apart.
 */
export function useTabPanelIds(idPrefix: string, value: string): { tabId: string; panelId: string } {
  return useMemo(() => panelIds(idPrefix, value), [idPrefix, value]);
}
