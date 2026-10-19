/**
 * Table exporters — CSV, Excel (.xlsx) and a branded, watermarked corporate A4
 * PDF report (ported from the rhub design-system exporters.ts; the data-prep
 * half lives in @pattadar/core). jsPDF / xlsx are lazy-imported so they only
 * load when the user actually exports (keeps the initial chunk lean).
 */
import { buildCsv, buildMatrix, exportStamp } from '@pattadar/core';
import type { ExportBrand, ExportCol } from '@pattadar/core';

export type { ExportBrand, ExportCol };

const RED: [number, number, number] = [176, 34, 28];
const INK: [number, number, number] = [33, 37, 41];
const MUTE: [number, number, number] = [120, 120, 120];

// ── CSV ────────────────────────────────────────────────────────────────
export function exportCsv<T>(filename: string, cols: ExportCol<T>[], rows: T[]): void {
  const body = buildCsv(cols, rows);
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}

// ── Excel (.xlsx) ────────────────────────────────────────────────────────
export async function exportExcel<T>(
  filename: string,
  brand: ExportBrand,
  cols: ExportCol<T>[],
  rows: T[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const { head, body } = buildMatrix(cols, rows);
  const aoa: (string | number)[][] = [
    [brand.title],
    [`${brand.subtitle || brand.brand} · Generated ${exportStamp()} · ${rows.length} record(s)`],
    [],
    head,
    ...body,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(12, c.title.length + 4) }));
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, cols.length - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, cols.length - 1) } },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, brand.title.slice(0, 28) || 'Sheet1');
  XLSX.writeFile(wb, filename);
}

// ── Branded PDF (corporate A4) ───────────────────────────────────────────
export async function exportPdf<T>(
  filename: string,
  brand: ExportBrand,
  cols: ExportCol<T>[],
  rows: T[],
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const stamp = exportStamp();
  const { head, body } = buildMatrix(cols, rows);

  const drawHeader = () => {
    // brand logo tile
    doc.setFillColor(...RED);
    doc.roundedRect(30, 26, 26, 26, 5, 5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(brand.brand.slice(0, 1).toUpperCase(), 43, 44, { align: 'center' });
    // brand name + subtitle
    doc.setTextColor(...INK);
    doc.setFontSize(15);
    doc.text(brand.brand, 64, 40);
    if (brand.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTE);
      doc.text(brand.subtitle, 64, 51);
    }
    // report title + meta (right aligned)
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(brand.title, W - 30, 38, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTE);
    doc.text(`Generated ${stamp}  ·  ${rows.length} record(s)`, W - 30, 51, { align: 'right' });
    // rule
    doc.setDrawColor(...RED);
    doc.setLineWidth(1.2);
    doc.line(30, 60, W - 30, 60);
  };

  const drawWatermark = () => {
    const wm = (brand.watermark || brand.brand).toUpperCase();
    try {
      doc.saveGraphicsState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.setGState(new (doc as any).GState({ opacity: 0.06 }));
    } catch {
      /* older jsPDF */
    }
    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(120);
    doc.text(wm, W / 2, H / 2 + 40, { align: 'center', angle: 28 });
    try {
      doc.restoreGraphicsState();
    } catch {
      /* */
    }
  };

  const drawFooter = (page: number, total: number) => {
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.6);
    doc.line(30, H - 34, W - 30, H - 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTE);
    doc.text(`Confidential · ${brand.brand} Land Records`, 30, H - 22);
    doc.text(`Page ${page} of ${total}`, W / 2, H - 22, { align: 'center' });
    doc.text(stamp, W - 30, H - 22, { align: 'right' });
  };

  autoTable(doc, {
    head: [head],
    body,
    startY: 72,
    margin: { top: 72, bottom: 44, left: 30, right: 30 },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', lineColor: [235, 235, 235], lineWidth: 0.5 },
    headStyles: { fillColor: RED, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [250, 247, 246] },
    didDrawPage: () => {
      drawWatermark();
      drawHeader();
    },
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawFooter(i, total);
  }
  doc.save(filename);
}

