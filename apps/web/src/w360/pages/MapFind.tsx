/** W06 — find by map. Colour is status, hovering a row lights its shape and
 *  hovering a shape lights its row, and the panel offers the one thing the map
 *  can see that a list cannot: two of your parcels share a boundary.
 *
 *  The basemap is deliberately a placeholder. Dropping a real tile layer in is
 *  a one-component change; inventing satellite imagery under records that have
 *  never been surveyed would be a lie the rest of the product does not tell. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import FullscreenOutlined from '@mui/icons-material/FullscreenOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';

import { useMapRecords } from '../api';
import type { MapRecord } from '../api';
import { Chip, Icon, Loading, inr, num, plural } from '../ui';

/** Status → the stroke it is drawn in. Values are Bloom tokens, never literals. */
const STROKE: Record<string, string> = {
  owned: 'var(--w-ok)',
  for_sale: 'var(--w-accent)',
  disputed: 'var(--w-danger)',
};
const LEGEND = [
  ['owned', 'Owned'], ['for_sale', 'For sale'], ['disputed', 'Disputed'], ['built', 'Built'],
] as const;

const points = (shape: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < shape.length; i += 2) out.push(`${shape[i] * 100},${shape[i + 1] * 100}`);
  return out.join(' ');
};

/** A feature chip wears its own icon; every chip used to be drawn as a bore
 *  because the record the screen was built on happened to lead with one. */
function chipIcon(label: string): string {
  const l = label.toLowerCase();
  for (const [needle, icon] of [
    ['bore', 'bore'], ['well', 'well'], ['pond', 'pond'], ['pump', 'pump'],
    ['drip', 'drip'], ['transformer', 'power'], ['meter', 'power'], ['solar', 'power'],
    ['fence', 'fence'], ['wall', 'fence'], ['gate', 'gate'], ['house', 'house'],
    ['shed', 'house'], ['tree', 'trees'], ['crop', 'crop'], ['road', 'road'],
    ['bund', 'road'], ['lift', 'power'], ['tank', 'pond'], ['park', 'road'],
  ] as const) {
    if (l.includes(needle)) return icon;
  }
  return 'feature';
}

const strokeFor = (r: MapRecord) =>
  r.kind === 'property' && r.status === 'owned' ? 'var(--w-info)' : STROKE[r.status] ?? 'var(--w-ok)';

