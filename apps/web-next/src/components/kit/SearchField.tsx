'use client';

/**
 * The two toolbar atoms every list screen re-types by hand: the search box and
 * the list/grid switch.
 *
 * Seven screens paste the same `TextField` today — Properties at
 * `views/LandPropertiesPage.tsx:493-508`, Passbooks at `:221-236`, Documents at
 * `documents/DocumentsTab.tsx:645-660`, plus AuditLog, AdminRefData and Tools —
 * and each copy carries the same three defects. It has no accessible name: a
 * placeholder is a hint, it is announced only while the field is empty, and it
 * is the first thing a screen reader drops, so what the user actually hears is
 * "edit, blank". It has no way out except backspacing, which is why every one of
 * those screens strands a filter you can see the effect of but not the cause of.
 * And it refilters on every keystroke, because the parent's `setSearch` runs the
 * whole predicate chain synchronously — fine over 30 rows, not over 3,000. So a
 * visually hidden `<label htmlFor>` carries the name while the placeholder stays
 * as the hint, a labelled clear button ends the search in one press, and the
 * value leaves on a timer while the input itself echoes instantly. The echo is
 * deliberately NOT debounced: a laggy text field is the one thing worse than a
 * laggy list.
 *
 * The three `minWidth`s (190 / 220 / 260) collapse to one default that a caller
 * may still widen, because a toolbar that wraps at a different width on every
 * screen is a rhythm bug, not a per-screen decision.
 *
 * `ViewToggle` exists for a narrower reason: its accessible names are load
 * bearing. `List view` and `Grid view` are frozen defaults rather than copy, so
 * assistive technology and automation can address the controls consistently. The null guard from
 * `LandPropertiesPage.tsx:511` travels with it — a click on the already-selected
 * button hands MUI `null`, and without the guard the group deselects and the
 * screen renders neither view. Persistence is the one thing it gains: the choice
 * is read back in an effect (never in a `useState` initializer — that is
 * `DashboardPage.tsx:75`, the app's only render-phase `localStorage` read, and
 * it is the reason that page can hydration-mismatch), and every access is
 * wrapped because Safari's private mode throws on both read and write.
 *
 * Persistence is deliberately the WEAKER authority. Screen state is also
 * URL-addressable, so a shared `?view=grid` link and a remembered `list` can
 * disagree; the link is the explicit request and this browser's memory is only
 * a habit, so a caller that seeded `value` from the URL passes `hasUrlValue`
 * and the restore stands down. Without that, opening a colleague's link would
 * land on your own remembered mode and — because the screen writes its state
 * back — rewrite the address bar to say so.
 *
 * **`ViewToggle` is for view mode only. A data-scope toggle is a `TabStrip`.**
 * `NotificationsPage.tsx:134-143` currently uses this control to switch between
 * All and Failures — a different dataset, not a different rendering of one — and
 * that is the confusion this sentence exists to stop spreading.
 *
 * Extracted from `views/LandPropertiesPage.tsx:493-508` and `:509-516`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ClearIcon from '@mui/icons-material/Clear';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import type { SxProps, Theme } from '@mui/material/styles';

import { IconAction } from './Action';
import { GAP, TOUCH, focusRingSx } from './tokens';
import type { ViewMode } from './types';

/**
 * Off-screen but still in the accessibility tree — `display: none` and
 * `visibility: hidden` both remove a label from it, which would defeat the
 * whole point of having one. Clipped to a 1px box rather than moved to a
 * negative offset so it never widens the document in a right-to-left locale.
 */
const visuallyHiddenSx = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
} as const satisfies SxProps<Theme>;

/* ── SearchField ─────────────────────────────────────────────────────── */

