/**
 * Outlines out of a georeferenced PDF (an ISO 32000 "GeoPDF", as QGIS and ArcGIS
 * export an FMB or village map).
 *
 * Such a sheet carries no corner table for a reader to copy: the survey lines
 * are vector paths on the page, and the page itself is tied to the ground by a
 * viewport (`/VP`) whose `/Measure` maps its box to latitude/longitude. So this
 * reads the georeference, collects the stroked straight lines, closes them into
 * the faces they enclose, and returns each face as a [lat, lon] ring. Nothing is
 * sent anywhere and nothing is inferred from the drawing's text.
 *
 * What it does NOT know is which face is which survey: the labels on these
 * sheets are usually drawn as glyph outlines, not text. The caller asks the
 * owner. A face is a candidate outline, never a saved boundary.
 *
 * Deliberately narrow: classic `N 0 obj … endobj` objects, Flate or unfiltered
 * content streams, straight segments. A sheet outside that (object streams,
 * form XObjects, curves) returns fewer or no outlines rather than a guess.
 */
import { ringAreaSqM } from './landcalc';

export interface GeoPdfOutline {
  /** Open ring, [lat, lon], corner order. */
  ring: Array<[number, number]>;
  areaAc: number;
}

export interface GeoPdfReading {
  outlines: GeoPdfOutline[];
  /** The projected system the sheet was drawn in, when it says (e.g. 32644). */
  epsg: number | null;
}

/** zlib inflate, supplied by the caller: DecompressionStream in a browser,
 *  node:zlib in a test. */
export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

const SQ_M_PER_ACRE = 4046.8564224;
const MAX_SEGMENTS = 20000;
const MAX_OUTLINES = 60;
/** Endpoints closer than this (PDF points, 1/72 in) are the same corner. */
const SNAP = 0.75;

type Pt = [number, number];

interface PdfObject { dict: string; streamStart: number; streamEnd: number }

function latin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

/** Every `N G obj … endobj`, the last definition winning (incremental saves
 *  append the updated object — the georeference is often exactly that). */
function objects(text: string): Map<number, PdfObject> {
  const out = new Map<number, PdfObject>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const endObj = text.indexOf('endobj', start);
    if (endObj < 0) break;
    // A stream's bytes can contain anything, "endobj" included, so a stream
    // object ends at the endobj AFTER its endstream.
    const s = /\bstream\r?\n/.exec(text.slice(start, endObj));
    let obj: PdfObject;
    let end = endObj;
    if (s) {
      const dataStart = start + s.index + s[0].length;
      let dataEnd = text.indexOf('endstream', dataStart);
      if (dataEnd < 0) break;
      end = text.indexOf('endobj', dataEnd);
      if (end < 0) break;
      while (dataEnd > dataStart && (text[dataEnd - 1] === '\n' || text[dataEnd - 1] === '\r')) dataEnd -= 1;
      obj = { dict: text.slice(start, start + s.index), streamStart: dataStart, streamEnd: dataEnd };
    } else {
      obj = { dict: text.slice(start, endObj), streamStart: -1, streamEnd: -1 };
    }
    out.set(Number(m[1]), obj);
    re.lastIndex = end;
  }
  return out;
}

/** The balanced `<<…>>` or `[…]` starting at `at`. */
function balanced(text: string, at: number): string {
  const open = text[at] === '[' ? '[' : '<<';
  const close = open === '[' ? ']' : '>>';
  let depth = 0;
  for (let i = at; i < text.length; i += 1) {
    if (text.startsWith(open, i)) { depth += 1; i += open.length - 1; }
    else if (text.startsWith(close, i)) {
      depth -= 1;
      if (depth === 0) return text.slice(at, i + close.length);
      i += close.length - 1;
    }
  }
  return '';
}

/** The value of `/Key` in a dict: a resolved reference, an inline dict/array,
 *  or the raw token. */
function value(dict: string, key: string, objs: Map<number, PdfObject>): string {
  const re = new RegExp(`/${key}(?![A-Za-z0-9])\\s*`);
  const m = re.exec(dict);
  if (!m) return '';
  const at = m.index + m[0].length;
  const ref = /^(\d+)\s+\d+\s+R/.exec(dict.slice(at));
  if (ref) return objs.get(Number(ref[1]))?.dict.trim() ?? '';
  if (dict[at] === '[' || dict.startsWith('<<', at)) return balanced(dict, at);
  return /^[^\s/\[\]<>()]+|^\/[^\s/\[\]<>()]+/.exec(dict.slice(at))?.[0] ?? '';
}

