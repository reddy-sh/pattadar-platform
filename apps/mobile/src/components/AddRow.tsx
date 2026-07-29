import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

/**
 * The last row of a list: "＋ Add passbook".
 *
 * Creation belongs where the content ends, the way Reminders, Notes and Todoist
 * do it — the eye is already there after reading the list, and nothing floats
 * over the content competing for attention. Deliberately lighter than a card:
 * it is an action, not a record, and must never be mistaken for one.
 *
 * Never rendered on an empty list — the empty state carries its own call to
 * action, and two of them would be the duplication this pattern removes.
 */
export function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: theme.colors.surfaceVariant }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      <View style={styles.icon}>
        <Icon source="plus" size={20} color={theme.colors.primary} />
      </View>
      <Text variant="bodyMedium" style={[styles.label, { color: theme.colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Generous target: this is the primary way to add on every list screen.
    paddingVertical: 18,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  icon: { width: 40, alignItems: 'center' },
  label: { fontWeight: '600' },
});