export function MapFind() {
  const { data, isLoading } = useMapRecords();
  const [facet, setFacet] = useState('all');
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const all = data?.records ?? [];
    const byFacet = all.filter((r) => {
      if (facet === 'all') return true;
      if (facet === 'parcel' || facet === 'property') return r.kind === facet;
      if (facet === 'disputed') return r.status === 'disputed';
      if (facet === 'bore') return r.featureChips.some((c) => c.includes('Bore'));
      return true;
    });
    if (!q.trim()) return byFacet;
    const needle = q.trim().toLowerCase();
    return byFacet.filter((r) =>
      `${r.title} ${r.village} ${r.khataNo}`.toLowerCase().includes(needle));
  }, [data, facet, q]);

  const hovered = shown.find((r) => r.id === hover) ?? null;

  const places = [...new Set(shown.map((r) => r.village).filter(Boolean))];
  const areaLabel = places.length === 0 ? 'Nothing in view'
    : places.length <= 2 ? places.join(' & ')
    : `${places.slice(0, 2).join(', ')} and ${places.length - 2} more`;

  if (isLoading || !data) return <main><Loading h="80vh" /></main>;

  return (
    <main className="flush" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 24rem', minHeight: 'calc(100vh - 3.5rem)' }}>
      <section style={{ position: 'relative', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)' }}>
        <div className="row" style={{ padding: 'var(--space-md) var(--space-lg)', gap: 'var(--space-sm)' }}>
          <span className="search" style={{ width: '18rem', justifySelf: 'start' }}>
            <SearchOutlined sx={{ fontSize: 17 }} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Village, survey no., khata" aria-label="Search the map" />
          </span>
          {data.counts.map((c) => (
            <Chip key={c.key} active={facet === c.key} count={c.count}
                  tone={c.key === 'disputed' ? 'alert' : undefined}
                  onClick={() => setFacet(c.key)}>
              {c.label}
            </Chip>
          ))}
          <Chip><LayersOutlined sx={{ fontSize: 14 }} /> Boundaries · auto</Chip>
        </div>

        <div className="plot" style={{ margin: '0 var(--space-lg) var(--space-lg)', minHeight: '30rem' }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
               aria-label={`${plural(shown.length, 'property', 'properties')} on the map`}>
            {/* Roads and the canal — orientation, not cartography.
                `vector-effect` is NOT inherited, so it goes on each path: set on
                the <g> alone, these drew as 56px slabs across the map. */}
            <g stroke="var(--w-line-strong)" fill="none" opacity="0.5">
              <path d="M0 62 L100 56" strokeWidth="7" vectorEffect="non-scaling-stroke" />
              <path d="M46 0 L44 100" strokeWidth="5" vectorEffect="non-scaling-stroke" />
              <path d="M62 100 Q 76 60 100 44" strokeWidth="9" opacity="0.7"
                    vectorEffect="non-scaling-stroke" />
            </g>
            <g fill="var(--w-ink-3)" fontSize="2.1" fontFamily="var(--font-mono)" opacity="0.75">
              <text x="12" y="30">CHINNAPURAM</text>
              <text x="58" y="42">PEDDAPURAM</text>
              <text x="8" y="76">KOTHAPALLI</text>
              <text x="76" y="82">Yeleru canal</text>
            </g>
            {shown.filter((r) => r.shape.length >= 6).map((r) => {
              const on = hover === r.id;
              return (
                <polygon
                  key={r.id}
                  points={points(r.shape)}
                  stroke={strokeFor(r)}
                  strokeWidth={on ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  fill={strokeFor(r)}
                  fillOpacity={on ? 0.28 : 0.12}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{r.title}</title>
                </polygon>
              );
            })}
          </svg>

          {hovered && (
            <div className="hovercard" style={{ left: '18%', top: '48%' }}>
              <div className="art" style={{
                height: '5rem', display: 'grid', placeItems: 'center', position: 'relative',
                background: 'linear-gradient(155deg, color-mix(in oklab, var(--w-accent) 16%, var(--w-surface-2)), var(--w-surface-2))',
                color: 'color-mix(in oklab, var(--w-accent) 55%, transparent)',
              }}>
                <Icon name={hovered.classification} size={34} />
                <span style={{ position: 'absolute', top: '0.5rem', left: '0.5rem' }}>
                  <span className={`pill ${hovered.status}`}>
                    {hovered.status === 'for_sale' ? 'For sale' : hovered.status === 'disputed' ? 'Disputed' : 'Owned'}
                  </span>
                </span>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <h3>{hovered.title}</h3>
                  <span className="num">
                    {hovered.extentUnit === 'ac'
                      ? `${num(hovered.extent, 2)} ac`
                      : `${num(hovered.extent)} ${hovered.extentUnit}`}
                  </span>
                </div>
                <p className="note" style={{ marginTop: '0.1875rem' }}>
                  {[hovered.ownerName, hovered.khataNo && `Khata ${hovered.khataNo}`, hovered.village]
                    .filter(Boolean).join(' · ')}
                </p>
                <hr className="hr" style={{ margin: '0.625rem 0' }} />
                <div className="row tight">
                  {hovered.featureChips.map((c) => (
                    <span key={c} className="note row tight" style={{ color: 'var(--w-info)', fontSize: '0.75rem' }}>
                      <Icon name={chipIcon(c)} size={13} /> {c}
                    </span>
                  ))}
                </div>
                {hovered.watcher && (
                  <>
                    <hr className="hr" style={{ margin: '0.625rem 0' }} />
                    <p className="note">
                      Watched by {hovered.watcher}{hovered.watcherPay ? ` · ${hovered.watcherPay}` : ''}
                    </p>
                  </>
                )}
                <div className="row tight" style={{ marginTop: '0.625rem' }}>
                  <Link className="btn primary sm" to={`/app/records/${hovered.id}`}>Open</Link>
                  <Link className="btn sm" to={`/app/records/${hovered.id}`}>Papers {hovered.paperCount}</Link>
                  <Link className="btn sm" to={`/app/records/${hovered.id}/photos`}>Photos {hovered.photoCount}</Link>
                </div>
              </div>
            </div>
          )}

          <div className="legend">
            <span className="k">Colour is status</span>
            <div className="row" style={{ gap: 'var(--space-md)', marginTop: '0.375rem' }}>
              {LEGEND.map(([k, label]) => (
                <span key={k} className="swatch"
                      style={{ color: k === 'built' ? 'var(--w-info)' : STROKE[k] }}>
                  <i /> <span style={{ color: 'var(--w-ink-2)' }}>{label}</span>
                </span>
              ))}
            </div>
          </div>

          <span className="cap">basemap placeholder · drop a real tile layer here · zoom 16 · boundaries on</span>
          <div className="zoom">
            <button type="button" aria-label="Zoom in">+</button>
            <button type="button" aria-label="Zoom out">−</button>
            <button type="button" aria-label="Fit"><FullscreenOutlined sx={{ fontSize: 15 }} /></button>
          </div>
        </div>
      </section>

      <aside style={{ borderLeft: '1px solid var(--w-line)', padding: 'var(--space-lg)', overflowY: 'auto' }}>
        <p className="eyebrow">In view · {plural(shown.length, 'property', 'properties')}</p>
        {/* Named after the villages actually on screen, and honest when there
            are more of them than fit the line. */}
        <h2 style={{ fontSize: '1.375rem', marginBottom: 'var(--space-md)' }}>{areaLabel}</h2>

        {data.insights.map((ins) => (
          <div className="card accent" key={ins.id} style={{ marginBottom: 'var(--space-md)' }}>
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
              <span className="accent" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                <LightbulbOutlined sx={{ fontSize: 18 }} />
              </span>
              <div>
                <h3>{ins.title}</h3>
                <p className="note" style={{ margin: '0.25rem 0 0.625rem' }}>{ins.detail}</p>
                <div className="row tight">
                  <button type="button" className="btn soft sm">Combine</button>
                  <button type="button" className="btn sm">Dismiss</button>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="rows">
          {shown.map((r) => (
            <Link
              key={r.id}
              to={`/app/records/${r.id}`}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                textDecoration: 'none', color: 'inherit', paddingLeft: 'var(--space-sm)',
                borderLeft: `2px solid ${hover === r.id ? 'var(--w-accent)' : 'transparent'}`,
                background: hover === r.id ? 'var(--w-accent-wash)' : undefined,
              }}
            >
              <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
                <Icon name={r.classification} size={18} />
              </span>
              <span className="grow">
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>{r.title}</span>
                <span className="note" style={{ display: 'block' }}>
                  {r.extentUnit === 'ac' ? `${num(r.extent, 2)} ac` : `${num(r.extent)} ${r.extentUnit}`}
                  {' · '}{r.status === 'for_sale' ? 'for sale' : r.status}
                  {r.featureChips.length > 0 && ` · ${r.featureChips.slice(0, 2).join(', ').toLowerCase()}`}
                </span>
              </span>
              <span className="num" style={{ fontSize: '0.8125rem' }}>{inr(r.marketValue)}</span>
            </Link>
          ))}
        </div>

        <p className="note" style={{ marginTop: 'var(--space-lg)' }}>
          Hovering a row lights its shape on the map, and hovering a shape lights its row.
        </p>
      </aside>
    </main>
  );
}
