'use client';

/**
 * LAYER 2 — the record page, and the one state machine all three of them got
 * wrong in the same way.
 *
 * Parcel, Property and Passbook are near-twins across roughly twenty blocks,
 * and each rebuilt the same header by hand. All three spell the record's title
 * `Typography variant="h6" component="h1"` (`ParcelDetailPage.tsx:998`,
 * `PropertyDetailPage.tsx:685`, `PassbookDetailPage.tsx:434`), so the one
 * heading a record page owns is drawn at the size of a card title, and the
 * extent and address that belong under it are crammed into the title row as a
 * `body2` and a `caption` instead. Here the title goes through `PageHeader
 * level="page"` — an `h1` at the `h4` scale — and `summary` becomes the muted
 * line beneath it, which is the shape that row was always trying to be.
 *
 * **The bug this file exists to close** is `PassbookDetailPage.tsx:382`. The
 * page renders `NotFoundCard` — "Passbook not found or not yours" — whenever
 * `data.passbook` is null, and `sampleFor(id)` at `:166-167` hands back exactly
 * that for any real id the moment the service stops answering. An owner whose
 * api is down is told their land may not be theirs. So precedence is fixed here
 * and stated once: loading → unreachable → not-found → content. `isUnreachable`
 * OUTRANKS `notFound`, because "we could not ask" and "the answer was no" are
 * different sentences and only one of them is ever safe to guess at. Loading
 * renders `RecordSkeleton` shaped like THIS page, `hero` following whether the
 * record actually has a cover band, so the placeholder stops promising
 * furniture that never arrives (`PassbookDetailPage.tsx:373-379` drew a hero
 * and a table for a page that has neither).
 *
 * Every badge arrives as data. `pills`, `attention` and `dataState` are props
 * rather than rules, because the three pages disagree about what deserves one —
 * Property alone triages tax, EC and litigation (`PropertyDetailPage.tsx:204-215`),
 * Parcel alone carries a classification, Passbook carries neither — and a
 * scaffold that derived any of them would have to know all three domains. What
 * it does replace is the "Sample data" chip all three render (`:1012`, `:701`,
 * `:440`) under a tooltip promising a bundled dataset the app no longer paints:
 * one `dataState`, one `ServiceStateChip`, one sentence.
 *
 * `RecordMedia` is `common.tsx`'s `MediaHero` with its defects removed rather
 * than its markup copied. That banner is a `Box` with `role="button"`, no
 * `tabIndex` and no key handler (`:354-358`) — a control a keyboard cannot
 * reach — and its photo and video counts are `Box`es with `onClick` (`:385-417`)
 * dressed in a hand-mixed `rgba(0,0,0,0.65)` chip over a hard-coded blue
 * gradient, on a product whose brand is emerald. The banner is a `ButtonBase`
 * now, so the `button` role, `Enter`, `Space` and the focus ring all come from
 * the platform; the counts are named `Action`s in a real row beneath it, which
 * is why they no longer need a scrim to be legible and no longer nest a button
 * inside a button; and the gradient is `CardHero`'s, which is the theme's. With
 * no media and an `emptyAction` it renders the offer instead of an empty band,
 * because a cover with nothing behind it is a dead control.
 *
 * Two structural notes, because both look like omissions. The tab strip does
 * NOT ride `PageHeader`'s `below` slot the way `TabbedScreen`'s does: the cover
 * band stands between the header and the tabs, so this file spends those two
 * margins itself — and spends them to match `RecordSkeleton` exactly, 24px
 * under the header and 16px under the band, so nothing shifts when the record
 * arrives. And a tab panel opens NO `ActionRegion`: the hero's region (the
 * header's action cluster) is a SIBLING of the panel, never its ancestor, so a
 * record's `Edit details` and a tab's `Add note` already never compete — while
 * a region around the panel would have made every `Section` inside that tab a
 * nested region and demoted the `Add note` this file calls legal.
 *
 * Extracted from `views/detail/ParcelDetailPage.tsx:995-1019` (the hand-rolled
 * header), `:1021` (`MediaHero`), `:1027-1040` (six tabs with no tab-panel
 * semantics) and `:1042` (the back link as `Link component="button"` — a
 * control announced as a link that navigates nowhere);
 * `views/detail/PropertyDetailPage.tsx:682-713`, `:715`, `:716-729`, `:731` and
 * `:204-215`; `views/detail/PassbookDetailPage.tsx:373-382` and `:411-463`;
 * and `views/detail/common.tsx:119-131` (`NotFoundCard`) plus `:333-417`
 * (`MediaHero`).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import type { ReactNode } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import type { SxProps, Theme } from '@mui/material/styles';

import { Action, ActionRow } from './Action';
import { CardHero, useMediaRef } from './CardGrid';
import { pluralise } from './format';
import { RecordSkeleton } from './KitSkeletons';
import { PageHeader } from './PageHeader';
import type { PageHeaderProps } from './PageHeader';
import { StatusChip } from './StatusChip';
import { TabPanel, TabStrip } from './TabStrip';
import { GAP, focusRingSx, surfaceSx } from './tokens';
import { ZeroState } from './ZeroState';
import type {
  ActionSpec,
  DataState,
  MediaSource,
  PillSpec,
  TabPanelItem,
  ZeroSpec,
} from './types';

const NOOP = () => {};

/**
 * MUI's sx-composition idiom, the same helper `CardGrid.tsx:96` and
 * `Section.tsx:83` factor out. A token like `surfaceSx` is typed
 * `SxProps<Theme>` — a union that already admits the callback and array forms —
 * so it cannot be spread into an object literal without being flattened first,
 * and copying its rules instead is how a token stops being the one definition
 * of a surface. It is the reason this file declares no colour, border, radius
 * or shadow of its own: every one of them is borrowed, not restated.
 */
