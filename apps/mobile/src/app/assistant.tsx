import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Appbar, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';


/** Pattadar Assistant landing — the in-app AI ships with the
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
          The Pattadar Assistant answers questions about your parcels, passbooks,
          stamp duty and documents. It is not built yet — when it is, it will
          be reachable from every screen.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontWeight: '700', textAlign: 'center' },
  body: { textAlign: 'center' },
});
