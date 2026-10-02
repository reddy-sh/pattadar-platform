import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { PageMeta } from '../components/PageMeta';
import { officialReferencesById } from '../data/officialReferences';
import { recordGuideBySlug, recordGuidePath, recordGuidesForState, recordVideoUrl } from '../data/recordGuides';
import { publishedStateLandRecordBySlug } from '../data/stateLandRecords';

export function RecordDetailPage() {
  const { slug, recordSlug } = useParams();
  const [selectedField, setSelectedField] = useState(0);
  useEffect(() => setSelectedField(0), [recordSlug]);
  const guide = recordGuideBySlug(slug, recordSlug);
  const profile = publishedStateLandRecordBySlug(slug);
  if (!guide || !profile) return <Navigate to="/states" replace />;

  const currentField = guide.fields[selectedField] ?? guide.fields[0];
  const references = officialReferencesById(guide.sourceIds);
  const stateGuides = recordGuidesForState(guide.stateCode);
  const next = stateGuides[(stateGuides.findIndex((entry) => entry.slug === guide.slug) + 1) % stateGuides.length];

  return (
    <main className="page-shell record-detail-page">
      <PageMeta
        title={`${guide.title} explained | ${profile.name} | Pattadar University`}
        description={guide.summary}
        path={recordGuidePath(guide)}
      />
      <Link className="back-link" to={`/states/${profile.slug}/records`}><ArrowBackRounded /> {profile.name} record library</Link>
      <header className="record-detail-hero">
        <span className="context-line">{profile.name} · {guide.kind}</span>
        <h1>{guide.title}</h1>
        <p>{guide.summary}</p>
        <div className="record-detail-tags"><span>Fictional examples</span><span>Government sources</span><span>Captions + transcript</span></div>
      </header>

      <section className="record-film" aria-labelledby="record-film-title">
        <div className="record-film__copy">
          <span className="context-line">Watch · pause · check</span>
          <h2 id="record-film-title">A guided visual lesson</h2>
          <p>Follow the annotated example with English captions. The video starts muted; unmute it only if you want narration. Pause at each field, then inspect its meaning below.</p>
          <a className="record-film__transcript" href={recordVideoUrl(guide, 'txt')} download><DownloadRounded /> Download transcript</a>
        </div>
        <div className="record-film__player">
          <video controls muted playsInline preload="metadata" poster={recordVideoUrl(guide, 'jpg')} aria-label={`${guide.title} visual lesson`}>
            <source src={recordVideoUrl(guide, 'mp4')} type="video/mp4" />
            <track kind="captions" src={recordVideoUrl(guide, 'vtt')} srcLang="en" label="English captions" default />
            Your browser cannot play this video. Use the downloadable transcript and field guide below.
          </video>
          <p>Original Pattadar University animation. Names and numbers are invented for learning.</p>
        </div>
      </section>

      <section className="record-purpose" aria-label="Purpose and limit">
        <div><span className="context-line">What it helps you do</span><p>{guide.purpose}</p></div>
        <div><span className="context-line">What it cannot settle</span><p>{guide.limit}</p></div>
      </section>

      <section className="record-anatomy" aria-labelledby="record-anatomy-title">
        <header><span className="context-line">Interactive fictional sample</span><h2 id="record-anatomy-title">Read each key field</h2><p>Select a row to see what it means and what to compare in a real file.</p></header>
        <div className="record-anatomy__layout">
          <div className="record-anatomy__sheet" aria-label="Fictional record fields">
            <div className="record-anatomy__sheet-head"><span>TRAINING SAMPLE</span><strong>{guide.shortTitle}</strong><small>Not a government record</small></div>
            {guide.fields.map((field, index) => (
              <button key={field.label} type="button" className={selectedField === index ? 'is-selected' : undefined} aria-pressed={selectedField === index} onClick={() => setSelectedField(index)}>
                <span>{String(index + 1).padStart(2, '0')} · {field.label}</span><strong>{field.example}</strong>
              </button>
            ))}
          </div>
          <div className="record-anatomy__detail" aria-live="polite">
            <span className="context-line">Field {selectedField + 1} of {guide.fields.length}</span>
            <h3>{currentField.label}</h3>
            <p className="record-anatomy__example">Example: {currentField.example}</p>
            <h4>What it means</h4><p>{currentField.meaning}</p>
            <h4>What to verify</h4><p>{currentField.verify}</p>
          </div>
        </div>
        <div className="record-field-notes">
          {guide.fields.map((field, index) => <article key={field.label}>
            <span>{String(index + 1).padStart(2, '0')}</span><div><h3>{field.label}</h3><p>{field.meaning}</p><p><strong>Verify:</strong> {field.verify}</p></div>
          </article>)}
        </div>
      </section>

      <section className="record-apply" aria-labelledby="record-apply-title">
        <div><span className="context-line">Practice</span><h2 id="record-apply-title">Try the comparison</h2><p>{guide.practice}</p></div>
        <div><span className="context-line">Pause when you see</span><ul>{guide.watchFor.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </section>

      <section className="record-sources" aria-labelledby="record-sources-title">
        <span className="context-line">Source trail · reviewed 1 October 2026</span>
        <h2 id="record-sources-title">Check the official material</h2>
        <p>Portal screens, forms, and rules can change. Use these government sources to verify the current service and obtain a certified copy when needed.</p>
        <ul>{references.map((reference) => <li key={reference.id}><a href={reference.url} target="_blank" rel="noreferrer"><span><strong>{reference.title}</strong><small>{reference.authority} · {reference.kind} · reviewed {reference.reviewedOn}</small></span><OpenInNewRounded aria-hidden="true" /></a></li>)}</ul>
      </section>

      <nav className="record-detail-next" aria-label="Continue learning">
        <Link to={`/courses/${guide.courseSlug}/lessons/${guide.lessonId}`}><span><small>Continue in the course</small><strong>Open the related lesson</strong></span><ArrowForwardRounded /></Link>
        {next.slug !== guide.slug && <Link to={recordGuidePath(next)}><span><small>Next record</small><strong>{next.shortTitle}</strong></span><ArrowForwardRounded /></Link>}
      </nav>
    </main>
  );
}
