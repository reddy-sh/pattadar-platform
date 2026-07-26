/**
 * Shared table styling atoms for the M3 redesign.
 *
 * `stickyHeadSx` — put on the TableContainer of long list tables: bounds the
 * container to the viewport and pins the header row while its rows scroll
 * (a container-scoped scrollport is also what keeps wide tables from ever
 * overflowing the page horizontally — the suite's hard rule). Card
 * background fills the pinned header so rows never show through.
 */
export const stickyHeadSx = {
  overflowX: 'auto',
  maxHeight: 'min(72vh, 680px)',
  '& thead th': {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    bgcolor: 'background.paper',
  },
} as const;

/**
 * `selectionBarSx` — the M3 contextual toolbar that replaces a table's
 * filter toolbar while rows are checkbox-selected: primaryContainer fill,
 * "N selected" on the left, bulk actions on the right, Esc clears.
 */
export const selectionBarSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  flexWrap: 'wrap',
  mb: 1.5,
  px: 2,
  py: 1,
  minHeight: 52,
  borderRadius: 3, // 12 — default M3 radius
  bgcolor: 'primary.container',
  color: 'primary.onContainer',
} as const;