const numbers = (s: string) => (s.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

/** Solve the 3×3 normal equations for z ≈ a·u + b·v + c. */
function fitPlane(uv: Pt[], z: number[]): [number, number, number] | null {
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  uv.forEach(([u, v], i) => {
    const row = [u, v, 1];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) M[r][c] += row[r] * row[c];
      M[r][3] += row[r] * z[i];
    }
  });
  for (let i = 0; i < 3; i += 1) {
    let p = i;
    for (let r = i + 1; r < 3; r += 1) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) return null;
    for (let r = 0; r < 3; r += 1) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c += 1) M[r][c] -= f * M[i][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

interface Georef { toLatLon: (p: Pt) => Pt; box: [number, number, number, number]; epsg: number | null }

function georef(viewport: string, objs: Map<number, PdfObject>): Georef | null {
  const b = numbers(value(viewport, 'BBox', objs));
  const measure = value(viewport, 'Measure', objs);
  if (b.length < 4 || !/\/Subtype\s*\/GEO\b/.test(measure)) return null;
  const g = numbers(value(measure, 'GPTS', objs));
  const lpts = value(measure, 'LPTS', objs);
  const l = lpts ? numbers(lpts) : [0, 0, 0, 1, 1, 1, 1, 0];
  const n = Math.min(g.length, l.length) >> 1;
  if (n < 3) return null;
  const uv: Pt[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  for (let i = 0; i < n; i += 1) {
    uv.push([l[2 * i], l[2 * i + 1]]);
    lat.push(g[2 * i]);
    lon.push(g[2 * i + 1]);
  }
  if (lat.some((x) => Math.abs(x) > 90) || lon.some((x) => Math.abs(x) > 180)) return null;
  const fl = fitPlane(uv, lat);
  const fo = fitPlane(uv, lon);
  if (!fl || !fo) return null;
  const box: [number, number, number, number] = [
    Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  if (!(w > 0 && h > 0)) return null;
  const epsgMatch = /\/EPSG\s+(\d+)/.exec(value(measure, 'GCS', objs));
  return {
    box,
    epsg: epsgMatch ? Number(epsgMatch[1]) : null,
    toLatLon: ([x, y]) => {
      const u = (x - box[0]) / w;
      const v = (y - box[1]) / h;
      return [fl[0] * u + fl[1] * v + fl[2], fo[0] * u + fo[1] * v + fo[2]];
    },
  };
}

// ── Content stream ──────────────────────────────────────────────────────

type Tok = { op: string } | { num: number } | { other: true };

function* tokens(s: string): Generator<Tok> {
  let i = 0;
  const n = s.length;
  const ws = (c: string) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';
  const delim = (c: string) => '()<>[]{}/%'.includes(c);
  while (i < n) {
    const c = s[i];
    if (ws(c)) { i += 1; continue; }
    if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i += 1; continue; }
    if (c === '(') {
      let depth = 0;
      for (; i < n; i += 1) {
        if (s[i] === '\\') { i += 1; continue; }
        if (s[i] === '(') depth += 1;
        else if (s[i] === ')') { depth -= 1; if (depth === 0) { i += 1; break; } }
      }
      yield { other: true }; continue;
    }
    if (c === '<' && s[i + 1] === '<') { i += 2; yield { other: true }; continue; }
    if (c === '>' && s[i + 1] === '>') { i += 2; yield { other: true }; continue; }
    if (c === '<') { const e = s.indexOf('>', i); i = e < 0 ? n : e + 1; yield { other: true }; continue; }
    if (c === '[' || c === ']' || c === '{' || c === '}') { i += 1; yield { other: true }; continue; }
    let j = i + 1;
    while (j < n && !ws(s[j]) && !delim(s[j])) j += 1;
    const word = s.slice(i, j);
    i = j;
    if (c === '/') { while (i < n && !ws(s[i]) && !delim(s[i])) i += 1; yield { other: true }; continue; }
    const num = Number(word);
    if (word !== '' && Number.isFinite(num) && /^[-+.\d]/.test(word)) { yield { num }; continue; }
    if (word === 'BI') {
      // Inline image: its binary data would be read as operators.
      const e = s.slice(i).search(/\sEI(\s|$)/);
      i = e < 0 ? n : i + e + 3;
      continue;
    }
    yield { op: word };
  }
}

type Seg = [Pt, Pt];

/** Stroked straight segments, grouped by line style (width + stroke colour). */
function strokedSegments(content: string): Map<string, Seg[]> {
  type M6 = [number, number, number, number, number, number];
  let ctm: M6 = [1, 0, 0, 1, 0, 0];
  let width = 1;
  let stroke = '0';
  const saved: Array<{ ctm: M6; width: number; stroke: string }> = [];
  let ops: number[] = [];
  let subs: Array<{ pts: Pt[]; closed: boolean; curved: boolean }> = [];
  let cur: { pts: Pt[]; closed: boolean; curved: boolean } | null = null;
  const groups = new Map<string, Seg[]>();
  let total = 0;

  const at = (x: number, y: number): Pt =>
    [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const flush = () => { if (cur && cur.pts.length) subs.push(cur); cur = null; };

  for (const t of tokens(content)) {
    if ('num' in t) { ops.push(t.num); continue; }
    if (!('op' in t)) { ops = []; continue; }
    const a = ops;
    ops = [];
    switch (t.op) {
      case 'q': saved.push({ ctm: [...ctm] as M6, width, stroke }); break;
      case 'Q': { const s = saved.pop(); if (s) ({ ctm, width, stroke } = s); break; }
      case 'cm':
        if (a.length >= 6) {
          const [p, q, r, s, e, f] = a.slice(-6);
          ctm = [p * ctm[0] + q * ctm[2], p * ctm[1] + q * ctm[3],
            r * ctm[0] + s * ctm[2], r * ctm[1] + s * ctm[3],
            e * ctm[0] + f * ctm[2] + ctm[4], e * ctm[1] + f * ctm[3] + ctm[5]];
        }
        break;
      case 'w': if (a.length) width = a[a.length - 1]; break;
      case 'RG': case 'G': case 'K': case 'SC': case 'SCN':
        stroke = a.map((x) => x.toFixed(2)).join(','); break;
      case 'm': flush(); if (a.length >= 2) cur = { pts: [at(a[a.length - 2], a[a.length - 1])], closed: false, curved: false }; break;
      case 'l': if (cur && a.length >= 2) cur.pts.push(at(a[a.length - 2], a[a.length - 1])); break;
      case 'c': case 'v': case 'y':
        if (cur && a.length >= 2) { cur.curved = true; cur.pts.push(at(a[a.length - 2], a[a.length - 1])); }
        break;
      case 're':
        if (a.length >= 4) {
          flush();
          const [x, y, w, h] = a.slice(-4);
          subs.push({ pts: [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)], closed: true, curved: false });
        }
        break;
      case 'h': if (cur) { cur.closed = true; flush(); } break;
      case 'S': case 's': case 'B': case 'B*': case 'b': case 'b*': {
        flush();
        const closeAll = t.op === 's' || t.op === 'b' || t.op === 'b*';
        const key = `${width.toFixed(2)}|${stroke}`;
        let list = groups.get(key);
        if (!list) { list = []; groups.set(key, list); }
        for (const sp of subs) {
          if (sp.curved || sp.pts.length < 2) continue;
          for (let i = 0; i + 1 < sp.pts.length; i += 1) list.push([sp.pts[i], sp.pts[i + 1]]);
          if ((sp.closed || closeAll) && sp.pts.length > 2) list.push([sp.pts[sp.pts.length - 1], sp.pts[0]]);
        }
        total += list.length;
        subs = [];
        if (total > MAX_SEGMENTS) return groups;
        break;
      }
      case 'f': case 'F': case 'f*': case 'n':
        flush(); subs = []; break;
      default: break;
    }
  }
  return groups;
}

// ── Faces ────────────────────────────────────────────────────────────────

const signedArea = (r: Pt[]) => {
  let s = 0;
  for (let i = 0; i < r.length; i += 1) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
};

/** Drop corners that sit on a straight run: a neighbour's line meeting this
 *  one's side makes a node, not a corner of this outline. */
function dropStraight(r: Pt[]): Pt[] {
  let ring = r;
  for (let pass = 0; pass < 3; pass += 1) {
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i += 1) {
      const p = ring[(i - 1 + ring.length) % ring.length];
      const q = ring[i];
      const n = ring[(i + 1) % ring.length];
      const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const a2 = Math.atan2(n[1] - q[1], n[0] - q[0]);
      let d = Math.abs(a2 - a1) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > (1 * Math.PI) / 180) out.push(q);
    }
    if (out.length === ring.length || out.length < 3) return out.length >= 3 ? out : ring;
    ring = out;
  }
  return ring;
}

