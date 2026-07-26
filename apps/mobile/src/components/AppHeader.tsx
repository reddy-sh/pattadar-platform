import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Avatar, IconButton, Text, useTheme } from 'react-native-paper';

import { useDashboard } from '@/data/hooks';
import { tokens } from '@pattadar/tokens';

/** Zoom-style top bar: avatar + title + Pattadar Assistant sparkle. */
export function AppHeader({ title }: { title: string }) {
  const theme = useTheme();
  const { data } = useDashboard();
  const initial = (data?.data.me?.name || 'P').trim()[0]?.toUpperCase() ?? 'P';
  return (
    <View style={styles.row}>
      <Avatar.Text
        size={36}
        label={initial}
        style={{ backgroundColor: theme.colors.primaryContainer }}
        labelStyle={{ color: theme.colors.onPrimaryContainer }}
      />
      <Text variant="headlineSmall" style={styles.title}>
        {title}
      </Text>
      <IconButton
        icon="shimmer"
        size={22}
        iconColor={theme.colors.primary}
        onPress={() => router.push('/assistant' as never)}
        accessibilityLabel="Pattadar Assistant"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  title: { fontWeight: '700', flex: 1 },
});
