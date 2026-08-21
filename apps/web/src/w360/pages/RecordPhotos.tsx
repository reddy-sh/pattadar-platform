/** W05 + W14 — photos as dated evidence, not decoration.
 *
 *  One screen, two right-hand panels. Scoped to the record it is the gallery:
 *  metadata, tags, and the one field you may change (the caption). Scoped to a
 *  feature (`?feature=`) it becomes the provenance panel: why this photo is of
 *  THAT bore, and what a forwarded picture can and cannot be used for.
 *
 *  The delete copy is not a generic confirm. It names what the photo is doing
 *  elsewhere, because W14's point is that one file is referenced three times
 *  and removing it from one place does not remove it from the others. */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import FingerprintOutlined from '@mui/icons-material/FingerprintOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';

import { usePhotos, useUpdateCaption } from '../api';
import type { Photo } from '../api';
import { Card, Icon, KV, Loading, Tag, ddmmyyyy, plural } from '../ui';
import { useRecordCtx } from './Record';

/** '2026-08-12 07:41 IST' → '12/08/2026 07:41 IST'. A capture stamp is
 *  evidence and is read in the same order as every other date here. */
const stamp = (s: string) => (s ? `${ddmmyyyy(s.slice(0, 10))}${s.slice(10)}` : '');

function Provenance({ p, subject }: { p: Photo; subject: string }) {
  // Every line below is a fact about THIS photo; an unverified one asserts none.
  const checks = [
    [PhotoCameraOutlined, 'Shot inside Pattadar, not picked from a gallery', p.source === 'app'],
    [AccessTimeOutlined, 'Device clock matched our server to the second', p.deviceClockOk],
    [FingerprintOutlined, `Unedited since capture  sha256 ${p.sha256.slice(0, 4)}…${p.sha256.slice(-4)}`, !!p.sha256],
    [PersonOutlined, `${p.capturedBy} · Pattadar caretaker, ID verified`, !!p.capturedBy],
    [ReceiptLongOutlined, `Came in on order ${p.orderRef}, a paid site visit`, !!p.orderRef],
  ] as const;

  return (
    <>
      <p className="eyebrow">Source of truth</p>
      <h2 style={{ fontSize: '1.375rem', marginBottom: 'var(--space-md)' }}>Why this is {subject}</h2>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-md)' }}>
        {!p.verified ? (
          <p className="note" style={{ padding: 'var(--space-md)', color: 'var(--w-ink-2)' }}>
            This photo carries no location of its own, so there is nothing to compare
            against the saved pin. That is what makes it a picture rather than evidence.
          </p>
        ) : (
        <>
        <svg viewBox="0 0 100 46" style={{ display: 'block', width: '100%', background: 'var(--w-surface-2)' }}
             role="img" aria-label="Where the photo was taken against the saved pin">
          <polygon points="8,38 10,10 88,7 92,36" fill="none" stroke="var(--w-ink-3)" strokeWidth="0.5" />
          <circle cx="48" cy="22" r="9" fill="var(--w-ok)" fillOpacity="0.14" />
          <circle cx="45" cy="22" r="1.7" fill="var(--w-info)" />
          <circle cx="51" cy="21" r="1.7" fill="var(--w-accent)" />
          <text x="24" y="26" fontSize="2.6" fill="var(--w-info)" fontFamily="var(--font-mono)">saved pin</text>
          <text x="55" y="19" fontSize="2.6" fill="var(--w-accent)" fontFamily="var(--font-mono)">photo taken</text>
          <text x="50" y="43" fontSize="2.2" textAnchor="middle" fill="var(--w-ink-3)"
                fontFamily="var(--font-mono)">
            {Math.round(p.pinDistanceM)} m apart · inside the boundary
          </text>
        </svg>
        <p className="note" style={{ padding: 'var(--space-md)', color: 'var(--w-ink-2)' }}>
          The photo&rsquo;s own coordinates land <strong>{Math.round(p.pinDistanceM)} m</strong> from
          where {subject ? subject.toLowerCase() : 'this feature'} is pinned, and both sit inside
          the boundary. Anything beyond 50 m is flagged for you to look at.
        </p>
        </>
        )}
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 'var(--space-md)' }}>
        <div className="checks">
          {checks.map(([I, label, ok]) => (
            <div key={label as string}>
              <span style={{ display: 'flex', color: ok ? 'var(--w-ok)' : 'var(--w-ink-3)' }}>
                <I sx={{ fontSize: 16 }} />
              </span>
              <span className="mono" style={{ fontSize: '0.75rem' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function RecordPhotos() {
  const { id } = useParams();
  const rec = useRecordCtx();
  const [params] = useSearchParams();
  const featureId = params.get('feature') ?? undefined;
  const { data, isLoading } = usePhotos(id, featureId);
  const save = useUpdateCaption();
  const [i, setI] = useState(0);
  const [caption, setCaption] = useState('');

  const photos = data?.photos ?? [];
  const p = photos[Math.min(i, photos.length - 1)];

  useEffect(() => { if (p) setCaption(p.caption); }, [p?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
      if (e.key === 'ArrowRight') setI((v) => Math.min(photos.length - 1, v + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length]);

  if (isLoading || !data) return <main><Loading h="80vh" /></main>;
  if (!p) return <main><p className="note">No photos on this record yet.</p></main>;

  const unproven = photos.filter((x) => !x.verified).length;

  return (
    <main className="flush">
      <header className="row between" style={{ padding: 'var(--space-sm) var(--space-lg)', borderBottom: '1px solid var(--w-line)', flexWrap: 'nowrap', gap: 'var(--space-md)' }}>
        <span className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
          <Link to={`/app/records/${id}`} className="iconbtn" aria-label="Back to the record">
            <ArrowBackOutlined sx={{ fontSize: 18 }} />
          </Link>
          <span>
            <strong style={{ fontSize: '1rem' }}>
              {featureId ? `${data.subject} · photos` : `${rec.title} · Photos`}
            </strong>
            <span className="note" style={{ display: 'block' }}>
              {featureId
                ? `${plural(photos.length, 'photo')} across ${plural(data.visitCount, 'visit')}`
                : [plural(data.total, 'photo'),
                   data.videoCount ? plural(data.videoCount, 'video') : '',
                   plural(data.visitCount, 'site visit')].filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
        <span className="row tight" style={{ flexWrap: 'nowrap' }}>
          {featureId ? (
            <>
              <span className="chip static" style={{ color: 'var(--w-ok)', borderColor: 'color-mix(in oklab, var(--w-ok) 40%, transparent)' }}>
                <GppGoodOutlined sx={{ fontSize: 14 }} /> {photos.length - unproven} verified on site
              </span>
              <span className="chip static alert">
                <LinkOffOutlined sx={{ fontSize: 14 }} /> {unproven} unproven
              </span>
              <button type="button" className="btn sm">
                <PhotoCameraOutlined sx={{ fontSize: 15 }} /> Ask for a fresh photo
              </button>
            </>
          ) : (
            <>
              <span className="search" style={{ width: '16rem' }}>
                <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
                <input placeholder="Search photos by tag or date" aria-label="Search photos" />
              </span>
              <button type="button" className="btn sm">
                <ChecklistOutlined sx={{ fontSize: 15 }} /> Select
              </button>
              <button type="button" className="btn primary sm">
                <FileUploadOutlined sx={{ fontSize: 15 }} /> Upload
              </button>
            </>
          )}
        </span>
      </header>

      <div className="lightbox">
        <div className="stage"
             style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto',
                      placeItems: 'stretch', gap: 'var(--space-md)' }}>
          {!featureId && (
            <div className="row tight">
              <span className="chip static">
                <PlaceOutlined sx={{ fontSize: 13 }} /> geo-stamped
              </span>
              <span className="chip static">
                <GppGoodOutlined sx={{ fontSize: 13 }} /> from a Pattadar visit
              </span>
            </div>
          )}

          {/* minWidth:0 + overflow:hidden is what actually clamps the frame: an
              aspect-ratio box sized from its height will happily exceed its
              flex track and paint over the panel beside it. */}
          <div className="row"
               style={{ flexWrap: 'nowrap', gap: 'var(--space-md)', alignItems: 'stretch',
                        justifyContent: 'center', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
            <button type="button" className="iconbtn" onClick={() => setI(Math.max(0, i - 1))}
                    disabled={i === 0} aria-label="Previous photo"
                    style={{ border: '1px solid var(--w-line)', alignSelf: 'center', flex: 'none' }}>
              <ChevronLeftOutlined sx={{ fontSize: 18 }} />
            </button>
            <div className="frame"
                 style={{ width: 'auto', height: '100%', maxWidth: '100%',
                          minWidth: 0, flex: '0 1 auto' }}>
              <span style={{ display: 'grid', justifyItems: 'center', gap: '0.5rem' }}>
                <Icon name={p.mediaKind === 'video' ? 'video' : p.category.toLowerCase()} size={40} />
                <span className="mono note">
                  photo placeholder · {p.fileName}
                  {p.width > 0 && ` · ${p.width} × ${p.height}`}
                </span>
              </span>
              {p.verified && (
                <span style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)' }}>
                  <span className="pill owned"><GppGoodOutlined sx={{ fontSize: 13 }} /> Verified on site</span>
                </span>
              )}
              {p.lat > 0 && (
                <span className="stamp">
                  {p.lat.toFixed(4)}° N {p.lon.toFixed(4)}° E ±{Math.round(p.accuracyM)} m<br />
                  {stamp(p.capturedAt)}
                </span>
              )}
            </div>
            <button type="button" className="iconbtn" onClick={() => setI(Math.min(photos.length - 1, i + 1))}
                    disabled={i >= photos.length - 1} aria-label="Next photo"
                    style={{ border: '1px solid var(--w-line)', alignSelf: 'center', flex: 'none' }}>
              <ChevronRightOutlined sx={{ fontSize: 18 }} />
            </button>
          </div>

          <div className="thumbs" style={{ border: 0, padding: 0 }}>
            {photos.slice(0, 5).map((t, n) => (
              <button key={t.id} type="button" className="thumb" aria-current={n === i}
                      onClick={() => setI(n)} aria-label={t.caption}>
                <Icon name={t.mediaKind === 'video' ? 'video' : t.category.toLowerCase()} size={18} />
                <span className={t.verified ? 'src' : 'src no'} aria-hidden />
              </button>
            ))}
            {photos.length > 5 && (
              <span className="thumb" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                +{photos.length - 5}
              </span>
            )}
            <span className="grow" />
            <span className="note" style={{ alignSelf: 'center' }}>
              {featureId
                ? <>● taken here, in the app &nbsp; ● uploaded, location unproven</>
                : <>Grouped by visit · <span className="num">{ddmmyyyy(data.latestVisit)}</span> · {data.latestVisitCount} photos</>}
            </span>
          </div>
        </div>

        <aside className="side">
          {featureId ? (
            <>
              <Provenance p={p} subject={data.subject} />
              {unproven > 0 && (
                <div className="card alert" style={{ marginBottom: 'var(--space-md)' }}>
                  <h3 className="down row tight">
                    <LinkOffOutlined sx={{ fontSize: 16 }} /> {unproven} photos here prove nothing
                  </h3>
                  <p className="note" style={{ margin: '0.5rem 0', color: 'var(--w-ink-2)' }}>
                    A neighbour sent them on WhatsApp in 2023. Forwarding strips the location, so
                    they are kept as pictures but never used as evidence — not in a dispute, not in
                    a listing, not for a bank.
                  </p>
                  <div className="row tight">
                    <button type="button" className="btn sm">Set their place by hand</button>
                    <button type="button" className="btn sm">Leave as is</button>
                  </div>
                </div>
              )}
              <Card title="This photo is doing three jobs">
                <p className="note" style={{ color: 'var(--w-ink-2)' }}>
                  It is {data.subject || 'this feature'}&rsquo;s current condition on the Features
                  tab{p.orderRef && <>, the evidence on order {p.orderRef}</>}, and one of this
                  record&rsquo;s photos. One file, filed once, referenced from several places —
                  deleting it from one does not remove it from the others.
                </p>
              </Card>
            </>
          ) : (
            <>
              <p className="eyebrow">Photo {i + 1} of {photos.length}</p>
              <input
                aria-label="Caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={() => caption !== p.caption && save.mutate({ photoId: p.id, caption })}
                style={{
                  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.375rem',
                  border: 0, background: 'none', padding: 0, marginBottom: '0.5rem',
                  width: '100%',
                }}
              />
              <p className="note" style={{ marginBottom: 'var(--space-md)' }}>
                Caption is editable — click and type. It is the only thing on this photo you can change.
              </p>

              <KV
                rows={[
                  { k: 'Taken', v: stamp(p.capturedAt) },
                  ...(p.localTime ? [{ k: 'Your time', v: p.localTime }] : []),
                  { k: 'By', v: p.capturedBy },
                  { k: 'Where', v: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` },
                  ...(p.orderRef ? [{ k: 'Order', v: <span className="accent">{p.orderRef} ›</span> }] : []),
                ]}
              />

              <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Tags</p>
              <div className="row tight">
                <Tag>Photos</Tag>
                <Tag>{rec.title}</Tag>
                <Tag>visit {ddmmyyyy(p.capturedAt.slice(0, 10))}</Tag>
                {p.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
                <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--w-accent)', borderColor: 'var(--w-accent)' }}>
                  + tag
                </span>
              </div>

              <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Do</p>
              <div className="grid4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--space-xs)' }}>
                <button type="button" className="btn" style={{ justifyContent: 'center' }}>
                  <ImageOutlined sx={{ fontSize: 15 }} /> Make cover
                </button>
                <button type="button" className="btn" style={{ justifyContent: 'center' }}>
                  <MyLocationOutlined sx={{ fontSize: 15 }} /> Pin on map
                </button>
                <button type="button" className="btn" style={{ justifyContent: 'center' }}>
                  <IosShareOutlined sx={{ fontSize: 15 }} /> Share
                </button>
                <button type="button" className="btn" style={{ justifyContent: 'center' }}>
                  <FileDownloadOutlined sx={{ fontSize: 15 }} /> Download
                </button>
              </div>

              <div className="card alert" style={{ marginTop: 'var(--space-lg)' }}>
                <h3 className="down row tight">
                  <DeleteOutlineOutlined sx={{ fontSize: 16 }} /> Delete this photo
                </h3>
                <p className="note" style={{ marginTop: '0.5rem', color: 'var(--w-ink-2)' }}>
                  {p.tags.includes('boundary dispute')
                    ? <>It is evidence in a live boundary dispute and is attached to order {p.orderRef}, so it archives for 30 days first. Nothing about the order changes.</>
                    : <>It archives for 30 days before it is destroyed. Anything referencing it keeps working until then.</>}
                </p>
              </div>

              <p className="note" style={{ marginTop: 'var(--space-md)' }}>
                Bulk select to tag, download or archive a whole visit at once.
              </p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
