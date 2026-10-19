import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputBase from '@mui/material/InputBase';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { ChatMessage } from '../types';
import { MESSAGE_ROOT_CLASS, MessageActions, useCopiedFlag, type MessageActionItem } from './MessageActions';

export interface UserMessageProps {
  message: ChatMessage;
  /** True for the newest question (Edit is offered only there). */
  isLast?: boolean;
  /** True while any request is in flight. */
  busy?: boolean;
  onCopy?: (message: ChatMessage) => void;
  /** Called with the edited text; the shell replaces this turn and resends. */
  onEditResend?: (messageId: string, newText: string) => void;
}

/**
 * One question from the reader: a soft bubble on the right, any attached files as
 * chips above the text, and Copy / Edit underneath. Edit swaps the bubble for an
 * inline editor (Enter saves, Shift+Enter breaks a line, Escape cancels).
 */
export function UserMessage({ message, isLast = false, busy = false, onCopy, onEditResend }: UserMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  // Set when the edit is cancelled, so focus returns to the Edit button.
  const refocusEdit = useRef(false);
  const editId = useId();
  const copy = useCopiedFlag();
  const canEdit = isLast && !busy && Boolean(onEditResend);

  // Leave edit mode if the message stops being editable (e.g. a request starts).
  useEffect(() => {
    if (editing && !canEdit) setEditing(false);
  }, [editing, canEdit]);

  useEffect(() => {
    if (!editing) {
      if (refocusEdit.current) {
        refocusEdit.current = false;
        rootRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Edit message"]')?.focus();
      }
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);

  const startEdit = () => {
    setDraft(message.text);
    setEditing(true);
  };
  const cancel = () => {
    refocusEdit.current = true;
    setEditing(false);
  };
  const trimmed = draft.trim();
  const save = () => {
    if (!trimmed || !onEditResend) return;
    setEditing(false);
    onEditResend(message.id, trimmed);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      // The drawer closes on Escape too; this one belongs to the editor.
      event.stopPropagation();
      cancel();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  };

  const actions: MessageActionItem[] = [];
  if (message.text.trim()) {
    actions.push({
      label: 'Copy message',
      tooltip: copy.copied ? 'Copied' : 'Copy',
      icon: copy.icon,
      onClick: () => {
        onCopy?.(message);
        copy.flag();
      },
    });
  }
  if (canEdit) {
    actions.push({ label: 'Edit message', tooltip: 'Edit and resend', icon: <EditOutlinedIcon />, onClick: startEdit });
  }

  return (
    <Box
      ref={rootRef}
      component="article"
      aria-label="Your message"
      className={MESSAGE_ROOT_CLASS}
      data-role="user"
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '100%', minWidth: 0 }}
    >
      {message.attachments && message.attachments.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 0.5, mb: 0.5, maxWidth: '85%' }}>
          {message.attachments.map((fileName) => (
            <Chip
              key={fileName}
              size="small"
              variant="outlined"
              icon={<AttachFileIcon />}
              label={fileName}
              sx={{ maxWidth: '100%', bgcolor: 'background.paper' }}
            />
          ))}
        </Box>
      )}

      {editing ? (
        <Box
          component="form"
          aria-label="Edit message"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          sx={{
            width: '100%',
            maxWidth: 560,
            border: 1,
            borderColor: 'primary.main',
            borderRadius: 3,
            bgcolor: 'background.paper',
            px: 1.5,
            pt: 1,
            pb: 0.75,
          }}
        >
          <InputBase
            inputRef={inputRef}
            id={editId}
            multiline
            fullWidth
            maxRows={8}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            inputProps={{ 'aria-label': 'Edit your message' }}
            sx={{ fontSize: '0.95rem', lineHeight: 1.6 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75, mt: 0.75 }}>
            <Button size="small" variant="text" onClick={cancel}>Cancel</Button>
            <Button size="small" variant="contained" type="submit" disabled={!trimmed}>Save &amp; resend</Button>
          </Box>
        </Box>
      ) : (
        message.text && (
          <Box
            sx={{
              maxWidth: '85%',
              px: 1.75,
              py: 1,
              borderRadius: 3,
              borderBottomRightRadius: 6,
              bgcolor: 'action.selected',
              color: 'text.primary',
              fontSize: '0.95rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {message.text}
          </Box>
        )
      )}

      {!editing && <MessageActions actions={actions} align="end" label="Message actions" />}
    </Box>
  );
}
