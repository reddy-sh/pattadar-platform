/**
 * The chat composer: one rounded frame holding pending attachment chips, an
 * auto-growing message box (1 → 8 lines, then it scrolls), and a bottom row
 * with the attach button, the caller's model picker and Send — which becomes
 * Stop while a reply streams.
 *
 * Presentational only: the shell owns the text, the upload and the stream.
 */
import { useRef } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactNode, Ref } from 'react';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import type { AttachmentSelection } from '../types';

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  uploading: boolean;
  incognito: boolean;
  attachments: AttachmentSelection[];
  onRemoveAttachment: (id: string) => void;
  onPickFiles: (files: File[]) => void;
  /** Rendered bottom-left inside the frame, after the attach button (the model picker). */
  modelSlot?: ReactNode;
  placeholder?: string;
  /** The message box, so the shell can hand focus back to it. */
  inputRef?: Ref<HTMLTextAreaElement>;
}

const focusRing = {
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

export function Composer({
  value, onChange, onSend, onStop, busy, uploading, incognito,
  attachments, onRemoveAttachment, onPickFiles, modelSlot, placeholder = 'Ask about Pattadar…', inputRef,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = !busy && !uploading && value.trim().length > 0;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // An IME (Telugu, Hindi, …) confirms its candidate with Enter; that Enter
    // belongs to the composition, not to Send. keyCode 229 covers Safari, which
    // reports the confirming keydown after compositionend.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (canSend) onSend();
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file again still fires a change.
    event.target.value = '';
    if (files.length) onPickFiles(files);
  }

  return (
    <Box
      sx={(theme) => ({
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.paper',
        px: 1,
        pt: 0.75,
        pb: 0.5,
        transition: theme.transitions.create(['border-color', 'box-shadow'], { duration: 120 }),
        '&:focus-within': { borderColor: 'primary.main' },
      })}
    >
      {attachments.length > 0 && (
        <Box component="ul" aria-label="Attached files" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, listStyle: 'none', m: 0, p: 0, px: 0.5, pt: 0.25, pb: 0.5 }}>
          {attachments.map((attachment) => (
            <Box component="li" key={attachment.id} sx={{ maxWidth: '100%', minWidth: 0 }}>
              <Chip
                size="small"
                variant="outlined"
                icon={<AttachFileIcon />}
                label={attachment.fileName}
                onDelete={busy ? undefined : () => onRemoveAttachment(attachment.id)}
                sx={{ maxWidth: '100%' }}
              />
            </Box>
          ))}
        </Box>
      )}

      <InputBase
        inputRef={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        multiline
        minRows={1}
        maxRows={8}
        fullWidth
        sx={{
          px: 0.75,
          py: 0.5,
          fontSize: '0.95rem',
          lineHeight: 1.55,
          alignItems: 'flex-start',
          '& textarea': { overflowWrap: 'anywhere' },
        }}
        inputProps={{ 'aria-label': 'Message the Pattadar Assistant' }}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, minWidth: 0 }}>
        <input ref={fileInputRef} hidden type="file" multiple onChange={handleFiles} />
        <Tooltip title={incognito ? 'Attachments are off in incognito — uploading stores the file' : 'Attach documents or images'}>
          <span>
            <IconButton
              size="small"
              aria-label="Attach files"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading || incognito}
              sx={focusRing}
            >
              {uploading ? <CircularProgress size={18} aria-label="Uploading" /> : <AttachFileIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        {modelSlot && <Box sx={{ minWidth: 0, flex: '0 1 auto', display: 'flex', alignItems: 'center' }}>{modelSlot}</Box>}
        <Box sx={{ flex: 1 }} />
        {busy ? (
          <Tooltip title="Stop generating">
            <IconButton
              size="small"
              aria-label="Stop generating"
              onClick={onStop}
              sx={{
                width: 32, height: 32,
                bgcolor: 'text.primary', color: 'background.paper',
                '&:hover': { bgcolor: 'text.secondary' },
                ...focusRing,
              }}
            >
              <StopRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <IconButton
            size="small"
            aria-label="Send message"
            onClick={onSend}
            disabled={!canSend}
            sx={{
              width: 32, height: 32,
              bgcolor: 'primary.main', color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
              ...focusRing,
            }}
          >
            <ArrowUpwardRoundedIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
