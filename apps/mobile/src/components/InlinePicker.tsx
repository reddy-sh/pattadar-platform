import { Pressable, StyleSheet, View } from 'react-native';
import { HelperText, List, Text, TextInput, useTheme } from 'react-native-paper';

/**
 * A select that renders in normal flow.
 *
 * react-native-paper's Menu/Dialog mount through a Portal at the app root,
 * which sits BELOW any screen presented with `presentation: 'modal'` — so on
 * those screens the menu opens invisibly behind the sheet and looks dead.
 * Every add/edit screen in this app is modal-presented, so they all use this.
 * Rule: never portal a picker from a modal screen.
 */
export interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function InlinePicker({
  label,
  value,
  options,
  open,
  error,
  errorText,
  emptyText,
  onToggle,
  onPick,
}: {
  label: string;
  value: string;
  options: PickerOption[];
  open: boolean;
  error?: boolean;
  errorText?: string;
  emptyText?: string;
  onToggle: () => void;
  onPick: (v: string) => void;
}) {
  const theme = useTheme();
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${selected?.label ?? 'not set'}. Tap to change.`}
        onPress={onToggle}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        {/* pointerEvents none: the Pressable owns the whole field, not just the icon */}
        <View pointerEvents="none">
          <TextInput
            label={label}
            value={selected?.label ?? ''}
            placeholder="Tap to choose"
            mode="outlined"
            editable={false}
            error={error}
            right={<TextInput.Icon icon={open ? 'menu-up' : 'menu-down'} />}
          />
        </View>
      </Pressable>
      {error && !!errorText && (
        <HelperText type="error" visible>
          {errorText}
        </HelperText>
      )}
      {open && (
        <View
          style={[
            styles.list,
            { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
          ]}
        >
          {options.length === 0 && (
            <View style={styles.row}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {emptyText ?? 'Nothing to choose yet'}
              </Text>
            </View>
          )}
          {options.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              disabled={o.disabled}
              onPress={() => onPick(o.value)}
              style={({ pressed }) => [
                styles.row,
                o.disabled && styles.disabled,
                (pressed || value === o.value) && { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Text variant="bodyMedium" style={value === o.value ? styles.bold : undefined}>
                {o.label}
              </Text>
              {value === o.value && <List.Icon icon="check" color={theme.colors.primary} style={styles.check} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: 8, marginTop: 4, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  disabled: { opacity: 0.5 },
  check: { margin: 0, width: 22, height: 22 },
  bold: { fontWeight: '700' },
});
