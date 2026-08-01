import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { healApiBase } from '@/api/client';
import { installQueryLifecycle } from '@/lib/queryLifecycle';
import { paperDark, paperLight } from '@/theme/paper';

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? paperDark : paperLight;

  // A saved server address that no longer answers used to strand the whole app
  // behind "can't reach the server", with the panel that could fix it hidden
  // behind a seven-tap gate. Check once at startup and fall back to the address
  // built into this app when the saved one is dead.
  // react-query's focus/online defaults are browser-shaped and inert on a
  // phone; this is what makes them mean something. Installed before anything
  // queries, and once for the life of the app.
  useEffect(() => installQueryLifecycle(), []);

  useEffect(() => {
    healApiBase()
      .then((url) => queryClient.invalidateQueries({ queryKey: ['pattadar'] }) ?? url)
      .catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <StatusBar style="auto" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="add-khata" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="add-parcel" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="add-property" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="add-member" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="allocation" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              {/* Pushed, not presented as a modal: the map needs the full height,
                  and the Snackbar inside it would mount below a modal. */}
              <Stack.Screen name="set-location" />
            </Stack>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
