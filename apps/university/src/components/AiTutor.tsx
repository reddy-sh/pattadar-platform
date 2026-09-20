import CloseRounded from '@mui/icons-material/CloseRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import { useEffect, useMemo, useRef, useState } from 'react';
import { answerTutor } from '../domain/learning';
import type { Course } from '../domain/types';

interface AiTutorProps {
  open: boolean;
  course?: Course;
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'learner' | 'tutor';
  text: string;
  sources?: string[];
}

export function AiTutor({ open, course, onClose }: AiTutorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const initial = useMemo<Message>(() => ({
    id: `hello-${course?.id ?? 'general'}`,
    role: 'tutor',
    text: course
      ? `I am ready to help with ${course.title}. Ask for an explanation, a practice question, or the next module.`
      : 'Choose a course or ask how a Pattadar learning path leads to supervised work.',
    sources: course ? [`${course.title} · course guide`] : ['Tutor use policy'],
  }), [course]);
  const [messages, setMessages] = useState<Message[]>([initial]);

  useEffect(() => setMessages([initial]), [initial]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const ask = (question: string) => {
    const clean = question.trim();
    if (!clean) return;
    const reply = answerTutor(course, clean);
    setMessages((current) => [
      ...current,
      { id: `q-${Date.now()}`, role: 'learner', text: clean },
      { id: `a-${Date.now()}`, role: 'tutor', text: reply.text, sources: reply.sources },
    ]);
    setDraft('');
  };

  return (
    <dialog
      ref={dialogRef}
      className="tutor-dialog"
      aria-label="Pattadar AI tutor"
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="tutor-dialog__head">
        <span className="icon-box"><SmartToyOutlined /></span>
        <div><strong>AI tutor</strong><small>{course?.title ?? 'Pattadar University'}</small></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close AI tutor" title="Close AI tutor">
          <CloseRounded />
        </button>
      </div>
      <div className="tutor-dialog__messages" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message chat-message--${message.role}`}>
            <span className="chat-message__role">{message.role === 'tutor' ? 'Tutor' : 'You'}</span>
            <p>{message.text}</p>
            {message.sources?.length ? (
              <div className="chat-message__sources">
                {message.sources.map((source) => <span key={source}>{source}</span>)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="tutor-dialog__prompts">
        <button type="button" onClick={() => ask('What should I learn next?')}>What next?</button>
        <button type="button" onClick={() => ask('How does the certificate work?')}>Certificate</button>
        <button type="button" onClick={() => ask('How can I find supervised work?')}>Find work</button>
      </div>
      <form className="tutor-dialog__composer" onSubmit={(event) => { event.preventDefault(); ask(draft); }}>
        <label className="sr-only" htmlFor="tutor-question">Ask the AI tutor</label>
        <input
          ref={inputRef}
          id="tutor-question"
          value={draft}
          placeholder="Ask about this course"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="icon-button icon-button--accent" type="submit" aria-label="Send question" title="Send question" disabled={!draft.trim()}>
          <SendRounded />
        </button>
      </form>
      <p className="tutor-dialog__note">Answers use approved course material. Live property, legal, or safety decisions go to a qualified person.</p>
    </dialog>
  );
}
