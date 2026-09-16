'use client';

/**
 * The overflow menu, once — and the trigger that opens it, twice, because a
 * table row and a photo card need different affordances for the same three dots.
 *
 * Land & Properties ships this menu twice already. The table keeps ONE `Menu`
 * for the whole page and drives it from a `{ anchor, row }` state
 * (`LandPropertiesPage.tsx:763-777`); the grid card mounts its own
 * (`holdingCards.tsx:204-243`). Both spell the item list the same way — map an
 * array, close, then run the handler — and both stop there, which is why every
 * screen that needs a disabled entry, a separator, an icon or a confirmation
 * has instead hand-written its own `MenuItem` list (`DocumentsTab.tsx:794-858`
 * is seven of them). So the item is DATA here — `ActionItem` already carries
 * `hidden`, `disabled`, `disabledReason`, `dividerBefore`, `icon`, `danger`
 * and `confirm` — and the menu is the only thing that knows how to spell it.
 *
 * The two triggers are separate components rather than one with a `variant`
 * because they differ in kind, not in degree. A row trigger is invisible until
 * its row is hovered or focused (and always visible under `hover: none`), and
 * shares one page-level menu with every other row — one `Menu` per table, not
 * one per row, which is the whole point of `useActionMenu`. A card trigger sits
 * on top of photography, so it carries a scrim for contrast, is always visible,
 * owns its own menu, and above all has to swallow the click twice: the card
 * around it is itself a link, and the wrapper guard alone does not stop the
 * trigger's own bubbling. Both guards at `holdingCards.tsx:206,211` are load-
 * bearing.
 *
 * The accessible names are the one thing in this file that may never be
 * generated. `Row actions` and `Card actions` are the established app contract,
 * so `triggerLabel` DEFAULTS to those literals and a per-row name is something a caller opts
 * into, never something the kit templates on its behalf. The menu's own name
 * (`menuLabel`) is free-form and required — a popup with no name is announced
 * as an anonymous list of verbs.
 *
 * `confirm` is why this component mounts a `ConfirmDialog` of its own: guarding
 * Delete used to cost a screen a second piece of state and a second dialog, and
 * eleven screens each solved it differently. Because the dialog lives here,
 * `ActionMenu` must stay MOUNTED while its menu is closed — render it beside the
 * table, never inside a `{menu.row && …}` guard, or the confirmation unmounts
 * the moment the menu closes.
 *
 * Extracted from `views/LandPropertiesPage.tsx:341-373` (`rowActions`, with its
 * `danger` flag and parcels-only Location spread), `:748-752` (the row trigger)
 * and `:763-777` (the page-level `Menu` and its close-then-run order);
 * `components/holdingCards.tsx:196-243` (`CardAction` / `CardActionsMenu`, its
 * absolute placement, its scrim and its double `stopPropagation`).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useId, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import MoreVertIcon from '@mui/icons-material/MoreVert';

import { IconAction } from './Action';
import { useConfirm } from './ConfirmDialog';
import { focusRingSx } from './tokens';
import type { ActionItem } from './types';

/** The e2e-asserted names. Defaults, never templates. See the header. */
const ROW_TRIGGER_LABEL = 'Row actions';
const CARD_TRIGGER_LABEL = 'Card actions';

/**
 * The kit focus ring, turned inward. A menu's Paper clips horizontally
 * (`overflowX: hidden`), so the shared +2px offset would shave the ring's left
 * and right edges off exactly where a keyboard user needs to see it.
 */
const menuItemFocusSx = { ...focusRingSx, outlineOffset: '-2px' } as const;

/**
 * `fontSize="small"` is the contract's size for a menu glyph, applied here
 * rather than trusted to every call site — `1.25rem` is what MUI's own `small`
 * resolves to. `color: inherit` is what carries `danger` through to the icon,
 * so a destructive entry is red end to end instead of red text beside a grey
 * glyph.
 */
const listItemIconSx: SxProps<Theme> = {
  color: 'inherit',
  minWidth: 36,
  '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
};

/**
 * Announced-but-unseen text, the kit's spelling (`StatusChip.tsx:127-138`).
 * A hovered tooltip reaches a mouse; this node reaches everyone else.
 */
const srOnlySx: SxProps<Theme> = {
  border: 0,
  margin: -1,
  padding: 0,
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  clip: 'rect(0 0 0 0)',
};

/* ── ActionMenu ──────────────────────────────────────────────────────── */

export interface ActionMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  items: ActionItem[];
  /** The menu's accessible name, e.g. "Actions for Sy 214/2". Free-form. */
  menuLabel: string;
}

