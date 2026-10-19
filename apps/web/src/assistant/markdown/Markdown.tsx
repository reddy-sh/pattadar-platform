/**
 * The assistant's markdown renderer (GFM: tables, strikethrough, task lists, autolinks).
 *
 * Model and deed text is data, never HTML: there is no rehype-raw, raw HTML is
 * shown as plain text (a lone `<sub>`-style tag is dropped), images are never
 * fetched (their alt text shows instead), and links survive only as http(s),
 * opening in a new tab with rel="noreferrer noopener".
 *
 * While `streaming`, the text is first stabilised so half-written markdown
 * does not flash: an incomplete trailing table row or a table whose divider
 * row has not arrived is held back, a lone trailing `-`/`=` line (which would
 * briefly turn the paragraph above into a heading) is held back, and an
 * unclosed `**` or backtick in the last paragraph is closed provisionally. An
 * unterminated code fence already renders as a code block to the end.
 */
import { memo, useDeferredValue, useMemo, type CSSProperties, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import type { SxProps, Theme } from '@mui/material/styles';
import { tableSx } from './MarkdownLite';
import { CodeBlock } from './CodeBlock';
import { StreamingCaret } from './StreamingCaret';

/* ── Minimal hast shapes (react-markdown hands these to components and plugins) ── */

interface HastText { type: 'text'; value: string }
interface HastElement {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}
interface HastRoot { type: 'root'; children: HastNode[] }
type HastNode = HastText | HastElement | HastRoot | { type: string; children?: HastNode[]; value?: string };

function hastText(node: HastNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return (node as HastText).value;
  const children = (node as { children?: HastNode[] }).children;
  return children ? children.map(hastText).join('') : '';
}

/* ── Safety ── */

const SAFE_URL = /^https?:\/\//i;

/** Only absolute http(s) URLs survive; everything else (javascript:, data:, relative, #) is dropped. */
function safeUrl(url: string): string {
  const trimmed = url.trim();
  return SAFE_URL.test(trimmed) ? trimmed : '';
}

/** A lone formatting tag (`<sub>`, `</b>`, `<br/>`) the model sometimes emits: dropped. */
const LONE_TAG = /^<\/?(sub|sup|b|i|u|em|strong|small|span|br|mark)(\s[^<>]*)?\/?>$/i;

interface MdastNode { type: string; value?: string; children?: MdastNode[] }

/**
 * Raw HTML in model text becomes visible text (never markup): mdast `html`
 * nodes turn into `text` nodes, except a lone formatting tag, which is dropped.
 */
function remarkHtmlAsText() {
  const walk = (node: MdastNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child): MdastNode[] => {
      if (child.type !== 'html') {
        walk(child);
        return [child];
      }
      const value = (child.value ?? '').trim();
      if (!value || LONE_TAG.test(value)) return [];
      const text: MdastNode = { type: 'text', value: child.value ?? '' };
      // A block of HTML sits where a paragraph would; give it one so it keeps prose spacing.
      return [node.type === 'root' || node.type === 'blockquote' || node.type === 'listItem'
        ? { type: 'paragraph', children: [text] }
        : text];
    });
  };
  return (tree: MdastNode) => walk(tree);
}

/* ── Streaming stabiliser ── */

