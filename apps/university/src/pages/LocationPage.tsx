import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import { Link, useParams } from 'react-router';
import { CourseCard } from '../components/CourseCard';
import { PageMeta } from '../components/PageMeta';
import { campusBySlug, courses, mentors } from '../data/catalog';
import { useUniversity } from '../state/UniversityProvider';

export function LocationPage() {
  const { slug } = useParams();
  const campus = campusBySlug(slug);
  const { enrollmentFor, joinCourse } = useUniversity();
  if (!campus) {
    return (
      <main className="page-shell empty-page">
        <h1>Location not found</h1>
        <p>This learning-centre slug is not published.</p>
        <Link className="button button--primary" to="/locations">Browse learning hubs</Link>
      </main>
    );
  }
  const localCourses = courses.filter((course) => campus.courseSlugs.includes(course.slug));
  const localMentors = mentors.filter((mentor) => mentor.locationSlug === campus.slug);
  return (
    <main className="page-shell interior-page location-page">
      <PageMeta
        title={`${campus.name} | Pattadar University`}
        description={`Explore ${campus.state} land-record and property practice lessons through the ${campus.name}. Online learning is available; local sessions are not yet scheduled.`}
        path={`/locations/${campus.slug}`}
      />
      <Link className="back-link" to="/locations"><ArrowBackRounded /> All learning hubs</Link>
      <header className="location-heading">
        <span className="icon-box"><LocationOnOutlined /></span>
        <div>
          <span className="context-line">{campus.district} · {campus.state}</span>
          <h1>{campus.name}</h1>
          <p>{campus.mode}</p>
        </div>
      </header>
      <div className="location-notice"><strong>Online now; no local venue yet</strong><span>{campus.address}</span></div>
      {campus.focusAreas?.length ? (
        <section className="location-focus" aria-labelledby="location-focus-title">
          <header className="section-heading"><div>
            <span className="context-line">Local learning priorities</span>
            <h2 id="location-focus-title">Start with these Markapuram property questions</h2>
            {campus.contextNote ? <p>{campus.contextNote}</p> : null}
          </div></header>
          <div className="location-focus__grid">
            {campus.focusAreas.map((area, index) => (
              <article className="location-focus__card" key={area.lessonId}>
                <span className="location-focus__number">0{index + 1}</span>
                <h3>{area.title}</h3>
                <p>{area.description}</p>
                <div className="location-focus__links">
                  <Link to={`/courses/${area.courseSlug}/lessons/${area.lessonId}`}>Study the lesson</Link>
                  <a href={area.sourceUrl} target="_blank" rel="noopener noreferrer">Official source: {area.sourceLabel}</a>
                </div>
              </article>
            ))}
          </div>
          <p className="location-focus__boundary">These topics help learners prepare questions and evidence. A record, agreement, or course completion does not settle title or transfer rights.</p>
        </section>
      ) : null}
      <section aria-labelledby="local-courses-title">
        <header className="section-heading"><div><h2 id="local-courses-title">Courses for {campus.state}</h2><p>Written online lessons are available now. State-specific courses shown here match this location's jurisdiction; local mentor and field sessions are not yet scheduled.</p></div></header>
        <div className="course-grid">
          {localCourses.map((course) => (
            <CourseCard key={course.id} course={course} enrollment={enrollmentFor(course.id)} onJoin={joinCourse} />
          ))}
        </div>
      </section>
      <section className="location-mentors" aria-labelledby="local-mentors-title">
        <header className="section-heading"><div><h2 id="local-mentors-title">Future local support</h2><p>These describe support disciplines, not assigned people. Names and availability will appear only after identity, qualification, and schedule review.</p></div></header>
        {localMentors.length ? localMentors.map((mentor) => (
          <article className="mentor-row" key={mentor.id}>
            <span className="mentor-row__initials" aria-hidden="true">{mentor.name.split(' ').map((part) => part[0]).join('')}</span>
            <div><h3>{mentor.name}</h3><p>{mentor.role}</p></div>
            <div><strong>{mentor.languages.join(' · ')}</strong><span>{mentor.focus}</span></div>
          </article>
        )) : <p>No mentor schedule is published for this location yet.</p>}
      </section>
    </main>
  );
}
