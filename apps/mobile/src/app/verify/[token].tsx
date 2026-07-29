import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hasApi } from '@/api/client';
import { useVerifyBeneficiary } from '@/data/hooks';

/**
 * Public verification landing — opened from the invite link
 * https://pattadar.com/verify/<token> (Android App Link / iOS Universal Link).
 * The verifyBeneficiary mutation is the one operation the gateway allows
 * without a signed-in user; the token IS the credential — which is exactly
 * why verification only fires on an explicit tap, never on mere link-open.
 */
export default function VerifyScreen() {
  const theme = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const verify = useVerifyBeneficiary();
  const statusColors = theme.dark ? { good: '#6fcf97', warning: '#e8a13d', critical: '#ef6a6a', muted: theme.colors.onSurfaceVariant } : { good: '#2e7d32', warning: '#b45309', critical: '#a61b1b', muted: theme.colors.onSurfaceVariant };

  const succeeded = verify.isSuccess && !!verify.data?.verifyBeneficiary;
  // A rejected token comes back as a GraphQL-level error ("Invalid or expired
  // verification link") which the shared client throws; transport failures
  // throw network/HTTP errors instead. Split the two so a bad link is not
  // reported as a connectivity problem.
  const errMsg = verify.error instanceof Error ? verify.error.message : '';
  const isTransportError = /network|failed to fetch|GraphQL HTTP/i.test(errMsg);
  const invalidToken =
    (verify.isSuccess && !verify.data?.verifyBeneficiary) ||
    (verify.isError && !isTransportError);
  const unreachable = !hasApi || (verify.isError && isTransportError);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.center}>
        {verify.isIdle && !unreachable && (
          <>
            <MaterialCommunityIcons
              name="shield-account-outline"
              size={64}
              color={theme.colors.primary}
            />
            <Text variant="headlineSmall" style={styles.title}>
              Verify your co-ownership
            </Text>
            <Text variant="bodyMedium" style={styles.body}>
              You were invited to confirm your place in a Pattadar family group.
              Tap below to complete verification.
            </Text>
            <Button mode="contained" disabled={!token} onPress={() => token && verify.mutate(token)}>
              Confirm verification
            </Button>
          </>
        )}
        {verify.isPending && (
          <>
            <ActivityIndicator size="large" />
            <Text variant="titleMedium">Verifying your invitation…</Text>
          </>
        )}
        {succeeded && (
          <>
            <MaterialCommunityIcons name="check-decagram" size={64} color={statusColors.good} />
            <Text variant="headlineSmall" style={styles.title}>
              Verification complete
            </Text>
            <Text variant="bodyMedium" style={styles.body}>
              Your co-ownership is confirmed. You can close this screen — the
              family head can see your verified status.
            </Text>
          </>
        )}
        {invalidToken && (
          <>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={64}
              color={theme.colors.error}
            />
            <Text variant="headlineSmall" style={styles.title}>
              Link not valid
            </Text>
            <Text variant="bodyMedium" style={styles.body}>
              This invitation link is invalid, already used, or expired. Ask the
              sender for a fresh link.
            </Text>
          </>
        )}
        {unreachable && !verify.isPending && !succeeded && (
          <>
            <MaterialCommunityIcons
              name="wifi-off"
              size={64}
              color={theme.colors.onSurfaceVariant}
            />
            <Text variant="headlineSmall" style={styles.title}>
              Could not reach the server
            </Text>
            <Text variant="bodyMedium" style={styles.body}>
              Check your connection and try again.
            </Text>
            {token ? (
              <Button mode="contained" onPress={() => verify.mutate(token)}>
                Try again
              </Button>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontWeight: '700', textAlign: 'center' },
  body: { textAlign: 'center' },
});
