/**
 * A link out of a confirmation card ("Open holding", an order ref, "Open the
 * form"). The assistant is a modal drawer over the app, so following a link
 * closes it — otherwise the page changes out of sight behind it (on a phone the
 * drawer is the whole screen). It is a real link (an href), so middle-click
 * and open-in-new-tab work; those leave the drawer open, as the reader is
 * staying here.
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import Button from '@mui/material/Button';
import type { ButtonProps } from '@mui/material/Button';

/** Closes the assistant drawer; provided by AssistantPanel. */
export const AssistantLeaveContext = createContext<() => void>(() => undefined);

export function CardLink({ to, children, size, variant, sx, title }: {
  to: string; children: ReactNode; size?: ButtonProps['size']; variant?: ButtonProps['variant']; sx?: ButtonProps['sx']; title?: string;
}) {
  const leave = useContext(AssistantLeaveContext);
  return (
    <Button
      size={size}
      variant={variant}
      sx={sx}
      title={title}
      component={RouterLink}
      to={to}
      onClick={(event: React.MouseEvent) => {
        // A modified click opens a new tab: the reader stays in the chat.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        leave();
      }}
    >
      {children}
    </Button>
  );
}
