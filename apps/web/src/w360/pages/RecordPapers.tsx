/** W03 — the record's front page. Its hero states the four numbers you are
 *  asked for on a phone call (extent, worth, rate, year bought), and its
 *  default hanger is Papers, because that is what a piece of land IS in the
 *  Indian system: a stack of paper that agrees with itself. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';

import { usePapers } from '../api';
import { Card, Cell, Chip, Icon, Loading, Pill, Tag, coords, inr, num, plural } from '../ui';
import { RecordCrumbs, RecordTabs, useRecordCtx } from './Record';

const SHELF_WORD: Record<string, string> = {
  title: 'Title', revenue: 'Revenue record', map: 'Map', search: 'Search & tax',
  identity: 'Identity', old: 'Old record', photos: 'Photos', unsorted: 'Unsorted',
};

const STATUS_WORD: Record<string, string> = {
  owned: 'Owned', for_sale: 'For sale', disputed: 'Disputed', managed: 'Managed', watch: 'Watch',
};

/** What to call this record in a sentence. A flat is not a parcel. */
const nounFor = (kind: string, cls: string) =>
  kind === 'parcel' ? 'parcel'
    : cls === 'flat' ? 'flat'
    : cls === 'shop' ? 'shop'
    : cls === 'open_plot' ? 'plot' : 'property';

