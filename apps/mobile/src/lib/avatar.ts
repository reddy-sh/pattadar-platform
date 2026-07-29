import * as FileSystem from 'expo-file-system/legacy';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * The signed-in user's profile photo.
 *
 * Shared through react-query so every consumer (app bar, Account) re-renders
 * the moment it changes. It used to be read once per screen with useEffect,
 * which meant the app-bar avatar kept a stale copy until that screen remounted.
 *
 * Stored under a FIXED filename: iOS rotates the container path on reinstall,
 * so an absolute URI saved today is dead tomorrow.
 */
const FILE = 'pattadar-avatar.jpg';
const dest = () => `${FileSystem.documentDirectory}${FILE}`;
export const AVATAR_KEY = ['pattadar', 'avatar'];

export function useAvatar(): string | null {
  const { data } = useQuery({
    queryKey: AVATAR_KEY,
    queryFn: async () => {
      const info = await FileSystem.getInfoAsync(dest()).catch(() => null);
      // Cache-bust on modification time or the Image component keeps the old bytes.
      return info?.exists ? `${dest()}?t=${info.modificationTime ?? 0}` : null;
    },
    staleTime: Infinity,
  });
  return data ?? null;
}

/**
 * Adopt the identity-provider photo (Google returns a `picture` claim) on first
 * sign-in. Downloaded once into the same fixed path so it behaves exactly like
 * a picked photo — and never overwrites a photo the user chose themselves.
 */
export async function adoptProviderPhoto(url: string): Promise<boolean> {
  if (!url) return false;
  const existing = await FileSystem.getInfoAsync(dest()).catch(() => null);
  if (existing?.exists) return false; // the user's own choice wins
  const res = await FileSystem.downloadAsync(url, dest()).catch(() => null);
  if (!res || res.status !== 200) {
    await FileSystem.deleteAsync(dest(), { idempotent: true }).catch(() => undefined);
    return false;
  }
  return true;
}

/**
 * Delete the locally stored profile photo (called on sign-out, H-1): the
 * filename is fixed, not per-user, so whoever signs in next on this device
 * otherwise inherits the previous account's photo.
 */
export async function clearAvatarFile(): Promise<void> {
  await FileSystem.deleteAsync(dest(), { idempotent: true }).catch(() => undefined);
}

export function useSetAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uri: string) => {
      await FileSystem.deleteAsync(dest(), { idempotent: true }).catch(() => undefined);
      await FileSystem.copyAsync({ from: uri, to: dest() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: AVATAR_KEY }),
  });
}
