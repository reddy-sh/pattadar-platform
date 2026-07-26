import { ScrollView, StyleSheet } from 'react-native';
import { Divider, List, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { useDashboard } from '@/data/hooks';
import { tokens } from '@pattadar/tokens';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEV_USER = process.env.EXPO_PUBLIC_DEV_USER ?? '';

export default function MoreScreen() {
  const theme = useTheme();
  const { data: result } = useDashboard();
  const name = result?.data.me?.name || '—';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader title="More" />
        <List.Section>
          <List.Subheader>Coming soon</List.Subheader>
          <List.Item title="Documents" description="View and manage files — needs sign-in (Cognito)" left={(p) => <List.Icon {...p} icon="file-document-outline" />} />
          <List.Item title="Notifications" description="Alerts and reminders" left={(p) => <List.Icon {...p} icon="bell-outline" />} />
          <List.Item title="Tools" description="Stamp duty, market value, calculators" left={(p) => <List.Icon {...p} icon="calculator-variant-outline" />} />
          <Divider />
          <List.Subheader>Account</List.Subheader>
          <List.Item title={name} description="Signed-in profile" left={(p) => <List.Icon {...p} icon="account-circle-outline" />} />
          <List.Item
            title="Sign in with Cognito"
            description="Coming with the native app client — local dev uses a dev identity"
            left={(p) => <List.Icon {...p} icon="shield-key-outline" />}
          />
          <Divider />
          <List.Subheader>App</List.Subheader>
          <List.Item
            title="Manage documents, exports & tools"
            description="pattadar.com — everything syncs with this app"
            left={(p) => <List.Icon {...p} icon="open-in-new" />}
          />
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
            description="Pattadar mobile 0.1.0 · Phase 4"
            left={(p) => <List.Icon {...p} icon="information-outline" />}
          />
        </List.Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl },
  heading: { fontWeight: '700' },
});