function composeSx(...parts: SxProps<Theme>[]): SxProps<Theme> {
  return parts.flatMap((part) => (Array.isArray(part) ? part : [part]));
}

/**
 * `ActionSpec.key` is a list identity, not a DOM prop — spreading it whole
 * would put `key` through React's own channel and then hand `Action` a prop it
 * does not have. Every action in this file goes through here so the two uses
 * cannot be confused.
 */
function actionNode(spec: ActionSpec) {
  const { key, ...rest } = spec;
  return <Action key={key ?? spec.label} {...rest} />;
}

/* ── Copy ────────────────────────────────────────────────────────────── */

/**
 * Restated from `ZeroState.tsx:111-115` rather than imported, because those
 * constants are private to the switch that owns collection states. The words
 * are the kit's one outage sentence and must stay byte-identical to it: a
 * record page and a list page that phrase the same silence differently is the
 * five-spellings problem `DataState` was introduced to end.
 */
const OUTAGE_COPY = {
  title: 'We could not load this',
  body: 'The service did not answer. Your records are safe — try again in a moment.',
  retryLabel: 'Try again',
} as const;

/**
 * The fallback for a genuine 404. `NotFoundCard` said "{what} not found or not
 * yours" for both a missing record and an outage; now that the outage has a
 * state of its own this sentence can finally mean what it says. Callers name
 * the record type by passing their own `notFound` spec.
 */
const NOT_FOUND_COPY: ZeroSpec = {
  icon: '🔍',
  title: 'Not found',
  body: 'This record does not exist, or it is not yours.',
};

/**
 * Verbatim from `common.tsx:357`. The accessible name and its position before
 * the tab strip are part of the record-screen contract, not incidental copy.
 */
const GALLERY_LABEL = 'Open gallery';

const CHANGE_PHOTO_LABEL = 'Change photo';

/** `PassbookDetailPage.tsx:419-423`'s holder photograph, at its own size. */
const AVATAR_PX = 72;
const AVATAR_GLYPH_PX = 28;

/* ── Back link ───────────────────────────────────────────────────────── */

/**
 * The same `Action` `PageHeader` renders in its own back slot, for the two
 * states that have no header to hang it on. A reader who lands on a missing
 * record or an outage still needs the way out that `NotFoundCard`'s `Button`
 * gave them — and it is a real anchor when the caller has a URL, never the
 * `Link component="button"` the three pages settled for.
 */
function BackControl({ back }: { back: PageHeaderProps['back'] }) {
  if (back === undefined) return null;

  return (
    <Box sx={{ mb: GAP.control }}>
      <Action
        role="quiet"
        size="compact"
        label={back.label}
        icon={<ChevronLeftIcon fontSize="small" />}
        href={'href' in back ? back.href : undefined}
        onClick={'onClick' in back ? back.onClick : NOOP}
      />
    </Box>
  );
}

