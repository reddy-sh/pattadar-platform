import { describe, expect, test } from 'bun:test';
import { deflateSync, inflateSync } from 'node:zlib';
import { readGeoPdf } from './geoPdf';

const inflate = async (d: Uint8Array) => new Uint8Array(inflateSync(d));
const enc = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

// A 1000 × 1000 pt viewport over 0.01° × 0.01° near 16.5 N, 79.4 E: the same
// shape QGIS writes — GPTS as lat/lon pairs for the LPTS corners of the box.
const MEASURE = '<< /Type /Measure /Subtype /GEO /Bounds [0 1 0 0 1 0 1 1]'
  + ' /GPTS [16.51 79.40 16.50 79.40 16.50 79.41 16.51 79.41]'
  + ' /LPTS [0 1 0 0 1 0 1 1] /GCS 9 0 R >>';

// Two fields side by side, drawn QGIS-style as one two-point path per side,
// plus the sheet frame, a graticule line and a filled glyph that must be ignored.
// Not level-and-plumb squares: those are what a frame or a graticule cell
// looks like, and are dropped as such. Real fields lean.
const LINES = [
  [100, 100, 400, 110], [400, 110, 700, 100], [700, 100, 710, 400], [710, 400, 400, 410],
  [400, 410, 90, 400], [90, 400, 100, 100], [400, 110, 400, 410],
];
const content = [
  'q 1 0 0 1 0 0 cm 7.8 w 0 0 0 RG',
  ...LINES.map(([a, b, c, d]) => `${a} ${b} m ${c} ${d} l S`),
  '0.5 w 0 0 0 RG 0 0 1000 1000 re S 0 500 m 1000 500 l S',
  '0 0 0 rg 10 10 m 20 10 l 20 20 l h f',
  'BT /F1 12 Tf (Sy 1 (a) \\) note) Tj ET Q',
].join('\n');

function pdf(opts: { geo?: boolean; deflate?: boolean } = {}): Uint8Array {
  const body = opts.deflate ? Buffer.from(deflateSync(Buffer.from(content, 'latin1'))).toString('latin1') : content;
  const filter = opts.deflate ? ' /Filter /FlateDecode' : '';
  const vp = opts.geo === false ? '' : ' /VP [ 8 0 R ]';
  return enc([
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 1000] /Contents 4 0 R${vp} >> endobj`,
    `4 0 obj << /Length ${body.length}${filter} >>\nstream\n${body}\nendstream\nendobj`,
    '8 0 obj << /Type /Viewport /BBox [0 0 1000 1000] /Measure 7 0 R >> endobj',
    `7 0 obj ${MEASURE} endobj`,
    '9 0 obj << /Type /PROJCS /EPSG 32644 >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n'));
}

describe('readGeoPdf', () => {
  test('closes the stroked lines into one outline per field, georeferenced', async () => {
    const r = await readGeoPdf(pdf(), inflate);
    expect(r?.epsg).toBe(32644);
    // The frame and the graticule are page furniture, not fields.
    expect(r?.outlines).toHaveLength(2);
    for (const o of r!.outlines) {
      expect(o.ring).toHaveLength(4);
      // Page y=100 is 10% up a box whose top is 16.51°: 16.501°.
      expect(Math.min(...o.ring.map((p) => p[0]))).toBeCloseTo(16.501, 6);
      // ~300 pt × ~300 pt of a 1000 pt box over ~1.1 km: roughly 26 acres.
      expect(o.areaAc).toBeGreaterThan(24);
      expect(o.areaAc).toBeLessThan(29);
    }
    // The shared side is one line on the sheet and a side of both outlines.
    const shared = (o: { ring: Array<[number, number]> }) =>
      o.ring.filter(([, lon]) => Math.abs(lon - 79.404) < 1e-9).length;
    expect(r!.outlines.map(shared)).toEqual([2, 2]);
    const west = r!.outlines.map((o) => Math.min(...o.ring.map((p) => p[1]))).sort();
    expect(west[0]).toBeCloseTo(79.4009, 6);
    expect(west[1]).toBeCloseTo(79.404, 6);
  });

  test('reads a Flate-compressed page the same way', async () => {
    const r = await readGeoPdf(pdf({ deflate: true }), inflate);
    expect(r?.outlines).toHaveLength(2);
  });

  test('a PDF with no georeference yields nothing rather than a guess', async () => {
    expect(await readGeoPdf(pdf({ geo: false }), inflate)).toBeNull();
    expect(await readGeoPdf(enc('not a pdf'), inflate)).toBeNull();
  });
});
