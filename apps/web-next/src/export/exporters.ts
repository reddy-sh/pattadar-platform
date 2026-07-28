/**
 * Table exporters — CSV, Excel (.xlsx) and a branded, watermarked corporate A4
 * PDF report (ported from the predecessor design-system exporters.ts; the data-prep
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
