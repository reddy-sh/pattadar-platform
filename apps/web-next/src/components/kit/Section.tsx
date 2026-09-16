'use client';

/**
 * The one surface, and the one gradient.
 *
 * A panel is spelled three different ways inside a single file today.
 * `views/LandPropertiesPage.tsx:540` is a `Card variant="outlined"` at `p: 1.75`
 * on `background.default`; `:570` is the same intent at `px: 1.5, py: 1`; `:690`
 * is a `TableContainer component={Card}`. `views/detail/common.tsx:67-87` adds a
 * fourth as `SectionCard`, and `components/GlassCard.tsx:17-23` a fifth — a
 * `Paper elevation={2}` still accepting a `tone` prop it has ignored since the
 * gold glass was removed. None of the five disagrees about anything anyone would
 * call a decision. They disagree because a panel had nowhere to be defined.
 *
 * So `variant` is the entire vocabulary, and it answers one question: what is
 * this surface FOR. `card` is a unit of content. `quiet` is chrome — the filter
 * panel and the collapsed chip row, recessed onto `background.default` so it
 * reads as apparatus rather than as something to read. `table` is the same card
 * with its padding removed, because a table's own 52px rows own the inset and a
 * second one would double it. `bare` is rhythm with no surface at all, for a
 * group of headed content that is not a panel.
 *
 * No variant carries a shadow. In this spec elevation means "this floats above
 * the page", so a resting section wearing one is making a claim about itself
 * that is not true; `customShadows` belongs to menus, dialogs and the viewer.
 * That is also why `GlassCard`'s `elevation={2}` is not preserved here.
 *
 * `SectionHeader` exists for the same reason and costs more where it is
 * missing. Every detail page hand-rolls `Box` + `Typography` at
 * `fontWeight: 600, fontSize: 14` — a type scale invented at the call site,
 * outside the theme, and therefore invisible to any later change to the scale.
 * Worse, it is invented as a `<div>`: a screen reader moving by heading finds
 * nothing between the page's `h1` and the fields. Here the title is a real
 * heading whose LEVEL is separable from its SIZE, which is what lets a nested
 * panel be an `h3` without shrinking.
 *
 * `HeroSection` is the app's ONE gradient. Three exist today and all three are
 * hex stops: `DashboardPage.tsx:50-59`, `holdingCards.tsx:148`,
 * `detail/common.tsx:366`. A hex gradient is a fixed slab — it is the same dark
 * blue in light mode, in dark mode and in highContrast, so the one surface in
 * the app that is supposed to be a deliberate flourish is the only one that
 * cannot answer to the scheme it is painted in. This gradient is composed from
 * `primary.darker` → `primary.dark` → `secondary.dark` through a theme callback,
 * each stop sunk toward `common.black` so the slab is the reference's dark
 * island in every scheme, under one fixed `common.white` ink — see
 * `brandHeroSx` for the measurement. Every scheme gets a hero rather than one
 * scheme getting a hero and two getting a bug.
 *
 * On `tone="brand"` the hero publishes a context flag saying "the ground under
 * you is dark", and `Action` reads it through `useHeroContext()` and switches
 * to its on-dark spelling: `primary` becomes a `common.white` fill with
 * `primary.darker` ink, `secondary` a `common.white` alpha wash, and
 * `tertiary`/`quiet` white ink over a `common.white` alpha border. `destructive`
 * has no on-dark spelling of its own — `error.main` text cannot hold AA against
 * this gradient in all three schemes — so it renders the quiet on-dark spelling
 * and says so in dev; a destructive verb belongs behind a `ConfirmDialog`
 * trigger, not on the hero.
 *
 * The context itself is declared in `Action.tsx` and imported here, not the
 * other way round: the kit's build order puts `Action` at 4 and this file at 5,
 * so `Action` may not import `Section`, and the switch has to live on the side
 * that consumes it. The mechanism is deliberately an explicit, exported React
 * context rather than a descendant CSS selector: a button should be able to SAY
 * why it is white, and a selector that repaints whatever it happens to contain
 * is how a hero ends up silently restyling a menu that was portalled out of it.
 * `useHeroContext` re-exports through the kit barrel either way.
 *
 * Extracted from `views/LandPropertiesPage.tsx:540`, `:570` and `:690` (the
 * three panel spellings), `components/GlassCard.tsx:17-23` (the vestigial
 * wrapper this replaces), `views/detail/common.tsx:67-87` (`SectionCard` and its
 * off-scale title) and `views/DashboardPage.tsx:50-59` (`heroSx`, a gradient
 * built from six colour literals).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

import { Action, ActionRegion, HeroContext } from './Action';
import { GAP, PAD, RADIUS, actionClusterSx, quietSurfaceSx, surfaceSx } from './tokens';
import type { ActionSpec, HeroTone, SectionVariant } from './types';

/**
 * MUI's own sx-composition idiom, factored out. A token like `surfaceSx` is
 * typed `SxProps<Theme>` — a union that already admits the callback and array
 * forms — so it cannot be spread into an object literal without first being
 * flattened. Composing into one array is what MUI documents, and it keeps the
 * token the single definition of the surface instead of a value this file
 * copies and then quietly edits.
 */