export function RecordPapers() {
  const rec = useRecordCtx();
  const noun = nounFor(rec.kind, rec.classification);
  const { data: papers, isLoading } = usePapers(rec.id);
  const [shelf, setShelf] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const shelves = useMemo(() => {
    const counts = new Map<string, number>();
    (papers ?? []).forEach((p) => counts.set(p.shelf, (counts.get(p.shelf) ?? 0) + 1));
    return [...counts.entries()];
  }, [papers]);

  const shown = (papers ?? []).filter((p) =>
    (!shelf || p.shelf === shelf)
    && (!q.trim() || `${p.title} ${p.detail}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <main>
      <RecordCrumbs rec={rec} />

      <header className="pagehead">
        <div className="grow">
          <p className="eyebrow">{rec.eyebrow}</p>
          <div className="row" style={{ gap: 'var(--space-sm)' }}>
            <h1>{rec.title}</h1>
            {rec.status !== 'owned' && <Pill kind={rec.status}>{STATUS_WORD[rec.status]}</Pill>}
            {rec.stake !== 'owned' && <Pill kind={rec.stake}>{STATUS_WORD[rec.stake]}</Pill>}
          </div>
          <p className="lede" style={{ marginTop: '0.375rem' }}>
            {rec.placeLine} — Andhra Pradesh
            {rec.placeLineTe && <> · <span className="accent">{rec.placeLineTe}</span></>}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn">
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </button>
          <button type="button" className="btn primary">
            <IosShareOutlined sx={{ fontSize: 16 }} /> Share securely
          </button>
          <button type="button" className="btn icon" aria-label="More">
            <MoreVertOutlined sx={{ fontSize: 18 }} />
          </button>
        </div>
      </header>

      <div className="split">
        <div>
          <div className="strip" style={{ marginBottom: 'var(--space-lg)' }}>
            <Cell
              k="Extent"
              v={rec.extentUnit === 'ac' ? num(rec.extent, 2) : num(rec.extent)}
              unit={rec.extentUnit}
              note={rec.extentDetail}
            />
            <Cell k="Market value" v={inr(rec.marketValue)} />
            <Cell k={rec.perUnitLabel} v={inr(rec.perUnitValue)} />
            <Cell k="Bought" v={rec.boughtYear || 'Not recorded'} />
          </div>

          <RecordTabs rec={rec} />

          <div className="row" style={{ gap: 'var(--space-sm)', margin: 'var(--space-md) 0' }}>
            <span className="search" style={{ width: '22rem' }}>
              <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={rec.paperCount > 0
                  ? `Search the ${plural(rec.paperCount, 'paper')} on this ${noun}`
                  : `No papers on this ${noun} yet`}
                aria-label="Search this record's papers"
              />
            </span>
            {shelves.map(([k, n]) => (
              <Chip key={k} active={shelf === k} count={n}
                    onClick={() => setShelf(shelf === k ? null : k)}>
                {SHELF_WORD[k] ?? k}
              </Chip>
            ))}
            <button type="button" className="btn sm">
              <AddOutlined sx={{ fontSize: 15 }} /> Add a paper
            </button>
          </div>

          {isLoading && <Loading h="12rem" />}

          <div className="card" style={{ padding: 0 }}>
            <div className="rows boxed">
              {shown.map((p) => (
                <div key={p.id}>
                  <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
                    <Icon name={p.shelf} size={18} />
                  </span>
                  <span className="grow">
                    <Link to={`/app/papers/${p.id}`}
                          style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: '0.9375rem' }}>
                      {p.title}
                    </Link>
                    <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{p.detail}</span>
                  </span>
                  <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                    <Chip>● {SHELF_WORD[p.shelf] ?? p.shelf}</Chip>
                    {p.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
                    {p.shared && (
                      <span className="note row tight" style={{ color: 'var(--w-info)' }}>
                        <LinkOutlined sx={{ fontSize: 13 }} /> shared
                      </span>
                    )}
                    <span className="muted" aria-hidden style={{ display: 'flex' }}>
                      <MoreVertOutlined sx={{ fontSize: 17 }} />
                    </span>
                  </span>
                </div>
              ))}
              {/* Two different emptinesses: nothing filed at all, versus a
                  filter that happened to miss. */}
              {!isLoading && shown.length === 0 && (
                <div>
                  <p className="note">
                    {papers && papers.length === 0
                      ? `Nothing is filed against this ${noun} yet. A deed, a passbook or a receipt added here becomes searchable by its text.`
                      : 'No paper here matches that.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="stack">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <Link to={`/app/records/${rec.id}/map`} style={{ display: 'block', position: 'relative' }}>
              <svg viewBox="0 0 100 62" style={{ display: 'block', width: '100%', background: 'var(--w-surface-2)' }}
                   role="img" aria-label="Boundary sketch">
                <polygon points="14,50 16,16 78,12 84,48" fill="var(--w-accent)" fillOpacity="0.12"
                         stroke="var(--w-accent)" strokeWidth="1.1" />
                {[[14, 50], [16, 16], [78, 12]].map(([x, y]) => (
                  <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="var(--w-accent)" />
                ))}
                <circle cx="84" cy="48" r="1.8" fill="var(--w-danger)" />
                <path d="M0 58 L100 52" stroke="var(--w-line-strong)" strokeWidth="2.4" opacity="0.7" />
              </svg>
              {/* The caption sits in its own band: over the sketch's own
                  strokes it was unreadable at thumbnail size. */}
              <span
                className="cap"
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  padding: '0.3125rem 0.625rem',
                  background: 'color-mix(in oklab, var(--w-bg) 82%, transparent)',
                }}
              >
                {rec.mapCaption}
              </span>
            </Link>
            <div style={{ padding: 'var(--space-md)' }}>
              <h3>Where it is</h3>
              {/* An unset pin says so. Printed as 0.0000° N it read as a real
                  place — in the Gulf of Guinea. */}
              <p className={coords(rec.lat, rec.lon) ? 'num' : 'note'}
                 style={{ margin: '0.375rem 0', fontSize: '0.875rem' }}>
                {coords(rec.lat, rec.lon) || 'No pin set yet — open the map to place one'}
              </p>
              <Link className="link accent" to={`/app/records/${rec.id}/map`} style={{ fontSize: '0.8125rem' }}>
                Open map &amp; boundary ›
              </Link>
            </div>
          </div>

          <Card title="Photos" aside={<span className="num muted">{rec.photoCount}</span>}>
            {rec.photoCount === 0 ? (
              <p className="note">
                No photos yet. A dated, geo-stamped photo is what makes everything else on
                this record checkable.
              </p>
            ) : (
              <>
                <div className="tiles">
                  {Array.from({ length: Math.min(rec.photoCount, 5) }).map((_, i) => (
                    <Link key={i} className="t" to={`/app/records/${rec.id}/photos`}
                          aria-label={`Photo ${i + 1}`}>
                      <Icon name={['place', 'crop', 'well', 'fence', 'crop'][i]} size={20} />
                    </Link>
                  ))}
                  {rec.photoCount > 5 && (
                    <Link className="t" to={`/app/records/${rec.id}/photos`}>
                      +{rec.photoCount - 5}
                    </Link>
                  )}
                </div>
                {rec.photoNote && (
                  <p className="note" style={{ marginTop: 'var(--space-sm)' }}>{rec.photoNote}</p>
                )}
                <Link className="link accent" to={`/app/records/${rec.id}/photos`}
                      style={{ fontSize: '0.8125rem' }}>
                  Open gallery ›
                </Link>
              </>
            )}
          </Card>

          {rec.noteBody && (
            <Card title="Notes">
              <p style={{ fontSize: '0.9375rem', lineHeight: 1.55, margin: 0 }}>{rec.noteBody}</p>
              <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                <span className="avatarlg" style={{ width: '1.375rem', height: '1.375rem', fontSize: '0.625rem' }}>
                  {rec.noteAuthor.slice(0, 1)}
                </span>
                <span className="note">{rec.noteAuthor} · {rec.noteAt}</span>
              </div>
            </Card>
          )}

          {(rec.khataNo || rec.ownerName) && (
            <p className="note row tight">
              <PlaceOutlined sx={{ fontSize: 13 }} aria-hidden />{' '}
              {[rec.khataNo && `Khata ${rec.khataNo}`, rec.ownerName].filter(Boolean).join(' · ')}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
