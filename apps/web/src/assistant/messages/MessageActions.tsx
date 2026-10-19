import { useEffect, useRef, useState, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import { focusRingSx } from './focusRing';

export interface MessageActionItem {
  /** Stable key and the accessible name ("Copy reply"). */
  label: string;
  /** Tooltip text; defaults to label. */
  tooltip?: string;
  icon: ReactElement;
  onClick: () => void;
  /** For toggles (feedback): rendered as aria-pressed. */
  pressed?: boolean;
  disabled?: boolean;
}

export interface MessageActionsProps {
  actions: MessageActionItem[];
  /** Which side the row hugs. */
  align?: 'start' | 'end';
  /** Accessible name for the toolbar ("Reply actions"). */
  label: string;
}

/** The class a message root carries so its actions show on hover/focus-within. */
export const MESSAGE_ROOT_CLASS = 'assistant-message-root';

/**
 * A small toolbar under a message. On pointer devices it fades in on hover or
 * keyboard focus inside the message; on touch it is always visible. It never
 * collapses its height, so showing it does not shift the conversation.
 */
export function MessageActions({ actions, align = 'start', label }: MessageActionsProps) {
  // While a reply streams it has no actions yet; the row's height is still
  // reserved so their arrival does not push the conversation down.
  if (actions.length === 0) return <Box aria-hidden sx={{ mt: 0.25, minHeight: 30 }} />;
  return (
    <Box
      role="toolbar"
      aria-label={label}
      className="message-actions"
      sx={(theme) => ({
        display: 'flex',
        justifyContent: align === 'end' ? 'flex-end' : 'flex-start',
        gap: 0.25,
        mt: 0.25,
        minHeight: 30,
        transition: theme.transitions.create('opacity', { duration: 120 }),
        '@media (hover: hover) and (pointer: fine)': {
          opacity: 0,
          [`.${MESSAGE_ROOT_CLASS}:hover &, .${MESSAGE_ROOT_CLASS}:focus-within &`]: { opacity: 1 },
          // Pressed toggles stay visible so a given rating is never hidden.
          '&:has([aria-pressed="true"])': { opacity: 1 },
        },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      })}
    >
      {actions.map((action) => (
        <Tooltip key={action.label} title={action.tooltip ?? action.label} enterDelay={800} enterNextDelay={400}>
          <span>
            <IconButton
              size="small"
              aria-label={action.label}
              aria-pressed={action.pressed}
              onClick={action.onClick}
              disabled={action.disabled}
              sx={(theme) => ({
                width: 30,
                height: 30,
                borderRadius: 1.5,
                color: action.pressed ? 'primary.main' : 'text.secondary',
                '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
                '& svg': { fontSize: 16 },
                ...focusRingSx(theme),
              })}
            >
              {action.icon}
            </IconButton>
          </span>
        </Tooltip>
      ))}
    </Box>
  );
}

/**
 * Copy state for a copy button: flips to a check for ~1.6s after a copy.
 * Returns the icon to show and a wrapper that runs the copy.
 */
export function useCopiedFlag(): { copied: boolean; flag: () => void; icon: ReactElement } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flag = () => {
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };
  return { copied, flag, icon: copied ? <CheckIcon /> : <ContentCopyOutlinedIcon /> };
}
