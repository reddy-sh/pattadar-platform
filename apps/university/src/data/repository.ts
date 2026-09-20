import type { Enrollment, LearningSnapshot } from '../domain/types';

const STORAGE_KEY = 'pattadar.university.learning.v1';
const OPPORTUNITY_STORAGE_KEY = 'pattadar.university.opportunity-interest.v1';
const EMPTY_SNAPSHOT: LearningSnapshot = { schemaVersion: 1, enrollments: [] };

interface OpportunityInterestStore {
  schemaVersion: 1;
  byLearner: Record<string, string[]>;
}

export interface LearningRepository {
  load(learnerId: string): Promise<LearningSnapshot>;
  save(enrollment: Enrollment): Promise<void>;
}

export interface OpportunityInterestRepository {
  load(learnerId: string): Promise<string[]>;
  toggle(learnerId: string, opportunityId: string): Promise<string[]>;
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

export class BrowserOpportunityInterestRepository implements OpportunityInterestRepository {
  async load(learnerId: string): Promise<string[]> {
    return this.read().byLearner[learnerId] ?? [];
  }

  async toggle(learnerId: string, opportunityId: string): Promise<string[]> {
    const store = this.read();
    const next = new Set(store.byLearner[learnerId] ?? []);
    if (next.has(opportunityId)) next.delete(opportunityId);
    else next.add(opportunityId);
    const opportunityIds = [...next];
    store.byLearner[learnerId] = opportunityIds;
    window.localStorage.setItem(OPPORTUNITY_STORAGE_KEY, JSON.stringify(store));
    return opportunityIds;
  }

  private read(): OpportunityInterestStore {
    try {
      const raw = window.localStorage.getItem(OPPORTUNITY_STORAGE_KEY);
      if (!raw) return { schemaVersion: 1, byLearner: {} };
      const parsed = JSON.parse(raw) as Partial<OpportunityInterestStore>;
      if (parsed.schemaVersion !== 1 || !parsed.byLearner || typeof parsed.byLearner !== 'object') {
        return { schemaVersion: 1, byLearner: {} };
      }
      return { schemaVersion: 1, byLearner: parsed.byLearner };
    } catch {
      return { schemaVersion: 1, byLearner: {} };
    }
  }
}
