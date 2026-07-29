import { Avatar, useTheme } from 'react-native-paper';

import { avatarColor, displayName, initialsFor } from '@/lib/family';

/**
 * One avatar for every person, everywhere (member rows, group stacks, headers):
 * their photo when one is stored, otherwise given-name initials on a stable
 * per-name colour. Any screen showing a person uses this — never a bare
 * Avatar.Text — so adding a photo lights it up app-wide.
 */
export function PersonAvatar({
  name,
  photo,
  size = 32,
  border,
}: {
  name: string;
  photo?: string | null;
  size?: number;
  border?: boolean;
}) {
  const theme = useTheme();
  const shown = displayName(name);
  const ring = border ? { borderWidth: 1, borderColor: theme.colors.surface } : null;
  if (photo) {
    return <Avatar.Image size={size} source={{ uri: photo }} style={[ring]} />;
  }
  return (
    <Avatar.Text
      size={size}
      label={initialsFor(name)}
      style={[{ backgroundColor: avatarColor(shown) }, ring]}
      labelStyle={{ color: '#fff', fontSize: Math.max(9, Math.round(size * 0.36)) }}
    />
  );
}
