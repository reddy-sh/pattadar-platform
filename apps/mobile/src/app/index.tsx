import { formatAcresGuntas, formatINR } from '@pattadar/core';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, Divider, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@pattadar/tokens';

/**
 * Placeholder home screen — proves the Phase 4 scaffold end to end:
 * expo-router renders it, react-native-paper is themed from @pattadar/tokens,
 * and the sample figures below are formatted by @pattadar/core (the same
 * functions the web dashboard uses). Replaced by the real portfolio
 * dashboard once the GraphQL client is wired to the gateway.
 */
export default function HomeScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <Text variant="displaySmall" style={styles.title}>
          Pattadar
        </Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          Your land records, in your pocket
        </Text>

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Sample portfolio
            </Text>
            <View style={styles.row}>
              <Text variant="bodyMedium">Total extent</Text>
              <Text variant="titleMedium">{formatAcresGuntas(12.625)}</Text>
            </View>
            <Divider />
            <View style={styles.row}>
              <Text variant="bodyMedium">Market value</Text>
              <Text variant="titleMedium">{formatINR(12_500_000)}</Text>
            </View>
          </Card.Content>
        </Card>

        <Chip mode="outlined" style={styles.chip}>
          Phase 4 scaffold — dashboard coming next
        </Chip>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  title: { fontWeight: '700' },
  card: { alignSelf: 'stretch', marginTop: tokens.spacing.xl },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.md,
  },
  chip: { marginTop: tokens.spacing.lg },
});
