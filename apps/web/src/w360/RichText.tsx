/** Rich text for owner-written prose (a property's Notes).
 *
 *  Stored as plain Markdown in the same text column it always was, so a note
 *  stays legible wherever it is shown raw — the phone, an export, the audit
 *  log — and every note filed before formatting existed is already valid.
 *
 *  Only the subset the toolbar writes is drawn: headings, **bold**, *italic*
 *  (asterisks only — `_` stays literal, so file names like sale_deed_2019.pdf
 *  survive),
 *  bulleted and numbered lists, and http(s) links. Text is never parsed as
 *  HTML; everything renders as React elements, so a pasted `<script>` is just
 *  words. A single newline is a line break, as it was in the plain box.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import FormatBoldOutlined from '@mui/icons-material/FormatBoldOutlined';
import FormatItalicOutlined from '@mui/icons-material/FormatItalicOutlined';
import TitleOutlined from '@mui/icons-material/TitleOutlined';
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined';
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';

import { Segmented } from './ui';

export type RichBlock =
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number }
  | { kind: 'p'; lines: string[] };

const HEADING = /^#{1,6}\s+(.*)$/;
// `•` too: the AI deed summary writes its caveats that way.
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

/** Markdown source → blocks. Pure, so it is tested without a browser. */
export function richBlocks(src: string): RichBlock[] {
  const out: RichBlock[] = [];
  let open: Exclude<RichBlock, { kind: 'h' }> | null = null;
  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) { open = null; continue; }
    const h = HEADING.exec(line);
    if (h) { out.push({ kind: 'h', text: h[1].trim() }); open = null; continue; }
    const ul = BULLET.exec(line);
    const ol = ul ? null : NUMBERED.exec(line);
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      const text = ul ? ul[1] : ol![2];
      if (open && open.kind === kind) { open.items.push(text); continue; }
      // A list keeps the number it was written with: "3. …" reads 3, and a
      // line that starts with a year ("2019. Sold to …") keeps its year.
      open = ul ? { kind: 'ul', items: [text] } : { kind: 'ol', items: [text], start: Number(ol![1]) };
    } else {
      if (open && open.kind === 'p') { open.lines.push(line); continue; }
      open = { kind: 'p', lines: [line] };
    }
    out.push(open);
  }
  return out;
}

// Bold may hold an italic inside it; emphasis never opens or closes between
// two word characters (CommonMark's rule), so "30*40 ft" stays as typed. A
// link URL may hold one level of balanced parentheses (Wikipedia-style).
const BOLD = String.raw`(?<!\*)\*\*(?=\S)(?:[^*\n]|\*(?!\*))+?(?<=\S)\*\*(?!\*)`;
const ITALIC = String.raw`(?<![\w*])\*(?=[^\s*])[^*\n]*?(?<=[^\s*])\*(?![\w*])`;
const LINK = String.raw`\[[^\]\n]+\]\((?:[^()\s]|\([^()\s]*\))+\)`;
const INLINE = new RegExp(`(${BOLD}|${LINK}|${ITALIC})`, 'g');
const SAFE_URL = /^https?:\/\/\S+$/i;

/** One line's inline marks → React nodes. A link survives only as http(s). */
export function richInline(text: string): ReactNode[] {
  // A capturing split puts the marked parts at the odd indexes; the even
  // ones are plain text and are never inspected for marks.
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0 || !part) return part;
    if (part.startsWith('**')) return <strong key={i}>{richInline(part.slice(2, -2))}</strong>;
    if (part.startsWith('[')) {
      const cut = part.indexOf('](');
      const label = part.slice(1, cut);
      const url = part.slice(cut + 2, -1);
      return SAFE_URL.test(url)
        ? <a key={i} href={url} target="_blank" rel="noreferrer noopener">{label}</a>
        : <span key={i}>{label}</span>;
    }
    return <em key={i}>{part.slice(1, -1)}</em>;
  }).filter((n) => n !== '');
}

/** Draws stored rich text. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="richtext">
      {richBlocks(text).map((b, i) => {
        if (b.kind === 'h') return <h4 key={i}>{richInline(b.text)}</h4>;
        if (b.kind === 'p') {
          return (
            <p key={i}>
              {b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{richInline(l)}</span>)}
            </p>
          );
        }
        const items = b.items.map((it, j) => <li key={j}>{richInline(it)}</li>);
        return b.kind === 'ol'
          ? <ol key={i} start={b.start === 1 ? undefined : b.start}>{items}</ol>
          : <ul key={i}>{items}</ul>;
      })}
    </div>
  );
}

type Edit = { value: string; start: number; end: number };

/** Wraps the selection in a mark (`**`), drops an empty pair at the caret, or
 *  takes the mark off again when the selection already sits inside one. */