function composeSx(...parts: SxProps<Theme>[]): SxProps<Theme> {
  return parts.flatMap((part) => (Array.isArray(part) ? part : [part]));
}

/* ── Nesting ─────────────────────────────────────────────────────────── */

/**
 * How deep this section sits inside other sections. It exists for exactly one
 * decision — a top-level section heads at `h2` under the page's `h1`, a section
 * inside one heads at `h3` — so the document outline stays true without every
 * call site having to know where it was mounted. Not exported: nesting is a
 * fact about the tree, never a prop a screen should be able to lie about.
 */
const SectionDepthContext = createContext(0);

function useHeadingLevel(explicit?: 'h2' | 'h3' | 'h4'): 'h2' | 'h3' | 'h4' {
  const depth = useContext(SectionDepthContext);
  return explicit ?? (depth === 0 ? 'h2' : 'h3');
}

/* ── Surfaces ────────────────────────────────────────────────────────── */

/**
 * The four surfaces, resolved once. `card` is the resting unit at the spec's
 * 20px inset; `quiet` is the token verbatim, already carrying its own 14px;
 * `table` is the card with the inset removed so a `TableContainer` child can
 * reach the rounded edge; `bare` contributes nothing but the gutter below.
 */
const SURFACE: Record<SectionVariant, SxProps<Theme>> = {
  card: composeSx(surfaceSx, { p: PAD.card }),
  quiet: quietSurfaceSx,
  table: composeSx(surfaceSx, { p: 0 }),
  bare: {},
};

/* ── SectionHeader ───────────────────────────────────────────────────── */

export interface SectionHeaderProps {
  title: string;
  /** Overline eyebrow above the title. */
  eyebrow?: string;
  description?: ReactNode;
  /** Right-aligned. */
  actions?: ReactNode;
  /** Default 'h2' inside a page, 'h3' when nested. */
  headingAs?: 'h2' | 'h3' | 'h4';
}

/**
 * The header alone, for content that supplies its own surface — a tab body, a
 * dialog, a region already inside a card of its own.
 */
