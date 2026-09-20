import { describe, expect, test } from 'bun:test';
import { answerTutor, createEnrollment, progressFor, searchCourses, toggleModule } from './learning';
import type { Course } from './types';

const course: Course = {
  id: 'course-test',
  slug: 'test-course',
  title: 'Field record basics',
  summary: 'Read and compare property records.',
  outcome: 'Prepare a review checklist.',
  roles: ['buyer'],
  level: 'Foundation',
  durationMinutes: 60,
  language: 'English',
  priceLabel: 'Free foundation',
  credential: 'Pattadar skill certificate',
  tone: 'records',
  locationSlugs: ['hyderabad'],
  modules: [
    { id: 'm1', title: 'Record names', minutes: 20, kind: 'lesson' },
    { id: 'm2', title: 'Review practice', minutes: 40, kind: 'assessment' },
  ],
  contentVersion: '2026.09',
};

describe('learning domain', () => {
  test('creates an idempotent learner-course identity', () => {
    const first = createEnrollment('learner-1', course, new Date('2026-09-20T00:00:00Z'));
    const second = createEnrollment('learner-1', course, new Date('2026-09-21T00:00:00Z'));
    expect(first.id).toBe(second.id);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  test('tracks module progress and completion', () => {
    const enrolled = createEnrollment('learner-1', course);
    const halfway = toggleModule(course, enrolled, 'm1');
    const complete = toggleModule(course, halfway, 'm2');
    expect(progressFor(course, halfway)).toBe(50);
    expect(progressFor(course, complete)).toBe(100);
    expect(complete.status).toBe('completed');
  });

  test('searches across outcomes and roles', () => {
    expect(searchCourses([course], 'buyer checklist')).toHaveLength(1);
    expect(searchCourses([course], 'surveyor')).toHaveLength(0);
  });

  test('hands live disputes to a qualified person', () => {
    const reply = answerTutor(course, 'Should I buy this land dispute?');
    expect(reply.needsHuman).toBe(true);
    expect(reply.text).toContain('cannot');
  });
});
