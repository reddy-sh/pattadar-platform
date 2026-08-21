/** W04 — the sketch over the ground, and what to do when a stone has moved.
 *
 *  The FMB sheet is a government document and is never edited. What the owner
 *  edits is a MARK: a numbered point with its own history. Accepting a new
 *  position keeps the old one, and deleting a mark keeps it in History — which
 *  is why the destructive action can sit on the page at all. */
import { useState } from 'react';
import GpsFixedOutlined from '@mui/icons-material/GpsFixedOutlined';
import StraightenOutlined from '@mui/icons-material/StraightenOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
import FullscreenOutlined from '@mui/icons-material/FullscreenOutlined';

import { useBoundary, useAcceptMark, useDeleteMark } from '../api';
import { Card, KV, Loading } from '../ui';
import { RecordCrumbs, useRecordCtx } from './Record';

const VIEWS = ['FMB sketch', 'Satellite', 'Both'];

export function RecordBoundary() {
  const rec = useRecordCtx();
  const { data, isLoading } = useBoundary(rec.id);
  const accept = useAcceptMark();
  const remove = useDeleteMark();
  const [view, setView] = useState('FMB sketch');

  if (isLoading || !data) return <main><Loading h="70vh" /></main>;

  const marks = data.marks.filter((m) => m.state !== 'deleted');
  const movedIdx = marks.findIndex((m) => m.state === 'moved');
  // The sketch is drawn in its own 0..1 space; marks sit on its corners in order.
  const pts: [number, number][] = [];
  for (let i = 0; i < data.shape.length; i += 2) pts.push([data.shape[i] * 100, data.shape[i + 1] * 100]);

  return (
    <main>
      <RecordCrumbs rec={rec} here="Map" />
      <p className="eyebrow">{rec.title} · boundary</p>

      <header className="pagehead">
        <div className="grow"><h1>Map &amp; boundary</h1></div>
        <div className="actions">
          <div className="segmented" role="group" aria-label="Basemap">
            {VIEWS.map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>
            ))}
          </div>
          <button type="button" className="btn">
            <GpsFixedOutlined sx={{ fontSize: 16 }} /> Move the pin
          </button>
          <button type="button" className="btn primary">
            <StraightenOutlined sx={{ fontSize: 16 }} /> Order a survey
          </button>
        </div>
      </header>

      <div className="split">
        <div className="plot" style={{ minHeight: '34rem' }}>
          <p className="hint">
            Drag any numbered mark to correct it. Marks are versioned — nothing is overwritten.
          </p>

          {/* preserveAspectRatio="none" stretches the sketch to the panel, which
              also multiplies every stroke width by the scale factor — 0.9 user
              units became an 8px slab. `vector-effect: non-scaling-stroke` on
              the strokes keeps them in screen pixels, as drawn. */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
               aria-label={`Boundary of ${data.title}`}>
            {view !== 'FMB sketch' && (
              <rect x="0" y="0" width="100" height="100" fill="var(--w-surface-2)" opacity="0.5" />
            )}
            <path d="M0 84 L100 78" stroke="var(--w-line-strong)" strokeWidth="14" opacity="0.5"
                  vectorEffect="non-scaling-stroke" />
            <path d="M0 84 L100 78" stroke="var(--w-ink-3)" strokeWidth="1"
                  strokeDasharray="8 8" opacity="0.6" vectorEffect="non-scaling-stroke" />
            <path d="M2 28 L100 24" stroke="var(--w-line-strong)" strokeWidth="8" opacity="0.35"
                  vectorEffect="non-scaling-stroke" />

            <polygon
              points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="var(--w-accent)" fillOpacity="0.09"
              stroke="var(--w-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke"
            />
            {/* The moved edge is drawn where the stone now stands, in the alarm
                hue — on the edge that actually moved, not always the fourth. */}
            {movedIdx >= 0 && pts.length >= 2 && (
              <line
                x1={pts[(movedIdx - 1 + pts.length) % pts.length][0]}
                y1={pts[(movedIdx - 1 + pts.length) % pts.length][1]}
                x2={pts[movedIdx % pts.length][0]}
                y2={pts[movedIdx % pts.length][1]}
                stroke="var(--w-danger)" strokeWidth="2" opacity="0.9"
                vectorEffect="non-scaling-stroke" />
            )}

            {pts.map(([x, y], i) => {
              const m = marks[i];
              const moved = m?.state === 'moved';
              return (
                <g key={`${x}-${y}`}>
                  <circle cx={x} cy={y} r="0.9" fill={moved ? 'var(--w-danger)' : 'var(--w-accent)'} />
                  <text x={x + 2.2} y={y + 1} fontSize="2.6" fontFamily="var(--font-mono)"
                        fill={moved ? 'var(--w-danger)' : 'var(--w-ink-2)'}>
                    {m?.seq ?? i + 1}
                  </text>
                </g>
              );
            })}
            <text x="50" y="52" fontSize="3.4" textAnchor="middle" fontFamily="var(--font-mono)"
                  fill="var(--w-ink-3)">
              {data.extentLabel}
            </text>
            {movedIdx >= 0 && pts[movedIdx] && (
              <text x={Math.min(88, pts[movedIdx][0] + 3)} y={Math.min(96, pts[movedIdx][1] + 7)}
                    fontSize="2.8" fontFamily="var(--font-mono)" fill="var(--w-danger)">
                {marks[movedIdx]?.seq} moved
              </text>
            )}
          </svg>

          <span className="cap">{data.caption}</span>
          <div className="zoom">
            <button type="button" aria-label="Zoom in">+</button>
            <button type="button" aria-label="Zoom out">−</button>
            <button type="button" aria-label="Recentre"><MyLocationOutlined sx={{ fontSize: 15 }} /></button>
          </div>
        </div>

        <aside className="stack">
          <Card title={<span className="eyebrow" style={{ margin: 0 }}>Location</span>}>
            <KV
              rows={[
                { k: 'Pin', v: `${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}` },
                { k: 'Set by', v: data.setBy, highlight: true },
                { k: 'Accuracy', v: data.accuracy },
              ]}
            />
          </Card>

          <Card title="Boundary marks"
                aside={<button type="button" className="link accent"
                               style={{ border: 0, background: 'none', font: 'inherit', fontSize: '0.8125rem', color: 'var(--w-accent)', cursor: 'pointer' }}>
                  Add a mark
                </button>}>
            {marks.length === 0 && (
              <p className="note">
                No marks recorded. A mark is a numbered corner with its own photos and its
                own history — add one, or order a survey and the surveyor sets them.
              </p>
            )}
            <div className="rows">
              {marks.map((m) => {
                const moved = m.state === 'moved';
                return (
                  <div key={m.id} style={{ display: 'block', padding: 'var(--space-sm) 0' }}>
                    <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                      <span
                        className="avatarlg"
                        style={{
                          width: '1.5rem', height: '1.5rem', fontSize: '0.6875rem',
                          background: moved ? 'var(--w-danger-wash)' : 'var(--w-accent-wash)',
                          color: moved ? 'var(--w-danger)' : 'var(--w-accent)',
                          borderColor: 'transparent',
                        }}
                      >
                        {m.seq}
                      </span>
                      <span className="grow">
                        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: moved ? 'var(--w-danger)' : undefined }}>
                          {m.label}
                        </span>
                        <span className="note" style={{ display: 'block' }}>{m.detail}</span>
                      </span>
                      <span className="muted" aria-hidden style={{ display: 'flex' }}>
                        <MoreVertOutlined sx={{ fontSize: 16 }} />
                      </span>
                    </div>

                    {moved && (
                      <>
                        <div className="row tight" style={{ marginTop: 'var(--space-sm)', paddingLeft: '2rem' }}>
                          <button type="button" className="btn sm">View photos</button>
                          <button type="button" className="btn sm"
                                  onClick={() => accept.mutate({ markId: m.id })}>
                            Accept new position
                          </button>
                          <button type="button" className="btn sm danger"
                                  onClick={() => remove.mutate({ markId: m.id })}>
                            Delete mark
                          </button>
                        </div>
                        <p className="note" style={{ marginTop: 'var(--space-sm)', paddingLeft: '2rem' }}>
                          Deleting a mark keeps the old position in History — the FMB sheet it came
                          from is never edited.
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
              <span style={{ display: 'flex', color: 'var(--w-info)' }}>
                <FullscreenOutlined sx={{ fontSize: 18 }} />
              </span>
              <span className="grow">
                <strong style={{ fontSize: '0.875rem' }}>{data.sheetTitle}</strong>
                <span className="note" style={{ display: 'block' }}>{data.sheetDetail}</span>
              </span>
            </div>
            <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
              <button type="button" className="btn sm">Open sheet</button>
              <button type="button" className="btn sm">Replace</button>
              <button type="button" className="btn sm">Version history</button>
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}
