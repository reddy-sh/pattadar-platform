import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { Avatar, IconButton, Menu, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';

import { useAvatar } from '@/lib/avatar';
import type { HeaderAction } from '@/components/AppHeader';

/**
 * The bar that appears once the title has scrolled away (CL-618..621).
 *
 * Tab roots render their title as ordinary scroll content, so scrolling made
 * the screen anonymous: no title, no avatar, no actions, and the filter row
 * ended up half-clipped under the status bar. iOS solves this with a large
 * title that collapses into a pinned inline bar; this is that behaviour, built
 * in JS because these screens are not inside a native stack — expo-router's
 * Tabs render no navigation bar, and nesting a stack per tab would rewrite
 * every route path in the app.
 *
 * It is drawn OPAQUE and above the list on purpose: content passing underneath
 * is what stops the segmented control showing through beneath the clock.
 */
export function StickyTitleBar({
  title,
  subtitle,
  scrollY,
  threshold = 44,
  onSearch,
  menuItems,
}: {
  title: string;
  /** The one-line answer to "what am I looking at" — pinned with the title. */
  subtitle?: string;
  scrollY: SharedValue<number>;
  threshold?: number;
  onSearch?: () => void;
  menuItems?: HeaderAction[];
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const photo = useAvatar();
  const [menu, setMenu] = useState(false);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [threshold, threshold + 28], [0, 1], Extrapolation.CLAMP),
    // Slides down as it fades in, rather than appearing fully formed.
    transform: [
      { translateY: interpolate(scrollY.value, [threshold, threshold + 28], [-8, 0], Extrapolation.CLAMP) },
    ],
  }));

  /**
   * Untouchable until it is actually visible, so an invisible bar cannot eat
   * taps meant for the header beneath it.
   *
   * This is React state rather than an animated style: `pointerEvents` is not
   * an animatable property, and returning it from a worklet is not something
   * Reanimated supports. The crossing fires at most twice per scroll direction,
   * so the re-render cost is nil.
   */
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > threshold + 14,
    (visible, previous) => {
      if (visible !== previous) runOnJS(setShown)(visible);
    },
    [threshold],
  );

  return (
    <Animated.View
      pointerEvents={shown ? 'auto' : 'none'}
      style={[
        styles.bar,
        style,
        {
          paddingTop: insets.top,
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.row}>
        {photo ? (
          <Avatar.Image size={28} source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <Avatar.Text
            size={28}
            label={title.trim()[0]?.toUpperCase() ?? 'P'}
            style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}
            labelStyle={{ color: theme.colors.onPrimaryContainer }}
            accessibilityLabel="Your profile"
          />
        )}
        <View style={styles.titles}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {!!subtitle && (
            <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
              {subtitle}
            </Text>
          )}
        </View>
        {onSearch && (
          <IconButton icon="magnify" size={20} style={styles.tight} onPress={onSearch} accessibilityLabel="Search" hitSlop={8} />
        )}
        <Menu
          visible={menu}
          onDismiss={() => setMenu(false)}
          anchor={
            <IconButton
              icon="dots-horizontal"
              size={20}
              style={styles.tight}
              accessibilityLabel="More actions"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setMenu(true);
              }}
              hitSlop={8}
            />
          }
        >
          {(menuItems ?? []).map((it) => (
            <Menu.Item
              key={it.label}
              leadingIcon={it.icon}
              title={it.label}
              onPress={() => {
                setMenu(false);
                it.onPress();
              }}
            />
          ))}
        </Menu>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 48 },
  avatar: { marginRight: 4 },
  titles: { flex: 1 },
  title: { fontWeight: '700' },
  tight: { margin: 0 },
});
