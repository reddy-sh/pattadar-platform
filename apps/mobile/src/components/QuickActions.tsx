import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';


/** Zoom-style action row: big rounded icon buttons under the top bar. */
const ACTIONS: { icon: string; label: string; route?: string }[] = [
  { icon: 'book-plus-outline', label: 'Passbook', route: '/add-khata' },
  { icon: 'home-plus-outline', label: 'Property', route: '/add-property' },
];

export function QuickActions() {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {ACTIONS.map((a) => (
        <Pressable
          key={a.label}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          onPress={
            a.route
              ? () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  router.push(a.route as never);
                }
              : undefined
          }
        >
          <View
            style={[
              styles.tile,
              { backgroundColor: a.route ? theme.colors.primary : theme.colors.surfaceVariant },
            ]}
          >
            <MaterialCommunityIcons
              name={a.icon as never}
              size={26}
              color={a.route ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}
            />
          </View>
          <Text
            variant="labelMedium"
            style={{ color: a.route ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 32, paddingVertical: 4 },
  item: { alignItems: 'center', gap: 6 },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  tile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
