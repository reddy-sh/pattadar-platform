import { ActionSheetIOS, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/**
 * Choosing an image, the way iOS expects it.
 *
 * Two bugs made the old custom sheet unreliable:
 *  1. it never asked for photo-library permission, only camera;
 *  2. it launched the picker while its own modal was still dismissing — iOS
 *     cannot present a view controller during a dismissal, so the library
 *     picker silently did nothing while the camera happened to survive.
 *
 * ActionSheetIOS is presented by the system rather than by our view, so there
 * is no modal-over-modal race. This is also the platform-native pattern: Apple's
 * HIG puts destructive/選択 choices in an action sheet, not a custom dialog.
 */
export type PhotoSource = 'camera' | 'library' | 'files' | 'remove' | null;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  base64?: string | null;
}

/** Native chooser. Returns which source the user picked, or null if cancelled. */
export function choosePhotoSource(options: {
  allowFiles?: boolean;
  allowRemove?: boolean;
  title?: string;
}): Promise<PhotoSource> {
  const labels: { label: string; value: PhotoSource }[] = [
    { label: 'Take a photo', value: 'camera' },
    { label: 'Choose from library', value: 'library' },
  ];
  if (options.allowFiles) labels.push({ label: 'Choose a file', value: 'files' });
  if (options.allowRemove) labels.push({ label: 'Remove photo', value: 'remove' });

  return new Promise((resolve) => {
    if (Platform.OS !== 'ios') {
      // Android has no ActionSheetIOS; callers render their own sheet.
      resolve(null);
      return;
    }
    const buttons = [...labels.map((l) => l.label), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: options.title,
        options: buttons,
        cancelButtonIndex: buttons.length - 1,
        destructiveButtonIndex: options.allowRemove ? labels.length - 1 : undefined,
      },
      (index) => resolve(index >= 0 && index < labels.length ? labels[index].value : null),
    );
  });
}

/** Ask for the right permission, then open the right picker. */
export async function pickImage(
  source: Exclude<PhotoSource, 'remove' | null>,
  opts: { square?: boolean; base64?: boolean } = {},
): Promise<PickedFile | { error: string } | null> {
  const common = {
    mediaTypes: 'images' as const,
    quality: 0.6,
    base64: !!opts.base64,
    ...(opts.square ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : {}),
  };

  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return { error: 'Camera access is off — turn it on in Settings › Pattadar.' };
    const r = await ImagePicker.launchCameraAsync(common);
    return r.canceled || !r.assets?.[0] ? null : toFile(r.assets[0]);
  }

  if (source === 'library') {
    // This was missing entirely, which is why the library picker did nothing.
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) return { error: 'Photo access is off — turn it on in Settings › Pattadar.' };
    const r = await ImagePicker.launchImageLibraryAsync(common);
    return r.canceled || !r.assets?.[0] ? null : toFile(r.assets[0]);
  }

  const r = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' };
}

function toFile(a: ImagePicker.ImagePickerAsset): PickedFile {
  return {
    uri: a.uri,
    name: a.fileName ?? `photo-${a.assetId ?? 'capture'}.jpg`,
    mimeType: a.mimeType ?? 'image/jpeg',
    base64: a.base64,
  };
}
