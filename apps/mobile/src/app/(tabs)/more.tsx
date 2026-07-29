import { ScrollView, StyleSheet } from 'react-native';
import { List, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEV_USER = process.env.EXPO_PUBLIC_DEV_USER ?? '';

/** Everything this screen used to list — Documents, Notifications, Tools,
 * sign-in, the signed-in name — either never shipped or is already the real,
 * wired Account screen (reachable from the More sheet's own grid). Repeating
 * it here as inert rows was a second, broken copy of that menu, so this is
 * now just the app-identity rows Account does not carry. */
export default function MoreScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader title="More" />
        <List.Section>
          <List.Subheader>App</List.Subheader>
          <List.Item
            title="Appearance"
            description="Follows your device light/dark setting"
            left={(p) => <List.Icon {...p} icon="theme-light-dark" />}
          />
          {__DEV__ && (
            <List.Item
              title="Dev connection"
              description={`${API_URL || 'no API'} as ${DEV_USER || '(none)'}`}
              left={(p) => <List.Icon {...p} icon="server-network-outline" />}
            />
          )}
          <List.Item
            title="Version"
            description="Pattadar mobile 0.1.0"
            left={(p) => <List.Icon {...p} icon="information-outline" />}
          />
        </List.Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
});
