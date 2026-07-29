import { useQuery } from '@tanstack/react-query';

import { fetchDriveFile } from '@/api/storage';

/**
 * Local file URI for a stored photo, downloaded once and cached on disk by
 * `fetchDriveFile`.
 *
 * Through react-query so a photo appearing in three places — the strip, the
 * gallery, a list row's cover — downloads once rather than three times, and so
 * a failure is a quiet null instead of an unhandled rejection.
 */
export function usePhotoFile(fileRef: string | null | undefined, name = 'photo.jpg'): string | null {
  const { data } = useQuery({
    queryKey: ['pattadar', 'photo-file', fileRef],
    enabled: !!fileRef,
    staleTime: Infinity,
    retry: false,
    queryFn: () => fetchDriveFile(fileRef!, name).catch(() => null),
  });
  return data ?? null;
}
