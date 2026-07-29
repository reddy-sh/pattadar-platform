/**
 * ONE owner for how much bottom clearance every list needs.
 *
 * This used to reserve room for a floating button (80 + 56 + labels). With the
 * FAB gone, that space was dead: ~140pt of blank scroll under the last row on
 * every screen. Now it clears the tab bar and nothing else.
 */
export const TAB_BAR_CLEARANCE = 60 + 24;

/** @deprecated Kept so older imports keep compiling; equals TAB_BAR_CLEARANCE. */
export const FAB_CLEARANCE = TAB_BAR_CLEARANCE;

export function listBottomInset(safeAreaBottom: number): number {
  return TAB_BAR_CLEARANCE + safeAreaBottom;
}