/** The bounded faces a set of segments encloses, as page-space rings. */
export function facesOf(segs: Seg[]): Pt[][] {
  const nodes: Pt[] = [];
  const cell = new Map<string, number[]>();
  const nodeId = (p: Pt) => {
    const cx = Math.floor(p[0] / SNAP);
    const cy = Math.floor(p[1] / SNAP);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const id of cell.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (Math.hypot(nodes[id][0] - p[0], nodes[id][1] - p[1]) <= SNAP) return id;
        }
      }
    }
    nodes.push(p);
    const k = `${cx},${cy}`;
    cell.set(k, [...(cell.get(k) ?? []), nodes.length - 1]);
    return nodes.length - 1;
  };
  const adj = new Map<number, Set<number>>();
  for (const [a, b] of segs) {
    const i = nodeId(a);
    const j = nodeId(b);
    if (i === j) continue;
    if (!adj.has(i)) adj.set(i, new Set());
    if (!adj.has(j)) adj.set(j, new Set());
    adj.get(i)!.add(j);
    adj.get(j)!.add(i);
  }
  // Loose ends enclose nothing; prune them so a stray tick does not break a face.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [i, nb] of adj) {
      if (nb.size <= 1) {
        for (const j of nb) adj.get(j)?.delete(i);
        adj.delete(i);
        pruned = true;
      }
    }
  }
  const order = new Map<number, number[]>();
  for (const [i, nb] of adj) {
    order.set(i, [...nb].sort((x, y) =>
      Math.atan2(nodes[x][1] - nodes[i][1], nodes[x][0] - nodes[i][0])
      - Math.atan2(nodes[y][1] - nodes[i][1], nodes[y][0] - nodes[i][0])));
  }
  // Components, so each one's outer face can be told from its inner ones.
  const comp = new Map<number, number>();
  let nComp = 0;
  for (const start of adj.keys()) {
    if (comp.has(start)) continue;
    const stack = [start];
    comp.set(start, nComp);
    while (stack.length) {
      const i = stack.pop()!;
      for (const j of adj.get(i) ?? []) if (!comp.has(j)) { comp.set(j, nComp); stack.push(j); }
    }
    nComp += 1;
  }
  const used = new Set<string>();
  const faces: Array<{ ring: Pt[]; area: number; comp: number }> = [];
  for (const [i, nb] of adj) {
    for (const j of nb) {
      if (used.has(`${i}>${j}`)) continue;
      const cyc: number[] = [];
      let a = i;
      let c = j;
      let ok = true;
      for (let guard = 0; ; guard += 1) {
        used.add(`${a}>${c}`);
        cyc.push(a);
        const around = order.get(c)!;
        const k = around.indexOf(a);
        const next = around[(k - 1 + around.length) % around.length];
        a = c;
        c = next;
        if (a === i && c === j) break;
        if (guard > 2000) { ok = false; break; }
      }
      if (!ok || cyc.length < 3) continue;
      const ring = cyc.map((id) => nodes[id]);
      faces.push({ ring, area: signedArea(ring), comp: comp.get(i) ?? 0 });
    }
  }
  const out: Pt[][] = [];
  for (let k = 0; k < nComp; k += 1) {
    const mine = faces.filter((f) => f.comp === k);
    if (!mine.length) continue;
    const outer = mine.reduce((m, f) => (Math.abs(f.area) > Math.abs(m.area) ? f : m));
    for (const f of mine) {
      if (f === outer || Math.sign(f.area) === Math.sign(outer.area) || Math.abs(f.area) < 1) continue;
      out.push(dropStraight(f.ring));
    }
  }
  return out;
}

