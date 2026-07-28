'use client';

/**
 * Area Calculator — functional port of the predecessor Calculator.tsx over
 * @pattadar/core units.ts + landcalc.ts: Unit Converter, Plot Area
 * (rectangle / triangle / quadrilateral from ground measurements), Fencing
 * estimate (posts, wire, cost — accepts the perimeter from the other tabs),
 * and Map Area from a GeoJSON polygon boundary. The predecessor original draws the
 * boundary on an interactive map; this head accepts the polygon GeoJSON
 * directly (no map dependency) and runs the same spherical math.
 */
import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import {
  LENGTH_UNITS,
  UNITS,
  acresToAll,
  fenceEstimate,
  formatArea,
  parsePolygonRing,
  quadrilateralSqft,
  rectangleSqft,
  ringAreaSqM,
  ringPerimM,
  round2,
  toAcres,
  toFeet,
  triangleSqft,
} from '@pattadar/core';
import type { LengthUnit, UnitKey } from '@pattadar/core';

/** Big acres+cents readout + a table of every unit for a given acreage. */
function AreaResult({ acres, title }: { acres: number; title?: string }) {
  const rows = useMemo(() => acresToAll(acres), [acres]);
  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {title || 'Area'}
        </Typography>
        <Typography variant="h6" component="p" sx={{ mb: 1 }}>
          {formatArea(acres)}
        </Typography>
        <Divider sx={{ mb: 1 }} />
        <Table size="small">
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.key}>
                <TableCell sx={{ color: 'text.secondary' }}>{u.label}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {round2(u.value).toLocaleString('en-IN')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function UsePerimeter({ perimFt, onUse, extra }: { perimFt: number; onUse: (ft: number) => void; extra?: string }) {
  if (!(perimFt > 0)) return null;
  return (
    <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography variant="body2" color="text.secondary">
        Perimeter ≈ {round2(perimFt).toLocaleString('en-IN')} ft{extra ? ` (${extra})` : ''}
      </Typography>
      <Button size="small" variant="outlined" onClick={() => onUse(perimFt)}>
        Use in Fencing →
      </Button>
    </Box>
  );
}

function ConverterTab() {
  const [value, setValue] = useState('1');
  const [unit, setUnit] = useState<UnitKey>('acre');
  const acres = toAcres(Number(value) || 0, unit);
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          type="number"
          label="Amount"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          sx={{ width: 180 }}
        />
        <TextField
          select
          size="small"
          label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value as UnitKey)}
          sx={{ width: 170 }}
        >
          {UNITS.map((u) => (
            <MenuItem key={u.key} value={u.key}>
              {u.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <AreaResult
        acres={acres}
        title={`${Number(value) || 0} ${UNITS.find((u) => u.key === unit)?.label ?? ''} =`}
      />
    </>
  );
}

type Shape = 'rect' | 'tri' | 'quad';

function PlotAreaTab({ onUsePerimeter }: { onUsePerimeter: (ft: number) => void }) {
  const [shape, setShape] = useState<Shape>('rect');
  const [lu, setLu] = useState<LengthUnit>('ft');
  const [d, setD] = useState<Record<string, string>>({});
  const val = (k: string) => Number(d[k]) || 0;
  const ft = (k: string) => toFeet(val(k), lu);

  const sqft =
    shape === 'rect'
      ? rectangleSqft(ft('len'), ft('wid'))
      : shape === 'tri'
        ? triangleSqft(ft('a'), ft('b'), ft('c'))
        : quadrilateralSqft(ft('s1'), ft('s2'), ft('s3'), ft('s4'), ft('diag'));
  const acres = sqft / 43560;
  const perimFt =
    shape === 'rect'
      ? 2 * (ft('len') + ft('wid'))
      : shape === 'tri'
        ? ft('a') + ft('b') + ft('c')
        : ft('s1') + ft('s2') + ft('s3') + ft('s4');

  const num = (k: string, label: string) => (
    <TextField
      key={k}
      size="small"
      type="number"
      label={label}
      value={d[k] ?? ''}
      onChange={(e) => setD((p) => ({ ...p, [k]: e.target.value }))}
      sx={{ width: { xs: '46%', sm: 170 } }}
    />
  );

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup size="small" exclusive value={shape} onChange={(_e, v) => v && setShape(v)}>
          <ToggleButton value="rect">Rectangle</ToggleButton>
          <ToggleButton value="tri">Triangle</ToggleButton>
          <ToggleButton value="quad">Quadrilateral</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          select
          size="small"
          label="Measured in"
          value={lu}
          onChange={(e) => setLu(e.target.value as LengthUnit)}
          sx={{ width: 150 }}
        >
          {LENGTH_UNITS.map((u) => (
            <MenuItem key={u.key} value={u.key}>
              {u.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {shape === 'rect' && [num('len', 'Length'), num('wid', 'Width')]}
        {shape === 'tri' && [num('a', 'Side A'), num('b', 'Side B'), num('c', 'Side C')]}
        {shape === 'quad' &&
          [num('s1', 'Side 1'), num('s2', 'Side 2'), num('s3', 'Side 3'), num('s4', 'Side 4'), num('diag', 'Diagonal (corner 1→3)')]}
      </Box>
      <AreaResult acres={acres} />
      <UsePerimeter perimFt={perimFt} onUse={onUsePerimeter} />
    </>
  );
}

function FencingTab({ perimeterFt }: { perimeterFt: number }) {
  const [perimeter, setPerimeter] = useState(perimeterFt > 0 ? String(round2(perimeterFt)) : '');
  const [spacing, setSpacing] = useState('8');
  const [strands, setStrands] = useState('3');
  const [costPost, setCostPost] = useState('');
  const [costWire, setCostWire] = useState('');
  const r = fenceEstimate(
    Number(perimeter) || 0,
    Number(spacing) || 0,
    Number(strands) || 0,
    Number(costPost) || 0,
    Number(costWire) || 0,
  );
  const field = (label: string, v: string, set: (s: string) => void) => (
    <TextField
      size="small"
      type="number"
      label={label}
      value={v}
      onChange={(e) => set(e.target.value)}
      sx={{ width: { xs: '46%', sm: 180 } }}
    />
  );
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {field('Perimeter (ft)', perimeter, setPerimeter)}
        {field('Post spacing (ft)', spacing, setSpacing)}
        {field('Wire strands / rails', strands, setStrands)}
        {field('Cost per post (₹)', costPost, setCostPost)}
        {field('Cost per ft wire (₹)', costWire, setCostWire)}
      </Box>
      <Card sx={{ mt: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Posts
            </Typography>
            <Typography variant="h6" component="p">
              {r.posts}
            </Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Wire length (ft)
            </Typography>
            <Typography variant="h6" component="p">
              {round2(r.wire).toLocaleString('en-IN')}
            </Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Est. cost
            </Typography>
            <Typography variant="h6" component="p">
              {r.cost > 0 ? `₹${round2(r.cost).toLocaleString('en-IN')}` : '—'}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </>
  );
}

function MapAreaTab({ onUsePerimeter }: { onUsePerimeter: (ft: number) => void }) {
  const [geo, setGeo] = useState('');
  const ring = useMemo(() => parsePolygonRing(geo), [geo]);
  const acres = ringAreaSqM(ring) / 4046.8564;
  const perimM = ringPerimM(ring);
  const perimFt = perimM * 3.280839895;
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Paste the plot boundary as GeoJSON — a Polygon of [longitude, latitude] corners (from any
        GPS/mapping tool, or a parcel&apos;s saved location).
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={5}
        placeholder='{"type":"Polygon","coordinates":[[[80.648,16.506],[80.650,16.506],[80.650,16.508],[80.648,16.508],[80.648,16.506]]]}'
        value={geo}
        onChange={(e) => setGeo(e.target.value)}
        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
      />
      {ring.length >= 3 ? (
        <>
          <AreaResult acres={acres} />
          <UsePerimeter perimFt={perimFt} onUse={onUsePerimeter} extra={`${round2(perimM).toLocaleString('en-IN')} m`} />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Add at least 3 points to compute an area.
        </Typography>
      )}
    </>
  );
}

export function CalculatorTool() {
  const [tab, setTab] = useState('convert');
  const [perimeterFt, setPerimeterFt] = useState(0);
  const usePerimeter = (ftVal: number) => {
    setPerimeterFt(ftVal);
    setTab('fence');
  };
  return (
    <>
      <Typography variant="h6" component="h2">
        Area Calculator
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Convert between Indian land units, measure a plot, estimate fencing, or compute a mapped
        boundary&apos;s area.
      </Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Unit Converter" value="convert" />
        <Tab label="Plot Area" value="plot" />
        <Tab label="Fencing" value="fence" />
        <Tab label="Map Area" value="map" />
      </Tabs>
      {tab === 'convert' ? (
        <ConverterTab />
      ) : tab === 'plot' ? (
        <PlotAreaTab onUsePerimeter={usePerimeter} />
      ) : tab === 'fence' ? (
        <FencingTab key={perimeterFt} perimeterFt={perimeterFt} />
      ) : (
        <MapAreaTab onUsePerimeter={usePerimeter} />
      )}
    </>
  );
}
