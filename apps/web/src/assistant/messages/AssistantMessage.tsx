import { useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import ReplayIcon from '@mui/icons-material/Replay';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ThumbDownAltOutlinedIcon from '@mui/icons-material/ThumbDownAltOutlined';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import type { ChatMessage } from '../types';
import { ActivitySteps } from './ActivitySteps';
import { MESSAGE_ROOT_CLASS, MessageActions, useCopiedFlag, type MessageActionItem } from './MessageActions';

export type Feedback = 'up' | 'down';

/** Readable measure for prose; tables and cards in the extras use the full width. */
export const PROSE_MAX_WIDTH = '72ch';

export interface AssistantMessageProps {
  message: ChatMessage;
  /** The rendered reply text (markdown); the shell owns the renderer. */
  body: ReactNode;
  /** Views, follow-ups, disclaimer and cost line, rendered full width under the body. */
  extras?: ReactNode;
  /** True while this reply is the one being streamed. */
  streaming?: boolean;
  /** True when this is the newest reply (Regenerate is offered only there). */
  isLast?: boolean;
  /** True while any request is in flight. */
  busy?: boolean;
  /** Controlled feedback; omit to keep it local to the message. */
  feedback?: Feedback | null;
  onCopy?: (message: ChatMessage) => void;
  onRegenerate?: () => void;
  onFeedback?: (messageId: string, value: Feedback) => void;
}

/** The small round avatar that leads every assistant reply. */
export function AssistantAvatar() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 28,
        height: 28,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: '50%',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'primary.main',
        mt: 0.125,
      }}
    >
      <SmartToyOutlinedIcon sx={{ fontSize: 17 }} />
    </Box>
  );
}

/** Three soft dots shown before the first token or step arrives. */
function PendingDots() {
  return (
    <Box
      role="status"
      aria-label="Assistant is preparing a reply"
      sx={{
        display: 'inline-flex',
        gap: 0.5,
        py: 1,
        '& span': {
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: 'text.disabled',
          animation: 'assistantDot 1.2s ease-in-out infinite',
        },
        '& span:nth-of-type(2)': { animationDelay: '0.15s' },
        '& span:nth-of-type(3)': { animationDelay: '0.3s' },
        '@keyframes assistantDot': {
          '0%, 80%, 100%': { opacity: 0.35 },
          '40%': { opacity: 1 },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '& span': { animation: 'none', animationDelay: '0s', opacity: 0.6 },
        },
      }}
    >
      <span /><span /><span />
    </Box>
  );
}

/**
 * One assistant reply: full width with no bubble, led by a small avatar. The
 * working steps sit above the text, the text keeps a readable measure, rich
 * extras run full width, and a quiet action row follows.
 */
export function AssistantMessage({
  message,
  body,
  extras,
  streaming = false,
  isLast = false,
  busy = false,
  feedback,
  onCopy,
  onRegenerate,
  onFeedback,
}: AssistantMessageProps) {
  const [localFeedback, setLocalFeedback] = useState<Feedback | null>(null);
  const rating = feedback !== undefined ? feedback : localFeedback;
  const copy = useCopiedFlag();
  const hasText = message.text.trim().length > 0;
  const hasActivities = (message.activities?.length ?? 0) > 0;

  const rate = (value: Feedback) => {
    setLocalFeedback((current) => (current === value ? null : value));
    onFeedback?.(message.id, value);
  };

  const actions: MessageActionItem[] = [];
  if (!streaming && hasText) {
    actions.push({
      label: 'Copy reply',
      tooltip: copy.copied ? 'Copied' : 'Copy',
      icon: copy.icon,
      onClick: () => {
        onCopy?.(message);
        copy.flag();
      },
    });
  }
  if (!streaming && isLast && !busy && onRegenerate) {
    actions.push({ label: 'Regenerate reply', tooltip: 'Regenerate', icon: <ReplayIcon />, onClick: onRegenerate });
  }
  if (!streaming && hasText) {
    actions.push(
      {
        label: 'Good reply',
        tooltip: 'Good response',
        icon: rating === 'up' ? <ThumbUpAltIcon /> : <ThumbUpAltOutlinedIcon />,
        pressed: rating === 'up',
        onClick: () => rate('up'),
      },
      {
        label: 'Bad reply',
        tooltip: 'Bad response',
        icon: rating === 'down' ? <ThumbDownAltIcon /> : <ThumbDownAltOutlinedIcon />,
        pressed: rating === 'down',
        onClick: () => rate('down'),
      },
    );
  }

  return (
    <Box
      component="article"
      aria-label="Assistant reply"
      aria-busy={streaming || undefined}
      className={MESSAGE_ROOT_CLASS}
      data-role="assistant"
      sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', width: '100%', minWidth: 0 }}
    >
      <AssistantAvatar />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {hasActivities && <ActivitySteps activities={message.activities ?? []} />}

        {hasText ? (
          <Box
            className={streaming ? 'assistant-prose assistant-streaming' : 'assistant-prose'}
            sx={{
              fontSize: '0.95rem',
              lineHeight: 1.65,
              color: 'text.primary',
              overflowWrap: 'anywhere',
              textRendering: 'optimizeLegibility',
              WebkitFontSmoothing: 'antialiased',
              // Prose keeps a readable measure; tables, code and anything marked
              // .assistant-wide (or a scroll wrapper around a table) use the full column.
              '& > *:not(table):not(pre):not(.assistant-wide):not(:has(table))': { maxWidth: PROSE_MAX_WIDTH },
              // A soft caret after the last streamed glyph.
              ...(streaming && {
                '& > :last-child:not(table):not(pre):not(hr):not(.assistant-wide)::after, &:not(:has(> *))::after': {
                  content: '""',
                  display: 'inline-block',
                  width: '0.5em',
                  height: '1em',
                  ml: '2px',
                  verticalAlign: '-0.15em',
                  borderRadius: '2px',
                  bgcolor: 'primary.main',
                  opacity: 0.7,
                  animation: 'assistantCaret 1s steps(2, start) infinite',
                },
                '@keyframes assistantCaret': { to: { visibility: 'hidden' } },
                '@media (prefers-reduced-motion: reduce)': {
                  '& > :last-child:not(table):not(pre):not(hr):not(.assistant-wide)::after, &:not(:has(> *))::after': { animation: 'none' },
                },
              }),
            }}
          >
            {body}
          </Box>
        ) : (
          streaming && !hasActivities && <PendingDots />
        )}

        {extras && <Box sx={{ width: '100%', minWidth: 0 }}>{extras}</Box>}

        <MessageActions actions={actions} label="Reply actions" />
      </Box>
    </Box>
  );
}