const TABLE_ROW = /^\s*\|/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function stabilise(text: string): string {
  const lines = text.split('\n');
  // Fence state: an open fence means the tail is code, which renders fine as is.
  let inFence = false;
  for (const line of lines) if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
  if (inFence) return text;

  // A trailing setext underline in progress would flip the paragraph into a heading.
  const last = lines.at(-1) ?? '';
  if (lines.length > 1 && /^\s*[-=]{1,2}\s*$/.test(last)) lines.pop();

  // The trailing run of table rows.
  // A finished line (text ends in a newline) leaves an empty last entry; skip it.
  const end = lines.at(-1) === '' ? lines.length - 1 : lines.length;
  let start = end;
  while (start > 0 && TABLE_ROW.test(lines[start - 1])) start -= 1;
  if (start < end) {
    const run = lines.slice(start, end);
    const lastLineOpen = end === lines.length;
    // The divider must be complete: a half-typed one with fewer cells than the header is not a table yet.
    const hasDivider = run.length >= 2 && TABLE_DIVIDER.test(run[1]) && (run.length > 2 || !lastLineOpen);
    if (!hasDivider) {
      lines.splice(start);
    } else if (lastLineOpen && run.length > 2 && !/\|\s*$/.test(run[run.length - 1])) {
      lines.pop();
    }
  }

  let out = lines.join('\n');

  // Provisionally close an unbalanced `**` or backtick in the last paragraph.
  const paraStart = out.lastIndexOf('\n\n') + 1;
  const para = out.slice(paraStart);
  if (!TABLE_ROW.test(para)) {
    const ticks = (para.match(/`/g) ?? []).length;
    if (ticks % 2 === 1) out += '`';
    else {
      const bold = (para.replace(/`[^`]*`/g, '').match(/\*\*/g) ?? []).length;
      if (bold % 2 === 1 && !/\*\*\s*$/.test(para)) out += '**';
    }
  }
  return out;
}

/* ── Caret plugin: append a marker to the deepest last text-bearing element ── */

const CARET_CLASS = 'pattadar-md-caret';
const DESCEND = new Set([
  'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'strong', 'em', 'del', 'a',
]);
const NO_CARET_AFTER = new Set(['pre', 'hr']);

function rehypeCaret() {
  return (tree: HastRoot) => {
    let parent: HastRoot | HastElement = tree;
    for (;;) {
      const meaningful: HastNode[] = parent.children.filter(
        (child: HastNode) => child.type === 'element' || (child.type === 'text' && (child as HastText).value.trim() !== ''),
      );
      const lastChild = meaningful.at(-1);
      if (lastChild && lastChild.type === 'element' && DESCEND.has((lastChild as HastElement).tagName)) {
        parent = lastChild as HastElement;
        continue;
      }
      // After a code block or a rule there is no line to sit on: an inline caret
      // would open a new line that vanishes when streaming ends. Skip it.
      if (lastChild && lastChild.type === 'element' && NO_CARET_AFTER.has((lastChild as HastElement).tagName)) return;
      break;
    }
    parent.children.push({ type: 'element', tagName: 'span', properties: { className: [CARET_CLASS] }, children: [] });
  };
}

/* ── Element styles ── */

const PROSE_MEASURE = '72ch';

const rootSx: SxProps<Theme> = {
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  lineHeight: 1.65,
  fontSize: 'inherit',
  color: 'text.primary',
  // The first block, spelt `:not(* + *)` (an element with no element before
  // it). Emotion logs a console.error for `:first-child` on every first render
  // — it is unsafe under server rendering, where emotion's own <style> tags can
  // be the first child — and that error failed every assistant answer under
  // the e2e console guard. src/emotionSelectors.test.ts keeps it out.
  '& > :not(* + *)': { mt: 0 },
  '& > :last-child': { mb: 0 },
  '& p, & ul, & ol, & blockquote, & h1, & h2, & h3, & h4, & h5, & h6': { maxWidth: PROSE_MEASURE },
  '& p': { my: 0.75 },
  '& ul, & ol': { my: 0.75, pl: 2.75 },
  '& li': { my: 0.375, pl: 0.25 },
  '& li > p': { my: 0.25 },
  '& li > ul, & li > ol': { my: 0.25 },
  '& li::marker': { color: 'text.secondary' },
  '& ul.contains-task-list': { listStyle: 'none', pl: 0.5 },
  '& strong': { fontWeight: 700 },
  '& del': { color: 'text.secondary' },
};

const headingSx = (fontSize: string, mt: number): SxProps<Theme> => ({
  fontSize,
  fontWeight: 700,
  lineHeight: 1.35,
  mt,
  mb: 0.5,
});

const linkSx = (theme: Theme) => {
  const palette = (theme.vars ?? theme).palette;
  return {
    color: 'primary.main',
    textDecorationColor: 'currentColor',
    textUnderlineOffset: '2px',
    borderRadius: '2px',
    '&:focus-visible': { outline: `2px solid ${palette.focus ?? palette.primary.main}`, outlineOffset: 2 },
  };
};

const NUMERIC_CELL = /^[\s₹$+\-–(]*\d[\d,]*(\.\d+)?\s*(%|\)|L|Cr|lakh|lakhs|crore|crores|acres?|guntas?|sq\.?\s?(ft|yd|m))?\s*$/i;

function alignClass(node: HastNode | undefined): string | undefined {
  return NUMERIC_CELL.test(hastText(node)) ? 'num' : undefined;
}

function textAlign(style: unknown): CSSProperties | undefined {
  return style && typeof style === 'object' ? (style as CSSProperties) : undefined;
}

const components: Components = {
  h1: ({ children }) => <Box component="h3" sx={headingSx('1.2rem', 2)}>{children}</Box>,
  h2: ({ children }) => <Box component="h4" sx={headingSx('1.08rem', 1.75)}>{children}</Box>,
  h3: ({ children }) => <Box component="h5" sx={headingSx('1rem', 1.5)}>{children}</Box>,
  h4: ({ children }) => <Box component="h6" sx={headingSx('0.95rem', 1.25)}>{children}</Box>,
  h5: ({ children }) => <Box component="h6" sx={headingSx('0.9rem', 1.25)}>{children}</Box>,
  h6: ({ children }) => (
    <Box component="h6" sx={{ ...headingSx('0.8rem', 1.25), textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary', fontWeight: 400 }}>
      {children}
    </Box>
  ),
  p: ({ children }) => <p>{children}</p>,
  a: ({ href, children }) => {
    const url = typeof href === 'string' ? safeUrl(href) : '';
    if (!url) return <span>{children}</span>;
    return (
      <Link href={url} target="_blank" rel="noreferrer noopener" underline="always" sx={linkSx}>
        {children}
      </Link>
    );
  },
  img: ({ alt }) => (alt ? <Box component="span" sx={{ color: 'text.secondary' }}>{alt}</Box> : null),
  blockquote: ({ children }) => (
    <Box
      component="blockquote"
      sx={{
        mx: 0,
        my: 1,
        pl: 1.5,
        py: 0.25,
        borderLeft: 3,
        borderColor: 'divider',
        color: 'text.secondary',
        '& > p': { my: 0.5 },
      }}
    >
      {children}
    </Box>
  ),
  hr: () => <Divider sx={{ my: 1.75 }} />,
  code: ({ children }) => (
    <Box
      component="code"
      sx={{
        fontSize: '0.875em',
        px: 0.5,
        py: '1px',
        borderRadius: 0.75,
        bgcolor: 'action.hover',
        border: 1,
        borderColor: 'divider',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </Box>
  ),
  pre: ({ node }) => {
    const codeEl = (node as HastElement | undefined)?.children.find(
      (child): child is HastElement => child.type === 'element' && (child as HastElement).tagName === 'code',
    );
    const classes = codeEl?.properties?.className;
    const languageClass = Array.isArray(classes)
      ? classes.find((name): name is string => typeof name === 'string' && name.startsWith('language-'))
      : undefined;
    return <CodeBlock code={hastText(codeEl ?? node as HastNode)} language={languageClass?.slice('language-'.length)} />;
  },
  table: ({ children }) => (
    <Box
      role="region"
      aria-label="Table"
      tabIndex={0}
      sx={(theme: Theme) => ({
        overflowX: 'auto',
        my: 1.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        maxWidth: '100%',
        '&:focus-visible': {
          outline: `2px solid ${(theme.vars ?? theme).palette.focus ?? (theme.vars ?? theme).palette.primary.main}`,
          outlineOffset: 2,
        },
      })}
    >
      <Box
        component="table"
        sx={{
          ...tableSx,
          '& td': { minWidth: 72, maxWidth: 360, whiteSpace: 'normal', overflowWrap: 'normal', wordBreak: 'normal' },
          '& td.num': { whiteSpace: 'nowrap' },
          '& tbody tr:last-of-type td': { borderBottom: 0 },
        }}
      >
        {children}
      </Box>
    </Box>
  ),
  th: ({ children, node, style }) => (
    <th className={alignClass(node as HastNode)} style={textAlign(style)}>{children}</th>
  ),
  td: ({ children, node, style }) => (
    <td className={alignClass(node as HastNode)} style={textAlign(style)}>{children}</td>
  ),
  input: ({ checked, type }) => (type === 'checkbox'
    ? (
      <Box
        component="input"
        type="checkbox"
        checked={Boolean(checked)}
        disabled
        readOnly
        aria-label={checked ? 'Done' : 'Not done'}
        sx={(theme: Theme) => ({ m: 0, mr: 0.75, verticalAlign: '-0.1em', accentColor: (theme.vars ?? theme).palette.primary.main })}
      />
    )
    : null),
  span: ({ className, children }) => (className === CARET_CLASS ? <StreamingCaret /> : <span className={className}>{children}</span>),
};

const remarkPlugins = [remarkGfm, remarkHtmlAsText];
const streamingRehypePlugins = [rehypeCaret];
const noRehypePlugins: [] = [];

const MarkdownBody = memo(function MarkdownBody({ source, caret }: { source: string; caret: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={caret ? streamingRehypePlugins : noRehypePlugins}
      components={components}
      skipHtml
      urlTransform={safeUrl}
    >
      {source}
    </ReactMarkdown>
  );
});

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }): ReactNode {
  // Under load React may skip intermediate streamed frames instead of queueing them.
  const deferred = useDeferredValue(text);
  const live = streaming ? deferred : text;
  const source = useMemo(() => (streaming ? stabilise(live) : live), [live, streaming]);
  return (
    <Box sx={rootSx} className="pattadar-markdown assistant-wide">
      <MarkdownBody source={source} caret={Boolean(streaming)} />
    </Box>
  );
}
