import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** How close to the end still counts as "reading the latest" (px). */
export const STICK_THRESHOLD_PX = 80;

export interface StickToBottom {
  /** True while the reader is at (or within STICK_THRESHOLD_PX of) the end. */
  atBottom: boolean;
  /** Scroll to the end and resume following new content. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

/**
 * Follows new content in a scroll container only while the reader is already at
 * the end. Scrolling up to re-read releases it; scrollToBottom() re-engages it.
 *
 * `dependency` should change whenever content grows (e.g. message count plus the
 * streaming text length). Growth that does not change it (an image or table
 * settling) is caught by a ResizeObserver on the container's children.
 */
export function useStickToBottom(
  containerRef: RefObject<HTMLElement | null>,
  dependency: unknown,
): StickToBottom {
  const [atBottom, setAtBottom] = useState(true);
  // The ref is the source of truth during a stream; state only drives the UI.
  const followingRef = useRef(true);
  // Our own programmatic scrolls must not be read as the reader scrolling away.
  const programmaticRef = useRef(false);

  const pin = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = containerRef.current;
    if (!element) return;
    programmaticRef.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior });
    // Smooth scrolls fire several scroll events; release the guard after a frame
    // for instant scrolls, and let the scroll handler release it on arrival.
    if (behavior !== 'smooth') {
      requestAnimationFrame(() => { programmaticRef.current = false; });
    }
  }, [containerRef]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    followingRef.current = true;
    setAtBottom(true);
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    pin(reduce ? 'auto' : behavior);
  }, [pin]);

  // Track the reader's position.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    let lastTop = element.scrollTop;
    const onScroll = () => {
      const top = element.scrollTop;
      // Our own pins only ever move down; any upward move is the reader taking
      // over, even when it lands in the same frame as a pin.
      const movedUp = top < lastTop - 1;
      lastTop = top;
      const near = distanceFromBottom(element) <= STICK_THRESHOLD_PX;
      if (programmaticRef.current && !movedUp) {
        if (near) programmaticRef.current = false;
        return;
      }
      programmaticRef.current = false;
      followingRef.current = near;
      setAtBottom(near);
    };
    // Wheeling or keying upward is the reader leaving, before any scroll event
    // arrives: stop following at once so no pin races their scroll. The scroll
    // that follows re-engages following if they are still near the end.
    const leave = () => {
      // Nothing above to scroll to: no scroll event will follow, so keep following.
      if (element.scrollTop <= 0) return;
      programmaticRef.current = false;
      followingRef.current = false;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) leave();
    };
    // A touch drag can go either way; just let its scroll be read as the reader's.
    const onTouchMove = () => { programmaticRef.current = false; };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea, input, select, [contenteditable="true"]')) return;
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) leave();
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef]);

  // Follow content growth driven by the caller (new message, streamed tokens).
  useLayoutEffect(() => {
    if (followingRef.current) pin('auto');
  }, [dependency, pin]);

  // Follow growth that happens after render (tables, charts, fonts settling).
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) pin('auto');
    });
    const observeChildren = () => {
      observer.disconnect();
      observer.observe(element);
      for (const child of Array.from(element.children)) observer.observe(child);
    };
    observeChildren();
    const mutations = new MutationObserver(observeChildren);
    mutations.observe(element, { childList: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [containerRef, pin]);

  return { atBottom, scrollToBottom };
}