/* ── RecordHero ──────────────────────────────────────────────────────── */

interface RecordAvatarSpec {
  media?: MediaSource;
  onEdit?: () => void;
  editLabel?: string;
}

/**
 * The holder photograph. `PassbookDetailPage.tsx:414-429` makes it an `Avatar`
 * with a bare `onClick`, named only by a `Tooltip` — invisible to the keyboard
 * and nameless to a screen reader. `component={ButtonBase}` keeps the avatar's
 * own geometry while making the root a real `button`, so the name, the focus
 * ring and `Enter` / `Space` all come from the platform. At 72px it clears the
 * 44px touch floor several times over.
 */
function RecordAvatar({ media, onEdit, editLabel }: RecordAvatarSpec) {
  // A direct URL (a data: holder photo) wins over a fileRef, exactly as
  // `CardHero` decides it — one rule for resolving media, not two.
  const direct = media?.url !== undefined && media.url !== '';
  const resolved = useMediaRef(direct ? undefined : media?.fileRef);
  const src = direct ? media?.url : resolved.url;

  const imageSrc = src === '' ? undefined : src;
  const sizeSx = { width: AVATAR_PX, height: AVATAR_PX, fontSize: AVATAR_GLYPH_PX };

  if (onEdit === undefined) {
    return (
      <Avatar variant="rounded" src={imageSrc} alt={media?.alt ?? ''} sx={sizeSx}>
        {media?.fallbackIcon}
      </Avatar>
    );
  }

  return (
    <Avatar
      component={ButtonBase}
      variant="rounded"
      src={imageSrc}
      alt={media?.alt ?? ''}
      onClick={onEdit}
      aria-label={editLabel ?? CHANGE_PHOTO_LABEL}
      sx={{ ...sizeSx, '&:focus-visible': { ...focusRingSx } }}
    >
      {media?.fallbackIcon}
    </Avatar>
  );
}

export interface RecordHeroProps {
  /** The page's single h1, at the page-title scale (not h6, as today). */
  title: string;
  eyebrow?: string;
  /** Tonal status chips: status, classification, stake. Passed as DATA. */
  pills?: PillSpec[];
  /** Outlined metadata chips. */
  metaChips?: ReactNode;
  /** The muted "extent · address" line. */
  summary?: ReactNode;
  /** Tax overdue / EC stale / litigation. Severity is the caller's domain triage. */
  attention?: PillSpec[];
  dataState?: DataState;
  /** Editable avatar (the passbook holder's photograph). */
  avatar?: { media?: MediaSource; onEdit?: () => void; editLabel?: string };
  /** One primary at most, plus secondaries and one destructive (red text). */
  actions?: ActionSpec[];
  /**
   * OPTIONAL and additive to the published API: `RecordScreen` routes its own
   * `back` through here, because the brief puts the back link in
   * `PageHeader.back` and `PageHeader` lives inside this component. A caller
   * that builds a `RecordHeroProps` without it is unaffected.
   */
  back?: PageHeaderProps['back'];
}

/**
 * The record's identity block. It derives nothing: the parcel/property/passbook
 * differences — Delete present or absent, a classification pill or none, the
 * type-adaptive attributes — all stay in the feature, which is the only place
 * that knows them.
 */
