/** Secure native audio/video streaming without putting credentials in a URL.
 *
 * A Bearer-authenticated POST asks the gateway to authorize one exact storage
 * node/version and set a short-lived HttpOnly cookie. The returned URL contains
 * only node+version; <video>/<audio> sends the cookie and performs native Range
 * requests. No media bytes are buffered into a Blob by application code.
 */
import { useCallback, useEffect, useState } from 'react';

import { apiFetch, apiErrorMessage } from '../api/client';
import { isStorageRef } from '../pages/documents/storage';

interface StreamState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  url?: string;
  message?: string;
  expiresAt?: number;
}

export function useMediaStream(fileRef: string, enabled: boolean) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<StreamState>({ status: 'idle' });

  useEffect(() => {
    if (!enabled || !isStorageRef(fileRef)) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    // Initial mint needs a loading state. Background renewal deliberately keeps
    // the existing ready URL/player mounted, so playback position is not lost.
    setState((current) => current.url ? current : { status: 'loading' });
    (async () => {
      try {
        const response = await apiFetch(
          `/api/gateway/storage/files/${encodeURIComponent(fileRef)}/stream-session`,
          { method: 'POST' },
        );
        if (!response.ok) {
          throw new Error(await apiErrorMessage(response, 'This recording could not be opened.'));
        }
        const body = await response.json() as { url?: string; expiresIn?: number };
        if (!body.url || !body.url.startsWith('/api/gateway/storage/files/')) {
          throw new Error('The stream service returned an invalid media address.');
        }
        const ttl = Math.max(30, Number(body.expiresIn) || 900);
        if (!cancelled) setState({ status: 'ready', url: body.url, expiresAt: Date.now() + ttl * 1000 });
      } catch (error) {
        if (!cancelled) setState((current) => current.url ? {
          ...current, status: 'ready',
          message: error instanceof Error ? error.message : 'The stream session could not be renewed.',
        } : {
          status: 'error',
          message: error instanceof Error ? error.message : 'This recording could not be opened.',
        });
      }
    })();
    return () => { cancelled = true; };
  }, [fileRef, enabled, nonce]);

  // Renew shortly before expiry while a player/poster remains mounted. The
  // exact node/version is reauthorized on every mint; an expired share fails
  // here rather than leaving a player stranded on its next seek.
  useEffect(() => {
    if (!enabled || !state.expiresAt) return;
    const delay = Math.max(1_000, state.expiresAt - Date.now() - 30_000);
    const timer = window.setTimeout(() => setNonce((value) => value + 1), delay);
    return () => window.clearTimeout(timer);
  }, [enabled, state.expiresAt]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, retry };
}
