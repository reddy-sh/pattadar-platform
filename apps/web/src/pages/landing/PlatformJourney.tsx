/**
 * PlatformJourney — the answer to "how does Pattadar actually work?", told as a
 * story rather than presented as a diagram.
 *
 * What was here before put one very wide picture of the entire mechanism above
 * the three steps. Everything happened at once, nothing was beside the words it
 * illustrated, and the panel was the largest thing on the page. This version
 * runs the steps and the stage SIDE BY SIDE: the step being told is the only one
 * lit, and the stage shows only its act, three times larger than before.
 *
 * Three acts, each mirroring one step of the frozen HOW copy:
 *   1. photograph a passbook or deed and watch the details fill themselves in
 *   2. invite family and heirs, then see confirmations come back
 *   3. everything settles into one organised, locked set of records
 *
 * This module deliberately imports NO animation library. It owns which act is
 * showing, the timers and the step list, and pulls in the Motion-powered artwork
 * (`JourneyScene`) lazily — so Motion stays out of the shared vendor chunk and
 * signed-in app routes never download it. Stage detection uses plain
 * IntersectionObserver and matchMedia for the same reason.
 *
 * Accessibility: the artwork is decorative and aria-hidden. The step list is the
 * source of truth, renders eagerly with complete text, and never waits on a
 * chunk or on JavaScript animation — every step's title AND body are readable at
 * once, whichever act is on the stage. Each title is a real button, so the story
 * is keyboard-operable and re-tellable; choosing a step stops the autoplay so it
 * never moves on under someone mid-read.
 *
 * The sequence plays ONCE and rests on the last step, so nothing loops
 * indefinitely and no pause control is owed (WCAG 2.2.2).
 *
 * COPY IS BYTE-FROZEN — strings come from landingContent.ts.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { HOW } from './landingContent';
import { SceneBoundary, prefersReducedMotion } from './sceneKit';

const JourneyScene = lazy(() => import('./JourneyScene'));

/** How long each act holds the stage. Mirrored by `--journey-act` in site.css,
 * which draws the progress line under the step being told. */
const ACT_MS = 3400;
const LAST = HOW.steps.length - 1;

export function PlatformJourney() {
  const rootRef = useRef<HTMLDivElement>(null);
  // Both resolved in the first render. Motion animates via the Web Animations
  // API, so the CSS prefers-reduced-motion guard cannot rein it in — the scene
  // has to MOUNT settled, which means knowing the preference before it mounts.
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [playing, setPlaying] = useState(prefersReducedMotion);
  const [autoplay, setAutoplay] = useState(() => !prefersReducedMotion());
  const [act, setAct] = useState(0);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const apply = () => {
      setReducedMotion(query.matches);
      if (query.matches) {
        setPlaying(true);
        setAutoplay(false);
      }
    };
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  // Start only once the visitor can actually see it.
  useEffect(() => {
    if (playing) return;
    const element = rootRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setPlaying(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setPlaying(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [playing]);

  // Advance step by step, then stop. There is no infinite loop by design.
  useEffect(() => {
    if (!autoplay || !playing || act >= LAST) return;
    const timer = setTimeout(() => setAct((current) => current + 1), ACT_MS);
    return () => clearTimeout(timer);
  }, [autoplay, playing, act]);

  /** Choosing a step hands the story over: it stops advancing on its own. */
  const choose = useCallback((index: number) => {
    setAutoplay(false);
    setPlaying(true);
    setAct(index);
  }, []);

  return (
    <div
      className="journey"
      ref={rootRef}
      data-auto={autoplay && playing && act < LAST ? 'true' : undefined}
    >
      <ol className="journey__steps">
        {HOW.steps.map((step, index) => (
          <li
            key={step.n}
            className="journey__step"
            data-state={index === act ? 'active' : index < act ? 'told' : 'ahead'}
          >
            <span className="journey__step-num" aria-hidden="true">
              {step.n}
            </span>
            <h3 className="journey__step-h">
              <button
                type="button"
                className="journey__step-btn"
                aria-pressed={index === act}
                onClick={() => choose(index)}
              >
                {step.title}
              </button>
            </h3>
            <p className="journey__step-b">{step.body}</p>
            <span className="journey__step-progress" aria-hidden="true" />
          </li>
        ))}
      </ol>

      {/* The placeholder holds the exact aspect ratio, so loading the scene
       * chunk never shifts the page under someone mid-read — and it is also
       * where we stay for good if that chunk never arrives. */}
      <figure className="journey__figure" aria-hidden="true">
        <SceneBoundary fallback={<div className="journey__placeholder" />}>
          <Suspense fallback={<div className="journey__placeholder" />}>
            <JourneyScene act={act} playing={playing} instant={reducedMotion} />
          </Suspense>
        </SceneBoundary>
      </figure>
    </div>
  );
}