// ── Markdown report PDF (assistant-generated reports) ───────────────────
/** jsPDF's built-in fonts are WinAnsi: no ₹, no smart quotes, no emoji. */
export function pdfSafe(text: string): string {
  return text
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/→/g, 'to')
    .replace(/≈/g, '~')
    .replace(/<\/?sub>/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[·•]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

/**
 * A Markdown report (headings, paragraphs, bullets, quotes and pipe tables) as
 * a branded A4 PDF. Only the subset the assistant's report generator emits is
 * understood; anything else is printed as plain text, never interpreted.
 */
export async function exportMarkdownPdf(filename: string, brand: ExportBrand, markdown: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const left = 40;
  const width = W - 80;
  const stamp = exportStamp();
  let y = 72;

  const header = () => {
    doc.setFillColor(...RED);
    doc.roundedRect(left, 26, 22, 22, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(brand.brand.slice(0, 1).toUpperCase(), left + 11, 41.5, { align: 'center' });
    doc.setTextColor(...INK);
    doc.setFontSize(13);
    doc.text(pdfSafe(brand.title), left + 30, 41);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTE);
    doc.text(`Generated ${stamp}`, W - left, 41, { align: 'right' });
    doc.setDrawColor(...RED);
    doc.setLineWidth(1);
    doc.line(left, 54, W - left, 54);
  };
  const ensure = (needed: number) => {
    if (y + needed > H - 50) {
      doc.addPage();
      header();
      y = 72;
    }
  };
  const write = (text: string, size: number, style: 'normal' | 'bold' | 'italic', color = INK, indent = 0) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const plain = text.replace(/\*\*|`/g, '').replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, '$1$2');
    const lines = doc.splitTextToSize(pdfSafe(plain), width - indent) as string[];
    for (const line of lines) {
      ensure(size * 1.35);
      doc.text(line, left + indent, y);
      y += size * 1.35;
    }
  };

  header();
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      i--;
      const rows = block
        .filter((row) => !/^\s*\|?\s*:?-{3,}/.test(row))
        .map((row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => pdfSafe(cell.trim().replace(/\*\*|`/g, ''))));
      if (!rows.length) continue;
      autoTable(doc, {
        head: [rows[0]],
        body: rows.slice(1),
        startY: y,
        margin: { left, right: left, top: 72, bottom: 50 },
        styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak', lineColor: [235, 235, 235], lineWidth: 0.5 },
        headStyles: { fillColor: RED, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 247, 246] },
        didDrawPage: (data) => { if (data.pageNumber > 1) header(); },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 12;
    } else if (/^#{1,6}\s+/.test(line)) {
      y += 4;
      write(line.replace(/^#{1,6}\s+/, ''), /^#\s/.test(line) ? 14 : 11, 'bold');
      y += 2;
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      ensure(10);
      doc.setDrawColor(225, 225, 225);
      doc.line(left, y, W - left, y);
      y += 10;
    } else if (/^\s*>\s?/.test(line)) {
      write(line.replace(/^\s*>\s?/, ''), 8.5, 'italic', MUTE, 8);
    } else if (/^\s*[-*]\s+/.test(line)) {
      write(`- ${line.replace(/^\s*[-*]\s+/, '')}`, 9, 'normal', INK, 8);
    } else if (line.trim()) {
      write(line, 9, 'normal');
    } else {
      y += 6;
    }
  }

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTE);
    doc.text(
      'Historical public records for reference only. May contain errors and may not be accurate; not proof of identity, '
        + 'ownership or title. Pattadar is not responsible for decisions made on it - verify with official IGRS records.',
      left, H - 26, { maxWidth: W - 2 * left - 70 },
    );
    doc.text(`Page ${page} of ${total}`, W - left, H - 22, { align: 'right' });
  }
  doc.save(filename);
}

// ── shared ───────────────────────────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
