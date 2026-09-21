import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import MapOutlined from '@mui/icons-material/MapOutlined';
import PolicyOutlined from '@mui/icons-material/PolicyOutlined';
import SourceOutlined from '@mui/icons-material/SourceOutlined';
import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { PageMeta } from '../components/PageMeta';
import { stateLearningGuideByCode } from '../data/stateGuideContent';
import {
  indiaLandRecordSources,
  landRecordAvailabilityLabels,
  stateLandRecordBySlug,
} from '../data/stateLandRecords';
import type {
  StateGuideSourceKind,
  StateLandRecordProfile,
} from '../domain/types';
import { buildStateGuideStructuredData } from '../seo/stateSeo';

const reviewSteps = [
  {
    icon: SourceOutlined,
    title: 'Identify the record family',
    copy: 'Choose the rural, urban, survey, customary, or settlement record that actually applies to the parcel and transaction.',
  },
  {
    icon: FactCheckOutlined,
    title: 'Preserve the source context',
    copy: 'Record the official URL, search fields, village or locality, parcel identifiers, record year, issue date, and certification status.',
  },
  {
    icon: MapOutlined,
    title: 'Reconcile separate layers',
    copy: 'Compare the revenue entry with registration, mutation, cadastral map, restrictions, tax, planning, and field observations without merging conflicts.',
  },
  {
    icon: PolicyOutlined,
    title: 'Escalate the conclusion',
    copy: 'Use the competent authority or a qualified professional for disputed records, title conclusions, boundary demarcation, and regulated advice.',
  },
];

interface SourceLinksProps {
  profile: StateLandRecordProfile;
  kinds: StateGuideSourceKind[];
}

