/**
 * The markdown renderer, loaded on demand. react-markdown + remark-gfm (and
 * micromark beneath them) are tens of KB that every /app page would otherwise
 * download with the shell, even when the assistant is never opened. The panel
 * calls preloadMarkdown() when it opens, so the first reply rarely waits.
 */
import { Suspense, lazy, type ReactNode } from 'react';
import Box from '@mui/material/Box';

const load = () => import('./Markdown');
const LoadedMarkdown = lazy(() => load().then((module) => ({ default: module.Markdown })));

export function preloadMarkdown(): void {
  void load().catch(() => undefined);
}

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }): ReactNode {
  return (
    <Suspense fallback={<Box sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.65 }}>{text}</Box>}>
      <LoadedMarkdown text={text} streaming={streaming} />
    </Suspense>
  );
}