export interface SearchFieldProps {
  /**
   * The noun searched. Renders placeholder "Search {noun}…" AND the visually
   * hidden label "Search {noun}". REQUIRED: no more unlabelled comboboxes.
   */
  noun: string;
  value: string;
  onChange: (value: string) => void;
  /** Default 250. The input echoes instantly; only onChange is debounced. */
  debounceMs?: number;
  /** Default 220. */
  minWidth?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function SearchField({
  noun,
  value,
  onChange,
  debounceMs = 250,
  minWidth = 220,
  autoFocus,
  disabled,
}: SearchFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState(value);

  /**
   * Refs rather than effect dependencies: a screen that declares `onChange`
   * inline hands us a new function identity on every commit, and a debounce
   * keyed on that identity would restart its timer forever and never fire.
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The keystroke waiting on the timer, so unmount can still deliver it. */
  const pendingRef = useRef<string | undefined>(undefined);
  /** The last value this field itself pushed out — see the sync effect below. */
  const emittedRef = useRef(value);

  const cancel = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    pendingRef.current = undefined;
  }, []);

  const emit = useCallback(
    (next: string) => {
      cancel();
      emittedRef.current = next;
      onChangeRef.current(next);
    },
    [cancel],
  );

  /**
   * A `value` this field did not produce is an outside reset — "Clear filters",
   * a Back navigation restoring URL state — so the input mirrors it and any
   * keystroke still on the timer is dropped rather than allowed to land on top
   * of the reset a moment later.
   */
  useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    cancel();
    setText(value);
  }, [value, cancel]);

  /**
   * Flush, not merely clear. Typing and then immediately switching tab must not
   * silently discard the last word; the screen's state is the thing that
   * survives the unmount, so it has to be told.
   */
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      pendingRef.current = undefined;
      if (pending !== undefined) onChangeRef.current(pending);
    },
    [],
  );

  const handleInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setText(next);
      if (debounceMs <= 0) {
        emit(next);
        return;
      }
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      pendingRef.current = next;
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        pendingRef.current = undefined;
        emit(next);
      }, debounceMs);
    },
    [debounceMs, emit],
  );

  const clear = useCallback(() => {
    setText('');
    // No debounce: pressing Clear is a decision, not a keystroke.
    emit('');
  }, [emit]);

  const handleClear = useCallback(() => {
    clear();
    // The button unmounts with the text that summoned it, so focus would fall
    // to the document body. Hand it back to the field the user is still in.
    inputRef.current?.focus();
  }, [clear]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape') return;
      // Nothing to clear means Escape still belongs to whatever encloses this
      // field; swallowing it in an empty box would break "Esc closes every
      // overlay" for any dialog that contains a search.
      if (text === '') return;
      event.stopPropagation();
      clear();
    },
    [clear, text],
  );

  return (
    <>
      <Box component="label" htmlFor={inputId} sx={visuallyHiddenSx}>
        {`Search ${noun}`}
      </Box>
      <TextField
        id={inputId}
        inputRef={inputRef}
        size="small"
        type="search"
        placeholder={`Search ${noun}…`}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        disabled={disabled}
        sx={{
          minWidth,
          // `type="search"` earns the mobile keyboard's search key and the
          // input's own semantics, but WebKit and Blink also paint an unnamed
          // native ✕ inside it. Ours is the one with an accessible name, so the
          // field does not offer two clear buttons that look alike.
          '& input[type="search"]::-webkit-search-cancel-button': { display: 'none' },
          '& input[type="search"]::-webkit-search-decoration': { display: 'none' },
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment:
              text !== '' && disabled !== true ? (
                <InputAdornment position="end">
                  <IconAction
                    label="Clear search"
                    icon={<ClearIcon fontSize="small" />}
                    onClick={handleClear}
                  />
                </InputAdornment>
              ) : undefined,
          },
        }}
      />
    </>
  );
}

/* ── ViewToggle ──────────────────────────────────────────────────────── */

export interface ViewToggleOption {
  value: ViewMode;
  /** Visible text. */
  label: string;
  /** Accessible name. MUST default to 'List view' / 'Grid view'. */
  ariaLabel: string;
}

export interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  /**
   * Defaults to exactly:
   *   [{ value: 'list', label: 'List', ariaLabel: 'List view' },
   *    { value: 'grid', label: 'Grid', ariaLabel: 'Grid view' }]
   */
  options?: ViewToggleOption[];
  /**
   * localStorage key; the choice survives navigation and reload. It is the
   * weakest authority on this control: pass `hasUrlValue` whenever the same
   * state is also URL-addressable.
   */
  persistKey?: string;
  /**
   * `true` when `value` arrived from the query string — for a `useQueryState`
   * screen, `rawParam(params.view) !== undefined`. The remembered choice is
   * then NOT restored over it, because a link is explicit and a memory is not.
   * Clicks are still written to `persistKey`: the user's latest decision is
   * worth remembering even on a visit the URL opened.
   */
  hasUrlValue?: boolean;
  /** Group aria-label. Default 'View mode'. */
  ariaLabel?: string;
}

/**
 * Frozen, not merely defaulted: two e2e specs address these buttons by name.
 * Module scope also gives the array a stable identity, so the restore effect
 * below cannot re-run on a caller's re-render.
 */
const DEFAULT_VIEW_OPTIONS: ViewToggleOption[] = [
  { value: 'list', label: 'List', ariaLabel: 'List view' },
  { value: 'grid', label: 'Grid', ariaLabel: 'Grid view' },
];

/** The icon belongs to the mode, so a caller's custom labels keep the glyph. */
const VIEW_ICON: Record<ViewMode, ReactNode> = {
  list: <ViewListOutlinedIcon fontSize="small" sx={{ mr: GAP.tight }} />,
  grid: <GridViewOutlinedIcon fontSize="small" sx={{ mr: GAP.tight }} />,
};

export function ViewToggle({
  value,
  onChange,
  options = DEFAULT_VIEW_OPTIONS,
  persistKey,
  hasUrlValue,
  ariaLabel = 'View mode',
}: ViewToggleProps) {
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  const restoredRef = useRef(false);

  /**
   * Read in an effect, which is to say after hydration: the server has no
   * `localStorage`, so restoring during render would paint one view on the
   * server and another in the browser and tear the markup apart.
   *
   * A URL-seeded `value` outranks the stored one, so the restore does not run
   * at all — not even to compare — when the caller says the query string
   * already spoke.
   */
  useEffect(() => {
    if (persistKey === undefined || hasUrlValue === true || restoredRef.current) return;
    restoredRef.current = true;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(persistKey);
    } catch {
      // Safari private mode throws on access. An unrestorable preference is
      // not an error the user needs to hear about.
      return;
    }
    if (stored === null) return;
    // Matched against the live options rather than cast: a stale key written by
    // an older build must not put the group into a mode that no longer exists.
    const match = options.find((option) => option.value === stored);
    if (match === undefined || match.value === valueRef.current) return;
    onChangeRef.current(match.value);
  }, [persistKey, hasUrlValue, options]);

  const handleChange = useCallback(
    (_event: MouseEvent<HTMLElement>, next: ViewMode | null) => {
      // The null guard, verbatim from LandPropertiesPage.tsx:511 — clicking the
      // selected button hands back null, and an empty group renders no view.
      if (!next) return;
      if (persistKey !== undefined) {
        try {
          window.localStorage.setItem(persistKey, next);
        } catch {
          // Private mode / quota. The choice still applies for this session.
        }
      }
      onChange(next);
    },
    [onChange, persistKey],
  );

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={handleChange}
      aria-label={ariaLabel}
      sx={{
        // The 44px gate, taken on the target only: the button keeps its `small`
        // padding, so the toolbar's visual weight is unchanged.
        '& .MuiToggleButton-root': {
          minHeight: TOUCH,
          '&:focus-visible': { ...focusRingSx },
        },
      }}
    >
      {options.map((option) => (
        <ToggleButton key={option.value} value={option.value} aria-label={option.ariaLabel}>
          {VIEW_ICON[option.value]}
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
