import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listBottomInset } from '@/lib/listInset';

export { FAB_CLEARANCE, TAB_BAR_CLEARANCE, listBottomInset } from '@/lib/listInset';

/** The one inset every list screen uses. Stop patching per-screen. */
export function useListBottomInset(): number {
  const insets = useSafeAreaInsets();
  return listBottomInset(insets.bottom);
}
