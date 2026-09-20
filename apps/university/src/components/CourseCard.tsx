import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import { Link } from 'react-router';
import { progressFor } from '../domain/learning';
import type { Course, Enrollment } from '../domain/types';
import { CourseVisual } from './CourseVisual';

interface CourseCardProps {
  course: Course;
  enrollment?: Enrollment;
  onJoin: (courseId: string) => Promise<unknown>;
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function CourseCard({ course, enrollment, onJoin }: CourseCardProps) {
  const progress = progressFor(course, enrollment);
  return (
    <article className="course-card">
      <Link className="course-card__media" to={`/courses/${course.slug}`} aria-label={`Open ${course.title}`}>
        <CourseVisual tone={course.tone} />
      </Link>
      <div className="course-card__body">
        <div className="course-card__meta">
          <span>{course.level}</span>
          <span className="course-card__duration"><AccessTimeOutlined />{durationLabel(course.durationMinutes)}</span>
        </div>
        <h3><Link to={`/courses/${course.slug}`}>{course.title}</Link></h3>
        <p>{course.summary}</p>
        <div className="course-card__foot">
          <span>{course.priceLabel}</span>
          {enrollment ? (
            <Link className="text-action" to={`/courses/${course.slug}`}>
              {progress === 100 ? <CheckCircleOutlineRounded /> : null}
              {progress === 100 ? 'Review course' : `Continue · ${progress}%`}
              <ArrowForwardRounded />
            </Link>
          ) : (
            <button className="text-action" type="button" onClick={() => void onJoin(course.id)}>
              Join course <ArrowForwardRounded />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
