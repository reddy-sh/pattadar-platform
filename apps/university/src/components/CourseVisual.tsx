import type { Course } from '../domain/types';

interface CourseVisualProps {
  course: Pick<Course, 'slug' | 'tone' | 'imageAlt'>;
  priority?: boolean;
}

export function CourseVisual({ course, priority = false }: CourseVisualProps) {
  return (
    <figure className={`course-visual course-visual--${course.tone}`}>
      <img
        src={`/course-art/${course.slug}.jpg`}
        alt={course.imageAlt}
        width="1280"
        height="853"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </figure>
  );
}
