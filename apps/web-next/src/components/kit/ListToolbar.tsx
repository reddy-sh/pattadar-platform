'use client';

/**
 * The list toolbar, fixed once so it stops being retyped.
 *
 * Five controls — search, a view toggle, Filters, Export and the create
 * action — sit above nearly every list in this app, and today they sit there
 * in three different orders. Properties runs tabs · search · toggle · Filters ·
 * Export · Add (`views/LandPropertiesPage.tsx:486-536`); Passbooks pins search
 * to the far LEFT behind a `flexGrow` spacer, drops Filters entirely and uses a
 * 16px bottom margin instead of 12 (`views/PassbooksPage.tsx:220-256`);
 * Documents puts the primary BEFORE Export (`views/documents/DocumentsTab.tsx:645-682`);
 * Invitations (`:186-197`) and Notifications (`:132-147`) hand the whole cluster
 * to `PageHeader`'s `actions` slot, where page-level verbs belong. None of those
 * four spellings was ever a decision — the row was simply rebuilt from memory
 * each time, and memory drifts. So the ORDER lives here rather than at the call
 * site: a caller names a slot, never a position, and there is nowhere left for
 * the next copy to diverge.
 *
 * The single `ActionRegion` is the second half of the same argument. Properties
 * flips its Filters button to `contained` the moment a filter is active
 * (`LandPropertiesPage.tsx:517-524`) while Add is already `contained` two lines
 * later — two filled buttons in one row, each locally reasonable. Wrapping the
 * toolbar in one region makes "exactly one filled button" structural instead of
 * a review note: a state control like Filters is `tertiary`/`secondary` and can
 * never win the claim against the create action.
 *
 * `replaceWith` exists because of a real defect, not for symmetry. When rows are
 * selected, `DocumentsTab.tsx:609-702` unmounts the entire toolbar and paints a
 * selection bar in its place, taking the search box and the live type-filter
 * chips with it — so mid-selection the reader can no longer see WHICH subset
 * they are acting on. Here the swap is scoped to the right-hand cluster; `left`
 * and anything the screen renders around the toolbar stay mounted.
 *
 * This file is layout only: two `Box`es, two shared `sx` atoms, and no colour,
 * border, radius or shadow of its own.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import Box from '@mui/material/Box';

import { ActionRegion, useActionRegion } from './Action';
import { actionClusterSx, toolbarRowSx } from './tokens';

/** Stripped from the production bundle; the audit below never ships. */
const DEV = process.env.NODE_ENV !== 'production';

export interface ListToolbarProps {
  /** Tabs or a scope control, pinned left. */
  left?: ReactNode;
  /**
   * The right cluster. ALWAYS rendered in this order regardless of prop order:
   *   search -> viewToggle -> filters -> extras -> exportAction -> primaryAction
   */
  search?: ReactNode;
  viewToggle?: ReactNode;
  filters?: ReactNode;
  extras?: ReactNode;
  exportAction?: ReactNode;
  primaryAction?: ReactNode;
  /** Names the ActionRegion for the one-filled-button registry. */
  regionName: string;
  /**
   * Replaces the whole right cluster (selection mode) while KEEPING `left` and
   * any active-filter display mounted.
   */
  replaceWith?: ReactNode;
}

/**
 * A toolbar whose order cannot be overridden. `left` holds tabs or a scope
 * control; the six right-hand slots render in the fixed sequence above however
 * they were passed. The whole row is one action region, so the create action is
 * the only control in it that can render filled.
 */
export function ListToolbar({
  left,
  search,
  viewToggle,
  filters,
  extras,
  exportAction,
  primaryAction,
  regionName,
  replaceWith,
}: ListToolbarProps) {
  const clusterRef = useRef<HTMLDivElement | null>(null);

  // `replaceWith={count > 0 && <SelectionBar/>}` is the natural call-site
  // spelling and yields `false`, not `undefined`, when nothing is selected —
  // which would otherwise swap the cluster for an empty row.
  const swapped = replaceWith !== undefined && replaceWith !== null && replaceWith !== false;

  return (
    // Inherits, with no `root`. A list at page level — or in a tab panel, which
    // opens no region of its own — has nothing above this toolbar, so the create
    // action is filled exactly as `LandPropertiesPage.tsx:526-534` has it. A
    // list embedded inside another region (a sub-list in a `Section`, a detail
    // pane) counts inside its host and the create action demotes, which is the
    // whole reason the toolbar is not declared `root`.
    <ActionRegion name={regionName}>
      <Box sx={toolbarRowSx}>
        {left}
        {swapped ? (
          replaceWith
        ) : (
          <Box ref={clusterRef} sx={actionClusterSx}>
            {search}
            {viewToggle}
            {filters}
            {extras}
            {exportAction}
            {primaryAction}
            {DEV ? <FilledButtonAudit cluster={clusterRef} /> : null}
          </Box>
        )}
      </Box>
    </ActionRegion>
  );
}

/**
 * Development-only second line of defence behind the claim registry. The
 * registry can only govern buttons that came through `Action`; a raw
 * `<Button variant="contained">` handed in through `extras` — the exact thing
 * this kit is replacing — never claims anything, so the count is taken from the
 * rendered DOM instead. Renders nothing, and is not rendered at all in
 * production.
 */
function FilledButtonAudit({ cluster }: { cluster: RefObject<HTMLDivElement | null> }) {
  const regionName = useActionRegion()?.name ?? 'list toolbar';
  const reportedRef = useRef('');

  // Deliberately no dependency array: an `Action` settles its claim in a layout
  // effect and re-renders, so only the latest commit tells the truth. The
  // signature guard is what keeps that from becoming a console full of the same
  // line.
  useEffect(() => {
    const node = cluster.current;
    if (node === null) return;
    const filled = Array.from(node.querySelectorAll<HTMLElement>('.MuiButton-contained'));
    if (filled.length < 2) {
      reportedRef.current = '';
      return;
    }
    const labels = filled.map((el) => `"${(el.textContent ?? '').trim()}"`).join(', ');
    if (labels === reportedRef.current) return;
    reportedRef.current = labels;
    console.error(
      `${filled.length} filled buttons in the "${regionName}" cluster: ${labels}. A toolbar may contain exactly one — give the others role="secondary" or "tertiary".`,
    );
  });

  return null;
}