export function wrapSelection(v: string, s: number, e: number, mark: string): Edit {
  const m = mark.length;
  // Only a mark of exactly this kind: "**x**" is not italic, so Italic on a
  // bold word adds a mark rather than stripping half the bold one.
  const around = (at: number) => v.slice(at, at + m) === mark && v[at - 1] !== '*' && v[at + m] !== '*';
  if (s >= m && around(s - m) && around(e)) {
    return { value: v.slice(0, s - m) + v.slice(s, e) + v.slice(e + m), start: s - m, end: e - m };
  }
  return { value: v.slice(0, s) + mark + v.slice(s, e) + mark + v.slice(e), start: s + m, end: e + m };
}

/** Toggles a line prefix (`### `, `- `, `1. `) on every line the selection
 *  touches. Blank lines stay blank, so two paragraphs do not become one list
 *  with an empty item between them. */
export function prefixLines(v: string, s: number, e: number, kind: 'h' | 'ul' | 'ol'): Edit {
  // A selection that ends at the start of a line does not touch that line.
  const end = e > s && v[e - 1] === '\n' ? e - 1 : e;
  const from = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
  const nl = v.indexOf('\n', end);
  const to = nl === -1 ? v.length : nl;
  const re = kind === 'h' ? HEADING : kind === 'ul' ? BULLET : NUMBERED;
  const bare = (l: string) => (kind === 'ol' ? l.replace(re, '$2') : l.replace(re, '$1'));
  const lines = v.slice(from, to).split('\n');
  const filled = lines.filter((l) => l.trim());
  const allOn = filled.length > 0 && filled.every((l) => re.test(l));
  let n = 0;
  const next = lines.map((l) => {
    if (!l.trim() && lines.length > 1) return l;
    const text = re.test(l) ? bare(l) : l;
    if (allOn) return text;
    n += 1;
    return (kind === 'h' ? '### ' : kind === 'ul' ? '- ' : `${n}. `) + text;
  }).join('\n');
  return { value: v.slice(0, from) + next + v.slice(to), start: from, end: from + next.length };
}

function linkEdit(v: string, s: number, e: number): Edit {
  const text = v.slice(s, e) || 'link text';
  const at = s + text.length + 3; // past "[text]("
  return { value: `${v.slice(0, s)}[${text}](https://)${v.slice(e)}`, start: at, end: at + 8 };
}

/** A Markdown text box with a formatting toolbar, a Write · Preview switch, and
 *  a height that follows its text, so a long note is read whole while it is
 *  written rather than through a three-line slot. */
export function RichTextField({ id, label, value, onChange, placeholder, describedBy }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  describedBy?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, mode]);

  function apply(edit: (v: string, s: number, e: number) => Edit) {
    const el = box.current;
    if (!el) return;
    const next = edit(el.value, el.selectionStart, el.selectionEnd);
    onChange(next.value);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(next.start, next.end); });
  }

  const ico = { fontSize: 18 } as const;
  const tools: [string, string, ReactNode, (v: string, s: number, e: number) => Edit][] = [
    ['Bold', 'Ctrl+B', <FormatBoldOutlined sx={ico} />, (v, s, e) => wrapSelection(v, s, e, '**')],
    ['Italic', 'Ctrl+I', <FormatItalicOutlined sx={ico} />, (v, s, e) => wrapSelection(v, s, e, '*')],
    ['Heading', '', <TitleOutlined sx={ico} />, (v, s, e) => prefixLines(v, s, e, 'h')],
    ['Bulleted list', '', <FormatListBulletedOutlined sx={ico} />, (v, s, e) => prefixLines(v, s, e, 'ul')],
    ['Numbered list', '', <FormatListNumberedOutlined sx={ico} />, (v, s, e) => prefixLines(v, s, e, 'ol')],
    ['Link', '', <LinkOutlined sx={ico} />, linkEdit],
  ];

  return (
    <div className="richfield">
      <div className="richbar">
        {mode === 'write' ? (
          // A group, not role="toolbar": the buttons are ordinary tab stops,
          // and Ctrl+B / Ctrl+I work from inside the text box.
          <div className="richtools" role="group" aria-label={`Formatting for ${label}`}>
            {tools.map(([name, keys, icon, edit]) => (
              <button key={name} type="button" className="iconbtn" aria-label={name}
                      title={keys ? `${name} (${keys})` : name}
                      // Keeps the textarea's selection: a click would blur it first.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => apply(edit)}>
                {icon}
              </button>
            ))}
          </div>
        ) : <span />}
        <Segmented label={`${label} view`} value={mode} onChange={setMode}
                   options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
      </div>
      {mode === 'write' ? (
        <textarea
          ref={box} id={id} aria-label={label} aria-describedby={describedBy}
          value={value} placeholder={placeholder} rows={4}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
            const k = e.key.toLowerCase();
            if (k !== 'b' && k !== 'i') return;
            e.preventDefault();
            apply((v, s, en) => wrapSelection(v, s, en, k === 'b' ? '**' : '*'));
          }}
        />
      ) : (
        <div className="richpreview" role="region" aria-label={`${label} preview`}>
          {value.trim() ? <RichText text={value} /> : <p className="note" style={{ margin: 0 }}>Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}