export function RecordHero({
  title,
  eyebrow,
  pills,
  metaChips,
  summary,
  attention,
  dataState,
  avatar,
  actions,
  back,
}: RecordHeroProps) {
  const statusPills = pills ?? [];
  const attentionPills = attention ?? [];
  const hasChips = statusPills.length > 0 || attentionPills.length > 0 || Boolean(metaChips);

  /* One row, in the order the three pages already read: status, then the
     record's own metadata, then whatever is wrong with it, and last the outage
     chip `PageHeader` appends. The two pill lists namespace their keys because
     a status and an attention badge are allowed to share a word. */
  const chips = hasChips ? (
    <>
      {statusPills.map((pill) => (
        <StatusChip
          key={`pill-${pill.label}`}
          kind="status"
          label={pill.label}
          tone={pill.tone}
          hint={pill.hint}
        />
      ))}
      {metaChips}
      {attentionPills.map((badge) => (
        <StatusChip
          key={`attention-${badge.label}`}
          kind="status"
          label={badge.label}
          tone={badge.tone}
          hint={badge.hint}
        />
      ))}
    </>
  ) : undefined;

  /* An empty array is truthy, and `PageHeader` wraps anything truthy in an
     `ActionRow` — which would paint an empty flex box above the record. */
  const actionNodes =
    actions !== undefined && actions.length > 0 ? actions.map(actionNode) : undefined;

  return (
    <PageHeader
      level="page"
      title={title}
      eyebrow={eyebrow}
      subtitle={summary}
      titleChips={chips}
      dataState={dataState}
      back={back}
      media={avatar !== undefined ? <RecordAvatar {...avatar} /> : undefined}
      actions={actionNodes}
    />
  );
}

/* ── RecordMedia ─────────────────────────────────────────────────────── */

/**
 * The band is its own surface, and its own control. `overflow: hidden` clips
 * the cover to the card's radius without clipping the element's OWN focus
 * outline, which is what a wrapping `Card` would have done to it.
 */
const bandSx: SxProps<Theme> = composeSx(surfaceSx, {
  display: 'block',
  width: '100%',
  overflow: 'hidden',
  textAlign: 'left',
  '&:focus-visible': { ...focusRingSx },
});

export interface RecordMediaProps {
  photos: Array<{ fileRef: string; name?: string }>;
  videos?: Array<{ fileRef: string; name?: string }>;
  /** Opens the in-portal FileViewer — never a new tab (founder rule). */
  onOpen: (index: number) => void;
  height?: number;
  fallbackIcon?: ReactNode | string;
  /** "Add a photo" when there is no media, instead of an empty gradient. */
  emptyAction?: ActionSpec;
}

/**
 * The cover banner above the tabs. Photo arrays are newest-first, so the first
 * photo is the cover; a record with only video has no cover image and falls
 * back to the motif, which is `CardHero`'s job and not this file's.
 */
export function RecordMedia({
  photos,
  videos,
  onOpen,
  height = 240,
  fallbackIcon,
  emptyAction,
}: RecordMediaProps) {
  const clips = videos ?? [];
  const count = photos.length + clips.length;
  const cover = photos.length > 0 ? photos[0] : undefined;

  const media: MediaSource = {
    fileRef: cover?.fileRef,
    fallbackIcon,
    // The banner is named by the button around it; the cover carries the file's
    // own name when it has one and is decorative when it does not.
    alt: cover?.name ?? '',
  };

  /* Nothing to show and something to offer: show the offer. An empty gradient
     whose only affordance is "go to the Files tab" was the banner asking the
     reader to guess, and `common.tsx:409-416` hid that guess inside a chip.

     The row INHERITS (no `root`): on a record page nothing encloses it, so a
     `primary` "Add a photo" fills; embedded inside another screen's region it
     demotes, which is right — a cover-photo offer is not the thing a nested
     record should be shouting. */
  if (count === 0 && emptyAction !== undefined) {
    return <ActionRow name="Record media">{actionNode(emptyAction)}</ActionRow>;
  }

  const band = <CardHero media={media} height={height} />;

  return (
    <Box>
      {count > 0 ? (
        <ButtonBase sx={bandSx} onClick={() => onOpen(0)} aria-label={GALLERY_LABEL}>
          {band}
        </ButtonBase>
      ) : (
        /* Nothing behind it and nothing offered: the band is decoration, so it
           is not a control. A button that opens an empty gallery is a dead one. */
        <Box sx={bandSx}>{band}</Box>
      )}

      {count > 0 ? (
        <Box sx={{ mt: GAP.control }}>
          {/* Real, named buttons in their own row — not `Box`es with `onClick`
              floating over the photograph, which is what forced the hand-mixed
              scrim chip in the first place. */}
          <ActionRow name="Record media">
            {photos.length > 0
              ? actionNode({
                  key: 'photos',
                  label: `View ${pluralise(photos.length, 'photo')}`,
                  icon: <PhotoLibraryOutlinedIcon fontSize="small" />,
                  role: 'quiet',
                  size: 'compact',
                  onClick: () => onOpen(0),
                })
              : null}
            {clips.length > 0
              ? actionNode({
                  key: 'videos',
                  label: `View ${pluralise(clips.length, 'video')}`,
                  icon: <VideocamOutlinedIcon fontSize="small" />,
                  role: 'quiet',
                  size: 'compact',
                  // The viewer takes one list, photos first — so the videos
                  // start exactly where the photos stop.
                  onClick: () => onOpen(photos.length),
                })
              : null}
          </ActionRow>
        </Box>
      ) : null}
    </Box>
  );
}

