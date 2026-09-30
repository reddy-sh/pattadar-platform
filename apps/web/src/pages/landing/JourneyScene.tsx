/**
 * The three real Pattadar surfaces behind How it works. Each new view wipes
 * across the same stage, covering the previous one without a blank or a
 * double-exposed label. One shared Motion value keeps both reveals in order
 * even when someone skips or rapidly changes steps.
 */
import { useEffect } from 'react';
import { animate, LazyMotion, m, useMotionValue, useTransform } from 'motion/react';
import {
  AddPropertyView, InviteView, JourneyChrome, OrganisedView,
} from './JourneyProductArtwork';

const loadDomAnimation = () => import('motion/react').then((mod) => mod.domAnimation);
const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

export default function JourneyScene({
  act,
  playing,
  instant,
}: {
  act: number;
  playing: boolean;
  instant: boolean;
}) {
  const visibleAct = playing ? act : 0;
  const progress = useMotionValue(visibleAct);
  const inviteWidth = useTransform(progress, (value) => Math.min(1, Math.max(0, value)) * 510);
  const organisedWidth = useTransform(progress, (value) => Math.min(1, Math.max(0, value - 1)) * 510);

  useEffect(() => {
    if (instant) {
      progress.set(visibleAct);
      return;
    }
    const distance = Math.abs(visibleAct - progress.get());
    if (distance === 0) return;
    const controls = animate(progress, visibleAct, {
      duration: distance * 0.68,
      // A two-step jump must spend real time on the middle view.
      ease: distance > 1 ? 'linear' : EASE,
    });
    return () => controls.stop();
  }, [instant, progress, visibleAct]);

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
          <clipPath id="journey-invite-reveal">
            <m.rect
              data-stage="invite-reveal"
              x="5" y="54" width={inviteWidth} height="361"
            />
          </clipPath>
          <clipPath id="journey-organised-reveal">
            <m.rect
              data-stage="organised-reveal"
              x="5" y="54" width={organisedWidth} height="361"
            />
          </clipPath>
        </defs>
        <JourneyChrome />
        <AddPropertyView />
        <g clipPath="url(#journey-invite-reveal)">
          <rect x="5" y="54" width="510" height="361" fill="var(--color-paper)" />
          <InviteView />
        </g>
        <g clipPath="url(#journey-organised-reveal)">
          <rect x="5" y="54" width="510" height="361" fill="var(--color-paper)" />
          <OrganisedView />
        </g>
      </svg>
    </LazyMotion>
  );
}
