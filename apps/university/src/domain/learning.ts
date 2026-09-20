import type { Course, Enrollment, TutorReply } from './types';

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
      text: 'Complete every module and its assessment to unlock the Pattadar skill certificate. It is an industry credential from Pattadar, not a government licence unless a course explicitly says otherwise.',
      sources: course ? [`${course.title} · credential policy`] : ['Credential policy'],
      needsHuman: false,
    };
  }
  if (/job|work|employment|mentor/.test(normalized)) {
    return {
      text: 'Finish the practitioner modules, publish your verified skill profile, then review matching work under Opportunities. A mentor can review your first field submission before you make the profile visible.',
      sources: ['Employment pathway', 'Mentor review standard'],
      needsHuman: false,
    };
  }
  const moduleTitles = course?.modules.slice(0, 3).map((module) => module.title) ?? [];
  return {
    text: course
      ? `Start with ${moduleTitles.join(', ')}. I will answer from this course and name the lesson I used; for a live parcel or client matter, ask a Pattadar professional to review the actual records.`
      : 'Choose a course and I will teach from its approved lessons, quiz you on the key decisions, and point to a human mentor when the question depends on live records.',
    sources: course ? moduleTitles.map((title) => `${course.title} · ${title}`) : ['Tutor use policy'],
    needsHuman: false,
  };
}
