import { useEffect, useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import { LazyMotion, m } from 'motion/react';
import type { ChatMessage } from '../types';
import { AssistantMessage, type Feedback } from './AssistantMessage';
import { prefersReducedMotion } from './focusRing';
import { UserMessage } from './UserMessage';

// Start fetching the animation features as soon as the drawer code loads, so the
// first new message never waits on them (design.md § Motion: LazyMotion + m, strict).
const domAnimation = import('motion/react').then((mod) => mod.domAnimation);
const loadDomAnimation = () => domAnimation;

export interface MessageListProps {
  messages: ChatMessage[];
  /** True while a request is in flight (hides Regenerate / Edit). */
  busy: boolean;
  /** Id of the newest assistant reply. */
  lastAssistantId?: string | null;
  /** Id of the reply currently streaming, if any (defaults to lastAssistantId while busy). */
  streamingId?: string | null;
  /** Renders the reply text (markdown). */
  renderAssistantBody: (message: ChatMessage) => ReactNode;
  /** Renders views, follow-ups, disclaimer and the cost line under a reply. */
  renderAssistantExtras?: (message: ChatMessage) => ReactNode;
  /** Controlled feedback by message id; omit to keep it local per message. */
  feedback?: Record<string, Feedback | undefined>;
  onCopy?: (message: ChatMessage) => void;
  onRegenerate?: () => void;
  onEditResend?: (messageId: string, newText: string) => void;
  onFeedback?: (messageId: string, value: Feedback) => void;
}

/**
 * The conversation: questions as right-hand bubbles, replies as full-width rich
 * content. Messages that arrive after the list mounts settle in with a short
 * fade and rise; messages already present (a loaded history) render in place,
 * and reduced motion renders everything in place. A polite live region announces
 * when a reply has finished.
 */
export function MessageList({
  messages,
  busy,
  lastAssistantId,
  streamingId,
  renderAssistantBody,
  renderAssistantExtras,
  feedback,
  onCopy,
  onRegenerate,
  onEditResend,
  onFeedback,
}: MessageListProps) {
  // Resolved synchronously, before anything animates (design.md § Motion).
  const [reduceMotion] = useState(prefersReducedMotion);
  // Messages present on first render (history) never animate in.
  const initialIds = useRef<Set<string> | null>(null);
  if (initialIds.current === null) initialIds.current = new Set(messages.map((message) => message.id));

  const lastUserId = [...messages].reverse().find((message) => message.role === 'user')?.id;
  const activeStreamId = streamingId !== undefined ? streamingId : busy ? lastAssistantId : null;

  // Announce completion once per reply (busy → idle), never per token. The list
  // itself is not a live region, so streamed text is not read out piecemeal.
  const [announcement, setAnnouncement] = useState('');
  const wasBusy = useRef(busy);
  // Read when busy flips, so the announcement says how the reply ended.
  const lastReply = useRef<ChatMessage | undefined>(undefined);
  lastReply.current = [...messages].reverse().find((message) => message.role === 'assistant');
  useEffect(() => {
    if (busy) setAnnouncement('');
    else if (wasBusy.current) {
      const reply = lastReply.current;
      setAnnouncement(reply?.error ? 'Reply failed.' : reply?.stopped ? 'Reply stopped.' : 'Reply complete.');
    }
    wasBusy.current = busy;
  }, [busy]);

  return (
    <LazyMotion features={loadDomAnimation} strict>
      <Box
        component="section"
        aria-label="Conversation"
        aria-busy={busy || undefined}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, width: '100%', minWidth: 0 }}
      >
        {messages.map((message) => {
          const animate = !reduceMotion && !initialIds.current?.has(message.id);
          const isStreaming = message.role === 'assistant' && message.id === activeStreamId;
          return (
            <m.div
              key={message.id}
              initial={animate ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ minWidth: 0 }}
            >
              {message.role === 'user' ? (
                <UserMessage
                  message={message}
                  isLast={message.id === lastUserId}
                  busy={busy}
                  onCopy={onCopy}
                  onEditResend={onEditResend}
                />
              ) : (
                <AssistantMessage
                  message={message}
                  body={renderAssistantBody(message)}
                  extras={renderAssistantExtras?.(message)}
                  streaming={isStreaming}
                  isLast={message.id === lastAssistantId}
                  busy={busy}
                  feedback={feedback ? feedback[message.id] ?? null : undefined}
                  onCopy={onCopy}
                  onRegenerate={onRegenerate}
                  onFeedback={onFeedback}
                />
              )}
            </m.div>
          );
        })}
      </Box>
      <Box
        role="status"
        aria-live="polite"
        sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
      >
        {announcement}
      </Box>
    </LazyMotion>
  );
}
