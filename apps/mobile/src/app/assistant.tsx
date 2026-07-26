import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Appbar, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@pattadar/tokens';

/** Pattadar Assistant landing — the in-app AI ships with Phase 3's
 * services/assistant; this screen is its permanent home in the top bar. */
export default function AssistantScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Pattadar Assistant" />
      </Appbar.Header>
      <View style={styles.center}>
        <Icon source="shimmer" size={64} color={theme.colors.primary} />
        <Text variant="headlineSmall" style={styles.title}>
          Ask about your land
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          The Pattadar Assistant answers questions about your parcels, khata,
          stamp duty and documents — arriving with the assistant service
          (Phase 3). It will live right here, one tap from every screen.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl, gap: tokens.spacing.md },
  title: { fontWeight: '700', textAlign: 'center' },
  body: { textAlign: 'center' },
});
