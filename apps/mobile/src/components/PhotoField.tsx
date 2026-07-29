import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { PersonAvatar } from '@/components/PersonAvatar';

/**
 * Avatar + its edit control, WhatsApp-style.
 *
 * The previous version stamped a pencil badge onto the avatar itself, which
 * covered the person's face and collided with the field border below it.
 * Every mainstream app keeps the control OUTSIDE the image: a separate camera
 * button and a plain "Edit" label. The image stays an image.
 */
export function PhotoField({
  name,
  photo,
  onEdit,
  size = 72,
  hint,
}: {
  name: string;
  photo?: string | null;
  onEdit: () => void;
  size?: number;
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={photo ? `Change photo for ${name}` : `Add a photo for ${name}`}
        onPress={onEdit}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <PersonAvatar name={name} photo={photo} size={size} />
      </Pressable>
      <View style={styles.controls}>
        <Button
          mode="outlined"
          compact
          icon="camera"
          onPress={onEdit}
          accessibilityLabel={photo ? 'Change photo' : 'Add photo'}
        >
          {photo ? 'Change photo' : 'Add photo'}
        </Button>
        {!!hint && (
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {hint}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  controls: { flex: 1, gap: 6, alignItems: 'flex-start' },
  pressed: { opacity: 0.7 },
});
