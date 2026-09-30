import { useEffect, useState } from 'react';
import { AnimatePresence, LazyMotion, m } from 'motion/react';
import { LAND_STORY } from './landingContent';
import { prefersReducedMotion } from './sceneKit';

const loadDomAnimation = () => import('motion/react').then((mod) => mod.domAnimation);
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const LAST_CHAPTER = LAND_STORY.chapters.length - 1;

export function HeroStory() {
  const [chapter, setChapter] = useState(() => prefersReducedMotion() ? LAST_CHAPTER : 0);
  const [autoplay, setAutoplay] = useState(() => !prefersReducedMotion());
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) {
        setAutoplay(false);
        setChapter(LAST_CHAPTER);
      }
    };
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!autoplay || chapter === LAST_CHAPTER) return;
    const timer = window.setTimeout(() => setChapter((current) => current + 1), 2800);
    return () => window.clearTimeout(timer);
  }, [autoplay, chapter]);

  const selectChapter = (next: number) => {
    setAutoplay(false);
    setChapter(next);
  };

  const current = LAND_STORY.chapters[chapter];

  return (
    <div className="hero-story" aria-label="The land record trail">
      <div className="hero-story__head">
        <span>The record trail</span>
        <span>{String(chapter + 1).padStart(2, '0')} / 04</span>
      </div>
      <LazyMotion features={loadDomAnimation} strict>
        <div className="hero-story__records" aria-hidden="true">
          {LAND_STORY.records.map((record, index) => (
            <m.div
              key={record.office}
              className="hero-story__record"
              data-record={record.office.toLowerCase()}
              initial={false}
              animate={{
                opacity: chapter === LAST_CHAPTER || chapter === index ? 1 : 0.42,
                x: chapter === LAST_CHAPTER ? 0 : index === chapter ? 0 : 14,
              }}
              transition={{ duration: reduced ? 0 : 0.9, ease: EASE }}
            >
              <span className="hero-story__record-index">0{index + 1}</span>
              <span className="hero-story__record-text">
                <small>{record.office}</small>
                <strong>{record.paper}</strong>
              </span>
            </m.div>
          ))}
          <m.div
            className="hero-story__arrival"
            data-stage="pattadar-arrival"
            initial={false}
            animate={{ opacity: chapter === LAST_CHAPTER ? 1 : 0, y: chapter === LAST_CHAPTER ? 0 : 20 }}
            transition={{ duration: reduced ? 0 : 0.9, ease: EASE }}
          >
            <span>Pattadar<span className="hero-story__dot">.</span></span>
            <small>Your copies, kept together</small>
          </m.div>
        </div>
        <div className="hero-story__narration" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={chapter}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduced ? 0 : 0.38, ease: EASE }}
            >
              <h2>{current.title}</h2>
              <p>{current.detail}</p>
            </m.div>
          </AnimatePresence>
        </div>
      </LazyMotion>
      <div className="hero-story__controls" role="group" aria-label="Land record story chapters">
        {LAND_STORY.chapters.map((item, index) => (
          <button
            type="button"
            key={item.label}
            className="hero-story__step"
            aria-pressed={chapter === index}
            onClick={() => selectChapter(index)}
          >
            <span className="hero-story__step-number">0{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>
      <p className="hero-story__note">{LAND_STORY.note}</p>
    </div>
  );
}
