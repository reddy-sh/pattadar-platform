/** W07 — what is on the land, and whether it works.
 *
 *  Sorted worst-condition-first, because the reason to open this tab is almost
 *  always that something is broken. Every feature carries its own pin and its
 *  own photos, which is what lets an expense hang off "Borewell 1" instead of
 *  off "the parcel" — and that is what makes the bore's true cost knowable. */
import { useState } from 'react';
import { Link } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';

import { useFeatures } from '../api';
import { Chip, Icon, Loading, State, ddmmyyyy, plural } from '../ui';
import { RecordCrumbs, RecordTabs, useRecordCtx } from './Record';

/** The starter kit on the "Add a feature" card. Naming your own is the last
 *  chip because most land has something the list did not think of. */
const TYPES = ['Bore', 'Well', 'Pond', 'Transformer', 'Meter', 'Solar', 'Fence', 'Gate',
  'Shed', 'House', 'Compound wall', 'Trees', 'Crop', 'Road', 'Bund', 'Canal'];

export function RecordFeatures() {
  const rec = useRecordCtx();
  const { data, isLoading } = useFeatures(rec.id);
  const [cat, setCat] = useState('all');

  const shown = (data?.features ?? []).filter((f) =>
    cat === 'all' ? true : cat === 'needs_repair' ? f.conditionState === 'bad' : f.category === cat);

  return (
    <main>
      <RecordCrumbs rec={rec} here="Features" />
      <p className="eyebrow">{rec.title} · {rec.placeLine.split(',')[0]}</p>

      <header className="pagehead">
        <div className="grow">
          <h1>On this land</h1>
          {data && (
            <p className="lede" style={{ marginTop: '0.375rem' }}>
              {plural(data.total, 'feature')}
              {data.needsRepair > 0
                && ` · ${data.needsRepair} need${data.needsRepair === 1 ? 's' : ''} repair`}
              {data.walkedOn && ` · walked ${ddmmyyyy(data.walkedOn)}`}
              {data.walkedBy && ` by ${data.walkedBy}`}
            </p>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn">
            <ChecklistOutlined sx={{ fontSize: 16 }} /> Ask for a check
          </button>
          <button type="button" className="btn primary">
            <AddOutlined sx={{ fontSize: 17 }} /> Add a feature
          </button>
        </div>
      </header>

      <RecordTabs rec={rec} />

      {/* The chips and the note share a line on a laptop and stack on a
          phone — the note is prose and must be allowed to fall below. */}
      <div className="row between" style={{ margin: 'var(--space-md) 0', gap: 'var(--space-lg)' }}>
        <span className="row tight">
          {/* A chip for a category with nothing in it is a filter that leads
              nowhere — and a red "Needs repair 0" reads as an alarm. */}
          {(data?.categories ?? []).filter((c) => c.count > 0).map((c) => (
            <Chip key={c.key} active={cat === c.key} count={c.count}
                  tone={c.key === 'needs_repair' ? 'alert' : undefined}
                  onClick={() => setCat(c.key)}>
              {c.label}
            </Chip>
          ))}
        </span>
        <span className="note" style={{ textAlign: 'right', flex: '1 1 16rem', minWidth: 0 }}>
          Worst condition first · every one carries its own pin and its own photos
        </span>
      </div>

      {isLoading && <Loading h="20rem" />}

      {/* Four across on a laptop, as drawn. A feature card carries a spec line,
          a condition, a note, coordinates and two actions — squeezed narrower
          than this, every one of those wraps. */}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 21rem), 1fr))' }}>
        {shown.map((f) => (
          <article key={f.id}
                   className={`card ${f.conditionState === 'bad' ? 'alert' : ''}`}
                   style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
            <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span className="row tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem', color: 'var(--w-info)' }}>
                  <Icon name={f.icon} size={19} />
                </span>
                <span>
                  <h3>{f.label}</h3>
                  <span className="note mono" style={{ display: 'block', marginTop: '0.1875rem' }}>{f.spec}</span>
                </span>
              </span>
              <span className="muted" aria-hidden style={{ display: 'flex' }}>
                <MoreVertOutlined sx={{ fontSize: 17 }} />
              </span>
            </div>

            <State state={f.conditionState}>{f.condition}</State>
            <p className="note" style={{ color: 'var(--w-ink-2)' }}>{f.note}</p>

            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <span className="note row tight">
                {f.lat ? (
                  <>
                    <PlaceOutlined sx={{ fontSize: 13 }} aria-hidden />
                    <span className="num">{f.lat.toFixed(4)}, {f.lon.toFixed(4)}</span>
                  </>
                ) : (
                  <>
                    <MyLocationOutlined sx={{ fontSize: 13 }} aria-hidden /> {f.pinLabel}
                  </>
                )}
              </span>
              {f.photoCount > 0 && (
                <Link to={`/app/records/${rec.id}/photos?feature=${f.id}`}
                      className="note row tight accent" style={{ textDecoration: 'none' }}>
                  <VisibilityOutlined sx={{ fontSize: 14 }} aria-hidden />{' '}
                  {f.photoCount} photo{f.photoCount === 1 ? '' : 's'}
                </Link>
              )}
            </div>

            <div className="row tight">
              {f.actions.map((a, i) => (
                <button key={a} type="button"
                        className={`btn sm ${i === 0 && f.conditionState === 'bad' ? 'soft' : ''}`}>
                  {a}
                </button>
              ))}
            </div>
          </article>
        ))}

        <article className="card dashed" style={{ display: 'grid', gap: '0.625rem', alignContent: 'start' }}>
          <h3 className="row tight accent"><AddOutlined sx={{ fontSize: 18 }} /> Add a feature</h3>
          <p className="note">
            Pick a type, or name your own. It becomes a pin, a photo slot and a repair history.
          </p>
          <div className="row tight">
            {TYPES.map((t) => <Chip key={t} onClick={() => undefined}>{t}</Chip>)}
            <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--w-accent)', borderColor: 'var(--w-accent)' }}>
              Something else…
            </span>
          </div>
        </article>
      </div>
    </main>
  );
}
