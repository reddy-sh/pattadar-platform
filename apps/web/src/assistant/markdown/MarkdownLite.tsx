/** A small markdown renderer: model text is data, rendered as React text nodes, never HTML. */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';

export function renderInline(text: string, keyBase: string): ReactNode[] {
  const output: ReactNode[] = [];
  const parts = text.replace(/<\/?sub>/g, '').split(/(\*\*[^*]+\*\*|`[^`]+`|(?<![\w])_[^_]+_(?![\w]))/g);
  parts.forEach((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      output.push(<strong key={`${keyBase}-${index}`}>{part.slice(2, -2)}</strong>);
    } else if (/^_[^_]+_$/.test(part)) {
      output.push(<em key={`${keyBase}-${index}`}>{part.slice(1, -1)}</em>);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      output.push(
        <Box
          key={`${keyBase}-${index}`}
          component="code"
          sx={{ fontSize: '0.85em', px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}
        >
          {part.slice(1, -1)}
        </Box>,
      );
    } else if (part) {
      output.push(part);
    }
  });
  return output;
}

export const TABLE_LINE = /^\s*\|.*\|\s*$/;
export const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

export const tableSx = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.8rem',
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
  '& th, & td': { px: 1, py: 0.6, borderBottom: 1, borderColor: 'divider', textAlign: 'left', verticalAlign: 'top' },
  '& th': { position: 'sticky', top: 0, bgcolor: 'background.paper', fontWeight: 700, zIndex: 1 },
  '& tbody tr:nth-of-type(even)': { bgcolor: 'action.hover' },
  '& td.num, & th.num': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  '& td.wrap': { whiteSpace: 'normal', minWidth: 200, maxWidth: 360 },
} as const;

export function MarkdownTable({ lines, keyBase }: { lines: string[]; keyBase: string }) {
  const [header, ...body] = lines.filter((line) => !TABLE_RULE.test(line)).map(tableCells);
  if (!header) return null;
  return (
    <Box sx={{ overflowX: 'auto', my: 0.75, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
      <Box component="table" sx={tableSx}>
        <thead>
          <tr>{header.map((cell, index) => <th key={index}>{renderInline(cell, `${keyBase}-h${index}`)}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {header.map((_, cellIndex) => (
                <td key={cellIndex}>{renderInline(row[cellIndex] ?? '', `${keyBase}-${rowIndex}-${cellIndex}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

export function MarkdownLite({ text }: { text: string }) {
  const blocks: Array<{ table: string[] } | { line: string }> = [];
  for (const line of text.split('\n')) {
    const last = blocks.at(-1);
    if (TABLE_LINE.test(line)) {
      if (last && 'table' in last) last.table.push(line);
      else blocks.push({ table: [line] });
    } else {
      blocks.push({ line });
    }
  }
  return (
    <>
      {blocks.map((block, index) => {
        if ('table' in block) {
          return block.table.length > 1
            ? <MarkdownTable key={index} lines={block.table} keyBase={`table-${index}`} />
            : <Box key={index}>{block.table[0]}</Box>;
        }
        const line = block.line;
        const bullet = /^\s*[-*]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-*]\s+/, '') : line;
        const rule = /^\s*(-{3,}|\*{3,})\s*$/.test(line);
        if (rule) return <Divider key={index} sx={{ my: 1 }} />;
        const quote = /^\s*>\s?/.test(content);
        const heading = /^#{1,6}\s+/.test(content);
        const unquoted = quote ? content.replace(/^\s*>\s?/, '') : content;
        const clean = heading ? unquoted.replace(/^#{1,6}\s+/, '') : unquoted;
        return (
          <Box
            key={index}
            sx={{
              display: 'flex', gap: 0.75, minHeight: line.trim() ? undefined : '0.6em',
              ...(quote ? { borderLeft: 3, borderColor: 'divider', pl: 1, color: 'text.secondary' } : {}),
            }}
          >
            {bullet && <Box component="span">•</Box>}
            <Box component="span" sx={heading ? { fontWeight: 700 } : undefined}>
              {heading ? clean : renderInline(clean, `line-${index}`)}
            </Box>
          </Box>
        );
      })}
    </>
  );
}
