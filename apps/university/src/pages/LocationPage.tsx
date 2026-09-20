import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import { Link, useParams } from 'react-router';
import { CourseCard } from '../components/CourseCard';
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
        <Link className="button button--primary" to="/">Browse University</Link>
      </main>
    );
  }
  const localCourses = courses.filter((course) => campus.courseSlugs.includes(course.slug));
  const localMentors = mentors.filter((mentor) => mentor.locationSlug === campus.slug);
  return (
    <main className="page-shell interior-page location-page">
      <Link className="back-link" to="/"><ArrowBackRounded /> All locations</Link>
      <header className="location-heading">
        <span className="icon-box"><LocationOnOutlined /></span>
        <div>
          <span className="context-line">{campus.district} · {campus.state}</span>
          <h1>{campus.name}</h1>
          <p>{campus.mode}</p>
        </div>
      </header>
      <div className="location-notice"><strong>Proposed location</strong><span>{campus.address}</span></div>
      <section aria-labelledby="local-courses-title">
        <header className="section-heading"><div><h2 id="local-courses-title">Planned courses for this location</h2><p>Online lessons can remain available everywhere; these paths are candidates for local mentor or field sessions after approval.</p></div></header>
        <div className="course-grid">
          {localCourses.map((course) => (
            <CourseCard key={course.id} course={course} enrollment={enrollmentFor(course.id)} onJoin={joinCourse} />
          ))}
        </div>
      </section>
      <section className="location-mentors" aria-labelledby="local-mentors-title">
        <header className="section-heading"><div><h2 id="local-mentors-title">Planned mentor roles</h2><p>Named people and availability are published only after identity and qualification review.</p></div></header>
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
