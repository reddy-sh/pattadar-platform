export type AudienceRole =
  | 'buyer'
  | 'seller'
  | 'surveyor'
  | 'document-writer'
  | 'legal'
  | 'field-services'
  | 'staff';

export type CourseLevel = 'Foundation' | 'Practitioner' | 'Professional';
export type CourseTone = 'records' | 'survey' | 'legal' | 'field' | 'development' | 'service';
export type UniversityStateCode =
  | 'AN'
  | 'AP'
  | 'AR'
  | 'AS'
  | 'BR'
  | 'CG'
  | 'CH'
  | 'DH'
  | 'DL'
  | 'GA'
  | 'GJ'
  | 'HP'
  | 'HR'
  | 'JH'
  | 'JK'
  | 'KA'
  | 'KL'
  | 'LA'
  | 'LD'
  | 'MH'
  | 'ML'
  | 'MN'
  | 'MP'
  | 'MZ'
  | 'NL'
  | 'OD'
  | 'PB'
  | 'PY'
  | 'RJ'
  | 'SK'
  | 'TN'
  | 'TR'
  | 'TS'
  | 'UK'
  | 'UP'
  | 'WB';

export type CourseJurisdictionScope = 'india-general' | 'state-specific';
export type JurisdictionKind = 'state' | 'union-territory';
export type LandRecordAvailability =
  | 'public-records'
  | 'service-portal'
  | 'limited-coverage'
  | 'department-guidance';

export interface UniversityState {
  code: UniversityStateCode;
  name: string;
}

export interface OfficialJurisdictionLink {
  kind: 'land-records' | 'registration' | 'guidance';
  label: string;
  authority: string;
  url: string;
}

export interface StateLandRecordProfile extends UniversityState {
  slug: string;
  kind: JurisdictionKind;
  availability: LandRecordAvailability;
  primaryRecordLabel: string;
  localTerms: string[];
  summary: string;
  coverageNote: string;
  officialLinks: OfficialJurisdictionLink[];
  reviewedOn: string;
}

export type StateGuideSourceKind = OfficialJurisdictionLink['kind'] | 'national';

export interface StateRecordExplainer {
  name: string;
  purpose: string;
  verify: string;
}

export interface StateGuideTopic {
  id: 'mutation' | 'survey' | 'registration' | 'special-context';
  question: string;
  answer: string;
  sourceKinds: StateGuideSourceKind[];
}

export interface StateGuideFaq {
  question: string;
  answer: string;
  sourceKinds: StateGuideSourceKind[];
}

export interface StateLearningGuide {
  code: UniversityStateCode;
  answerSummary: string;
  recordExplainers: StateRecordExplainer[];
  accessSteps: string[];
  topics: StateGuideTopic[];
  checklist: string[];
  faqs: StateGuideFaq[];
  seoTitle: string;
  seoDescription: string;
  searchTerms: string[];
  editorialNote: string;
  reviewedOn: string;
}

export interface CourseModule {
  id: string;
  title: string;
  minutes: number;
  kind: 'lesson' | 'field-practice' | 'assessment';
}

export interface LessonSection {
  heading: string;
  body: string;
}

export interface LessonPractice {
  title: string;
  steps: string[];
  deliverable: string;
}

export interface KnowledgeCheck {
  prompt: string;
  options: string[];
  correctOption: number;
  explanation: string;
}

export interface LessonContent {
  moduleId: string;
  overview: string;
  objectives: string[];
  sections: LessonSection[];
  practice: LessonPractice;
  knowledgeCheck: KnowledgeCheck;
  referenceIds?: string[];
  videoStatus: 'planned';
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  summary: string;
  outcome: string;
  roles: AudienceRole[];
  level: CourseLevel;
  durationMinutes: number;
  language: string;
  priceLabel: string;
  credential: string;
  tone: CourseTone;
  imageAlt: string;
  jurisdictionScope: CourseJurisdictionScope;
  stateCodes: UniversityStateCode[];
  locationSlugs: string[];
  modules: CourseModule[];
  contentVersion: string;
}

export interface Campus {
  id: string;
  slug: string;
  name: string;
  district: string;
  state: string;
  stateCode: UniversityStateCode;
  mode: string;
  address: string;
  courseSlugs: string[];
}

export interface Mentor {
  id: string;
  name: string;
  role: string;
  locationSlug: string;
  languages: string[];
  focus: string;
}

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  locationSlug: string;
  role: AudienceRole;
  engagement: string;
  requirement: string;
}

export type EnrollmentStatus = 'active' | 'completed' | 'paused';

export interface Enrollment {
  id: string;
  learnerId: string;
  courseId: string;
  enrolledAt: string;
  updatedAt: string;
  status: EnrollmentStatus;
  completedModuleIds: string[];
  contentVersion: string;
  version: number;
  idempotencyKey: string;
}

export interface LearningSnapshot {
  schemaVersion: 1;
  enrollments: Enrollment[];
}

export interface TutorReply {
  text: string;
  sources: string[];
  needsHuman: boolean;
}
