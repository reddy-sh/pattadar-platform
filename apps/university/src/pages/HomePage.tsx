import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { CourseCard } from '../components/CourseCard';
import { DiscoveryFilters } from '../components/DiscoveryFilters';
import { campuses, courses, mentors, opportunities, roleLabels } from '../data/catalog';
import { stateLandRecordByCode } from '../data/stateLandRecords';
import { filterCoursesByDiscovery, filterOpportunitiesByDiscovery } from '../domain/discovery';
import type { Course } from '../domain/types';
import { useDiscoveryFilters } from '../state/useDiscoveryFilters';
import { useUniversity } from '../state/UniversityProvider';

interface HomePageProps {
  onTutor: (course?: Course) => void;
}

export function HomePage({ onTutor }: HomePageProps) {
  const { enrollments, joinCourse, enrollmentFor } = useUniversity();
  const { filters, updateFilters, clearFilters, hasActiveFilters } = useDiscoveryFilters();
  const selectedState = filters.stateCode === 'all' ? undefined : stateLandRecordByCode(filters.stateCode);
  const visibleCourses = useMemo(() => filterCoursesByDiscovery(courses, filters), [filters]);
  const visibleOpportunities = useMemo(() => filterOpportunitiesByDiscovery(opportunities, campuses, {
    careerRole: filters.goal === 'career' ? filters.careerRole : 'all',
    stateCode: filters.stateCode,
  }), [filters]);
  const visibleCampuses = useMemo(
    () => filters.stateCode === 'all' ? campuses : campuses.filter((campus) => campus.stateCode === filters.stateCode),
    [filters.stateCode],
  );
  const opportunityParams = new URLSearchParams();
  if (filters.stateCode !== 'all') opportunityParams.set('state', filters.stateCode);
  if (filters.goal === 'career' && filters.careerRole !== 'all') opportunityParams.set('role', filters.careerRole);
  const opportunityHref = opportunityParams.size ? `/opportunities?${opportunityParams.toString()}` : '/opportunities';

  return (
    <main>
      <section className="catalog-intro page-shell">
        <div className="catalog-intro__copy">
          <span className="context-line">Property learning · skills · supervised work</span>
          <h1>Learn the work behind land.</h1>
          <p>Explore pathways for buyers, sellers, field professionals, and Pattadar employees. Production courses will use reviewed material, supervised practice, governed credentials, and consented work matching.</p>
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
        <DiscoveryFilters
          idPrefix="catalog"
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          resultCount={visibleCourses.length}
          totalCount={courses.length}
          onChange={updateFilters}
          onClear={clearFilters}
        />
        {selectedState ? (
          <aside className="selected-state-guide">
            <div><span>Land-record guide</span><strong>{selectedState.primaryRecordLabel}</strong><p>{selectedState.coverageNote}</p></div>
            <Link className="text-action" to={`/states/${selectedState.slug}`}>Open {selectedState.name} guide <ArrowForwardRounded /></Link>
          </aside>
        ) : null}
        {visibleCourses.length ? (
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
        ) : (
          <section className="filter-empty" aria-live="polite">
            <SearchOffRounded />
            <div><h3>No courses match</h3><p>Try another goal, career discipline, or state.</p></div>
            <button className="button button--quiet" type="button" onClick={clearFilters}>Clear filters</button>
          </section>
        )}
      </section>

      <section className="work-band">
        <div className="page-shell work-band__inner">
          <header className="section-heading">
            <div>
              <h2>Learn toward real work</h2>
              <p>These proposed pathways show the required course and human review step. They are not open roles or guarantees of assignment.</p>
            </div>
            <Link className="text-action" to={opportunityHref}>View opportunities <ArrowForwardRounded /></Link>
          </header>
          <div className="opportunity-preview">
            {visibleOpportunities.slice(0, 3).map((opportunity) => (
              <Link key={opportunity.id} to={opportunityHref} className="opportunity-preview__row">
                <WorkOutlineRounded />
                <span><strong>{opportunity.title}</strong><small>{opportunity.organization} · {opportunity.engagement}</small></span>
                <span>{roleLabels[opportunity.role]}</span>
                <ArrowForwardRounded />
              </Link>
            ))}
            {visibleOpportunities.length === 0 ? <p className="band-empty">No proposed work pathways match this state and discipline yet.</p> : null}
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
          {visibleCampuses.map((campus) => (
            <Link key={campus.id} to={`/locations/${campus.slug}`} className="location-row">
              <LocationOnOutlined />
              <span><strong>{campus.name}</strong><small>{campus.mode}</small></span>
              <span>{campus.state}</span>
              <ArrowForwardRounded />
            </Link>
          ))}
          {visibleCampuses.length === 0 ? <p className="band-empty">No proposed learning centre is listed for this state yet.</p> : null}
        </div>
      </section>

      <section className="mentor-band page-shell" aria-labelledby="mentor-title">
        <header className="section-heading">
          <div>
            <h2 id="mentor-title">Practise with a mentor</h2>
            <p>These are mentor role profiles, not named or scheduled people. Production mentors require identity and qualification review.</p>
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
