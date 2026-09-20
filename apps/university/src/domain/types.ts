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

export interface CourseModule {
  id: string;
  title: string;
  minutes: number;
  kind: 'lesson' | 'field-practice' | 'assessment';
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
