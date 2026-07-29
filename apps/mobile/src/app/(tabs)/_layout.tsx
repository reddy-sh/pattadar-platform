import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getIdentity } from '@/api/client';
import { setDrawerOpen } from '@/lib/drawerState';
import { LoginLanding } from '@/components/LoginLanding';
import type { ColorValue } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Modal, Portal, Text, useTheme } from 'react-native-paper';
import * as Haptics from 'expo-haptics';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size} />
  );
}

/** Zoom-style More sheet: quick icon grid over the current tab. */
/** Shortcuts to real destinations only. Unbuilt features are not listed here
 * for the same reason they are not listed on Account — a tile that cannot be
 * opened is not a feature. Account remains the full menu; this is the fast path. */
const MORE_ITEMS: { icon: IconName; label: string; route: string }[] = [
  { icon: 'shimmer', label: 'Assistant', route: '/assistant' },
  { icon: 'file-document-outline', label: 'Documents', route: '/documents' },
  { icon: 'history', label: 'Activity', route: '/activity' },
  { icon: 'account-circle-outline', label: 'Account', route: '/account' },
];

export default function TabsLayout() {
  const theme = useTheme();
  const [sheet, setSheet] = useState(false);
  // The FAB is portalled above everything; without this it renders inside the
  // sheet's grid and covers a real item.
  useEffect(() => {
    setDrawerOpen(sheet);
    return () => setDrawerOpen(false);
  }, [sheet]);
  const { data: identity, isLoading } = useQuery({
    queryKey: ['pattadar', 'identity'],
    queryFn: () => getIdentity(),
    staleTime: 0,
  });
  if (isLoading) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }
  if (!identity) {
    // Signed out: one door, no shell.
    return <LoginLanding />;
  }
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.outlineVariant,
          },
        }}
        screenListeners={{
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Home', tabBarIcon: tabIcon('home-variant-outline') }}
        />
        <Tabs.Screen
          name="passbooks"
          options={{ title: 'Passbooks', tabBarIcon: tabIcon('notebook-outline') }}
        />
        <Tabs.Screen
          name="holdings"
          options={{ title: 'Properties', tabBarIcon: tabIcon('home-city-outline') }}
        />
        <Tabs.Screen
          name="family"
          options={{ title: 'Groups', tabBarIcon: tabIcon('account-group-outline') }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: 'More', tabBarIcon: tabIcon('dots-horizontal') }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              setSheet(true);
            },
          }}
        />
      </Tabs>
      <Portal>
        <Modal
          visible={sheet}
          onDismiss={() => setSheet(false)}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.outline }]} />
          <View style={styles.grid}>
            {MORE_ITEMS.map((it) => (
              <Pressable
                key={it.label}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={it.label}
                onPress={() => {
                  setSheet(false);
                  if (it.route) router.push(it.route as never);
                }}
              >
                <MaterialCommunityIcons
                  name={it.icon}
                  size={28}
                  color={it.route ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
                <Text
                  variant="labelMedium"
                  style={{ color: it.route ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}
                >
                  {it.label}
                </Text>
                {!it.route && (
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    soon
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '25%', alignItems: 'center', gap: 4, paddingVertical: 14 },
});
