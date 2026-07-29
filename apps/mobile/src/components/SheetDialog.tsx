import { Modal as RNModal, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

/**
 * A dialog that works on modal-presented screens.
 *
 * react-native-paper's Dialog mounts through a Portal at the PaperProvider
 * root, which sits BELOW any screen presented with `presentation: 'modal'` —
 * so on those screens the dialog opens invisibly behind the sheet and the
 * button that triggered it looks dead. This uses React Native's own Modal,
 * which the platform renders above everything.
 *
 * Same trap as portalled pickers (see InlinePicker). Rule: on a modal screen,
 * never use Portal for anything the user must see.
 */
export function SheetDialog({
  visible,
  title,
  onDismiss,
  children,
  actions,
}: {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Dismiss">
        {/* stop taps inside the card from dismissing */}
        <Pressable style={[styles.card, { backgroundColor: theme.colors.elevation.level3 }]} onPress={() => {}}>
          <Text variant="titleMedium" style={styles.title}>
            {title}
          </Text>
          <View style={styles.body}>{children}</View>
          {!!actions && <View style={styles.actions}>{actions}</View>}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 20, gap: 10 },
  title: { fontWeight: '700' },
  body: { gap: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
});
