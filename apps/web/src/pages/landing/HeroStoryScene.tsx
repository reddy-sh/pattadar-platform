/**
 * One property moves from the portfolio into its record, gains a saved copy,
 * then opens sharing. A single interruptible Motion value drives the title,
 * record reveal, filing drawer and share overlay in the same product surface.
 */
import { useEffect } from 'react';
import { animate, LazyMotion, m, useMotionValue, useTransform } from 'motion/react';
import {
  DocumentsView, HERO_FRAME, NewDocumentRow, ProductChrome, PropertiesView,
  RecordFrame, ShareView, UploadDrawer,
} from './HeroProductArtwork';
import { HERO_SCENE } from './landingContent';

const loadDomAnimation = () => import('motion/react').then((mod) => mod.domAnimation);
const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export default function HeroStoryScene({
  instant,
  frame,
  act,
  onReady,
}: {
  instant: boolean;
  frame: keyof typeof HERO_FRAME;
  act: number;
  onReady: () => void;
}) {
  const progress = useMotionValue(act);
  const recordOpen = useTransform(progress, (value) => clamp(value));
  const recordWidth = useTransform(recordOpen, (value) => value * 517);
  const titleX = useTransform(recordOpen, (value) => 208 - value * 20);
  const titleY = useTransform(recordOpen, (value) => 322 - value * 186);
  const titleSize = useTransform(recordOpen, (value) => 19 + value * 8);
  const titleOpacity = useTransform(progress, (value) =>
    1 - clamp((value - 1.08) / 0.3) + clamp((value - 2.55) / 0.2));
  const shareHeight = useTransform(progress, (value) => clamp((value - 2.75) / 0.25) * 244);
  const filed = useTransform(progress, (value) => clamp((value - 2.5) / 0.2));
  const filedY = useTransform(filed, (value) => (1 - value) * 10);
  const drawerX = useTransform(progress, (value) => {
    if (value <= 1 || value >= 2.55) return 322;
    if (value < 1.45) return 322 * (1 - (value - 1) / 0.45);
    if (value <= 2.2) return 0;
    return 322 * ((value - 2.2) / 0.35);
  });

  useEffect(() => {
    onReady();
  }, [onReady]);

  useEffect(() => {
    if (instant) {
      progress.set(act);
      return;
    }
    const distance = Math.abs(act - progress.get());
    if (distance === 0) return;
    if (act === 3 && progress.get() < 2.7) {
      const travel = (2.7 - progress.get()) * 0.7;
      const hold = 0.45;
      const reveal = 0.6;
      const total = travel + hold + reveal;
      const controls = animate(progress, [progress.get(), 2.7, 2.7, 3], {
        duration: total,
        times: [0, travel / total, (travel + hold) / total, 1],
        ease: 'linear',
      });
      return () => controls.stop();
    }
    const controls = animate(progress, act, {
      duration: distance * 0.7,
      ease: distance > 1 ? 'linear' : EASE,
    });
    return () => controls.stop();
  }, [act, instant, progress]);

  return (
    <LazyMotion features={loadDomAnimation} strict>
      <svg
        className="hero-scene__svg"
        {...HERO_FRAME[frame]}
        fill="none"
        role="presentation"
        focusable="false"
      >
        <defs>
          <clipPath id="hero-product-clip">
            <rect x="4" y="4" width="672" height="492" rx="8" />
          </clipPath>
          <clipPath id="hero-record-reveal">
            <m.rect
              data-stage="record-reveal"
              x="159" y="59" width={recordWidth} height="437"
            />
          </clipPath>
          <clipPath id="hero-share-reveal">
            <m.rect
              data-stage="share-reveal"
              x="188" y="218" width="461" height={shareHeight}
            />
          </clipPath>
        </defs>
        <ProductChrome />
        <g clipPath="url(#hero-product-clip)">
          <PropertiesView showTitle={false} />
          <g clipPath="url(#hero-record-reveal)">
            <rect x="159" y="59" width="517" height="437" fill="var(--color-paper)" />
            <RecordFrame showTitle={false} />
            <DocumentsView />
            <m.g data-stage="new-document" style={{ opacity: filed, y: filedY }}>
              <NewDocumentRow />
            </m.g>
            <g clipPath="url(#hero-share-reveal)">
              <rect x="188" y="218" width="461" height="244" fill="var(--color-paper)" />
              <ShareView compact={frame === 'tiny'} showFootnote={frame !== 'tiny'} />
            </g>
          </g>
          <m.g data-stage="upload-drawer" style={{ x: drawerX }}>
            <UploadDrawer compact={frame === 'tiny'} />
          </m.g>
          <m.text
            data-stage="property-title"
            x={titleX} y={titleY}
            fontSize={titleSize}
            style={{ opacity: titleOpacity }}
            fill="var(--color-ink)"
            fontWeight="700"
          >
            {HERO_SCENE.property}
          </m.text>
        </g>
      </svg>
    </LazyMotion>
  );
}