/** A sheet's frame, a legend box or a graticule cell: four corners, every side
 *  level or plumb on the page. A surveyed field is essentially never that. */
function isPageRectangle(r: Pt[]): boolean {
  if (r.length !== 4) return false;
  return r.every((p, i) => {
    const q = r[(i + 1) % 4];
    return Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5;
  });
}

/**
 * Read the candidate outlines off a GeoPDF. `null` when the file carries no
 * usable georeference — it is then an ordinary picture of a sheet, and the
 * caller says so rather than inventing corners.
 */
export async function readGeoPdf(bytes: Uint8Array, inflate: Inflate): Promise<GeoPdfReading | null> {
  const text = latin1(bytes);
  if (text.indexOf('%PDF') < 0) return null;
  const objs = objects(text);
  let best: GeoPdfReading | null = null;
  for (const obj of objs.values()) {
    const d = obj.dict;
    if (!/\/Type\s*\/Page(?![s\w])/.test(d) || !/\/VP\b/.test(d)) continue;
    const vpRaw = value(d, 'VP', objs);
    const viewports: string[] = [];
    if (vpRaw.startsWith('[')) {
      const inner = vpRaw.slice(1, -1);
      for (const r of inner.matchAll(/(\d+)\s+\d+\s+R/g)) {
        const v = objs.get(Number(r[1]))?.dict;
        if (v) viewports.push(v);
      }
      for (let i = inner.indexOf('<<'); i >= 0; i = inner.indexOf('<<', i + 2)) {
        const v = balanced(inner, i);
        if (v) { viewports.push(v); i += v.length - 2; }
      }
    } else if (vpRaw) {
      viewports.push(vpRaw);
    }
    const refs = [...(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(d)?.[1] ?? '')
      .matchAll(/(\d+)\s+\d+\s+R/g)].map((r) => Number(r[1]));
    const parts: string[] = [];
    for (const n of refs) {
      const c = objs.get(n);
      if (!c) continue;
      // A /Contents reference can name an array object of further references.
      const nested = c.streamStart < 0 ? [...c.dict.matchAll(/(\d+)\s+\d+\s+R/g)].map((r) => objs.get(Number(r[1]))) : [c];
      for (const s of nested) {
        if (!s || s.streamStart < 0) continue;
        const raw = bytes.subarray(s.streamStart, s.streamEnd);
        const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(s.dict)?.[1] ?? '';
        const names = filter.match(/\/\w+/g) ?? [];
        if (names.some((f) => f !== '/FlateDecode')) continue;
        try {
          parts.push(latin1(names.length ? await inflate(raw) : raw));
        } catch {
          // A stream that will not inflate is skipped, not guessed at.
        }
      }
    }
    if (!parts.length) continue;
    const groups = strokedSegments(parts.join('\n'));
    for (const vp of viewports) {
      const geo = georef(vp, objs);
      if (!geo) continue;
      const [x0, y0, x1, y1] = geo.box;
      let pick: Pt[][] = [];
      for (const segs of groups.values()) {
        const faces = facesOf(segs).filter((r) => {
          if (r.length < 3 || isPageRectangle(r)) return false;
          const cx = r.reduce((s, p) => s + p[0], 0) / r.length;
          const cy = r.reduce((s, p) => s + p[1], 0) / r.length;
          return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        });
        if (faces.length > pick.length) pick = faces;
      }
      const outlines = pick.map((r) => {
        const ring = r.map((p) => geo.toLatLon(p));
        return { ring, areaAc: ringAreaSqM(ring) / SQ_M_PER_ACRE };
      })
        .filter((o) => o.ring.every(([la, lo]) => Math.abs(la) <= 90 && Math.abs(lo) <= 180
          && !(la === 0 && lo === 0)) && o.areaAc > 0)
        .sort((p, q) => q.areaAc - p.areaAc)
        .slice(0, MAX_OUTLINES);
      if (!best || outlines.length > best.outlines.length) best = { outlines, epsg: geo.epsg };
    }
  }
  return best;
}
