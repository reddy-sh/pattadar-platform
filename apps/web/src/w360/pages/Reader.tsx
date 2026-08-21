/** W13 — reading a document: the paper on the left, what was read from it on
 *  the right.
 *
 *  Two things this screen refuses to blur together. The SCAN is the evidence
 *  and is never altered — v1 is kept even after a better rescan replaces it.
 *  The READING is a machine's summary of that scan, is labelled as such, and
 *  says out loud where it was unsure ("the sub-division digit is smudged on
 *  page 4") instead of quietly guessing. */
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import RotateRightOutlined from '@mui/icons-material/RotateRightOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';

import { useDocument } from '../api';
import { Card, Chip, KV, Loading, Tag, inrFull } from '../ui';

const SHELF_WORD: Record<string, string> = {
  title: 'Title', revenue: 'Revenue record', map: 'Map', search: 'Search & tax',
  identity: 'Identity', old: 'Old record', photos: 'Photos', unsorted: 'Unsorted',
};

export function Reader() {
  const { id } = useParams();
  const { data, isLoading } = useDocument(id);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(124);
  const [q, setQ] = useState('');

  if (isLoading || !data) return <main><Loading h="80vh" /></main>;

  const pages = Math.max(1, data.pageCount);
  const thumbs = Math.min(6, pages);

  return (
    <main className="flush">
      <header className="row between" style={{ padding: 'var(--space-sm) var(--space-lg)', borderBottom: '1px solid var(--w-line)', flexWrap: 'nowrap', gap: 'var(--space-md)' }}>
        <span className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
          <Link className="iconbtn" to={data.recordId ? `/app/records/${data.recordId}` : '/app/papers'}
                aria-label="Back">
            <ArrowBackOutlined sx={{ fontSize: 18 }} />
          </Link>
          <span>
            <strong style={{ fontSize: '1rem' }}>{data.title}</strong>
            <span className="note" style={{ display: 'block' }}>
              {[data.recordTitle, SHELF_WORD[data.shelf], `${pages} pages`, data.sizeLabel]
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>

        <span className="search" style={{ width: '18rem' }}>
          <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search inside this paper" aria-label="Search inside this paper" />
          {/* No in-document text search yet, so the box does not claim a
              count it has not made. */}
          {q && <span className="note mono">searching…</span>}
        </span>

        <span className="row tight" style={{ flexWrap: 'nowrap' }}>
          <span className="segmented">
            <button type="button" onClick={() => setZoom(Math.max(50, zoom - 12))} aria-label="Zoom out">−</button>
            <button type="button" className="mono" style={{ pointerEvents: 'none' }}>{zoom}%</button>
            <button type="button" onClick={() => setZoom(Math.min(400, zoom + 12))} aria-label="Zoom in">+</button>
          </span>
          <button type="button" className="iconbtn" aria-label="Rotate"><RotateRightOutlined sx={{ fontSize: 17 }} /></button>
          <button type="button" className="iconbtn" aria-label="Print"><PrintOutlined sx={{ fontSize: 17 }} /></button>
          <button type="button" className="btn sm"><FileDownloadOutlined sx={{ fontSize: 15 }} /> Download</button>
          <button type="button" className="btn primary sm"><IosShareOutlined sx={{ fontSize: 15 }} /> Share securely</button>
          <button type="button" className="iconbtn" aria-label="More"><MoreVertOutlined sx={{ fontSize: 18 }} /></button>
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '7rem minmax(0,1fr) 24rem', minHeight: 'calc(100vh - 4.5rem)' }}>
        <nav aria-label="Pages" style={{ borderRight: '1px solid var(--w-line)', padding: 'var(--space-md)', display: 'grid', gap: '0.625rem', alignContent: 'start' }}>
          {Array.from({ length: thumbs }).map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n + 1)}
              aria-current={page === n + 1}
              className="thumb"
              style={{
                width: '100%', height: '4.5rem',
                borderColor: page === n + 1 ? 'var(--w-accent)' : 'var(--w-line)',
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              }}
            >
              {n + 1}
              {data.readerFlagPage === n + 1 && (
                <span className="src" style={{ background: 'var(--w-accent)' }} aria-hidden />
              )}
            </button>
          ))}
          {pages > thumbs && <span className="note mono" style={{ textAlign: 'center' }}>+{pages - thumbs}</span>}
        </nav>

        <section style={{ display: 'grid', gridTemplateRows: 'minmax(0,1fr) auto', placeItems: 'center', padding: 'var(--space-lg)', gap: 'var(--space-md)' }}>
          {/* A page of a scanned deed is white paper. That is the one place a
              neutral literal is right — the palette must not tint evidence. */}
          <div
            style={{
              // Height-led, so a page always fits the reader; zoom then scales
              // it within that. Width-led at 124% ran the seal off the screen.
              height: '100%', maxWidth: `min(${zoom}%, 44rem)`,
              aspectRatio: '1 / 1.35', background: '#f4f1ea',
              borderRadius: 'var(--radius-xs)', position: 'relative', display: 'grid',
              alignContent: 'start', gap: '0.5rem', padding: '2.5rem 2rem',
            }}
          >
            {[70, 45, 0, 92, 88, 96, 74, 90, 84, 62].map((w, n) => (
              <span key={n} style={{
                height: n === 2 ? '1px' : '0.5rem', width: `${w}%`,
                background: n === 4 ? 'var(--color-accent-soft)' : '#d9d3c7',
                borderRadius: '2px', justifySelf: n < 2 ? 'center' : 'start',
              }} />
            ))}
            <span style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 700,
              color: 'rgb(0 0 0 / 0.04)', letterSpacing: '0.1em', pointerEvents: 'none',
            }} aria-hidden>PATTADAR</span>
            <span style={{
              position: 'absolute', right: '2rem', bottom: '3rem', width: '5rem', height: '5rem',
              border: '1px dashed #c3bcae', borderRadius: '50%', display: 'grid',
              placeItems: 'center', color: '#a29a8c', fontSize: '0.625rem',
              fontFamily: 'var(--font-mono)', textAlign: 'center',
            }} aria-hidden>SRO<br />seal</span>
            <span style={{
              position: 'absolute', left: 0, right: 0, bottom: '0.5rem', textAlign: 'center',
              color: '#a29a8c', fontFamily: 'var(--font-mono)', fontSize: '0.625rem',
            }}>
              page placeholder · the real scan renders here · page {page} of {pages}
            </span>
          </div>

          <div className="row tight" style={{ flexWrap: 'nowrap' }}>
            <button type="button" className="iconbtn" onClick={() => setPage(Math.max(1, page - 1))}
                    aria-label="Previous page" style={{ border: '1px solid var(--w-line)' }}>
              <ChevronLeftOutlined sx={{ fontSize: 17 }} />
            </button>
            <span className="mono" style={{ fontSize: '0.8125rem' }}>{page} / {pages}</span>
            <button type="button" className="iconbtn" onClick={() => setPage(Math.min(pages, page + 1))}
                    aria-label="Next page" style={{ border: '1px solid var(--w-line)' }}>
              <ChevronRightOutlined sx={{ fontSize: 17 }} />
            </button>
          </div>
        </section>

        <aside style={{ borderLeft: '1px solid var(--w-line)', padding: 'var(--space-lg)', overflowY: 'auto', display: 'grid', gap: 'var(--space-md)', alignContent: 'start' }}>
          <div className="row between">
            <span className="row tight">
              <Chip>● {SHELF_WORD[data.shelf] ?? data.shelf}</Chip>
              {data.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
            </span>
            {data.shared && (
              <span className="note row tight" style={{ color: 'var(--w-info)' }}>
                <LinkOutlined sx={{ fontSize: 13 }} /> shared
              </span>
            )}
          </div>

          <h2 style={{ fontSize: '1.375rem' }}>{data.title}</h2>

          {(data.registeredOn || data.buyer) && (
            <KV
              rows={[
                ...(data.registeredOn ? [{ k: 'Registered', v: data.registeredOn }] : []),
                ...(data.office ? [{ k: 'Office', v: data.office }] : []),
                ...(data.buyer ? [{ k: 'Buyer', v: data.buyer }] : []),
                ...(data.seller ? [{ k: 'Seller', v: data.seller }] : []),
                ...(data.consideration ? [{ k: 'Consideration', v: inrFull(data.consideration) }] : []),
              ]}
            />
          )}

          {data.readerSummary && (
            <Card title={
              <span className="row tight">
                <span className="mono muted" style={{ fontSize: '0.75rem', letterSpacing: '0.08em' }}>TEXT_</span>
                <SearchOutlined sx={{ fontSize: 15 }} aria-hidden />
                What the reader found
              </span>
            }>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.55, margin: 0, color: 'var(--w-ink-2)' }}>
                {data.readerSummary}
              </p>
              {data.readerFlag && (
                <>
                  <hr className="hr" />
                  <div className="row between" style={{ flexWrap: 'nowrap' }}>
                    <span className="note row tight">
                      <span className="accent" style={{ display: 'flex' }}>
                        <ErrorOutlineOutlined sx={{ fontSize: 15 }} />
                      </span>
                      {data.readerFlag}
                    </span>
                    <button type="button" className="link accent"
                            onClick={() => setPage(data.readerFlagPage || 1)}
                            style={{ border: 0, background: 'none', font: 'inherit', fontSize: '0.8125rem', color: 'var(--w-accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Go to it
                    </button>
                  </div>
                </>
              )}
            </Card>
          )}

          {data.versions.length > 0 && (
            <Card title="Versions" aside={<button type="button" className="link accent" style={{ border: 0, background: 'none', font: 'inherit', fontSize: '0.8125rem', color: 'var(--w-accent)', cursor: 'pointer' }}>Replace</button>}>
              <div className="rows">
                {data.versions.map((v) => (
                  <div key={v.id}>
                    <span className="pill managed mono">v{v.version}</span>
                    <span className="grow">
                      <span style={{ display: 'block', fontSize: '0.875rem' }}>{v.label}</span>
                      <span className="note mono" style={{ display: 'block', fontSize: '0.6875rem' }}>
                        {[v.madeOn, v.madeBy && `by ${v.madeBy}`, v.note].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data.link && (
            <Card>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
                <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                  <VisibilityOutlined sx={{ fontSize: 17 }} />
                </span>
                <span>
                  <strong style={{ fontSize: '0.875rem' }}>
                    {data.link.audience} has opened this {data.link.openedCount} times
                  </strong>
                  <span className="note" style={{ display: 'block' }}>
                    Last {data.link.lastOpenedAt} ·{' '}
                    {data.link.daysLeft <= 1 ? 'link expires tomorrow' : `${data.link.daysLeft} days left`}
                  </span>
                </span>
              </div>
            </Card>
          )}

          <div className="card alert">
            <h3 className="down row tight">
              <DeleteOutlineOutlined sx={{ fontSize: 16 }} /> Delete this document
            </h3>
            <p className="note" style={{ marginTop: '0.5rem', color: 'var(--w-ink-2)' }}>
              {data.shelf === 'title' && data.shared
                ? <>It is your title to this land and it is shared right now, so it asks you to type{' '}
                    {data.title.replace(/^\D+/, '')} first.</>
                : <>It archives for 30 days before it is destroyed, and every version goes with it.</>}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
