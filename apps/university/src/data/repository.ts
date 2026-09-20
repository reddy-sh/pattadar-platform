import type { Enrollment, LearningSnapshot } from '../domain/types';

const STORAGE_KEY = 'pattadar.university.learning.v1';
const EMPTY_SNAPSHOT: LearningSnapshot = { schemaVersion: 1, enrollments: [] };

export interface LearningRepository {
  load(learnerId: string): Promise<LearningSnapshot>;
  save(enrollment: Enrollment): Promise<void>;
}

export class BrowserLearningRepository implements LearningRepository {
  async load(learnerId: string): Promise<LearningSnapshot> {
    const snapshot = this.read();
    return {
      schemaVersion: 1,
      enrollments: snapshot.enrollments.filter((enrollment) => enrollment.learnerId === learnerId),
    };
  }

  async save(enrollment: Enrollment): Promise<void> {
    const snapshot = this.read();
    const index = snapshot.enrollments.findIndex((item) => item.id === enrollment.id);
    if (index === -1) snapshot.enrollments.push(enrollment);
    else snapshot.enrollments[index] = enrollment;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  private read(): LearningSnapshot {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...EMPTY_SNAPSHOT, enrollments: [] };
      const parsed = JSON.parse(raw) as Partial<LearningSnapshot>;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.enrollments)) {
        return { ...EMPTY_SNAPSHOT, enrollments: [] };
      }
      return { schemaVersion: 1, enrollments: parsed.enrollments };
    } catch {
      return { ...EMPTY_SNAPSHOT, enrollments: [] };
    }
  }
}
