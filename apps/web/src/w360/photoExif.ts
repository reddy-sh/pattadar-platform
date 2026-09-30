/**
 * Reading a stored photo's metadata live, when it is opened.
 *
 * The metadata is not in the database — it rides inside the stored JPEG (see
 * exifGeo.ts). So the one place that needs it, the photo detail panel, fetches
 * the bytes it is already rendering and parses the EXIF off them. Nothing is
 * persisted: the panel recomputes from the file and the record each time, which
 * is why a later correction to the property's pin makes the on-property check
 * right again with no backfill.
 */
import { useEffect, useState } from 'react';

import { fetchFileRange, isStorageRef } from '../pages/documents/storage';
import { readExif, type ExifData } from './exifGeo';

export interface ExifState {
  status: 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';
  data: ExifData | null;
}

/** Fetch and parse the EXIF of one stored photo. `enabled` lets a caller hold
 *  off until its panel is actually the one on screen. Only JPEGs carry the
 *  metadata this reads; a non-image or legacy ref returns an empty result
 *  rather than an error, because "no metadata" is a normal answer here. */
export function useExif(fileRef: string | undefined, enabled = true, fileName = ''): ExifState {
  const [state, setState] = useState<ExifState>({ status: 'idle', data: null });

  useEffect(() => {
    if (!enabled || !fileRef || !isStorageRef(fileRef)) {
      setState({ status: 'idle', data: null });
      return;
    }
    if (/\.(heic|heif|png|webp|gif|bmp)$/i.test(fileName)) {
      setState({ status: 'unsupported', data: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', data: null });
    (async () => {
      try {
        // JPEG EXIF lives near the front. Ask only for the first 256 KiB;
        // gateway Range support prevents metadata inspection from downloading
        // the original image or recording whole.
        const blob = await fetchFileRange(fileRef, 'bytes=0-262143');
        const data = await readExif(blob);
        if (!cancelled) setState({ status: 'ready', data });
      } catch {
        // A storage read that failed is not a photo with no metadata — the
        // caller can tell 'error' from a ready result whose data is empty.
        if (!cancelled) setState({ status: 'error', data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [fileRef, enabled, fileName]);

  return state;
}
