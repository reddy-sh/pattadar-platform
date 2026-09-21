import type { Course, Enrollment, TutorReply } from './types';
import { contentForCourse } from '../content';
import { officialReferencesById } from '../data/officialReferences';

export function enrollmentIdFor(learnerId: string, courseId: string): string {
  return `enr_${learnerId}_${courseId}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function createEnrollment(learnerId: string, course: Course, now = new Date()): Enrollment {
  const timestamp = now.toISOString();
  return {
    id: enrollmentIdFor(learnerId, course.id),
    learnerId,
    courseId: course.id,
    enrolledAt: timestamp,
    updatedAt: timestamp,
    status: 'active',
    completedModuleIds: [],
    contentVersion: course.contentVersion,
    version: 1,
    idempotencyKey: `join:${learnerId}:${course.id}`,
  };
}

export function progressFor(course: Course, enrollment?: Enrollment): number {
  if (!enrollment || course.modules.length === 0) return 0;
  const valid = new Set(course.modules.map((module) => module.id));
  const completed = new Set(enrollment.completedModuleIds.filter((id) => valid.has(id))).size;
  return Math.round((completed / course.modules.length) * 100);
}

export function toggleModule(
  course: Course,
  enrollment: Enrollment,
  moduleId: string,
  now = new Date(),
): Enrollment {
  if (!course.modules.some((module) => module.id === moduleId)) return enrollment;
  const completed = new Set(enrollment.completedModuleIds);
  if (completed.has(moduleId)) completed.delete(moduleId);
  else completed.add(moduleId);
  const next = { ...enrollment, completedModuleIds: [...completed], updatedAt: now.toISOString() };
  return {
    ...next,
    status: progressFor(course, next) === 100 ? 'completed' : 'active',
    version: enrollment.version + 1,
  };
}

export function searchCourses(courses: Course[], query: string): Course[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return courses;
  return courses.filter((course) => {
    const haystack = [course.title, course.summary, course.outcome, course.level, ...course.roles]
      .join(' ')
      .toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function answerTutor(course: Course | undefined, question: string): TutorReply {
  const normalized = question.toLocaleLowerCase();
  if (/case|dispute|court|legal advice|should i buy/.test(normalized)) {
    return {
      text: 'I can explain the learning material, but I cannot decide a live property dispute or give legal advice. Use the lawyer or document-review service so a qualified person can inspect the current records.',
      sources: course ? [`${course.title} · learner safety note`] : ['Pattadar University · learner safety note'],
      needsHuman: true,
    };
  }
  if (/certificate|certification|credential/.test(normalized)) {
    return {
      text: 'In this preview, completing every module unlocks a clearly marked completion record. Production credentials also require the published assessment, reviewer approval, and a server-issued verification record. They are not government licences unless a course explicitly proves otherwise.',
      sources: course ? [`Preview outline · ${course.title} · credential policy`] : ['Preview credential policy'],
      needsHuman: false,
    };
  }
  if (/job|work|employment|mentor/.test(normalized)) {
    return {
      text: 'The preview shows planned pathways under Opportunities. In production, a learner would finish the required modules, pass human review, and explicitly consent before a verified employer can receive a skill profile.',
      sources: ['Preview employment pathway', 'Proposed mentor review standard'],
      needsHuman: false,
    };
  }
  const moduleTitles = course?.modules.slice(0, 3).map((module) => module.title) ?? [];
  if (course) {
    const ignoredTerms = new Set(['about', 'could', 'help', 'should', 'their', 'there', 'these', 'what', 'when', 'where', 'which', 'with', 'would']);
    const terms = normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !ignoredTerms.has(term));
    const candidates = contentForCourse(course).flatMap((lesson) => {
      const moduleTitle = course.modules.find((module) => module.id === lesson.moduleId)?.title ?? lesson.moduleId;
      return lesson.sections.map((section) => ({
        moduleTitle,
        heading: section.heading,
        body: section.body,
        referenceIds: lesson.referenceIds,
        score: terms.reduce((total, term) => {
          const titleMatch = moduleTitle.toLocaleLowerCase().includes(term) ? 3 : 0;
          const headingMatch = section.heading.toLocaleLowerCase().includes(term) ? 2 : 0;
          const bodyMatch = section.body.toLocaleLowerCase().includes(term) ? 1 : 0;
          return total + titleMatch + headingMatch + bodyMatch;
        }, 0),
      }));
    }).sort((left, right) => right.score - left.score);
    const best = candidates[0];
    if (best && best.score > 0) {
      const officialSources = officialReferencesById(best.referenceIds)
        .slice(0, 2)
        .map((reference) => `${reference.title} · ${reference.authority}`);
      return {
        text: `${best.body} Open “${best.moduleTitle}” for the complete explanation, practice activity, and knowledge check.`,
        sources: [`${course.title} · ${best.moduleTitle} · ${best.heading} · ${course.contentVersion}`, ...officialSources],
        needsHuman: false,
      };
    }
  }
  return {
    text: course
      ? `Start with ${moduleTitles.join(', ')}. I answer from this course's reviewed learning content and can help you find the right lesson. For a live parcel or client matter, ask a qualified person to review the actual records.`
      : 'Choose a course so I can answer from its learning content, quiz key decisions, and route live-record questions to a qualified person.',
    sources: course ? moduleTitles.map((title) => `${course.title} · ${title} · ${course.contentVersion}`) : ['AI Tutor use policy'],
    needsHuman: false,
  };
}
