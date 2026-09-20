import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { courseById } from '../data/catalog';
import { BrowserLearningRepository, BrowserOpportunityInterestRepository } from '../data/repository';
import { createEnrollment, toggleModule } from '../domain/learning';
import type { Enrollment } from '../domain/types';

interface UniversityContextValue {
  enrollments: Enrollment[];
  interestedOpportunityIds: string[];
  isReady: boolean;
  joinCourse: (courseId: string) => Promise<Enrollment | undefined>;
  toggleCourseModule: (courseId: string, moduleId: string) => Promise<void>;
  toggleOpportunityInterest: (opportunityId: string) => Promise<void>;
  enrollmentFor: (courseId: string) => Enrollment | undefined;
}

const learningRepository = new BrowserLearningRepository();
const opportunityInterestRepository = new BrowserOpportunityInterestRepository();
const UniversityContext = createContext<UniversityContextValue | null>(null);

export function UniversityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [interestedOpportunityIds, setInterestedOpportunityIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    if (!user) {
      setEnrollments([]);
      setInterestedOpportunityIds([]);
      setIsReady(true);
      return () => { cancelled = true; };
    }
    Promise.all([
      learningRepository.load(user.id),
      opportunityInterestRepository.load(user.id),
    ]).then(([snapshot, opportunityIds]) => {
      if (!cancelled) {
        setEnrollments(snapshot.enrollments);
        setInterestedOpportunityIds(opportunityIds);
        setIsReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  const value = useMemo<UniversityContextValue>(() => ({
    enrollments,
    interestedOpportunityIds,
    isReady,
    enrollmentFor: (courseId) => enrollments.find((enrollment) => enrollment.courseId === courseId),
    joinCourse: async (courseId) => {
      if (!user) return undefined;
      const existing = enrollments.find((enrollment) => enrollment.courseId === courseId);
      if (existing) return existing;
      const course = courseById(courseId);
      if (!course) return undefined;
      const enrollment = createEnrollment(user.id, course);
      await learningRepository.save(enrollment);
      setEnrollments((current) => [...current, enrollment]);
      return enrollment;
    },
    toggleCourseModule: async (courseId, moduleId) => {
      const course = courseById(courseId);
      const current = enrollments.find((enrollment) => enrollment.courseId === courseId);
      if (!course || !current) return;
      const next = toggleModule(course, current, moduleId);
      await learningRepository.save(next);
      setEnrollments((items) => items.map((item) => (item.id === next.id ? next : item)));
    },
    toggleOpportunityInterest: async (opportunityId) => {
      if (!user) return;
      const next = await opportunityInterestRepository.toggle(user.id, opportunityId);
      setInterestedOpportunityIds(next);
    },
  }), [enrollments, interestedOpportunityIds, isReady, user]);

  return <UniversityContext.Provider value={value}>{children}</UniversityContext.Provider>;
}

export function useUniversity(): UniversityContextValue {
  const value = useContext(UniversityContext);
  if (!value) throw new Error('useUniversity must be used inside UniversityProvider');
  return value;
}
