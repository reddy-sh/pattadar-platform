import { courses } from './catalog';

export type PathwayId = 'buyer' | 'seller' | 'employee' | 'service';

export interface PathwayStage {
  title: string;
  guidance: string;
  courseIds: string[];
  label: 'Choose your state' | 'Core learning' | 'Applied practice' | 'Optional focus';
}

export interface LearningPathway {
  id: PathwayId;
  audience: string;
  title: string;
  summary: string;
  outcome: string;
  stages: PathwayStage[];
}

// This is editorial guidance. Enrollment and access do not depend on these stages.
export const learningPathways: LearningPathway[] = [
  {
    id: 'buyer',
    audience: 'Buyers',
    title: 'Understand before you buy',
    summary: 'Learn which records answer which questions, then prepare a source-linked review and site visit.',
    outcome: 'Learning completion record. A course cannot confirm title or recommend a purchase.',
    stages: [
      {
        title: 'Start with the records for your state',
        guidance: 'Choose Andhra Pradesh or Telangana. For other places, start with the state guide while local course material is reviewed.',
        label: 'Choose your state',
        courseIds: ['crs-buy-ap-101', 'crs-buy-ts-101'],
      },
      {
        title: 'Explore development questions',
        guidance: 'Optional Andhra Pradesh course for access, utilities, drainage, and professional dependencies.',
        label: 'Optional focus',
        courseIds: ['crs-dev-201'],
      },
      {
        title: 'Plan ongoing site care',
        guidance: 'Optional general practice for maintenance scope, boundaries, and safe referrals.',
        label: 'Optional focus',
        courseIds: ['crs-landscape-101'],
      },
    ],
  },
  {
    id: 'seller',
    audience: 'Sellers',
    title: 'Prepare a clear property handoff',
    summary: 'Inventory the file, describe uncertainties, and share records with consent.',
    outcome: 'Learning completion record. Sale readiness is not a title certificate or transaction approval.',
    stages: [
      {
        title: 'Understand the local record set',
        guidance: 'Choose the state that matches the property. The Telangana sale course is still missing.',
        label: 'Choose your state',
        courseIds: ['crs-buy-ap-101', 'crs-buy-ts-101'],
      },
      {
        title: 'Build the sale-ready pack',
        guidance: 'Current guided sale curriculum is specific to Andhra Pradesh.',
        label: 'Core learning',
        courseIds: ['crs-sell-101'],
      },
      {
        title: 'Document site condition',
        guidance: 'Optional general practice for maintenance and specialist referrals.',
        label: 'Optional focus',
        courseIds: ['crs-landscape-101'],
      },
    ],
  },
  {
    id: 'employee',
    audience: 'Pattadar employees',
    title: 'Learn the operating standard',
    summary: 'Start with local record literacy, then learn consent, pricing, evidence, workforce controls, and escalation.',
    outcome: 'Training progress is separate from employer clearance and permission to handle customer work.',
    stages: [
      {
        title: 'Learn the records you will handle',
        guidance: 'Choose the state that matches your work. Other state curricula require review before publication.',
        label: 'Choose your state',
        courseIds: ['crs-buy-ap-101', 'crs-buy-ts-101'],
      },
      {
        title: 'Learn Pattadar service governance',
        guidance: 'Follow the company controls for consent, pricing, eligibility, audit evidence, and escalation.',
        label: 'Core learning',
        courseIds: ['crs-staff-301'],
      },
      {
        title: 'Practise the assignment you perform',
        guidance: 'Field staff can add visit and quick-help practice; office staff should take the relevant specialist course below.',
        label: 'Applied practice',
        courseIds: ['crs-visit-101', 'crs-quick-help-201'],
      },
    ],
  },
  {
    id: 'service',
    audience: 'Service professionals',
    title: 'Deliver reviewable service work',
    summary: 'Learn safe intake and field evidence, then choose the service discipline you are qualified to perform.',
    outcome: 'A future skill certificate requires supervised evidence, human review, identity checks, and a verifiable issuance record.',
    stages: [
      {
        title: 'Start with consent and evidence',
        guidance: 'General practice for a scoped site visit and a reviewable photo package.',
        label: 'Core learning',
        courseIds: ['crs-visit-101'],
      },
      {
        title: 'Learn customer service operations',
        guidance: 'Practise arrival, status updates, incidents, and handoff for on-demand work.',
        label: 'Applied practice',
        courseIds: ['crs-quick-help-201'],
      },
      {
        title: 'Choose a qualified specialty',
        guidance: 'Choose the work that matches your actual role. Training alone does not grant a professional licence or dispatch eligibility.',
        label: 'Optional focus',
        courseIds: ['crs-survey-201', 'crs-writer-201', 'crs-legal-301', 'crs-landscape-101'],
      },
    ],
  },
];

export const pathwayById = (id: string | undefined) => learningPathways.find((pathway) => pathway.id === id);
export const pathwaysForCourse = (courseId: string) => learningPathways.filter((pathway) =>
  pathway.stages.some((stage) => stage.courseIds.includes(courseId)));
export const pathwayCourses = (stage: PathwayStage) => stage.courseIds.flatMap((id) => {
  const course = courses.find((item) => item.id === id);
  return course ? [course] : [];
});