export function ActionMenu({ anchorEl, open, onClose, items, menuLabel }: ActionMenuProps) {
  const { ask, element } = useConfirm();

  /** Base for the per-item `aria-describedby` of a disabled entry's reason. */
  const reasonId = useId();

  /** `hidden` leaves no trace: a menu of greyed-out entries is a menu of noise. */
  const visible = useMemo(() => items.filter((item) => item.hidden !== true), [items]);

  const handleSelect = useCallback(
    (item: ActionItem) => {
      // A disabled entry is a real, focusable `menuitem` carrying
      // `aria-disabled` rather than MUI's `disabled` (see below), so it does
      // reach this handler. This guard is what makes it inert: no close, no
      // confirm, no action.
      if (item.disabled === true) return;
      // Close FIRST, then act — the order at `LandPropertiesPage.tsx:768-771`.
      // A handler that routes or opens a dialog while the menu is still up
      // leaves the popup floating over the next screen.
      onClose();
      const spec = item.confirm;
      if (spec) {
        ask(spec, item.onSelect);
        return;
      }
      void item.onSelect();
    },
    [ask, onClose],
  );

  /**
   * A flat array, never fragments: MUI's `MenuList` walks its children to place
   * initial focus and to wire the arrow keys, and a fragment hides everything
   * inside it from that walk.
   */
  const children = visible.flatMap((item, index) => {
    const label = (
      <>
        {item.icon ? <ListItemIcon sx={listItemIconSx}>{item.icon}</ListItemIcon> : null}
        {item.label}
      </>
    );

    const itemSx: SxProps<Theme> = {
      ...(item.danger === true ? { color: 'error.main' } : null),
      '&:focus-visible': { ...menuItemFocusSx },
    };

    // A disabled entry that cannot say why is a dead control, and a reason only
    // a mouse can reach is barely better: MUI's `disabled` drops the item out
    // of the menu's roving tab order, so a keyboard user arrows past three
    // entries where a mouse user sees four and is never told why. So the entry
    // stays a real, focusable `menuitem` and is made INERT instead — greyed by
    // `action.disabledOpacity`, marked `aria-disabled`, and stopped by the
    // guard in `handleSelect`. `describeChild` keeps the tooltip a DESCRIPTION
    // so the accessible name stays the verb, and the hidden sibling carries the
    // same sentence for everyone who never hovers. That sibling is an
    // `li role="none"` because a `menu` may only own `menuitem`s and
    // separators; a presentational list item keeps the markup valid.
    const nodes =
      item.disabled === true && item.disabledReason ? (
        [
          <Tooltip key={item.key} title={item.disabledReason} describeChild>
            <MenuItem
              aria-disabled="true"
              aria-describedby={`${reasonId}-${item.key}`}
              onClick={() => handleSelect(item)}
              sx={{ ...itemSx, opacity: (t: Theme) => t.palette.action.disabledOpacity }}
            >
              {label}
            </MenuItem>
          </Tooltip>,
          <Box
            key={`${item.key}-reason`}
            component="li"
            role="none"
            id={`${reasonId}-${item.key}`}
            sx={srOnlySx}
          >
            {item.disabledReason}
          </Box>,
        ]
      ) : (
        [
          <MenuItem
            key={item.key}
            disabled={item.disabled}
            onClick={() => handleSelect(item)}
            sx={itemSx}
          >
            {label}
          </MenuItem>,
        ]
      );

    // A rule above the first entry separates the menu from nothing at all.
    return item.dividerBefore === true && index > 0
      ? [<Divider key={`${item.key}-divider`} component="li" />, ...nodes]
      : nodes;
  });

  return (
    <>
      <Menu
        anchorEl={anchorEl}
        open={open}
        // Esc and the backdrop both arrive here, and MUI returns focus to the
        // trigger on close. Neither is disabled: they are the way out.
        onClose={onClose}
        // MUI 9 dropped `MenuListProps` in favour of the slot; the name still
        // lands on the `ul[role="menu"]`, which is what a screen reader reads.
        slotProps={{ list: { 'aria-label': menuLabel } }}
      >
        {children}
      </Menu>
      {element}
    </>
  );
}

/* ── useActionMenu ───────────────────────────────────────────────────── */

/** Page-level menu state shared by every row — ONE Menu per table, not one per row. */
export interface ActionMenuController<T> {
  open: (event: MouseEvent<HTMLElement>, row: T) => void;
  close: () => void;
  row: T | null;
  /** Spread onto <ActionMenu {...menu.menuProps} items={…} menuLabel={…} />. */
  menuProps: { anchorEl: HTMLElement | null; open: boolean; onClose: () => void };
}