/* ── RecordScreen ────────────────────────────────────────────────────── */

export interface RecordScreenProps {
  hero: RecordHeroProps;
  media?: RecordMediaProps;
  tabs: TabPanelItem[];
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
  tabsAriaLabel: string;
  back: { label: string; href: string } | { label: string; onClick: () => void };
  state: {
    isLoading: boolean;
    /** Only true for a genuine 404 — an outage must NOT render not-found. */
    notFound?: boolean;
    isUnreachable?: boolean;
    onRetry?: () => void;
  };
  notFound?: ZeroSpec;
  /** Dialogs. */
  children?: ReactNode;
}

export function RecordScreen({
  hero,
  media,
  tabs,
  value,
  onChange,
  idPrefix,
  tabsAriaLabel,
  back,
  state,
  notFound,
  children,
}: RecordScreenProps) {
  /* The shape of THIS page, not a generic one: `hero` follows whether the
     record actually has a cover band, so the placeholder never draws furniture
     the loaded page will not. The back-link bar and the section rhythm are the
     skeleton's own, which is why nothing below shifts when the record lands. */
  if (state.isLoading) {
    return <RecordSkeleton hero={media !== undefined} tabs={tabs.length > 0} />;
  }

  /* THE precedence. An outage outranks a 404 because the two are not the same
     claim: one says the record is not yours, the other says we could not ask.
     Getting this order wrong is how `PassbookDetailPage.tsx:382` tells an owner
     with a dead api that their land may not be theirs. */
  if (state.isUnreachable === true) {
    return (
      <>
        <BackControl back={back} />
        <ZeroState
          variant="error"
          placement="page"
          title={OUTAGE_COPY.title}
          body={OUTAGE_COPY.body}
          // Secondary, and absent when there is nothing to retry: a `Try again`
          // wired to nothing is the dead control the zero-state standard forbids.
          secondaryAction={
            state.onRetry !== undefined
              ? { label: OUTAGE_COPY.retryLabel, onClick: state.onRetry, role: 'secondary' }
              : undefined
          }
        />
      </>
    );
  }

  if (state.notFound === true) {
    return (
      <>
        <BackControl back={back} />
        {/* `no-results`, not `error`: a 404 is an answer, and `role="alert"`
            belongs to the state that interrupts. */}
        <ZeroState
          variant="no-results"
          placement="page"
          {...NOT_FOUND_COPY}
          {...(notFound ?? {})}
        />
      </>
    );
  }

  return (
    <>
      <RecordHero {...hero} back={back} />

      {media !== undefined ? (
        <Box sx={{ mb: GAP.block }}>
          <RecordMedia {...media} />
        </Box>
      ) : null}

      <TabStrip
        items={tabs}
        value={value}
        onChange={onChange}
        ariaLabel={tabsAriaLabel}
        idPrefix={idPrefix}
      />

      {/* Only the selected tab mounts: every one of these bodies fetches, and a
          record page with six tabs would otherwise open six queries to show one
          panel. A `value` outside `tabs` mounts nothing — the allowlist is the
          page's, and inventing a fallback here would swallow a broken `?tab=`.

          The panel opens NO `ActionRegion`. A tab's own primary is legal and
          does not compete with the hero's `Edit details` because the hero's
          region is a sibling, not an ancestor — and a panel has nothing of its
          own to count, so a wrapper here only made the panel's `Section`s into
          nested regions and tonalised the very `Add note` the contract calls
          legal. */}
      {tabs
        .filter((tab) => tab.value === value)
        .map((tab) => (
          <TabPanel key={tab.value} idPrefix={idPrefix} value={tab.value} active={value}>
            {tab.render()}
          </TabPanel>
        ))}

      {children}
    </>
  );
}
