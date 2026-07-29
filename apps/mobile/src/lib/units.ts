import * as SecureStore from 'expo-secure-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { ExtentPref } from '@pattadar/core';

const KEY = 'pattadar_units';
const OPTIONS: ExtentPref[] = ['acres-cents', 'acres-guntas', 'cents', 'sqyd'];
export const UNIT_LABELS: Record<ExtentPref, string> = {
  'acres-cents': 'Acres + Cents',
  'acres-guntas': 'Acres + Guntas',
  cents: 'Cents only',
  sqyd: 'Sq.yd',
};

/** Global unit preference (CL-13); default Acres+Cents. */
export function useUnitPref(): ExtentPref {
  const { data } = useQuery({
    queryKey: ['pattadar', 'units'],
    queryFn: async () => ((await SecureStore.getItemAsync(KEY)) as ExtentPref) || 'acres-cents',
    staleTime: Infinity,
  });
  return data ?? 'acres-cents';
}

/** Explicit choice — what Settings uses. A silent cycle-on-tap is too easy to
 * trigger by accident, and land units are not a thing to change by accident. */
export function useSetUnitPref() {
  const qc = useQueryClient();
  return async (next: ExtentPref) => {
    await SecureStore.setItemAsync(KEY, next).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ['pattadar', 'units'] });
  };
}

export const UNIT_OPTIONS = OPTIONS;

export function useCycleUnitPref() {
  const qc = useQueryClient();
  const current = useUnitPref();
  return async () => {
    const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length];
    await SecureStore.setItemAsync(KEY, next).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ['pattadar', 'units'] });
  };
}
