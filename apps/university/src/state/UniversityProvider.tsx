import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { courseById } from '../data/catalog';
import { BrowserLearningRepository } from '../data/repository';
import { createEnrollment, toggleModule } from '../domain/learning';
import type { Enrollment } from '../domain/types';

interface UniversityContextValue {
  enrollments: Enrollment[];
  isReady: boolean;
  joinCourse: (courseId: string) => Promise<Enrollment | undefined>;
  toggleCourseModule: (courseId: string, moduleId: string) => Promise<void>;
  enrollmentFor: (courseId: string) => Enrollment | undefined;
}

const repository = new BrowserLearningRepository();
const UniversityContext = createContext<UniversityContextValue | null>(null);

export function UniversityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    if (!user) {
      setEnrollments([]);
      setIsReady(true);
      return () => { cancelled = true; };
    }
    repository.load(user.id).then((snapshot) => {
      if (!cancelled) {
        setEnrollments(snapshot.enrollments);
        setIsReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  const value = useMemo<UniversityContextValue>(() => ({
    enrollments,
    isReady,
    enrollmentFor: (courseId) => enrollments.find((enrollment) => enrollment.courseId === courseId),
    joinCourse: async (courseId) => {
      if (!user) return undefined;
      const existing = enrollments.find((enrollment) => enrollment.courseId === courseId);
      if (existing) return existing;
      const course = courseById(courseId);
      if (!course) return undefined;
      const enrollment = createEnrollment(user.id, course);
      await repository.save(enrollment);
      setEnrollments((current) => [...current, enrollment]);
      return enrollment;
    },
    toggleCourseModule: async (courseId, moduleId) => {
      const course = courseById(courseId);
      const current = enrollments.find((enrollment) => enrollment.courseId === courseId);
      if (!course || !current) return;
      const next = toggleModule(course, current, moduleId);
      await repository.save(next);
      setEnrollments((items) => items.map((item) => (item.id === next.id ? next : item)));
    },
  }), [enrollments, isReady, user]);

  return <UniversityContext.Provider value={value}>{children}</UniversityContext.Provider>;
}

export function useUniversity(): UniversityContextValue {
  const value = useContext(UniversityContext);
  if (!value) throw new Error('useUniversity must be used inside UniversityProvider');
  return value;
}
