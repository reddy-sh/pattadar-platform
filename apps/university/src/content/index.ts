import type { Course, LessonContent } from '../domain/types';
import { learnerCourseLessons } from './learnerCourses';
import { professionalCourseLessons } from './professionalCourses';

export const lessonContentByModuleId: Record<string, LessonContent> = {
  ...learnerCourseLessons,
  ...professionalCourseLessons,
};

export function contentForModule(moduleId: string | undefined): LessonContent | undefined {
  return moduleId ? lessonContentByModuleId[moduleId] : undefined;
}

export function contentForCourse(course: Course): LessonContent[] {
  return course.modules.flatMap((module) => {
    const content = contentForModule(module.id);
    return content ? [content] : [];
  });
}

export function missingContentModuleIds(courses: Course[]): string[] {
  return courses.flatMap((course) => course.modules)
    .filter((module) => !lessonContentByModuleId[module.id])
    .map((module) => module.id);
}
