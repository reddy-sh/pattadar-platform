import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import PlayCircleOutlineRounded from '@mui/icons-material/PlayCircleOutlineRounded';
import { Link, Navigate, useParams } from 'react-router';
import { PageMeta } from '../components/PageMeta';
import { recordGuidePath, recordGuidesForState, recordVideoUrl } from '../data/recordGuides';
import { publishedStateLandRecordBySlug } from '../data/stateLandRecords';

export function RecordLibraryPage() {
  const { slug } = useParams();
  const profile = publishedStateLandRecordBySlug(slug);
  if (!profile || (profile.code !== 'AP' && profile.code !== 'TS')) return <Navigate to="/states" replace />;

  const guides = recordGuidesForState(profile.code);
  return (
    <main className="page-shell record-library-page">
      <PageMeta
        title={`${profile.name} record learning videos | Pattadar University`}
        description={`Watch original visual lessons on ${profile.name} land records, read fictional field examples, and check official sources.`}
        path={`/states/${profile.slug}/records`}
      />
      <Link className="back-link" to={`/states/${profile.slug}`}><ArrowBackRounded /> {profile.name} state guide</Link>
      <header className="record-library-hero">
        <div>
          <span className="context-line">{profile.code} · Self-learning record library</span>
          <h1>Read the record. Then test the claim.</h1>
          <p>{profile.code === 'AP'
            ? 'Six Andhra Pradesh lessons cover the Pattadar passbook, 1-B, Adangal, old settlement records, FMB, and EC.'
            : 'Five Telangana lessons cover ePPB and ROR, Pahani, old records, Tippan and LPM, and EC.'}</p>
        </div>
        <div className="record-library-count"><strong>{guides.length}</strong><span>visual lessons<br />with narration and captions</span></div>
      </header>
      <div className="record-library-note">
        All illustrated names, numbers and parcels are fictional. The videos teach how to read records; check the linked government source and obtain competent review for a real property.
      </div>
      <section className="record-library-grid" aria-label={`${profile.name} record lessons`}>
        {guides.map((guide, index) => (
          <Link className="record-library-card" key={guide.slug} to={recordGuidePath(guide)}>
            <div className="record-library-card__top"><span>{String(index + 1).padStart(2, '0')} / {String(guides.length).padStart(2, '0')}</span><PlayCircleOutlineRounded aria-hidden="true" /></div>
            <img className="record-library-card__poster" src={recordVideoUrl(guide, 'jpg')} alt="" loading="lazy" />
            <span className="record-library-card__kind">{guide.kind}</span>
            <h2>{guide.title}</h2>
            <p>{guide.summary}</p>
            <span className="record-library-card__foot">{guide.fields.length} key fields <ArrowForwardRounded aria-hidden="true" /></span>
          </Link>
        ))}
      </section>
    </main>
  );
}
