/**
 * Smooth reveal for streamed text.
 *
 * SSE tokens arrive in bursts; painting each burst as it lands reads as chunky
 * jumps. This hook reveals the target a little every animation frame instead:
 * about 1/8 of the backlog per 60 Hz frame (frame-rate independent), never
 * fewer than MIN_CHARS_PER_FRAME, so it catches up quickly when far behind and
 * eases in when nearly caught up.
 *
 * - When `streaming` turns false it snaps to the full target at once.
 * - Under prefers-reduced-motion it never animates: the target shows as is.
 * - The revealed text never animates backwards. When the target is replaced by
 *   something that does not extend what is shown (a regenerated or edited
 *   reply), the reveal resets to the shared prefix and continues from there.
 */
import { useEffect, useRef, useState } from 'react';

const MIN_CHARS_PER_FRAME = 2;
/** Share of the remaining backlog revealed per 16.7 ms frame. */
const BACKLOG_SHARE = 1 / 8;
const FRAME_MS = 1000 / 60;
/**
 * Every commit re-parses the whole reply's markdown, which costs roughly 1 ms
 * per 1,000 characters. Long replies therefore commit less often (about one
 * millisecond of spacing per 200 characters, capped), so parsing stays near a
 * fifth of the frame budget instead of growing to fill it.
 */
const CHARS_PER_MS_OF_SPACING = 200;
const MAX_COMMIT_SPACING_MS = 120;

function reducedMotionQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => reducedMotionQuery()?.matches ?? false);
  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return undefined;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function sharedPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  return i;
}

/** Never cut a surrogate pair (₹ is BMP, but emoji and some scripts are not). */
function safeCut(text: string, length: number): number {
  if (length > 0 && length < text.length) {
    const code = text.charCodeAt(length - 1);
    if (code >= 0xd800 && code <= 0xdbff) return length + 1;
  }
  return length;
}

export function useSmoothText(target: string, streaming: boolean): string {
  const reduced = usePrefersReducedMotion();
  const animate = streaming && !reduced;
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const targetRef = useRef(target);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const lastCommitRef = useRef(0);

  targetRef.current = target;

  useEffect(() => {
    const commit = (next: string) => {
      if (next === shownRef.current) return;
      shownRef.current = next;
      setShown(next);
    };
    const cancel = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };

    if (!animate || typeof requestAnimationFrame === 'undefined') {
      cancel();
      commit(target);
      return undefined;
    }

    // A non-extension resets to the shared prefix rather than un-typing.
    if (!target.startsWith(shownRef.current)) {
      commit(target.slice(0, sharedPrefixLength(shownRef.current, target)));
    }
    if (shownRef.current.length >= target.length || frameRef.current !== null) return undefined;

    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const goal = targetRef.current;
      const current = shownRef.current;
      const backlog = goal.length - current.length;
      if (backlog <= 0 || !goal.startsWith(current)) {
        frameRef.current = null;
        return;
      }
      const spacing = Math.min(MAX_COMMIT_SPACING_MS, goal.length / CHARS_PER_MS_OF_SPACING);
      if (now - lastCommitRef.current < spacing) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastCommitRef.current = now;
      const frames = Math.max(1, (now - lastTickRef.current) / FRAME_MS);
      lastTickRef.current = now;
      const share = 1 - (1 - BACKLOG_SHARE) ** frames;
      const step = Math.max(Math.round(MIN_CHARS_PER_FRAME * frames), Math.ceil(backlog * share));
      commit(goal.slice(0, safeCut(goal, Math.min(goal.length, current.length + step))));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return undefined;
  }, [target, animate]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  // Render-time guard: a snap or reset is never one frame late on screen.
  if (!animate) return target;
  return target.startsWith(shown) ? shown : target.slice(0, sharedPrefixLength(shown, target));
}
