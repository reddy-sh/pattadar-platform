/**
 * JourneyScene — the Motion-powered artwork for PlatformJourney.
 *
 * This module is the ONLY place the landing page imports Motion, and it is
 * loaded lazily on purpose. Motion's runtime is ~39 kB gzipped; folded into the
 * shared vendor chunk it would be downloaded by every signed-in app route that
 * never shows an animation. Land records get opened on slow rural connections,
 * so that download has to be earned by the page that actually uses it.
 *
 * ONE ACT AT A TIME. The three acts used to sit side by side in one very wide
 * panel, which meant the whole mechanism was on screen at once, every part of it
 * small, and none of it connected to the step you were reading. There was no
 * story — just a diagram. Now all three acts are composed in the SAME square
 * stage and cross-faded, so the picture beside step 2 is only step 2, at three
 * times the size it used to be.
 *
 * The parent owns which act is showing, the timers and the accessible step list,
 * so nothing here is required to understand the page.
 *
 * Colours resolve through design tokens because this SVG is inline in the DOM
 * (design.md § Per-page allowances — no hex literals in app code).
 */
import { useMemo } from 'react';
import type { Variants } from 'motion/react';
import { LazyMotion, m } from 'motion/react';

/* Only the DOM animation feature set, fetched separately from Motion's core. */
const loadDomAnimation = () => import('motion/react').then((mod) => mod.domAnimation);

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

const FROM_LEFT = { transformBox: 'fill-box', transformOrigin: 'left center' } as const;
const FROM_CENTER = { transformBox: 'fill-box', transformOrigin: 'center' } as const;

/**
 * Built per render rather than declared at module scope, because a
 * reduced-motion visitor may still step through the acts by choosing a step.
 * Collapsing every duration to zero lets them do that with no movement at all,
 * which mounting-at-the-target-state alone cannot deliver once the act changes.
 */
function buildVariants(instant: boolean) {
  const s = (seconds: number) => (instant ? 0 : seconds);

  /** Container that staggers its children once its act is showing. */
  const act: Variants = {
    idle: {},
    play: { transition: { staggerChildren: s(0.11), delayChildren: s(0.06) } },
  };

  /** A stroke that draws itself — links, scan brackets, the lock shackle. */
  const draw: Variants = {
    idle: { pathLength: 0, opacity: 0 },
    play: { pathLength: 1, opacity: 1, transition: { duration: s(0.62), ease: EASE } },
  };

  /** A value that arrives — nodes, badges, glyphs. */
  const pop: Variants = {
    idle: { scale: 0.55, opacity: 0 },
    play: { scale: 1, opacity: 1, transition: { duration: s(0.44), ease: EASE } },
  };

  /** A field being read off the document and filled in, left to right. */
  const fill: Variants = {
    idle: { scaleX: 0, opacity: 0 },
    play: { scaleX: 1, opacity: 1, transition: { duration: s(0.52), ease: EASE } },
  };

  /** A record settling into the organised stack. */
  const settle: Variants = {
    idle: { y: 18, opacity: 0 },
    play: { y: 0, opacity: 1, transition: { duration: s(0.5), ease: EASE } },
  };

  return { act, draw, pop, fill, settle, crossfade: { duration: s(0.4), ease: EASE } };
}

type Kit = ReturnType<typeof buildVariants>;

