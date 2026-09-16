/**
 * sceneKit — the two things every animated landing scene needs, in one place.
 *
 * Extracted once there was a third scene: HeroStory, PlatformJourney and
 * AssistantStory all need the same reduced-motion read and the same failure
 * behaviour. Their timing differs meaningfully, so that stays local to each.
 */
import { Component } from 'react';
import type { ReactNode } from 'react';

/**
 * Read synchronously, during the first render — never in an effect.
 *
 * Motion animates through the Web Animations API, so the
 * `prefers-reduced-motion` block in site.css cannot rein it in. The only
 * reliable way to honour the preference is to mount the scene already finished,
 * and that means knowing the answer before the scene mounts. An effect runs
 * after the first paint, by which time the animation has already started.
 */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * A decorative scene must never be able to take the page down with it.
 *
 * `lazy()` throws if its chunk fails, and an uncaught throw unmounts the whole
 * surrounding section — including the copy, which is the part that matters. Land
 * records get opened on unreliable rural connections, so a dropped chunk has to
 * degrade to the reserved space and nothing more.
 */
export class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
