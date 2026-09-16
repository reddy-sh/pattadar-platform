'use client';

/**
 * The tab host, and nothing else: a header, a tab bar, and the panel semantics
 * that make the pair mean something.
 *
 * Four screens in this app host tabs, and the interesting thing about them is
 * how little they have in common. `DocumentsPage.tsx:28-58` is the purest of
 * the four — two tabs, no toolbar, no body of its own — and yet it still calls
 * `useDocuments()` at `:30` for a query neither tab uses, purely to feed the
 * header's outage flag. That is a second fetch of the same collection whose
 * answer can disagree with the answer the tab got, which is how a header comes
 * to announce that the service is unreachable above two panels quietly
 * rendering data. A host that fetches is a host that can contradict its own
 * body, so this one does not fetch at all: the service state belongs to the
 * active tab's own query, passed up through `header.dataState`.
 *
 * The same file mounts its own `Snackbar` at `:48-57` behind a toast type
 * narrowed to `success | error | info` at `:23-26`, so a tab that needs to warn
 * has no way to say so and settles for `error` or for silence. Toasts are
 * `ToastProvider`'s job now, at the app shell; the severity vocabulary is the
 * kit's full union in `types.ts`, and this component never sees a message.
 *
 * `ToolsPage.tsx:121-140` shows what the host is actually for. Its four tools
 * are unrelated utilities, each with its own title, its own table and its own
 * controls — nothing a list scaffold can hold without being bent out of shape.
 * Its `?tab=` allowlist at `:40` is a routing contract: four retired routes
 * (`/app/sro`, `/app/stamp-duty`, `/app/market-value`, `/app/calculator`)
 * redirect here and must still land on the right tool, as must `?tab=deeds`
 * from the retired `/app/deeds`. That allowlist stays in the page, because the
 * page is the only place that can also hold rules like "`?pb=` outranks
 * `?tab=`"; `value` and `onChange` come from the screen's `useQueryState`, so
 * the parameter is now written back instead of being read once at mount.
 *
 * What none of the four renders is a tab PANEL. `DocumentsPage.tsx:47`,
 * `ToolsPage.tsx:138-144`, `GroupDetail.tsx:253-256` and
 * `AdminRefDataPage.tsx:209` are all bare `{tab === 'x' && …}` siblings of the
 * strip, so assistive tech is told a tab is selected and then finds nothing
 * claiming to be the thing that was selected. Every body here goes through
 * `TabPanel`, which owns the `role` / `id` / `aria-labelledby` triple.
 *
 * The structural decision is that **a panel opens no `ActionRegion` of its
 * own**. A tab is an independent tool, so its content must count exactly as it
 * would at page level: `DocumentsTab`'s `ListToolbar` keeps its filled create
 * action inside a tab for the same reason it keeps it on a page of its own.
 * This scaffold used to wrap each panel in a region, and the wrapper was the
 * defect — a panel has nothing of its own to count, so all the region did was
 * turn every region its content opened into a NESTED one and demote it, leaving
 * a tab the contract promises a primary with no filled button anywhere in it.
 * Being transparent also gets the embedded case right for free: when the
 * scaffold is itself inside a region (GroupDetail inside the families page) the
 * panel's content inherits and demotes, which is what that case wants.
 *
 * The two filled buttons `RegisteredDeedsTab` renders at once (`:458` in its
 * toolbar and `:298` inside an expanded row) are still fixed, but by the
 * expander rather than by the panel: the toolbar is the tab's one region at
 * depth 0, and the screen wraps the expanded row's body in an inherited
 * `ActionRegion`, so `Add as Parcel` demotes inside it.
 *
 * Deliberately absent: a toolbar, a search box, filters, an empty state. Tabs
 * that are separate collections own all four separately, which is exactly the
 * line between this scaffold and `ListScreen`. `GroupDetail.tsx:141-167`
 * hand-rolls a section header above its strip because no host offered one; that
 * is what `level="section"` is for.
 *
 * Extracted from `views/DocumentsPage.tsx:28-58`, `views/ToolsPage.tsx:121-140`
 * (with the allowlist at `:40`), `views/families/GroupDetail.tsx:141-167` and
 * `:247-256`, and `views/AdminRefDataPage.tsx:196-210`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import type { ReactNode } from 'react';

import { PageSkeleton } from './KitSkeletons';
import { PageHeader } from './PageHeader';
import type { PageHeaderProps } from './PageHeader';
import { StatTiles } from './StatTiles';
import { TabPanel, TabStrip } from './TabStrip';
import type { HeaderLevel, StatItem, StatScope, TabPanelItem } from './types';

export interface TabbedScreenProps {
  /** 'page' (default) or 'section' for an in-page host like GroupDetail. */
  level?: HeaderLevel;
  header: Omit<PageHeaderProps, 'below' | 'level'>;
  /** Each tab renders its OWN toolbar, stats, primary action and empty state. */
  tabs: TabPanelItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  idPrefix: string;
  /** Optional host-level stats shared by every tab (never per-tab figures). */
  stats?: { items: StatItem[]; scope: StatScope };
  /**
   * Actions in the header's right slot. The host owns at most one filled button,
   * and a tab that supplies its own primary must not receive one here.
   *
   * That second half is a call-site discipline the registry cannot enforce: the
   * header's region and the panel's content are SIBLINGS, never ancestor and
   * descendant, so nothing demotes one on account of the other. Pass `demote`
   * on whichever of the two should yield.
   */
  actions?: ReactNode;
  /** Rendered instead of the active panel while the HOST's own data loads. */
  loading?: boolean;
  loadingSkeleton?: ReactNode;
  /** Keep inactive panels mounted (preserves a half-typed search). Default false. */
  keepMounted?: boolean;
  /** Dialogs. Rendered after the panels, outside every region. */
  children?: ReactNode;
}

