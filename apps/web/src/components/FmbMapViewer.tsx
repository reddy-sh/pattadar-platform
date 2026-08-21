/**
 * The FMB sheet, turned into a map you can measure — web (§11 of the Vault
 * Maps Design). At a desk, comparing: the map fills the canvas, a right rail
 * holds the side table, corner table and area check, and hovering a table
 * row highlights that side on the map and the reverse — that binding is the
 * whole reason this desktop version exists.
 *
 * Everything drawn here was derived server-side from the sheet's own corner
 * table; this component computes nothing except unit conversion.
 */
import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';

export interface FmbPoint { id: number; e: number; n: number; lat: number; lon: number }
export interface FmbSide {
  from: number; to: number; m: number; printedM: number | null;
  bearing: number; beyond: string; state: string;
}
export interface FmbGeometry {
  orderSource: string;
  datumStated: boolean;
  ring: number[];
  points: FmbPoint[];
  sides: FmbSide[];
  areaAc: number;
  perimeterM: number;
  areaCheck: { ok: boolean; deltaPct: number; sheetAc: number | null } | null;
  portionExceedsField: boolean;
}

/** 1 m = 3.280839895 ft, exactly (§5). Lengths convert; areas do not. */
const FEET_PER_METRE = 3.280839895;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Decode reading JSON → the stored shape, or null when the sheet never
 * yielded a corner table (a scanned FMB shows the scan, not a map). */
export function parseFmbGeometry(reading?: string | null): FmbGeometry | null {
  if (!reading) return null;
  let root: Record<string, unknown>;
  try { root = JSON.parse(reading) as Record<string, unknown>; } catch { return null; }
  const g = root.geometry as Record<string, unknown> | undefined;
  if (!g) return null;
  const ring = (Array.isArray(g.ring) ? g.ring : []).map((x) => num(x)).filter((x): x is number => x != null);
  const points = (Array.isArray(g.points) ? g.points : [])
    .map((p): FmbPoint | null => {
      const row = p as Record<string, unknown>;
      const id = num(row.id); const e = num(row.e); const n = num(row.n);
      if (id == null || e == null || n == null) return null;
      return { id, e, n, lat: num(row.lat) ?? 0, lon: num(row.lon) ?? 0 };
    })
    .filter((p): p is FmbPoint => p != null);
  const sides = (Array.isArray(g.sides) ? g.sides : [])
    .map((s): FmbSide | null => {
      const row = s as Record<string, unknown>;
      const from = num(row.from); const to = num(row.to);
      const m = num(row.m); const bearing = num(row.bearing);
      if (from == null || to == null || m == null || bearing == null) return null;
      return {
        from, to, m, bearing,
        printedM: num(row.printed_m),
        beyond: typeof row.beyond === 'string' ? row.beyond : '',
        state: typeof row.state === 'string' ? row.state : 'surveyed',
      };
    })
    .filter((s): s is FmbSide => s != null);
  if (ring.length < 3 || points.length < 3 || sides.length !== ring.length) return null;
  const checks = Array.isArray(g.checks) ? (g.checks as Record<string, unknown>[]) : [];
  const area = checks.find((c) => c.code === 'area_vs_sheet');
  const crs = (g.crs ?? {}) as Record<string, unknown>;
  return {
    orderSource: typeof g.order_source === 'string' ? g.order_source : 'inferred',
    datumStated: crs.datum_stated === true,
    ring, points, sides,
    areaAc: num(g.area_ac) ?? 0,
    perimeterM: num(g.perimeter_m) ?? 0,
    areaCheck: area
      ? { ok: area.ok === true, deltaPct: num(area.delta_pct) ?? 0, sheetAc: num(area.sheet_ac) }
      : null,
    portionExceedsField: checks.some((c) => c.code === 'portion_exceeds_field' && c.ok !== true),
  };
}

/** "FMB / survey map" → "fmb-survey-map" — the platform's share naming. */
const slug = (raw: string) =>
  raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');

const fmtLen = (metres: number, unit: 'm' | 'ft', map = false) =>
  unit === 'm'
    ? `${metres.toFixed(2)} m`
    : `${(metres * FEET_PER_METRE).toFixed(map ? 0 : 1)} ft`;

