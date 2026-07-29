import { StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';

/**
 * CL-537: the one empty state. Icon, title, one sentence, primary action,
 * optional secondary — modelled on the Home onboarding card, which was the
 * only one of the four that told the user what would happen next.
 *
 * CL-542: placement lives here, so every screen centres the same way instead of
 * each one drifting (Groups sat near the top, Properties a third down,
 * Documents was left-aligned and had no button at all).
 *
 * CL-543: `secondary` exists because every assisted path needs a manual one —
 * scanning fails, and a dead end is not an empty state.
 *
 * CL-558: a vector icon, never an emoji.
 */
export interface EmptyStateAction {
  label: string;
  icon?: string;
  onPress: () => void;
}

export function EmptyState({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: string;
  title: string;
  body: string;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
}) {
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <View style={[styles.disc, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Icon source={icon} size={30} color={theme.colors.onSurfaceVariant} />
      </View>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
        {body}
      </Text>
      {!!primary && (
        <Button mode="contained" icon={primary.icon} onPress={primary.onPress} style={styles.action}>
          {primary.label}
        </Button>
      )}
      {!!secondary && (
        <Button mode="outlined" icon={secondary.icon} onPress={secondary.onPress} style={styles.action}>
          {secondary.label}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32, gap: 12 },
  disc: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '700', textAlign: 'center' },
  body: { textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: 4 },
});
