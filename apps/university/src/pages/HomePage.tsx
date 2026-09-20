import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { campuses, courses, mentors, opportunities, roleLabels } from '../data/catalog';
import type { AudienceRole, Course } from '../domain/types';
import { CourseCard } from '../components/CourseCard';
import { useUniversity } from '../state/UniversityProvider';

interface HomePageProps {
  onTutor: (course?: Course) => void;
}

export function HomePage({ onTutor }: HomePageProps) {
  const [role, setRole] = useState<AudienceRole | 'all'>('all');
  const { enrollments, joinCourse, enrollmentFor } = useUniversity();
  const visibleCourses = useMemo(
    () => role === 'all' ? courses : courses.filter((course) => course.roles.includes(role)),
    [role],
  );

  return (
    <main>
      <section className="catalog-intro page-shell">
        <div className="catalog-intro__copy">
          <span className="context-line">Property learning · skills · supervised work</span>
          <h1>Learn the work behind land.</h1>
          <p>Start as a buyer, seller, field professional, or Pattadar employee. Learn from reviewed material, practise with a mentor, earn a clear credential, and find work that matches the skill.</p>
        </div>
        <div className="catalog-intro__status">
          <span>{enrollments.length ? `${enrollments.length} active learning path${enrollments.length === 1 ? '' : 's'}` : 'No course joined yet'}</span>
          <Link className="text-action" to="/learn">Open my learning <ArrowForwardRounded /></Link>
        </div>
      </section>

      <section className="catalog-band page-shell" aria-labelledby="course-catalog-title">
        <header className="section-heading">
          <div>
            <h2 id="course-catalog-title">Choose a path</h2>
            <p>Filter by the work you need to do. Each course names its credential and review boundary before enrollment.</p>
          </div>
          <button className="button button--quiet" type="button" onClick={() => onTutor()}>
            <SmartToyOutlined /> Ask the AI tutor
          </button>
        </header>
        <div className="role-filter" role="group" aria-label="Filter courses by role">
          <button type="button" aria-pressed={role === 'all'} onClick={() => setRole('all')}>All paths</button>
          {(Object.entries(roleLabels) as Array<[AudienceRole, string]>).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)}>{label}</button>
          ))}
        </div>
        <div className="course-grid" aria-live="polite">
          {visibleCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              enrollment={enrollmentFor(course.id)}
              onJoin={joinCourse}
            />
          ))}
        </div>
      </section>

      <section className="work-band">
        <div className="page-shell work-band__inner">
          <header className="section-heading">
            <div>
              <h2>Learn toward real work</h2>
              <p>Opportunities state the required course and human review step. A certificate never guarantees an assignment.</p>
            </div>
            <Link className="text-action" to="/opportunities">View opportunities <ArrowForwardRounded /></Link>
          </header>
          <div className="opportunity-preview">
            {opportunities.slice(0, 3).map((opportunity) => (
              <Link key={opportunity.id} to="/opportunities" className="opportunity-preview__row">
                <WorkOutlineRounded />
                <span><strong>{opportunity.title}</strong><small>{opportunity.organization} · {opportunity.engagement}</small></span>
                <span>{roleLabels[opportunity.role]}</span>
                <ArrowForwardRounded />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="locations-band page-shell" aria-labelledby="locations-title">
        <header className="section-heading">
          <div>
            <h2 id="locations-title">Learn near the work</h2>
            <p>Location pages use stable slugs now; verified addresses and schedules can be published without changing links.</p>
          </div>
        </header>
        <div className="location-grid">
          {campuses.map((campus) => (
            <Link key={campus.id} to={`/locations/${campus.slug}`} className="location-row">
              <LocationOnOutlined />
              <span><strong>{campus.name}</strong><small>{campus.mode}</small></span>
              <span>{campus.state}</span>
              <ArrowForwardRounded />
            </Link>
          ))}
        </div>
      </section>

      <section className="mentor-band page-shell" aria-labelledby="mentor-title">
        <header className="section-heading">
          <div>
            <h2 id="mentor-title">Practise with a mentor</h2>
            <p>Mentors review field evidence and practice work. They do not silently complete assessments for learners.</p>
          </div>
        </header>
        <div className="mentor-list">
          {mentors.map((mentor) => (
            <article key={mentor.id} className="mentor-row">
              <span className="mentor-row__initials" aria-hidden="true">{mentor.name.split(' ').map((part) => part[0]).join('')}</span>
              <div><h3>{mentor.name}</h3><p>{mentor.role}</p></div>
              <div><strong>{mentor.languages.join(' · ')}</strong><span>{mentor.focus}</span></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