// The design's colour rules: teal for the parcel (the map family colour),
// red for corners and measured-not-walked lines, amber for the current
// selection. Nothing else — colour carries meaning here.
//
// These are drawn onto an SVG sketch over imagery, not onto app paper, so
// they are literals by necessity — but they are now the Bloom chart teal /
// status critical / brand amber rather than a stray Tailwind triplet.
const CYAN = '#3ebfc6'; // chartCategorical.dark[1] — teal
const RED = '#ff5453'; // status.dark.critical
const AMBER = '#fe860f'; // --color-accent

const VIEW = 760;
const INSET = 42;

export function FmbMapViewer({
  open, onClose, geometry, village,
}: {
  open: boolean;
  onClose: () => void;
  geometry: FmbGeometry;
  village: string;
}) {
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Fit, not zoom: one scale factor, north up, equal on both axes (§4).
  const layout = useMemo(() => {
    const pts = geometry.points;
    const minE = Math.min(...pts.map((p) => p.e));
    const maxE = Math.max(...pts.map((p) => p.e));
    const minN = Math.min(...pts.map((p) => p.n));
    const maxN = Math.max(...pts.map((p) => p.n));
    const span = VIEW - INSET * 2;
    const k = Math.min(span / Math.max(maxE - minE, 1), span / Math.max(maxN - minN, 1));
    const xPad = (span - (maxE - minE) * k) / 2;
    const yPad = (span - (maxN - minN) * k) / 2;
    const screen = new Map<number, { x: number; y: number }>();
    for (const p of pts) {
      screen.set(p.id, {
        x: INSET + xPad + (p.e - minE) * k,
        y: INSET + yPad + (maxN - p.n) * k,
      });
    }
    const ringPts = geometry.ring
      .map((id) => screen.get(id))
      .filter((p): p is { x: number; y: number } => !!p);
    const cx = ringPts.reduce((a, p) => a + p.x, 0) / ringPts.length;
    const cy = ringPts.reduce((a, p) => a + p.y, 0) / ringPts.length;
    return { screen, ringPts, cx, cy, metresPerUnit: 1 / k };
  }, [geometry]);

  // Keyboard (§11): arrows walk the selection around the ring, M toggles
  // units, Escape clears the selection before it closes the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') setUnit((u) => (u === 'm' ? 'ft' : 'm'));
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const ids = geometry.sides.map((s) => `${s.from}-${s.to}`);
        const at = selected ? ids.indexOf(selected) : -1;
        const step = e.key === 'ArrowRight' ? 1 : -1;
        setSelected(ids[(at + step + ids.length) % ids.length]);
      }
      if (e.key === 'Escape' && selected) {
        e.stopPropagation();
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, selected, geometry.sides]);

  const download = (name: string, mime: string, text: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // §11 output: exports that make the vault interoperable with every
  // surveyor's toolchain — named the platform's way.
  const exportGeoJSON = () => {
    const byId = new Map(geometry.points.map((p) => [p.id, p]));
    const ring = [...geometry.ring, geometry.ring[0]]
      .map((id) => byId.get(id))
      .filter((p): p is FmbPoint => !!p)
      .map((p) => [p.lon, p.lat]);
    download(
      `pattadar-fmb-${slug(village) || 'sheet'}.geojson`,
      'application/geo+json',
      JSON.stringify({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { village, area_ac: geometry.areaAc, perimeter_m: geometry.perimeterM },
      }, null, 2),
    );
  };
  const exportCSV = () => {
    const rows = [
      'point_id,easting,northing,latitude,longitude',
      ...geometry.points.map((p) => `${p.id},${p.e},${p.n},${p.lat},${p.lon}`),
    ];
    download(`pattadar-fmb-${slug(village) || 'sheet'}-corners.csv`, 'text/csv', rows.join('\n'));
  };

  const active = (id: string) => hovered === id || selected === id;
  const verdict = geometry.portionExceedsField
    ? { color: 'error' as const, text: 'A mapped portion cannot exceed its survey number — always an error.' }
    : !geometry.areaCheck
      ? null
      : geometry.areaCheck.deltaPct < 0.5
        ? { color: 'success' as const, text: `Agrees — within ${geometry.areaCheck.deltaPct.toFixed(2)}%.` }
        : geometry.areaCheck.deltaPct <= 2
          ? { color: 'warning' as const, text: `Worth knowing — ${geometry.areaCheck.deltaPct.toFixed(2)}% apart.` }
          : { color: 'error' as const, text: `${geometry.areaCheck.deltaPct.toFixed(2)}% apart — check ring order, corners, units.` };

  // Scale bar: a 1–2–5 round number in the active unit, caption restating it.
  const scale = useMemo(() => {
    const target = layout.metresPerUnit * VIEW * 0.22;
    const inUnit = unit === 'm' ? target : target * FEET_PER_METRE;
    const mag = 10 ** Math.floor(Math.log10(Math.max(inUnit, 1)));
    const base = inUnit / mag;
    const nice = (base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10) * mag;
    const metres = unit === 'm' ? nice : nice / FEET_PER_METRE;
    return { label: `${nice} ${unit}`, px: metres / layout.metresPerUnit };
  }, [layout, unit]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        FMB · {village || 'sheet'}
        {geometry.orderSource === 'inferred' && (
          <Chip size="small" color="warning" variant="outlined"
                label="Corner order inferred — confirm against the sheet" />
        )}
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup
          size="small" exclusive value={unit}
          onChange={(_, v: 'm' | 'ft' | null) => { if (v) setUnit(v); }}
          aria-label="Length unit"
        >
          <ToggleButton value="m">m</ToggleButton>
          <ToggleButton value="ft">ft</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" startIcon={<DownloadIcon />} onClick={exportGeoJSON}>GeoJSON</Button>
        <Button size="small" startIcon={<DownloadIcon />} onClick={exportCSV}>CSV</Button>
        <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.2fr) minmax(0, 1fr)' }, gap: 2 }}>
          {/* The map fills its canvas; tapping empty space clears back to
              the parcel summary. */}
          <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1 }}>
            <svg
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              role="img"
              aria-label={`Parcel map, ${geometry.sides.length} sides, ${geometry.areaAc.toFixed(2)} acres`}
              onClick={() => setSelected(null)}
            >
              <polygon
                points={layout.ringPts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={CYAN} fillOpacity={0.12} stroke="none"
              />
              {geometry.sides.map((s) => {
                const id = `${s.from}-${s.to}`;
                const a = layout.screen.get(s.from); const b = layout.screen.get(s.to);
                if (!a || !b) return null;
                const colour = active(id) ? AMBER : s.state === 'measured_only' ? RED : CYAN;
                const midX = (a.x + b.x) / 2; const midY = (a.y + b.y) / 2;
                const len = Math.hypot(b.x - a.x, b.y - a.y);
                const nx = -(b.y - a.y) / len; const ny = (b.x - a.x) / len;
                const toC = (layout.cx - midX) * nx + (layout.cy - midY) * ny;
                const ox = toC > 0 ? -nx : nx; const oy = toC > 0 ? -ny : ny;
                let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
                if (angle > 90) angle -= 180;
                if (angle < -90) angle += 180;
                return (
                  <g key={id}>
                    {/* The touch target is wider than the line. */}
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="transparent" strokeWidth={14}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setSelected(id); }}
                      onMouseEnter={() => setHovered(id)}
                      onMouseLeave={() => setHovered(null)}
                    />
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={colour} strokeWidth={active(id) ? 3.5 : 2}
                      pointerEvents="none"
                    />
                    {len >= 40 && (
                      <text
                        x={midX + ox * 12} y={midY + oy * 12}
                        transform={`rotate(${angle} ${midX + ox * 12} ${midY + oy * 12})`}
                        textAnchor="middle" fontSize={11} fontWeight={600}
                        fill={s.state === 'measured_only' ? RED : 'currentColor'}
                        pointerEvents="none"
                      >
                        {fmtLen(s.m, unit, true)}
                      </text>
                    )}
                  </g>
                );
              })}
              {geometry.ring.map((id) => {
                const p = layout.screen.get(id);
                if (!p) return null;
                const key = `pt-${id}`;
                const isActive = active(key);
                const ox = p.x - layout.cx; const oy = p.y - layout.cy;
                const len = Math.max(Math.hypot(ox, oy), 0.001);
                return (
                  <g key={key}>
                    <circle
                      cx={p.x} cy={p.y} r={13} fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setSelected(key); }}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered(null)}
                    />
                    <circle cx={p.x} cy={p.y} r={isActive ? 6 : 4}
                            fill={isActive ? AMBER : RED} pointerEvents="none" />
                    <text
                      x={p.x + (ox / len) * 15} y={p.y + (oy / len) * 15}
                      textAnchor="middle" fontSize={10} fontWeight={700}
                      fill="currentColor" opacity={0.65} pointerEvents="none"
                    >
                      {id}
                    </text>
                  </g>
                );
              })}
              {/* Always on screen: north arrow and a scale bar whose caption
                  restates the active unit (§4). */}
              <g transform={`translate(${VIEW - 30}, 26)`} opacity={0.7}>
                <path d="M 0 8 L 4 16 L 0 13 L -4 16 Z" fill="currentColor"
                      transform="rotate(180)" />
                <text y={22} textAnchor="middle" fontSize={10} fontWeight={700}
                      fill="currentColor">N</text>
              </g>
              <g transform={`translate(${INSET}, ${VIEW - 22})`} opacity={0.8}>
                <rect width={scale.px} height={3} fill="currentColor" />
                <text y={16} fontSize={10} fontWeight={600} fill="currentColor">
                  {scale.label}
                </text>
              </g>
            </svg>
          </Box>

          {/* The right rail: side table, corner table, area check (§11). */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Sides · {geometry.sides.length} · {fmtLen(geometry.perimeterM, unit)} around
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Side</TableCell>
                    <TableCell align="right">Length</TableCell>
                    <TableCell align="right">Printed</TableCell>
                    <TableCell align="right">Bearing</TableCell>
                    <TableCell>Beyond it</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {geometry.sides.map((s) => {
                    const id = `${s.from}-${s.to}`;
                    return (
                      <TableRow
                        key={id} hover selected={selected === id}
                        onMouseEnter={() => setHovered(id)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setSelected(selected === id ? null : id)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.from} → {s.to}
                          {s.state === 'measured_only' && (
                            <Chip size="small" label="red line" variant="outlined"
                                  sx={{ ml: 0.75, color: RED, borderColor: RED }} />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtLen(s.m, unit)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.printedM != null ? fmtLen(s.printedM, unit) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.bearing.toFixed(1)}°
                        </TableCell>
                        <TableCell>{s.beyond || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Corners</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Id</TableCell>
                    <TableCell align="right">Easting</TableCell>
                    <TableCell align="right">Northing</TableCell>
                    <TableCell align="right">Latitude</TableCell>
                    <TableCell align="right">Longitude</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {geometry.points.map((p) => {
                    const key = `pt-${p.id}`;
                    return (
                      <TableRow
                        key={key} hover selected={selected === key}
                        onMouseEnter={() => setHovered(key)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setSelected(selected === key ? null : key)}
                        sx={{ cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
                      >
                        <TableCell>{p.id}</TableCell>
                        <TableCell align="right">{p.e.toFixed(4)}</TableCell>
                        <TableCell align="right">{p.n.toFixed(4)}</TableCell>
                        <TableCell align="right">{p.lat.toFixed(5)}</TableCell>
                        <TableCell align="right">{p.lon.toFixed(5)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            {/* §7: three numbers, always shown together, then a verdict. */}
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">From the corners</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {geometry.areaAc.toFixed(2)} ac
                  </Typography>
                </Box>
                {geometry.areaCheck?.sheetAc != null && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">On the sheet</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {geometry.areaCheck.sheetAc.toFixed(2)} ac
                    </Typography>
                  </Box>
                )}
              </Box>
              {verdict && (
                <Chip size="small" color={verdict.color} variant="outlined"
                      label={verdict.text} sx={{ mt: 1 }} />
              )}
              {!geometry.datumStated && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Datum unstated on the sheet — placement on imagery is approximate.
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                ← → walk the sides · M toggles units · Esc clears
              </Typography>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
