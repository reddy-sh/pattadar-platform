/** Announces readings that finished while nobody was watching.
 *
 *  Mounted once, inside the Shell's ToastHost. It draws nothing: when the
 *  inbox gains an unread reading that no open drawer is showing, it raises a
 *  toast whose button opens Add property filled from that reading. Items
 *  already in the inbox when the app loads are not re-announced — the bell
 *  counts them. A push arriving while this tab is open (sw.js posts
 *  `inbox-changed`) makes it ask at once rather than on the next poll. */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { INBOX_KEY, isWatched, reviewPath, useInbox, useMarkRead } from './inbox';
import { useToast } from './Toast';

export function InboxWatcher() {
  const { data } = useInbox();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const markRead = useMarkRead();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.items.map((i) => i.id));
      return;
    }
    for (const item of data.items) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (item.kind !== 'reading' || item.read || isWatched(item.jobId)) continue;
      if (item.ok) {
        toast.notice('Your document has been read', {
          label: 'Review',
          onClick: () => navigate(reviewPath(item.jobId)),
        }, item.body || undefined);
      } else {
        toast.notice("Your document couldn't be read", {
          label: 'Try again',
          onClick: () => {
            markRead.mutate({ ids: [item.id] });
            navigate('/app/properties?new=1');
          },
        }, item.body || undefined);
      }
    }
  }, [data, toast, navigate, markRead]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'inbox-changed') {
        void qc.invalidateQueries({ queryKey: INBOX_KEY });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [qc]);

  return null;
}
