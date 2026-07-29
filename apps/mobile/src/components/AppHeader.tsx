import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, IconButton, Menu, Text, useTheme } from 'react-native-paper';

import * as Haptics from 'expo-haptics';

import { getIdentity } from '@/api/client';
import { useDashboard } from '@/data/hooks';
import { useAvatar } from '@/lib/avatar';

export interface HeaderAction {
  icon: string;
  label: string;
  onPress: () => void;
}

/**
 * `menuItems` lets a screen own its overflow. The menu used to carry the same
 * four global shortcuts everywhere, so on Passbooks the first item was "Scan
 * passbook" and on Groups it was also "Scan passbook" — never the thing the
 * screen you were looking at is made of. The screen's own Add comes first.
 */
export function AppHeader({
  title,
  onSearch,
  menuItems,
}: {
  title?: string;
  onSearch?: () => void;
  menuItems?: HeaderAction[];
}) {
  const theme = useTheme();
  const { data } = useDashboard();
  const [addMenu, setAddMenu] = useState(false);
  const name = data?.data.me?.name || 'Pattadar';
  // Shared source — updates the instant the photo changes on any screen.
  const photo = useAvatar();
  const [identity, setIdentityState] = useState('');
  useEffect(() => {
    getIdentity().then(setIdentityState).catch(() => undefined);
  }, []);
  const initial = name.trim()[0]?.toUpperCase() ?? 'P';


  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          router.push('/account' as never);
        }}
        accessibilityLabel="Account and settings"
      >
        {photo ? (
          <Avatar.Image size={40} source={{ uri: photo }} />
        ) : (
          <Avatar.Text
            size={40}
            label={initial}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            labelStyle={{ color: theme.colors.onPrimaryContainer }}
          />
        )}
      </Pressable>
      {title ? (
        <Text variant="titleLarge" style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}
      {onSearch && (
        <IconButton
          icon="magnify"
          size={22}
          style={styles.tight}
          onPress={onSearch}
          accessibilityLabel="Search"
          hitSlop={8}
        />
      )}
      <Menu
        visible={addMenu}
        onDismiss={() => setAddMenu(false)}
        anchor={
          <IconButton
            icon="dots-horizontal"
            size={22}
            style={styles.tight}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setAddMenu(true);
            }}
            accessibilityLabel="More actions"
            hitSlop={8}
          />
        }
      >
        {(menuItems ?? DEFAULT_ITEMS).map((it) => (
          <Menu.Item
            key={it.label}
            leadingIcon={it.icon}
            title={it.label}
            onPress={() => {
              setAddMenu(false);
              it.onPress();
            }}
          />
        ))}
      </Menu>
    </View>
  );
}

/** Fallback for any screen that has not declared its own actions. */
const DEFAULT_ITEMS: HeaderAction[] = [
  { icon: 'book-plus-outline', label: 'Add passbook', onPress: () => router.push('/add-khata' as never) },
  { icon: 'map-marker-plus-outline', label: 'Add parcel', onPress: () => router.push('/add-parcel' as never) },
  { icon: 'home-plus-outline', label: 'Add property', onPress: () => router.push('/add-property' as never) },
];

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { fontWeight: '700', flex: 1, marginLeft: 8 },
  tight: { margin: 0 },
  /* CL-107: true full height — no floating corner, no visible tab bar sliver */
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '82%', borderTopRightRadius: 16 },
  drawerFill: { flex: 1 },
  drawerScroll: { paddingBottom: 8 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  grow: { flex: 1 },
  name: { fontWeight: '700' },
  soonRow: { flexDirection: 'row', alignItems: 'center', opacity: 0.45, paddingRight: 24 },
  soonItem: { flex: 1 },
  chipText: { fontSize: 11 },
  drawerScrollFlex: { flex: 1 },
  versionRow: { minHeight: 28, justifyContent: 'center', paddingVertical: 6 },
  version: { textAlign: 'center' },
});
