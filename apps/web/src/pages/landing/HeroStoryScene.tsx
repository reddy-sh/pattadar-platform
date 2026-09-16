/**
 * HeroStoryScene — the Motion narrative behind the hero headline.
 *
 * The story is the one the copy actually tells: a family's proof of land exists,
 * but it is scattered. It lives in a pattadar passbook, a registered deed, an
 * FMB survey sketch, a village map and rows of adangal — different papers, in
 * different places, in language most of the family cannot read.
 *
 * So this scene converges rather than marching left to right (that grammar
 * belongs to the how-it-works explainer). Five kinds of real Andhra Pradesh
 * record drift in from the edges, straighten, and dissolve into ONE record card
 * — each arrival becoming a legible row inside it. The record is then stamped
 * verified and locked, and the family gathers beneath it, all reading the same
 * thing. Scattered proof becomes one secure place the whole family understands.
 *
 * Beats: converge (0–1.6s) → verify and lock (1.6–2s) → family (2–2.7s), then it
 * rests. Nothing loops, so no pause control is owed (WCAG 2.2.2).
 *
 * `instant` renders the finished picture with no animation at all, which is what
 * reduced-motion visitors and a late-arriving chunk both get.
 *
 * Decorative: the hero heading, lead and CTAs carry all meaning. Colours resolve
 * through design tokens (design.md § Per-page allowances).
 */
import { useState } from 'react';
import type { Variants } from 'motion/react';
import { LazyMotion, m } from 'motion/react';

const loadDomAnimation = () => import('motion/react').then((mod) => mod.domAnimation);

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** The card is the destination; everything is positioned relative to it. */
const CARD = { x: 330, y: 64, w: 300, h: 372 } as const;
const CENTER = { x: CARD.x + CARD.w / 2, y: CARD.y + CARD.h / 2 } as const;

/** Row y-positions inside the card — one per kind of record that arrives. */
const ROW_Y = [152, 198, 244, 290, 336] as const;
const ROW_H = 34;
const ROW_W = [160, 132, 176, 118, 148] as const;

/** Where each paper starts life: off in its own corner, tilted, unread. */
type Fragment = { i: number; dx: number; dy: number; rot: number };
const FRAGMENTS: Fragment[] = [
  { i: 0, dx: -350, dy: -180, rot: -14 },
  { i: 1, dx: 345, dy: -186, rot: 13 },
  { i: 2, dx: -370, dy: 80, rot: -8 },
  { i: 3, dx: 358, dy: 150, rot: 11 },
  { i: 4, dx: -268, dy: 182, rot: -12 },
];

const FAMILY_X = [372, 444, 516, 588] as const;

const CONVERGE_MS = 1.25;
const STAGGER = 0.16;

/** Each paper's destination is the row it becomes, so the cause is legible. */
const rowCentre = (i: number) => ROW_Y[i] + ROW_H / 2 - CENTER.y;

/**
 * A paper travels in, straightens, and collapses into its own row — it does not
 * fly to a shared point, which would just pile five papers into a blob over the
 * card. It is fully faded by arrival, so the record is never buried.
 */
const fragment: Variants = {
  idle: (c: Fragment) => ({ x: c.dx, y: c.dy, rotate: c.rot, opacity: 0, scale: 0.95 }),
  play: (c: Fragment) => ({
    x: 0,
    y: rowCentre(c.i),
    rotate: 0,
    opacity: [0, 1, 0.85, 0],
    scale: [0.95, 1, 0.72, 0.24],
    transition: { duration: CONVERGE_MS, delay: 0.15 + c.i * STAGGER, ease: EASE },
  }),
};

/** The row that appears as its paper lands — the paper becoming readable. */
const row: Variants = {
  idle: { scaleX: 0, opacity: 0 },
  play: (c: number) => ({
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.42, delay: 1.05 + c * STAGGER, ease: EASE },
  }),
};

const stamp: Variants = {
  idle: { scale: 0.4, opacity: 0 },
  play: { scale: 1, opacity: 1, transition: { duration: 0.5, delay: 2.2, ease: EASE } },
};

const shackle: Variants = {
  idle: { pathLength: 0, opacity: 0 },
  play: { pathLength: 1, opacity: 1, transition: { duration: 0.5, delay: 2.3, ease: EASE } },
};

const rim: Variants = {
  idle: { opacity: 0 },
  play: { opacity: 0.5, transition: { duration: 0.7, delay: 2.34, ease: EASE } },
};

const kin: Variants = {
  idle: { scale: 0.5, opacity: 0 },
  play: (c: number) => ({
    scale: 1,
    opacity: 1,
    transition: { duration: 0.44, delay: 2.58 + c * 0.1, ease: EASE },
  }),
};

const tie: Variants = {
  idle: { pathLength: 0, opacity: 0 },
  play: { pathLength: 1, opacity: 1, transition: { duration: 0.7, delay: 2.5, ease: EASE } },
};