export function SectionHeader({
  title,
  eyebrow,
  description,
  actions,
  headingAs,
}: SectionHeaderProps) {
  const heading = useHeadingLevel(headingAs);
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: GAP.cluster,
        mb: GAP.cluster,
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {eyebrow && (
          <Typography variant="overline" component="div" color="text.secondary">
            {eyebrow}
          </Typography>
        )}
        {/* Empty only when a Section was given actions or a description and no
            title; the row still needs its cluster, but not a nameless heading. */}
        {title && (
          <Typography variant="h6" component={heading}>
            {title}
          </Typography>
        )}
        {description !== undefined && description !== null && description !== false && (
          <Typography variant="body2" component="div" color="text.secondary" sx={{ mt: GAP.tight }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={actionClusterSx}>{actions}</Box>}
    </Box>
  );
}

/* ── Section ─────────────────────────────────────────────────────────── */

export interface SectionProps {
  /** 'card' (default) | 'quiet' | 'table' | 'bare'. See types.ts. */
  variant?: SectionVariant;
  title?: string;
  /** Overline eyebrow above the title. */
  eyebrow?: string;
  description?: ReactNode;
  /**
   * Right-aligned. The Section is its own ActionRegion, named after the title,
   * and it inherits: a `primary` here fills when the section stands on a page
   * or in a tab panel, and demotes when another region encloses the section.
   */
  actions?: ReactNode;
  /** Default 'h2' inside a page, 'h3' when nested. */
  headingAs?: 'h2' | 'h3' | 'h4';
  /** Bottom margin in grid units. Default GAP.section (32px). `false` removes it. */
  gutter?: number | false;
  children: ReactNode;
  id?: string;
}

export function Section({
  variant = 'card',
  title,
  eyebrow,
  description,
  actions,
  headingAs,
  gutter,
  children,
  id,
}: SectionProps) {
  const heading = useHeadingLevel(headingAs);
  const depth = useContext(SectionDepthContext);

  const hasHeader =
    title !== undefined || eyebrow !== undefined || description !== undefined || actions !== undefined;

  const header = hasHeader ? (
    <SectionHeader
      title={title ?? ''}
      eyebrow={eyebrow}
      description={description}
      actions={actions}
      headingAs={heading}
    />
  ) : null;

  /**
   * One region per section, named after whatever the reader can see, and it
   * INHERITS — a `Section` is structure, never a self-contained surface, so it
   * carries no `root`.
   *
   * That cuts both ways deliberately. A section standing directly on a page or
   * in a tab panel has no region above it, so it owns a filled button of its
   * own: that is how a detail card legally carries `Add note`. A section nested
   * inside another region — a sub-panel, an expanded row's body, a detail pane
   * the screen wrapped — counts inside its host instead and demotes, which is
   * what stops a sub-list's create action landing beside its host's.
   */
  const body = (
    <ActionRegion name={title ?? id ?? 'section'}>
      {/* `table` strips the surface's padding so the rows can reach the edge,
          which would leave a header flush against it. The header keeps the card
          inset; the table below it does not. */}
      {header && variant === 'table' ? (
        <Box sx={{ px: PAD.card, pt: PAD.card }}>{header}</Box>
      ) : (
        header
      )}
      <SectionDepthContext.Provider value={depth + 1}>{children}</SectionDepthContext.Provider>
    </ActionRegion>
  );

  const rootSx = composeSx(SURFACE[variant], { mb: gutter === false ? 0 : (gutter ?? GAP.section) });

  if (variant === 'bare') {
    return (
      <Box id={id} sx={rootSx}>
        {body}
      </Box>
    );
  }

  return (
    // `outlined` is load-bearing for `quiet` alone: `quietSurfaceSx` paints a
    // recessed fill and a hairline but says nothing about elevation, so a
    // default Card would float its chrome above the content it filters. `card`
    // and `table` get their `boxShadow: 'none'` from `surfaceSx` itself.
    <Card id={id} variant={variant === 'quiet' ? 'outlined' : undefined} sx={rootSx}>
      {body}
    </Card>
  );
}

/* ── HeroSection ─────────────────────────────────────────────────────── */

/**
 * The hero's ink, as a mix rather than a second colour. The originals dim their
 * captions with `rgba(238, 242, 246, 0.72)` — a fourth literal describing the
 * first one at less weight. Mixing the hero's own ink toward transparent says
 * the same thing in terms of the token, so it still follows if the token
 * changes.
 */
const heroInk = (channel: string, pct: number): string =>
  `color-mix(in srgb, ${channel} ${pct}%, transparent)`;

/**
 * How much of a gradient stop survives the sink to black. The reference hero is
 * a DARK ISLAND IN BOTH COLOUR MODES — `DashboardPage.tsx:49` says so in as many
 * words, and its three stops (`#14202f` / `#182a40` / `#1b3252`) sit at relative
 * luminance 0.016 / 0.022 / 0.033. Mapping those stops straight onto scheme
 * roles lost that: `primary.darker` / `primary.dark` / `secondary.dark` resolve
 * in the dark scheme to the LIGHT-surface rungs `#1565c0` / `#42a5f5` /
 * `#c9a227` (luminance up to 0.38), which is not a dark island and not a ground
 * any ink holds AA against. Sinking each stop 45% of the way from its role
 * toward `common.black` lands the light slab at 0.009 / 0.027 / 0.035 — the
 * reference's own band — and pulls dark and highContrast onto the same island
 * instead of a bright blue-to-gold sweep. It is one number, not a per-scheme
 * branch, because the hero being dark is a fixed fact about the surface.
 */
const HERO_SLAB_PCT = 45;

const heroSlab = (channel: string, black: string): string =>
  `color-mix(in srgb, ${channel} ${HERO_SLAB_PCT}%, ${black})`;

/**
 * The gradient, composed from palette channels. 150deg and the 0/60/100 stops
 * are `DashboardPage.tsx:53` verbatim; only the colours move from hex to token,
 * through `heroSlab`. The descendant `color` rules are the same file's `:56-58`:
 * a hero sets the ink for everything inside it, because a `text.secondary`
 * caption on a dark slab is the one contrast failure this surface reliably
 * produces.
 *
 * The ink is `common.white`, NOT `primary.contrastText`. "White sits on this
 * surface" is a fixed fact here, exactly as the reference's single `#eef2f6`
 * for both modes says it is; `primary.contrastText` is the ink for a surface
 * painted `primary.main`, and in the dark scheme it is `rgba(0,0,0,0.87)` —
 * black body text at 3.40:1 and black captions at 2.65:1 on the first stop,
 * i.e. the whole dark-mode hero below AA. After the sink the lightest point on
 * any scheme's ramp is 8.7:1 for body ink and 5.4:1 for the 72% caption.
 *
 * This is also what makes `HeroContext`'s promise true: `Action`'s on-dark
 * spellings (white fill, white ink, white alpha washes) are legible because the
 * ground is dark in every scheme, not only in light.
 */
const brandHeroSx: SxProps<Theme> = (t) => {
  const p = (t.vars ?? t).palette;
  const black = p.common.black;
  return {
    borderRadius: RADIUS.dialog,
    p: { xs: PAD.card, sm: PAD.dialog },
    mb: GAP.page,
    color: p.common.white,
    background: `linear-gradient(150deg, ${heroSlab(p.primary.darker, black)} 0%, ${heroSlab(p.primary.dark, black)} 60%, ${heroSlab(p.secondary.dark, black)} 100%)`,
    '& .MuiTypography-root': { color: 'inherit' },
    '& .MuiTypography-caption, & .MuiTypography-overline': {
      color: heroInk(p.common.white, 72),
    },
    '& .MuiDivider-root': { borderColor: heroInk(p.common.white, 16) },
  };
};

/** The same geometry on the resting card surface, for a hero that is not a flourish. */
const surfaceHeroSx: SxProps<Theme> = composeSx(surfaceSx, {
  borderRadius: RADIUS.dialog,
  p: { xs: PAD.card, sm: PAD.dialog },
  mb: GAP.page,
});

export interface HeroSectionProps {
  children: ReactNode;
  /** 'brand' = the deliberate dark/gold flourish (Dashboard, Wallet). */
  tone?: HeroTone;
  actions?: ActionSpec[];
}

export function HeroSection({ children, tone = 'brand', actions }: HeroSectionProps) {
  const brand = tone === 'brand';
  return (
    <HeroContext.Provider value={brand}>
      <Box sx={brand ? brandHeroSx : surfaceHeroSx}>
        {/* Inherits, like `Section`. A hero is the top band of a page, so in
            practice nothing encloses it and its one primary fills; declaring it
            `root` would only buy the right to shout from inside somebody else's
            region, which is not a thing a hero should be able to do. */}
        <ActionRegion name="hero">
          {children}
          {actions && actions.length > 0 && (
            // Below the copy and left-aligned, which is where WalletPage.tsx:60
            // already puts them — a hero's verbs belong at the end of what they
            // act on, not opposite it.
            <Box sx={composeSx(actionClusterSx, { mt: GAP.block })}>
              {actions.map(({ key, ...spec }) => (
                <Action key={key ?? spec.label} {...spec} />
              ))}
            </Box>
          )}
        </ActionRegion>
      </Box>
    </HeroContext.Provider>
  );
}
