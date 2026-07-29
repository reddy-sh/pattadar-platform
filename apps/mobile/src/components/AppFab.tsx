import { StyleSheet } from 'react-native';
import { FAB, Portal, useTheme } from 'react-native-paper';

import { useDrawerOpen } from '@/lib/drawerState';

/** CL-43/44/185 (shared): one FAB spec — solid accent, standard elevation, and
 * a bottom inset every list must clear (import LIST_BOTTOM_INSET for padding).
 * Sized for tab bar (~83) + FAB offset (80) + FAB (56) + breathing room, so the
 * last row is never under the button on ANY screen. Fix it here, not per-screen. */
export const LIST_BOTTOM_INSET = 224;

export function AppFab({
  open,
  onStateChange,
  actions,
  visible,
}: {
  open: boolean;
  onStateChange: (s: { open: boolean }) => void;
  actions: { icon: string; label: string; onPress: () => void }[];
  visible: boolean;
}) {
  const theme = useTheme();
  const drawerOpen = useDrawerOpen();
  if (!visible || drawerOpen) return null;
  // One action needs no menu: opening a list of one is a tap the user should
  // never have had to make. It still LOOKS like every other FAB — a plain +,
  // same size, same place — because a labelled pill on two screens and a bare
  // circle on the rest reads as three different controls.
  if (actions.length === 1) {
    return (
      <Portal>
        <FAB
          icon="plus"
          accessibilityLabel={actions[0].label}
          onPress={actions[0].onPress}
          color={theme.colors.onPrimary}
          style={[styles.single, { backgroundColor: theme.colors.primary }]}
        />
      </Portal>
    );
  }
  return (
    <Portal>
      <FAB.Group
        open={open}
        visible
        icon={open ? 'close' : 'plus'}
        fabStyle={{ backgroundColor: theme.colors.primary }}
        color={theme.colors.onPrimary}
        style={[styles.fab, { pointerEvents: 'box-none' }]}
        onStateChange={onStateChange}
        actions={actions}
      />
    </Portal>
  );
}

const styles = StyleSheet.create({
  fab: { paddingBottom: 80 },
  // FAB.Group positions itself; a bare FAB must be placed.
  single: { position: 'absolute', right: 16, bottom: 96, paddingBottom: 0 },
});
