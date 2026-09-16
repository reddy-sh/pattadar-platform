/**
 * AssistantConversation — the Pattadar AI section's proof, told as a
 * conversation instead of as an abstract mock.
 *
 * What was here before was a panel of grey placeholder bars with a separate
 * chat card beneath it. The bars said nothing — swap the labels and they could
 * belong to any product on earth — and having two panels meant the artwork and
 * the words competed instead of corroborating. So the mock is gone. The sample
 * conversation IS the picture now: it arrives beat by beat the way a real chat
 * does, in real words about real land, and when the assistant says it is opening
 * Survey 87/1B, you watch it open. Read it, and you know what the product does.
 *
 * NO ANIMATION LIBRARY, on purpose. This panel holds real copy, so the copy must
 * never sit inside a lazily loaded chunk waiting on a slow connection. The whole
 * sequence is a CSS timeline: every bubble is in the DOM and VISIBLE by default,
 * and the staged entrance is added only once `data-run` is set. If the observer
 * never fires, if JavaScript fails after hydration, or if the visitor prefers
 * reduced motion, the conversation is simply there, complete and readable.
 *
 * The timeline itself lives in site.css, keyed by position, because the
 * conversation is byte-frozen: four messages, always the same four.
 *
 * Plays once and rests on the opened record. Nothing loops, so no pause control
 * is owed (WCAG 2.2.2).
 *
 * COPY IS BYTE-FROZEN — strings come from landingContent.ts.
 */
import { useEffect, useRef, useState } from 'react';
import DriveFolderUploadOutlinedIcon from '@mui/icons-material/DriveFolderUploadOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { AI } from './landingContent';
import { prefersReducedMotion } from './sceneKit';

export function AssistantConversation() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  // Below the fold, so it waits until it can be seen rather than telling itself
  // to an empty room. Reduced motion never starts it: the conversation is
  // already complete on the page without it.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const element = rootRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setRun(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="assistant" ref={rootRef} data-run={run ? 'true' : undefined}>
      <div className="assistant__head">
        <SmartToyOutlinedIcon />
        <p className="overline">{AI.convoOverline}</p>
        <span className="assistant__live" aria-hidden="true" />
      </div>

      <div className="assistant__thread">
        {AI.convo.map((message) => (
          <div key={message.text} className="assistant__row" data-role={message.role}>
            <p className={`bubble bubble--${message.role}`}>{message.text}</p>
            {message.role === 'assistant' && (
              /* The pause before an answer, drawn the way every chat draws it.
               * Absolutely positioned so it costs no layout: the bubble behind
               * it already reserves the space, which is why the panel never
               * resizes while the story tells itself. */
              <span className="assistant__typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
        ))}
      </div>

      {/* "Acts, not just talks" — the last answer promises to open the record
       * and ready the Files section, so the opening is shown. Decorative: the
       * message above it has already said so in words. */}
      <div className="assistant__act" aria-hidden="true">
        <DriveFolderUploadOutlinedIcon />
        <span className="assistant__track">
          <span className="assistant__fill" />
        </span>
        <TaskAltOutlinedIcon className="assistant__done" />
      </div>
    </div>
  );
}