function SourceLinks({ profile, kinds }: SourceLinksProps) {
  const stateSources = profile.officialLinks.filter((source) => kinds.includes(source.kind));
  const nationalSources = kinds.includes('national') ? indiaLandRecordSources.slice(0, 2) : [];
  const sources = [...stateSources, ...nationalSources].filter(
    (source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index,
  );

  return (
    <p className="guide-citations">
      <span>Government sources</span>
      {sources.map((source) => (
        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
          {source.label}<LaunchRounded />
        </a>
      ))}
    </p>
  );
}

export function StateGuidePage() {
  const { slug } = useParams();
  const profile = stateLandRecordBySlug(slug);
  if (!profile) return <Navigate to="/states" replace />;

  const guide = stateLearningGuideByCode(profile.code);
  const structuredData = useMemo(
    () => buildStateGuideStructuredData(profile, guide),
    [guide, profile],
  );
  const courseParams = new URLSearchParams({ state: profile.code });

  return (
    <main className="page-shell state-guide-page">
      <PageMeta
        title={guide.seoTitle}
        description={guide.seoDescription}
        path={`/states/${profile.slug}`}
        structuredData={structuredData}
      />
      <Link className="back-link" to="/states"><ArrowBackRounded /> All state guides</Link>

      <header className="state-guide-hero">
        <div>
          <span className="context-line">{profile.kind === 'state' ? 'State' : 'Union territory'} · {profile.code}</span>
          <h1>{profile.name} land records</h1>
          <p>{guide.answerSummary}</p>
        </div>
        <dl className="state-guide-facts">
          <div><dt>Primary starting record</dt><dd>{profile.primaryRecordLabel}</dd></div>
          <div><dt>Digital availability</dt><dd>{landRecordAvailabilityLabels[profile.availability]}</dd></div>
          <div><dt>Sources reviewed</dt><dd>{profile.reviewedOn}</dd></div>
        </dl>
      </header>

      <nav className="state-guide-jump" aria-label={`${profile.name} guide sections`}>
        <a href="#records">Key records</a>
        <a href="#official-access">Official access</a>
        <a href="#workflow">Mutation and survey</a>
        <a href="#checklist">Review checklist</a>
        <a href="#questions">Questions answered</a>
        <a href="#sources">Sources</a>
      </nav>

      <section className="state-guide-alert" aria-labelledby="coverage-note-title">
        <PolicyOutlined />
        <div><h2 id="coverage-note-title">Coverage and reliance</h2><p>{profile.coverageNote}</p></div>
      </section>

      <div className="state-guide-layout" id="records">
        <section className="state-guide-main" aria-labelledby="key-records-title">
          <header>
            <span className="context-line">Record literacy</span>
            <h2 id="key-records-title">What the key records are for</h2>
            <p>Use each record for the question it can answer, and preserve conflicts for review.</p>
          </header>
          <div className="record-explainer-list">
            {guide.recordExplainers.map((record, index) => (
              <article key={record.name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{record.name}</h3><p>{record.purpose}</p></div>
                <div><strong>Verify</strong><p>{record.verify}</p></div>
              </article>
            ))}
          </div>
          <SourceLinks profile={profile} kinds={['land-records', 'guidance']} />
        </section>

        <aside className="official-systems" id="official-access" aria-labelledby="official-systems-title">
          <span className="context-line">Government systems</span>
          <h2 id="official-systems-title">Use official entry points</h2>
          <p>These links are maintained by the named government authority. A portal view and a certified copy may have different uses.</p>
          <div className="official-system-list">
            {profile.officialLinks.map((link) => (
              <a key={`${link.kind}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">
                <span><small>{link.kind.replace('-', ' ')}</small><strong>{link.label}</strong><em>{link.authority}</em></span>
                <LaunchRounded />
              </a>
            ))}
          </div>
        </aside>
      </div>

      <section className="official-access-steps" aria-labelledby="access-steps-title">
        <header className="section-heading section-heading--compact">
          <div><span className="context-line">Official access</span><h2 id="access-steps-title">Find and preserve the right record</h2></div>
        </header>
        <ol>
          {guide.accessSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="state-guide-topics" id="workflow" aria-labelledby="workflow-title">
        <header className="section-heading section-heading--compact">
          <div><span className="context-line">Answer-first guide</span><h2 id="workflow-title">Mutation, maps, registration, and local context</h2></div>
        </header>
        <div>
          {guide.topics.map((topic) => (
            <article key={topic.id} id={topic.id}>
              <h3>{topic.question}</h3>
              <p>{topic.answer}</p>
              <SourceLinks profile={profile} kinds={topic.sourceKinds} />
            </article>
          ))}
        </div>
      </section>

      <section className="state-guide-checklist" id="checklist" aria-labelledby="checklist-title">
        <header>
          <span className="context-line">Buyer, seller, and practitioner checklist</span>
          <h2 id="checklist-title">Review before relying on the file</h2>
          <p>This is an educational evidence checklist, not a title certificate or professional opinion.</p>
        </header>
        <ol>
          {guide.checklist.map((item) => (
            <li key={item}><CheckCircleOutlineRounded /><span>{item}</span></li>
          ))}
        </ol>
      </section>

      <section className="state-guide-faq" id="questions" aria-labelledby="faq-title">
        <header className="section-heading section-heading--compact">
          <div><span className="context-line">Questions answered</span><h2 id="faq-title">{profile.name} land-record FAQ</h2></div>
        </header>
        <div>
          {guide.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
              <SourceLinks profile={profile} kinds={faq.sourceKinds} />
            </details>
          ))}
        </div>
      </section>

      <section className="review-method" aria-labelledby="review-method-title">
        <header className="section-heading section-heading--compact">
          <div><span className="context-line">Reusable method</span><h2 id="review-method-title">Review without overclaiming</h2></div>
        </header>
        <div className="review-method__steps">
          {reviewSteps.map(({ icon: Icon, title, copy }, index) => (
            <article key={title}>
              <span><Icon /><small>{String(index + 1).padStart(2, '0')}</small></span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="national-source-band" id="sources" aria-labelledby="national-sources-title">
        <header>
          <span className="context-line">Source register</span>
          <h2 id="national-sources-title">Government references and editorial status</h2>
          <p>{guide.editorialNote}</p>
        </header>
        <div className="state-source-register">
          {profile.officialLinks.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              <span><strong>{source.label}</strong><small>{source.authority} · {source.kind.replace('-', ' ')}</small></span>
              <LaunchRounded />
            </a>
          ))}
          {indiaLandRecordSources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              <span><strong>{source.label}</strong><small>{source.authority} · national context</small></span>
              <LaunchRounded />
            </a>
          ))}
        </div>
        <p className="source-review-date">Last human source review: <strong>{guide.reviewedOn}</strong></p>
      </section>

      <section className="state-guide-cta">
        <div><span className="context-line">Continue learning</span><h2>See courses available for {profile.name}</h2><p>National practice courses stay visible. Jurisdiction-specific courses appear only when they cover this state or union territory.</p></div>
        <Link className="button button--primary" to={`/?${courseParams.toString()}`}>Browse courses <ArrowForwardRounded /></Link>
      </section>
    </main>
  );
}