function PersonGlyph({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const half = 8 * scale;
  const drop = 9 * scale;
  return (
    <>
      <circle cx={cx} cy={cy - 5 * scale} r={4.6 * scale} />
      <path
        d={`M${cx - half} ${cy + drop}c${half * 0.2}-${drop * 0.72} ${half * 1.8}-${drop * 0.72} ${half * 2} 0Z`}
      />
    </>
  );
}

/* ── Act 1 · Add your land in minutes ─────────────────────────────── */

/** The three lines read off the photographed page. */
const PAGE_LINES = [
  { y: 156, w: 88 },
  { y: 178, w: 72 },
  { y: 200, w: 94 },
] as const;

/** The same three, arrived in your record — longer, because they are complete. */
const RECORD_LINES = [
  { y: 164, w: 112 },
  { y: 186, w: 90 },
  { y: 208, w: 118 },
] as const;

function ActCapture({ kit }: { kit: Kit }) {
  return (
    <>
      {/* The passbook or deed itself, held still while it is photographed. */}
      <m.g variants={kit.pop} style={FROM_CENTER}>
        <rect
          x="64"
          y="98"
          width="136"
          height="192"
          rx="12"
          fill="var(--color-paper-3)"
          stroke="var(--color-ink-3)"
          strokeWidth="2"
        />
        <path d="M176 98V126H200" fill="var(--color-paper-2)" />
        <path d="M176 98V126H200" stroke="var(--color-ink-3)" strokeWidth="2" />
      </m.g>

      {/* The camera. */}
      <m.g variants={kit.pop} style={FROM_CENTER}>
        <rect
          x="112"
          y="316"
          width="40"
          height="26"
          rx="7"
          fill="var(--color-paper-2)"
          stroke="var(--color-accent)"
          strokeWidth="2"
        />
        <circle cx="141" cy="329" r="6.5" stroke="var(--color-accent)" strokeWidth="2" />
      </m.g>

      {/* The page framed in the viewfinder. */}
      <m.path
        d="M56 112V90H78M186 90H208V112M56 276V298H78M186 298H208V276"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        variants={kit.draw}
      />

      {/* What is printed on it. */}
      <m.rect
        x="84"
        y="128"
        width="56"
        height="9"
        rx="4.5"
        fill="var(--color-ink)"
        fillOpacity="0.88"
        variants={kit.fill}
        style={FROM_LEFT}
      />
      {PAGE_LINES.map((line) => (
        <m.rect
          key={line.y}
          x="84"
          y={line.y}
          width={line.w}
          height="5"
          rx="2.5"
          fill="var(--color-ink-3)"
          variants={kit.fill}
          style={FROM_LEFT}
        />
      ))}

      {/* Read across into your own record … */}
      <m.path
        d="M222 194H262"
        stroke="url(#journey-link)"
        strokeWidth="3"
        strokeLinecap="round"
        markerEnd="url(#journey-arrow)"
        variants={kit.draw}
      />

      <m.g variants={kit.pop} style={FROM_CENTER}>
        <rect
          x="278"
          y="108"
          width="172"
          height="172"
          rx="14"
          fill="var(--color-paper-2)"
          stroke="var(--color-rule-strong)"
          strokeWidth="2"
        />
      </m.g>

      {/* … where the fields fill themselves in, no typing. */}
      <m.rect
        x="300"
        y="134"
        width="62"
        height="9"
        rx="4.5"
        fill="var(--color-ink)"
        fillOpacity="0.88"
        variants={kit.fill}
        style={FROM_LEFT}
      />
      {RECORD_LINES.map((line) => (
        <m.rect
          key={line.y}
          x="300"
          y={line.y}
          width={line.w}
          height="6"
          rx="3"
          fill="var(--color-ink-3)"
          variants={kit.fill}
          style={FROM_LEFT}
        />
      ))}

      <m.g variants={kit.pop} style={FROM_CENTER}>
        <circle
          cx="312"
          cy="250"
          r="13"
          fill="var(--color-paper-2)"
          stroke="var(--color-success)"
          strokeWidth="2"
        />
        <path
          d="M306 250L310 254L318 245"
          stroke="var(--color-success)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </m.g>
    </>
  );
}

/* ── Act 2 · Bring in your family ─────────────────────────────────── */

/**
 * Family members, symmetric around the holder so the links read evenly. The
 * link endpoints stop at each circle's edge — a line that runs under a node
 * looks like a wire, not an invitation.
 */
const RELATIVES = [
  { x: 140, y: 110, from: [235.6, 178.5], to: [157.9, 122.8], confirmed: true },
  { x: 380, y: 110, from: [284.4, 178.5], to: [362.1, 122.8], confirmed: false },
  { x: 140, y: 282, from: [235.6, 213.5], to: [157.9, 269.2], confirmed: true },
  { x: 380, y: 282, from: [284.4, 213.5], to: [362.1, 269.2], confirmed: false },
] as const;

function ActFamily({ kit }: { kit: Kit }) {
  return (
    <>
      {/* The holder, at the centre of their own record. */}
      <m.g variants={kit.pop} style={FROM_CENTER}>
        <circle
          cx="260"
          cy="196"
          r="30"
          fill="var(--color-paper-2)"
          stroke="var(--color-accent)"
          strokeWidth="2"
        />
        <g fill="var(--color-accent)">
          <PersonGlyph cx={260} cy={196} scale={1.3} />
        </g>
      </m.g>

      {/* A secure verification link goes out to each person … */}
      {RELATIVES.map((relative) => (
        <m.path
          key={`link-${relative.x}-${relative.y}`}
          d={`M${relative.from[0]} ${relative.from[1]}L${relative.to[0]} ${relative.to[1]}`}
          stroke="url(#journey-link)"
          strokeWidth="2.5"
          strokeLinecap="round"
          variants={kit.draw}
        />
      ))}

      {RELATIVES.map((relative) => (
        <m.g key={`node-${relative.x}-${relative.y}`} variants={kit.pop} style={FROM_CENTER}>
          <circle
            cx={relative.x}
            cy={relative.y}
            r="22"
            fill="var(--color-paper-2)"
            stroke="var(--color-ink)"
            strokeOpacity="0.72"
            strokeWidth="2"
          />
          <g fill="var(--color-ink)" fillOpacity="0.72">
            <PersonGlyph cx={relative.x} cy={relative.y} scale={1.1} />
          </g>
        </m.g>
      ))}

      {/* … and you can see who has confirmed. */}
      {RELATIVES.filter((relative) => relative.confirmed).map((relative) => (
        <m.g key={`ok-${relative.x}-${relative.y}`} variants={kit.pop} style={FROM_CENTER}>
          <circle
            cx={relative.x + 17}
            cy={relative.y + 17}
            r="10"
            fill="var(--color-paper-2)"
            stroke="var(--color-success)"
            strokeWidth="2"
          />
          <path
            d={`M${relative.x + 12} ${relative.y + 17}L${relative.x + 16} ${relative.y + 21}L${relative.x + 22} ${relative.y + 12}`}
            stroke="var(--color-success)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.g>
      ))}
    </>
  );
}

/* ── Act 3 · Everything stays organised ───────────────────────────── */

/** The four kinds of record the copy promises to keep together. */
const ORGANISED_ROWS = [84, 132, 180, 228] as const;

function ActOrganised({ kit }: { kit: Kit }) {
  return (
    <>
      {ORGANISED_ROWS.map((y, index) => (
        <m.g key={y} variants={kit.settle}>
          <rect
            x="132"
            y={y}
            width="256"
            height="40"
            rx="10"
            fill="var(--color-paper-2)"
            stroke="var(--color-rule-strong)"
            strokeWidth="2"
          />
          <circle cx="156" cy={y + 20} r="4.5" fill="var(--color-accent)" />
          <rect
            x="176"
            y={y + 16.5}
            width={index % 2 === 0 ? 150 : 120}
            height="7"
            rx="3.5"
            fill="var(--color-ink-3)"
          />
        </m.g>
      ))}

      {/* Safe, and together. */}
      <m.path
        d="M248 310v-12a12 12 0 0 1 24 0v12"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        variants={kit.draw}
      />
      <m.g variants={kit.pop} style={FROM_CENTER}>
        <rect
          x="238"
          y="310"
          width="44"
          height="34"
          rx="8"
          fill="var(--color-paper-3)"
          stroke="var(--color-accent)"
          strokeWidth="2"
        />
        <circle cx="260" cy="327" r="3.4" fill="var(--color-accent)" />
      </m.g>
    </>
  );
}

const ACTS = [ActCapture, ActFamily, ActOrganised] as const;

export default function JourneyScene({
  act,
  playing,
  instant,
}: {
  /** Which step is being told, 0-based. */
  act: number;
  /** False until the section has been seen — the stage waits rather than
   * playing to an empty room. */
  playing: boolean;
  instant: boolean;
}) {
  const kit = useMemo(() => buildVariants(instant), [instant]);
  const target = (index: number) => (playing && index === act ? 'play' : 'idle');
  // Motion animates through the Web Animations API, which the CSS
  // prefers-reduced-motion guard cannot reach. Mounting at the target state is
  // the only reliable way to honour the preference: no movement at all.
  const from = (index: number) => (instant ? target(index) : 'idle');

  return (
    <LazyMotion features={loadDomAnimation} strict>
      <svg
        className="journey__svg"
        viewBox="0 0 520 420"
        width={520}
        height={420}
        fill="none"
        role="presentation"
        focusable="false"
      >
        <defs>
          <linearGradient id="journey-panel" x1="20" y1="16" x2="500" y2="404">
            <stop stopColor="var(--color-paper-3)" />
            <stop offset="0.52" stopColor="var(--color-paper-2)" />
            <stop offset="1" stopColor="var(--color-paper)" />
          </linearGradient>
          {/* userSpaceOnUse is required, not stylistic: the arrow in act 1 is
            * perfectly horizontal, so its object bounding box has zero height
            * and an objectBoundingBox gradient would collapse and paint
            * nothing. Spanning the stage in user space also means amber leads
            * and coral appears only where a link arrives. */}
          <linearGradient
            id="journey-link"
            gradientUnits="userSpaceOnUse"
            x1="120"
            y1="0"
            x2="400"
            y2="0"
          >
            <stop stopColor="var(--color-accent)" />
            <stop offset="0.88" stopColor="var(--color-accent)" />
            <stop offset="1" stopColor="var(--color-accent-2)" stopOpacity="0.9" />
          </linearGradient>
          <marker
            id="journey-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path
              d="M1 1L9 5L1 9"
              stroke="var(--color-accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>

        <rect
          x="1"
          y="1"
          width="518"
          height="418"
          rx="24"
          fill="url(#journey-panel)"
          stroke="var(--color-rule-strong)"
          strokeWidth="2"
        />
        <rect x="14" y="14" width="492" height="392" rx="16" stroke="var(--color-rule)" />

        {/* All three acts share the stage. Only the one being told is visible,
          * and each replays from the beginning whenever it comes back. */}
        {ACTS.map((Act, index) => (
          <m.g
            key={index}
            initial={false}
            animate={{ opacity: index === act ? 1 : 0 }}
            transition={kit.crossfade}
          >
            <m.g variants={kit.act} initial={from(index)} animate={target(index)}>
              <Act kit={kit} />
            </m.g>
          </m.g>
        ))}
      </svg>
    </LazyMotion>
  );
}
