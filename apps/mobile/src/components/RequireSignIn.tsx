import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';


/** Gate for write screens: no identity → no data entry. */
export function RequireSignIn() {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <Text variant="headlineSmall" style={styles.title}>
        Sign in to continue
      </Text>
      <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
        Your land records belong to your account. Sign in to add or change
        anything.
      </Text>
      <Button mode="contained" icon="login" onPress={() => router.push('/sign-in' as never)}>
        Sign in
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontWeight: '700' },
  body: { textAlign: 'center' },
});