export function TabbedScreen({
  level = 'page',
  header,
  tabs,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  stats,
  actions,
  loading = false,
  loadingSkeleton,
  keepMounted = false,
  children,
}: TabbedScreenProps) {
  /* The strip rides `PageHeader`'s `below` slot, which is what owns the whole
     header → tabs → content rhythm: 12px above the strip, 24px beneath it. The
     strip is therefore always asked for its `section` metrics regardless of the
     host's own `level` — its only effect is its bottom gap, and adding a second
     one here is precisely the 36px gutter `PageHeader` was built to stop. */
  const strip = (
    <TabStrip
      items={tabs}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      idPrefix={idPrefix}
      level="section"
    />
  );

  /* Unmounting inactive tabs is the default because separate collections mean
     separate fetches. `keepMounted` trades that for a preserved scroll position
     and an unfinished search box; `TabPanel` then hides the inactive ones with
     the `hidden` attribute so they leave the a11y tree and the tab order.
     A `value` outside `tabs` mounts nothing: the allowlist is the page's, and
     inventing a fallback here would quietly swallow a broken `?tab=`. */
  const mounted = keepMounted ? tabs : tabs.filter((tab) => tab.value === value);

  return (
    <>
      {/* `actions` is the documented slot, but `PageHeaderProps` still carries
          its own; falling back means a caller that spells it the other way gets
          a rendered button rather than a silently dropped one. */}
      <PageHeader
        {...header}
        level={level}
        actions={actions ?? header.actions}
        below={strip}
      />

      {stats ? <StatTiles items={stats.items} scope={stats.scope} /> : null}

      {loading ? (
        /* The skeleton stands inside the panel rather than in place of it, so
           the selected tab's `aria-controls` keeps pointing at something real
           while the host's data is in flight. It stands for the panel BODY
           only: the real header, strip and stats are already on screen above
           it, and `PageSkeleton`'s defaults (`header`, and four stat tiles the
           tab may not even have) would draw a second set beneath the live one. */
        <TabPanel idPrefix={idPrefix} value={value} active={value}>
          {loadingSkeleton ?? <PageSkeleton header={false} stats={false} toolbar={false} />}
        </TabPanel>
      ) : (
        /* A panel opens NO region of its own. A tab is an independent tool, so
           its content must count exactly as it would at page level — and a
           panel has nothing of its own to count. Wrapping one did the opposite:
           every region the content opened (`DocumentsTab`'s `ListToolbar`, a
           `Section`) became a nested region and demoted its primary, so the tab
           the contract promises a primary ended up with no filled button at
           all. Unwrapped, this scaffold is transparent — at page level the
           content is at depth 0, and when the scaffold is itself embedded in a
           region (GroupDetail inside the families page) the content inherits
           and demotes, which is the outcome that case wants. */
        mounted.map((tab) => (
          <TabPanel
            key={tab.value}
            idPrefix={idPrefix}
            value={tab.value}
            active={value}
            keepMounted={keepMounted}
          >
            {tab.render()}
          </TabPanel>
        ))
      )}

      {children}
    </>
  );
}
