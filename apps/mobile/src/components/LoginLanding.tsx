import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Button, HelperText, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCognitoAuth } from '@/auth/useCognitoAuth';
import { tokens } from '@pattadar/tokens';

/** Full-screen landing for signed-out users — no tabs, no content, one door. */
export function LoginLanding() {
  const theme = useTheme();
  const { ready, googleReady, busy, error, signIn, signInWithGoogle } = useCognitoAuth();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.center}>
        <Animated.Text entering={FadeIn.duration(700)} style={styles.emblem}>
          🌾
        </Animated.Text>
        <Animated.View entering={FadeInDown.duration(500).delay(200)}>
          <Text variant="displaySmall" style={styles.brand}>
            Pattadar
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(500).delay(350)}>
          <Text
            variant="titleMedium"
            style={[styles.tagline, { color: theme.colors.onSurfaceVariant }]}
          >
            Your family's land, safe forever.
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.duration(500).delay(550)} style={styles.actions}>
          <Button
            mode="contained"
            icon="email-outline"
            loading={busy}
            disabled={!ready || busy}
            contentStyle={styles.buttonContent}
            onPress={signIn}
          >
            Sign in with email
          </Button>
          <Button
            mode="outlined"
            icon="google"
            disabled={!googleReady || busy}
            contentStyle={styles.buttonContent}
            onPress={signInWithGoogle}
          >
            Continue with Google
          </Button>
          {!!error && (
            <HelperText type="error" visible style={styles.error}>
              {error}
            </HelperText>
          )}
        </Animated.View>
      </View>
      <Animated.View entering={FadeIn.duration(700).delay(900)}>
        <Text variant="bodySmall" style={[styles.footer, { color: theme.colors.onSurfaceVariant }]}>
          Same account as pattadar.com · Powered by Amazon Cognito
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  emblem: { fontSize: 72, marginBottom: tokens.spacing.sm },
  brand: { fontWeight: '700', letterSpacing: 0.5 },
  tagline: { textAlign: 'center' },
  actions: { marginTop: tokens.spacing.xl, alignSelf: 'stretch', gap: tokens.spacing.xs },
  buttonContent: { paddingVertical: tokens.spacing.xs },
  error: { textAlign: 'center' },
  footer: { textAlign: 'center', paddingBottom: tokens.spacing.lg },
});