const SPIN_CENTER = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
const FROM_LEFT = { transformBox: 'fill-box', transformOrigin: 'left center' } as const;

function Person({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const half = 7 * scale;
  const drop = 8 * scale;
  return (
    <>
      <circle cx={cx} cy={cy - 4 * scale} r={4.2 * scale} />
      <path
        d={`M${cx - half} ${cy + drop}c${half * 0.2}-${drop * 0.7} ${half * 1.8}-${drop * 0.7} ${half * 2} 0Z`}
      />
    </>
  );
}

/* ── the five kinds of record, each drawn around its own centre ───────── */

/** 1 · Pattadar passbook — the booklet families actually hold. */
function Passbook() {
  return (
    <g>
      <rect x="-42" y="-32" width="84" height="64" rx="8" fill="var(--color-paper-3)" stroke="var(--color-ink-3)" strokeWidth="2" />
      <path d="M-22 -32V32" stroke="var(--color-ink-3)" strokeWidth="2" />
      <rect x="-14" y="-18" width="44" height="6" rx="3" fill="var(--color-ink)" fillOpacity="0.7" />
      <path d="M-14 0H30M-14 12H18" stroke="var(--color-ink-3)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="-32" cy="-18" r="5" stroke="var(--color-accent)" strokeWidth="2" />
    </g>
  );
}

/** 2 · Registered deed — sheet, folded corner, registration seal. */
function Deed() {
  return (
    <g>
      <rect x="-34" y="-42" width="68" height="84" rx="7" fill="var(--color-paper-3)" stroke="var(--color-ink-3)" strokeWidth="2" />
      <path d="M16 -42V-22H34" stroke="var(--color-ink-3)" strokeWidth="2" />
      <path d="M-20 -14H14M-20 -2H20M-20 10H8" stroke="var(--color-ink-3)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="0" cy="26" r="9" stroke="var(--color-accent)" strokeWidth="2" />
      <path d="M-4 26L-1 29L4 22" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** 3 · Field Measurement Book — the parcel's shape and its dimensions. */
function SurveySketch() {
  return (
    <g>
      <rect x="-44" y="-34" width="88" height="68" rx="7" fill="var(--color-paper-3)" stroke="var(--color-ink-3)" strokeWidth="2" />
      <path d="M-28 14L-20 -18L18 -22L30 8L-4 20Z" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-28 22H30" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="-20" cy="-18" r="2.6" fill="var(--color-accent)" />
      <circle cx="18" cy="-22" r="2.6" fill="var(--color-accent)" />
      <circle cx="30" cy="8" r="2.6" fill="var(--color-accent)" />
    </g>
  );
}

/** 4 · Village map — your plot among all the others. */
function VillageMap() {
  return (
    <g>
      <rect x="-44" y="-34" width="88" height="68" rx="7" fill="var(--color-paper-3)" stroke="var(--color-ink-3)" strokeWidth="2" />
      <path d="M-16 -34V34M12 -34V34M-44 -8H44M-44 14H44" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
      <rect x="-16" y="-8" width="28" height="22" fill="var(--color-accent)" fillOpacity="0.28" stroke="var(--color-accent)" strokeWidth="2" />
    </g>
  );
}

/** 5 · Adangal — the rows that say who holds what, and how. */
function AdangalRows() {
  return (
    <g>
      <rect x="-46" y="-28" width="92" height="56" rx="7" fill="var(--color-paper-3)" stroke="var(--color-ink-3)" strokeWidth="2" />
      <path d="M-46 -10H46M-46 8H46" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
      <path d="M-8 -28V28" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
      <path d="M-38 -19H-16M-38 -1H-16M-38 17H-16" stroke="var(--color-ink-3)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M0 -19H36M0 -1H28M0 17H32" stroke="var(--color-ink-3)" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

const PAPERS = [Passbook, Deed, SurveySketch, VillageMap, AdangalRows];

/** How long after the hero appeared an arriving scene may still tell the story. */
const GRACE_MS = 2500;

export default function HeroStoryScene({
  instant,
  startedAt,
}: {
  instant: boolean;
  startedAt: number;
}) {
  // Decided once, here, at the moment this chunk actually mounts: if it arrived
  // late the visitor is already reading, so we settle instead of rewinding.
  const [lateArrival] = useState(() => Date.now() - startedAt > GRACE_MS);
  const settled = instant || lateArrival;

  const from = settled ? 'play' : 'idle';
  const to = 'play';

  return (
    <LazyMotion features={loadDomAnimation} strict>
      <svg
        className="hero-scene__svg"
        viewBox="0 0 960 540"
        width={960}
        height={540}
        fill="none"
        role="presentation"
        focusable="false"
      >
        <defs>
          <radialGradient id="hero-warmth" cx="0.5" cy="0.45" r="0.62">
            <stop stopColor="var(--color-accent)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hero-card" gradientUnits="userSpaceOnUse" x1="330" y1="64" x2="630" y2="436">
            <stop stopColor="var(--color-paper-3)" />
            <stop offset="1" stopColor="var(--color-paper-2)" />
          </linearGradient>
        </defs>

        {/* Warmth and two land contours: atmosphere only, never animated. */}
        <rect x="0" y="0" width="960" height="540" fill="url(#hero-warmth)" />
        <path
          d="M40 150C220 108 320 196 480 168 640 140 760 214 920 176"
          stroke="var(--color-rule-strong)"
          strokeOpacity="0.5"
        />
        <path
          d="M40 412C210 452 330 372 480 400 630 428 770 356 920 394"
          stroke="var(--color-rule-strong)"
          strokeOpacity="0.5"
        />

        {/* ── the one record everything becomes ───────────────────────── */}
        <rect
          x={CARD.x}
          y={CARD.y}
          width={CARD.w}
          height={CARD.h}
          rx="20"
          fill="url(#hero-card)"
          stroke="var(--color-rule-strong)"
          strokeWidth="2"
        />
        {/* Amber rim, earned at the moment the record is sealed. */}
        <m.rect
          x={CARD.x}
          y={CARD.y}
          width={CARD.w}
          height={CARD.h}
          rx="20"
          stroke="var(--color-accent)"
          strokeWidth="2"
          variants={rim}
          initial={from}
          animate={to}
        />
        <rect x="356" y="100" width="132" height="11" rx="5.5" fill="var(--color-ink)" fillOpacity="0.9" />
        <rect x="356" y="122" width="190" height="6" rx="3" fill="var(--color-ink-3)" />

        {/* One row per kind of paper that arrived. */}
        {ROW_Y.map((y, index) => (
          <m.g key={y} variants={row} custom={index} initial={from} animate={to} style={FROM_LEFT}>
            <rect
              x="356"
              y={y}
              width="252"
              height={ROW_H}
              rx="8"
              fill="var(--color-paper-2)"
              stroke="var(--color-rule-strong)"
            />
            <circle cx="374" cy={y + ROW_H / 2} r="4" fill="var(--color-accent)" />
            <rect x="390" y={y + 14} width={ROW_W[index]} height="6" rx="3" fill="var(--color-ink-3)" />
          </m.g>
        ))}

        {/* Locked, because it is a family's proof of ownership. */}
        <m.path
          d="M468 396v-8a12 12 0 0 1 24 0v8"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          variants={shackle}
          initial={from}
          animate={to}
        />
        <m.g variants={stamp} initial={from} animate={to} style={SPIN_CENTER}>
          <rect x="462" y="396" width="36" height="28" rx="7" fill="var(--color-paper-2)" stroke="var(--color-accent)" strokeWidth="2" />
          <circle cx="480" cy="410" r="3" fill="var(--color-accent)" />
        </m.g>

        {/* Verified, stamped on the corner like a real endorsement. */}
        <m.g variants={stamp} initial={from} animate={to} style={SPIN_CENTER}>
          <circle cx="606" cy="86" r="18" fill="var(--color-paper)" stroke="var(--color-success)" strokeWidth="2" />
          <path
            d="M598 86L604 92L615 79"
            stroke="var(--color-success)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.g>

        {/* ── the scattered papers, converging ────────────────────────── */}
        <g transform={`translate(${CENTER.x} ${CENTER.y})`}>
          {FRAGMENTS.map((spec) => {
            const Paper = PAPERS[spec.i];
            return (
              <m.g
                key={spec.i}
                variants={fragment}
                custom={spec}
                initial={from}
                animate={to}
                style={SPIN_CENTER}
              >
                <Paper />
              </m.g>
            );
          })}
        </g>

        {/* ── the family, who can now all read it ─────────────────────── */}
        <m.path
          d="M480 436V452M372 452H588M372 452V458M444 452V458M516 452V458M588 452V458"
          stroke="var(--color-accent)"
          strokeOpacity="0.6"
          strokeWidth="2"
          strokeLinecap="round"
          variants={tie}
          initial={from}
          animate={to}
        />
        {FAMILY_X.map((cx, index) => (
          <m.g key={cx} variants={kin} custom={index} initial={from} animate={to} style={SPIN_CENTER}>
            <circle
              cx={cx}
              cy={478}
              r="20"
              fill="var(--color-paper-2)"
              stroke={index === 0 ? 'var(--color-accent)' : 'var(--color-ink)'}
              strokeOpacity={index === 0 ? 1 : 0.72}
              strokeWidth="2"
            />
            <g
              fill={index === 0 ? 'var(--color-accent)' : 'var(--color-ink)'}
              fillOpacity={index === 0 ? 1 : 0.72}
            >
              <Person cx={cx} cy={478} scale={1.15} />
            </g>
          </m.g>
        ))}
      </svg>
    </LazyMotion>
  );
}