/**
 * Anchor and row held as ONE piece of state, because they are one fact: the
 * menu is open, over that row, from that button. Two `useState`s would let a
 * render land between them with an anchor and no row.
 */
export function useActionMenu<T>(): ActionMenuController<T> {
  const [target, setTarget] = useState<{ anchorEl: HTMLElement; row: T } | null>(null);

  const open = useCallback((event: MouseEvent<HTMLElement>, row: T) => {
    setTarget({ anchorEl: event.currentTarget, row });
  }, []);

  const close = useCallback(() => {
    setTarget(null);
  }, []);

  return useMemo(
    () => ({
      open,
      close,
      row: target === null ? null : target.row,
      menuProps: {
        anchorEl: target === null ? null : target.anchorEl,
        open: target !== null,
        onClose: close,
      },
    }),
    [open, close, target],
  );
}

/* ── RowActionsTrigger ───────────────────────────────────────────────── */

export interface RowActionsTriggerProps {
  /**
   * Accessible name. DEFAULTS TO THE LITERAL 'Row actions' — the app's current
   * name. Pass a per-row name only where no test pins the constant.
   */
  triggerLabel?: string;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** True while THIS row's menu is the open one. Drives `aria-expanded`. */
  expanded?: boolean;
}

/**
 * The trailing "⋮" of a table row. `revealOnRowHover` is the theme's
 * `.rowActions` class (`theme/index.tsx:105-110`): hidden at rest, revealed on
 * row hover **and** row focus-within, and permanently visible under
 * `hover: none`, so the control is never unreachable on a phone. The 44px
 * target comes from the theme's IconButton floor, not from a local override.
 */
export function RowActionsTrigger({
  triggerLabel = ROW_TRIGGER_LABEL,
  onClick,
  disabled,
  disabledReason,
  expanded = false,
}: RowActionsTriggerProps) {
  return (
    <IconAction
      label={triggerLabel}
      icon={<MoreVertIcon fontSize="small" />}
      onClick={onClick}
      disabled={disabled}
      disabledReason={disabledReason}
      revealOnRowHover
      aria-haspopup="menu"
      aria-expanded={expanded}
    />
  );
}

/* ── CardActionsTrigger ──────────────────────────────────────────────── */

export interface CardActionsTriggerProps {
  /** Accessible name. DEFAULTS TO THE LITERAL 'Card actions'. */
  triggerLabel?: string;
  /** The menu's accessible name. */
  menuLabel: string;
  items: ActionItem[];
}

/**
 * The "⋮" that sits on a card's photograph. It owns its menu because a grid
 * card is self-contained, and it is always visible because the card underneath
 * it is usually the whole click target — a control that appears only on hover
 * does not exist on a touch device.
 *
 * The scrim is the reason it stays legible over an arbitrary photo. It was
 * `rgba(10, 26, 17, 0.40)` with `#fff` on top; the same visual now comes from
 * `common.black` / `common.white` through `alpha`, so the file holds no colour
 * literal. `alpha` needs a parseable colour, which is why this reads
 * `theme.palette` rather than `theme.vars.palette` — `common` is identical in
 * every scheme, so there is nothing for a CSS variable to switch.
 *
 * Both `stopPropagation` calls are required. The wrapper catches clicks that
 * land beside the button; the trigger's own handler catches its click before it
 * reaches the wrapper's enclosing card, which would otherwise navigate away
 * from under the menu that just opened.
 */
export function CardActionsTrigger({
  triggerLabel = CARD_TRIGGER_LABEL,
  menuLabel,
  items,
}: CardActionsTriggerProps) {
  const menu = useActionMenu<null>();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      menu.open(event, null);
    },
    [menu],
  );

  const swallow = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <Box
      onClick={swallow}
      sx={(t) => ({
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 2,
        '& .MuiIconButton-root': {
          bgcolor: alpha(t.palette.common.black, 0.4),
          color: t.palette.common.white,
          backdropFilter: 'blur(2px)',
          transition: t.transitions.create('background-color', {
            duration: t.transitions.duration.shorter,
          }),
          '&:hover': { bgcolor: alpha(t.palette.common.black, 0.62) },
        },
      })}
    >
      <IconAction
        label={triggerLabel}
        icon={<MoreVertIcon fontSize="small" />}
        onClick={handleClick}
        aria-haspopup="menu"
        aria-expanded={menu.menuProps.open}
      />
      <ActionMenu {...menu.menuProps} items={items} menuLabel={menuLabel} />
    </Box>
  );
}
