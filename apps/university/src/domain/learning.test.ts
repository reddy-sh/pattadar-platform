import { describe, expect, test } from 'bun:test';
import { lessonContentByModuleId, missingContentModuleIds } from '../content';
import { campuses, courses, opportunities, universityStates } from '../data/catalog';
import {
  complianceCoverage,
  guidanceComplianceKeys,
  propertyChecklistKeys,
  serviceComplianceKeys,
  workforceComplianceKeys,
} from '../data/complianceCoverage';
import { isGovernmentReferenceUrl, officialReferenceById, officialReferences } from '../data/officialReferences';
import { stateLearningGuides } from '../data/stateGuideContent';
import { indiaLandRecordSources, stateLandRecordProfiles } from '../data/stateLandRecords';
import { buildStateGuideStructuredData } from '../seo/stateSeo';
import { defaultDiscoveryFilters, filterCoursesByDiscovery, filterOpportunitiesByDiscovery } from './discovery';
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
  priceLabel: 'Free access proposed',
  credential: 'Pattadar skill certificate pathway',
  tone: 'records',
  imageAlt: 'Test course image.',
  jurisdictionScope: 'state-specific',
  stateCodes: ['AP'],
  locationSlugs: ['hyderabad'],
  modules: [
    { id: 'm1', title: 'Record names', minutes: 20, kind: 'lesson' },
    { id: 'm2', title: 'Review practice', minutes: 40, kind: 'assessment' },
  ],
  contentVersion: 'preview-2026.09',
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

  test('filters course discovery by learner goal and state jurisdiction', () => {
    const buyerCourses = filterCoursesByDiscovery(courses, { ...defaultDiscoveryFilters, goal: 'buyer' });
    const telanganaBuyerCourses = filterCoursesByDiscovery(courses, {
      ...defaultDiscoveryFilters,
      goal: 'buyer',
      stateCode: 'TS',
    });
    const apSurveyCareerCourses = filterCoursesByDiscovery(courses, {
      ...defaultDiscoveryFilters,
      goal: 'career',
      careerRole: 'surveyor',
      stateCode: 'AP',
    });

    expect(buyerCourses.every((item) => item.roles.includes('buyer'))).toBe(true);
    expect(telanganaBuyerCourses.map((item) => item.slug)).toEqual(['landscape-and-site-care-basics']);
    expect(apSurveyCareerCourses.every((item) => item.roles.includes('surveyor') && (
      item.jurisdictionScope === 'india-general' || item.stateCodes.includes('AP')
    ))).toBe(true);
  });

  test('keeps national practice visible without leaking AP-specific courses into other states', () => {
    const gujaratBuyerCourses = filterCoursesByDiscovery(courses, {
      ...defaultDiscoveryFilters,
      goal: 'buyer',
      stateCode: 'GJ',
    });
    const andhraBuyerCourses = filterCoursesByDiscovery(courses, {
      ...defaultDiscoveryFilters,
      goal: 'buyer',
      stateCode: 'AP',
    });

    expect(gujaratBuyerCourses.map((item) => item.slug)).toEqual(['landscape-and-site-care-basics']);
    expect(andhraBuyerCourses.some((item) => item.slug === 'buying-land-andhra-pradesh')).toBe(true);
    expect(andhraBuyerCourses.some((item) => item.slug === 'landscape-and-site-care-basics')).toBe(true);
  });

  test('filters work pathways by career discipline and campus state', () => {
    const apSurveyPaths = filterOpportunitiesByDiscovery(opportunities, campuses, {
      careerRole: 'surveyor',
      stateCode: 'AP',
    });
    const telanganaWriterPaths = filterOpportunitiesByDiscovery(opportunities, campuses, {
      careerRole: 'document-writer',
      stateCode: 'TS',
    });

    expect(apSurveyPaths.map((item) => item.id)).toEqual(['opp-survey-apprentice']);
    expect(telanganaWriterPaths.map((item) => item.id)).toEqual(['opp-writer']);
  });

  test('publishes valid state metadata for courses and learning centres', () => {
    const stateCodes = new Set(universityStates.map((state) => state.code));
    for (const item of courses) {
      if (item.jurisdictionScope === 'state-specific') expect(item.stateCodes.length).toBeGreaterThan(0);
      else expect(item.stateCodes).toEqual([]);
      for (const stateCode of item.stateCodes) expect(stateCodes.has(stateCode)).toBe(true);
    }
    for (const campus of campuses) expect(stateCodes.has(campus.stateCode)).toBe(true);
  });

  test('publishes all Indian state and union territory land-record guides', () => {
    const states = stateLandRecordProfiles.filter((profile) => profile.kind === 'state');
    const unionTerritories = stateLandRecordProfiles.filter((profile) => profile.kind === 'union-territory');
    expect(states).toHaveLength(28);
    expect(unionTerritories).toHaveLength(8);
    expect(stateLandRecordProfiles).toHaveLength(36);
    expect(new Set(stateLandRecordProfiles.map((profile) => profile.code)).size).toBe(36);
    expect(new Set(stateLandRecordProfiles.map((profile) => profile.slug)).size).toBe(36);
  });

  test('gives every jurisdiction local vocabulary and government-only sources', () => {
    for (const profile of stateLandRecordProfiles) {
      expect(profile.localTerms.length).toBeGreaterThanOrEqual(4);
      expect(profile.summary.length).toBeGreaterThan(40);
      expect(profile.coverageNote.length).toBeGreaterThan(40);
      expect(profile.officialLinks.some((link) => link.kind === 'land-records')).toBe(true);
      expect(profile.officialLinks.some((link) => link.kind === 'registration')).toBe(true);
      for (const link of profile.officialLinks) expect(isGovernmentReferenceUrl(link.url)).toBe(true);
    }
    for (const source of indiaLandRecordSources) expect(isGovernmentReferenceUrl(source.url)).toBe(true);
  });

  test('publishes substantial reviewed learning content for every jurisdiction', () => {
    expect(stateLearningGuides).toHaveLength(36);
    expect(new Set(stateLearningGuides.map((guide) => guide.code)).size).toBe(36);

    for (const guide of stateLearningGuides) {
      const profile = stateLandRecordProfiles.find((item) => item.code === guide.code);
      expect(profile).toBeDefined();
      expect(guide.answerSummary.length).toBeGreaterThan(100);
      expect(guide.recordExplainers.length).toBeGreaterThanOrEqual(3);
      expect(guide.accessSteps).toHaveLength(4);
      expect(guide.topics.map((topic) => topic.id).sort()).toEqual([
        'mutation',
        'registration',
        'special-context',
        'survey',
      ]);
      expect(guide.checklist.length).toBeGreaterThanOrEqual(7);
      expect(guide.faqs).toHaveLength(4);
      expect(guide.editorialNote).toContain('government sources');

      for (const record of guide.recordExplainers) {
        expect(record.name.length).toBeGreaterThan(1);
        expect(record.purpose.length).toBeGreaterThan(40);
        expect(record.verify.length).toBeGreaterThan(40);
      }
      for (const topic of guide.topics) {
        expect(topic.answer.length).toBeGreaterThan(80);
        expect(topic.sourceKinds.length).toBeGreaterThan(0);
      }
      for (const faq of guide.faqs) {
        expect(faq.answer.length).toBeGreaterThan(80);
        expect(faq.sourceKinds.length).toBeGreaterThan(0);
      }
    }
  });

  test('publishes unique state SEO metadata and answer structured data', () => {
    expect(new Set(stateLearningGuides.map((guide) => guide.seoTitle)).size).toBe(36);
    expect(new Set(stateLearningGuides.map((guide) => guide.seoDescription)).size).toBe(36);

    for (const guide of stateLearningGuides) {
      const profile = stateLandRecordProfiles.find((item) => item.code === guide.code)!;
      expect(guide.seoTitle).toContain(profile.name);
      expect(guide.seoDescription.length).toBeGreaterThan(100);
      expect(guide.seoDescription.length).toBeLessThan(200);
      const schema = buildStateGuideStructuredData(profile, guide);
      expect(schema.map((item) => item['@type'])).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
      expect((schema[0].citation as string[]).every(isGovernmentReferenceUrl)).toBe(true);
      expect((schema[1].mainEntity as unknown[])).toHaveLength(4);
    }
  });

  test('hands live disputes to a qualified person', () => {
    const reply = answerTutor(course, 'Should I buy this land dispute?');
    expect(reply.needsHuman).toBe(true);
    expect(reply.text).toContain('cannot');
  });

  test('does not present a preview completion record as a verified credential', () => {
    const reply = answerTutor(course, 'How does the certificate work?');
    expect(reply.text).toContain('preview');
    expect(reply.text).toContain('reviewer approval');
  });

  test('grounds course tutor answers in published lesson content', () => {
    const surveyCourse = courses.find((item) => item.slug === 'field-survey-foundations');
    const reply = answerTutor(surveyCourse, 'How should I prepare field safety and consent?');
    expect(reply.needsHuman).toBe(false);
    expect(reply.sources[0]).toContain('Field safety and consent');
    expect(reply.sources[0]).toContain('preview-2026.09');
  });

  test('adds official-source provenance to Andhra Pradesh tutor answers', () => {
    const apCourse = courses.find((item) => item.slug === 'buying-land-andhra-pradesh');
    const reply = answerTutor(apCourse, 'What do the Pattadar passbook and Record of Rights show?');
    expect(reply.needsHuman).toBe(false);
    expect(reply.sources.some((source) => source.includes('Government'))).toBe(true);
  });

  test('publishes complete structured content for every catalog module', () => {
    expect(missingContentModuleIds(courses)).toEqual([]);
    expect(Object.keys(lessonContentByModuleId)).toHaveLength(52);
    for (const lesson of Object.values(lessonContentByModuleId)) {
      expect(lesson.objectives.length).toBeGreaterThanOrEqual(3);
      expect(lesson.sections.length).toBeGreaterThanOrEqual(3);
      expect(lesson.practice.steps.length).toBeGreaterThanOrEqual(3);
      expect(lesson.knowledgeCheck.options).toHaveLength(3);
      expect(lesson.knowledgeCheck.correctOption).toBeGreaterThanOrEqual(0);
      expect(lesson.knowledgeCheck.correctOption).toBeLessThan(lesson.knowledgeCheck.options.length);
    }
  });

  test('uses only resolvable government references', () => {
    for (const reference of officialReferences) expect(isGovernmentReferenceUrl(reference.url)).toBe(true);
    for (const lesson of Object.values(lessonContentByModuleId)) {
      for (const referenceId of lesson.referenceIds ?? []) expect(officialReferenceById(referenceId)).toBeDefined();
    }
  });

  test('grounds every Andhra Pradesh foundation module in official sources', () => {
    const apCourse = courses.find((item) => item.slug === 'buying-land-andhra-pradesh');
    expect(apCourse).toBeDefined();
    for (const module of apCourse?.modules ?? []) {
      expect(lessonContentByModuleId[module.id]?.referenceIds?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('maps every compliance requirement to published lessons', () => {
    const moduleIds = new Set(courses.flatMap((item) => item.modules.map((module) => module.id)));
    for (const requirement of complianceCoverage) {
      expect(requirement.moduleIds.length).toBeGreaterThan(0);
      for (const moduleId of requirement.moduleIds) expect(moduleIds.has(moduleId)).toBe(true);
    }
  });

  test('covers every published company workforce rule exactly once in the matrix', () => {
    const workforceKeys = complianceCoverage
      .filter((requirement) => requirement.area === 'workforce')
      .map((requirement) => requirement.key)
      .sort();
    expect(workforceKeys).toEqual([...workforceComplianceKeys].sort());
  });

  test('covers every AP property checklist and guidance section', () => {
    const propertyKeys = complianceCoverage
      .filter((requirement) => requirement.area === 'property-records')
      .map((requirement) => requirement.key)
      .sort();
    const guidanceKeys = complianceCoverage
      .filter((requirement) => requirement.area === 'buyer-seller')
      .map((requirement) => requirement.key)
      .sort();
    const serviceKeys = new Set(complianceCoverage
      .filter((requirement) => requirement.area === 'service-sharing')
      .map((requirement) => requirement.key));
    expect(propertyKeys).toEqual([...propertyChecklistKeys].sort());
    expect(guidanceKeys).toEqual([...guidanceComplianceKeys].sort());
    for (const key of serviceComplianceKeys) expect(serviceKeys.has(key)).toBe(true);
  });
});
