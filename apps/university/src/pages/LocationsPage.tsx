import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import { Link } from 'react-router';
import { PageMeta } from '../components/PageMeta';
import { campuses, courses } from '../data/catalog';

export function LocationsPage() {
  return (
    <main className="page-shell interior-page locations-page">
      <PageMeta
        title="Andhra Pradesh and Telangana Learning Hubs | Pattadar University"
        description="Find Pattadar University online learning paths for Andhra Pradesh and Telangana. Local classrooms, field labs, and mentor sessions are not yet scheduled."
        path="/locations"
      />
      <header className="page-heading state-directory-heading">
        <span className="context-line">Andhra Pradesh · Telangana</span>
        <h1>Regional learning hubs</h1>
        <p>Use these pages to find jurisdiction-matched written courses. Learning is online today; no public classroom, field lab, or local mentor schedule has been announced.</p>
      </header>

      <dl className="jurisdiction-summary" aria-label="Learning hub coverage">
        <div><dt>States covered</dt><dd>2</dd></div>
        <div><dt>Regional hubs</dt><dd>{campuses.length}</dd></div>
        <div><dt>Written courses</dt><dd>{courses.length}</dd></div>
        <div><dt>Local sessions</dt><dd>Not scheduled</dd></div>
      </dl>

      <section className="state-directory-boundary" aria-labelledby="location-boundary-title">
        <h2 id="location-boundary-title">A learning region, not a published venue</h2>
        <p>Each hub groups relevant courses and future support by jurisdiction. We publish a physical address or event only after the venue, accessibility, instructor, and schedule have been verified.</p>
      </section>

      <div className="location-directory-list">
        {campuses.map((campus) => (
          <Link key={campus.id} to={`/locations/${campus.slug}`} className="location-directory-row">
            <LocationOnOutlined />
            <span><small>{campus.district} · {campus.state}</small><strong>{campus.name}</strong><em>{campus.mode}</em>{campus.focusAreas?.length ? <span className="location-directory-row__focus">{campus.focusAreas.map((area) => area.title).join(' · ')}</span> : null}</span>
            <span>{campus.courseSlugs.length} courses</span>
            <ArrowForwardRounded />
          </Link>
        ))}
      </div>
    </main>
  );
}
