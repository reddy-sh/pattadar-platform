/** A fenced code block: language label, Copy button, horizontally scrollable text. Text only, never HTML. */
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined';
import type { Theme } from '@mui/material/styles';
import { copyText } from '../clipboard';

const COPIED_MS = 1600;

function languageLabel(language: string | undefined): string {
  if (!language) return 'Code';
  const clean = language.replace(/[^\w+#.-]/g, '').slice(0, 24);
  return clean || 'Code';
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const onCopy = async () => {
    const ok = await copyText(code.replace(/\n$/, ''));
    if (!ok) return;
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  const label = languageLabel(language);
  return (
    <Box
      sx={{
        my: 1.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'action.hover',
        maxWidth: '100%',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          pl: 1.5,
          pr: 0.5,
          py: 0.25,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', textTransform: 'lowercase', letterSpacing: '0.02em' }}>
          {label}
        </Box>
        <ButtonBase
          onClick={() => void onCopy()}
          aria-label={copied ? 'Copied' : `Copy ${label === 'Code' ? 'code' : label} to clipboard`}
          sx={(theme: Theme) => ({
            gap: 0.5,
            px: 1,
            py: 0.5,
            borderRadius: 999,
            fontSize: '0.75rem',
            color: copied ? 'success.main' : 'text.secondary',
            '&:hover': { bgcolor: 'action.hover', color: copied ? 'success.main' : 'text.primary' },
            '&:focus-visible': {
              outline: `2px solid ${(theme.vars ?? theme).palette.focus ?? (theme.vars ?? theme).palette.primary.main}`,
              outlineOffset: 1,
            },
            '& svg': { fontSize: '0.95rem' },
          })}
        >
          {copied ? <CheckIcon /> : <ContentCopyIcon />}
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </ButtonBase>
      </Box>
      <Box
        component="pre"
        tabIndex={0}
        aria-label={`${label} block`}
        sx={(theme: Theme) => ({
          m: 0,
          px: 1.5,
          py: 1.25,
          overflowX: 'auto',
          fontSize: '0.8125rem',
          lineHeight: 1.6,
          whiteSpace: 'pre',
          tabSize: 2,
          fontVariantNumeric: 'tabular-nums',
          '&:focus-visible': {
            outline: `2px solid ${(theme.vars ?? theme).palette.focus ?? (theme.vars ?? theme).palette.primary.main}`,
            outlineOffset: -2,
          },
        })}
      >
        <code>{code}</code>
      </Box>
    </Box>
  );
}
