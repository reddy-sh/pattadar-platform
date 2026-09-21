import type { AudienceRole, Campus, Course, Opportunity, UniversityStateCode } from './types';

export const learningGoals = ['all', 'buyer', 'seller', 'career'] as const;
export type LearningGoal = (typeof learningGoals)[number];

export const careerRoles = ['surveyor', 'document-writer', 'legal', 'field-services', 'staff'] as const satisfies readonly AudienceRole[];
export type CareerRole = (typeof careerRoles)[number];

export interface DiscoveryFilters {
  goal: LearningGoal;
  careerRole: CareerRole | 'all';
  stateCode: UniversityStateCode | 'all';
}

export const defaultDiscoveryFilters: DiscoveryFilters = {
  goal: 'all',
  careerRole: 'all',
  stateCode: 'all',
};

export function isLearningGoal(value: string | null): value is LearningGoal {
  return value !== null && learningGoals.some((goal) => goal === value);
}

export function isCareerRole(value: string | null): value is CareerRole {
  return value !== null && careerRoles.some((role) => role === value);
}

export function courseMatchesDiscovery(course: Course, filters: DiscoveryFilters): boolean {
  const matchesGoal = filters.goal === 'all'
    || (filters.goal === 'buyer' && course.roles.includes('buyer'))
    || (filters.goal === 'seller' && course.roles.includes('seller'))
    || (filters.goal === 'career' && (
      filters.careerRole === 'all'
        ? course.roles.some((role) => isCareerRole(role))
        : course.roles.includes(filters.careerRole)
    ));
  const matchesState = filters.stateCode === 'all'
    || course.jurisdictionScope === 'india-general'
    || course.stateCodes.includes(filters.stateCode);

  return matchesGoal && matchesState;
}

export function filterCoursesByDiscovery(items: Course[], filters: DiscoveryFilters): Course[] {
  return items.filter((course) => courseMatchesDiscovery(course, filters));
}

export function filterOpportunitiesByDiscovery(
  items: Opportunity[],
  locations: Campus[],
  filters: Pick<DiscoveryFilters, 'careerRole' | 'stateCode'>,
): Opportunity[] {
  const stateByLocation = new Map(locations.map((campus) => [campus.slug, campus.stateCode]));

  return items.filter((opportunity) => {
    const matchesRole = filters.careerRole === 'all' || opportunity.role === filters.careerRole;
    const matchesState = filters.stateCode === 'all'
      || stateByLocation.get(opportunity.locationSlug) === filters.stateCode;
    return matchesRole && matchesState;
  });
}
