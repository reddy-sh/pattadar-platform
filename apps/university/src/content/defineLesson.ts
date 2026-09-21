import type { LessonContent } from '../domain/types';

type LessonDraft = Omit<LessonContent, 'moduleId' | 'videoStatus'>;

export function defineLesson(moduleId: string, draft: LessonDraft): LessonContent {
  return {
    moduleId,
    videoStatus: 'planned',
    ...draft,
  };
}
