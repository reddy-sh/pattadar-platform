/**
 * HeroStory — the eager shell around the hero's Motion narrative.
 *
 * This module imports no animation library. The hero is above the fold and its
 * headline, lead and CTAs must never wait on a 26 kB animation runtime, so the
 * scene is loaded lazily and this file stays tiny.
 *
 * Two details matter for people on slow connections:
 *
 *  · The fallback is a drawn card silhouette, not an empty box. If the scene
 *    chunk is slow or never arrives, the hero still looks composed and holds its
 *    exact aspect ratio, so nothing shifts and nothing looks broken.
 *
 *  · If the chunk lands late, the story is NOT replayed from the beginning —
 *    restarting an animation under someone who has already started reading is
 *    worse than never animating. The scene decides that at its own mount, using
 *    `startedAt`, and settles straight to the finished picture instead.
 *
 * Reduced motion is resolved synchronously in the first render, not in an
 * effect. Motion animates via the Web Animations API, so the CSS
 * prefers-reduced-motion guard in site.css cannot rein it in — the only reliable
 * way to honour the preference is to mount the scene already finished.
 *
 * The artwork is decorative throughout; the hero copy carries the meaning.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { SceneBoundary, prefersReducedMotion } from './sceneKit';

const HeroStoryScene = lazy(() => import('./HeroStoryScene'));

/** Beats run for ~3.3s; after that the story has finished telling itself. */
const STORY_MS = 3600;

/** The composed silhouette shown until (or instead of) the animated scene. */
function HeroSceneFallback() {
  return (
    <svg
      className="hero-scene__svg"
      viewBox="0 0 960 540"
      width={960}
      height={540}
      fill="none"
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      {/* Geometry mirrors HeroStoryScene's card exactly, so swapping in the
        * animated scene never nudges the layout. */}
      <rect
        x="330"
        y="64"
        width="300"
        height="372"
        rx="20"
        fill="var(--color-paper-2)"
        stroke="var(--color-rule-strong)"
        strokeWidth="2"
      />
      <rect x="356" y="100" width="132" height="11" rx="5.5" fill="var(--color-ink)" fillOpacity="0.9" />
      <rect x="356" y="122" width="190" height="6" rx="3" fill="var(--color-ink-3)" />
      {[152, 198, 244, 290, 336].map((y) => (
        <rect
          key={y}
          x="356"
          y={y}
          width="252"
          height="34"
          rx="8"
          fill="var(--color-paper-2)"
          stroke="var(--color-rule-strong)"
        />
      ))}
    </svg>
  );
}

export function HeroStory() {
  // Correct in the very first render, so the scene can mount already finished.
  const [instant, setInstant] = useState(prefersReducedMotion);
  const startedAt = useRef(Date.now());
  const [runId, setRunId] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const apply = () => setInstant(query.matches);
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  // Track when the story is done, so replay cannot interrupt it mid-sentence.
  useEffect(() => {
    if (instant) {
      setFinished(true);
      return;
    }
    setFinished(false);
    const timer = setTimeout(() => setFinished(true), STORY_MS);
    return () => clearTimeout(timer);
  }, [instant, runId]);

  const replay = useCallback(() => {
    if (instant || !finished) return;
    startedAt.current = Date.now();
    setRunId((id) => id + 1);
  }, [instant, finished]);

  return (
    <figure
      className="hero-scene"
      aria-hidden="true"
      data-telling={!instant && !finished ? 'true' : undefined}
      onPointerEnter={replay}
      onPointerDown={replay}
    >
      <SceneBoundary fallback={<HeroSceneFallback />}>
        <Suspense fallback={<HeroSceneFallback />}>
          {/* runId remounts the scene, which is how a replay restarts it. */}
          <HeroStoryScene key={runId} instant={instant} startedAt={startedAt.current} />
        </Suspense>
      </SceneBoundary>
    </figure>
  );
}
