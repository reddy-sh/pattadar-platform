import type { LessonContent } from '../domain/types';

type LessonDraft = Omit<LessonContent, 'moduleId'>;

export function defineLesson(moduleId: string, draft: LessonDraft): LessonContent {
  return {
    moduleId,
    ...draft,
  };
}
