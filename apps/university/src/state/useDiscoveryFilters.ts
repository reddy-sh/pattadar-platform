import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { universityStates } from '../data/catalog';
import {
  defaultDiscoveryFilters,
  isCareerRole,
  isLearningGoal,
  type DiscoveryFilters,
  type LearningGoal,
} from '../domain/discovery';
import type { UniversityStateCode } from '../domain/types';

interface DiscoveryFilterOptions {
  lockGoal?: LearningGoal;
}

function isUniversityStateCode(value: string | null): value is UniversityStateCode {
  return value !== null && universityStates.some((state) => state.code === value);
}

export function useDiscoveryFilters({ lockGoal }: DiscoveryFilterOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.toString();
  const pendingParams = useRef(new URLSearchParams(query));
  if (pendingParams.current.toString() !== query) pendingParams.current = new URLSearchParams(query);
  const filters = useMemo<DiscoveryFilters>(() => {
    const params = new URLSearchParams(query);
    const requestedGoal = params.get('goal');
    const requestedRole = params.get('role');
    const requestedState = params.get('state');
    const goal = lockGoal ?? (isLearningGoal(requestedGoal) ? requestedGoal : defaultDiscoveryFilters.goal);

    return {
      goal,
      careerRole: goal === 'career' && isCareerRole(requestedRole) ? requestedRole : 'all',
      stateCode: isUniversityStateCode(requestedState) ? requestedState : 'all',
    };
  }, [lockGoal, query]);

  const updateFilters = useCallback((patch: Partial<DiscoveryFilters>) => {
    const next = new URLSearchParams(pendingParams.current);
    const requestedGoal = next.get('goal');
    const requestedRole = next.get('role');
    const requestedState = next.get('state');
    const currentGoal = lockGoal ?? (isLearningGoal(requestedGoal) ? requestedGoal : defaultDiscoveryFilters.goal);
    const nextGoal = lockGoal ?? patch.goal ?? currentGoal;
    const currentRole = isCareerRole(requestedRole) ? requestedRole : defaultDiscoveryFilters.careerRole;
    const nextRole = patch.careerRole ?? currentRole;
    const currentState = isUniversityStateCode(requestedState) ? requestedState : defaultDiscoveryFilters.stateCode;
    const nextState = patch.stateCode ?? currentState;

    if (lockGoal || nextGoal === 'all') next.delete('goal');
    else next.set('goal', nextGoal);

    if (nextGoal === 'career' && nextRole !== 'all') next.set('role', nextRole);
    else next.delete('role');

    if (nextState === 'all') next.delete('state');
    else next.set('state', nextState);

    pendingParams.current = next;
    setSearchParams(next, { replace: true });
  }, [lockGoal, setSearchParams]);

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(pendingParams.current);
    next.delete('goal');
    next.delete('role');
    next.delete('state');
    pendingParams.current = next;
    setSearchParams(next, { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = filters.stateCode !== 'all'
    || filters.careerRole !== 'all'
    || (!lockGoal && filters.goal !== 'all');

  return { filters, updateFilters, clearFilters, hasActiveFilters };
}
