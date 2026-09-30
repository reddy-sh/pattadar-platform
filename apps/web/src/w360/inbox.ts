/**
 * The inbox: readings that finished while nobody was watching.
 *
 * The server writes one row when an Add property reading ends
 * (services/api/src/inbox.py). This file is the web's side of it:
 *
 *  · `useInbox` — one GET that answers the items, the unread count and how
 *    many readings are still running. It asks every 5 s ONLY while something
 *    is running, and otherwise on focus or when told to. With nothing being
 *    read it costs nothing.
 *  · `watching` — the jobs a mounted drawer is waiting on itself. Those are
 *    not announced, because the person is looking at the result.
 *  · `rememberFile` — the File a reading was made from, kept in memory for as
 *    long as the tab lives. The server does not keep the bytes once a reading
 *    finishes, so reopening from a notice in the same tab can still file the
 *    document; after a reload it cannot, and the drawer says so.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { apiErrorMessage, apiFetch } from '../api/client';
import { readingFromBody } from '../pages/documents/upload';
import type { Reading } from '../pages/documents/upload';

export interface InboxItem {
  id: string; kind: string; title: string; body: string; jobId: string;
  ok: boolean; read: boolean; createdAt: string;
}
export interface Inbox { unread: number; running: number; items: InboxItem[] }

export const INBOX_KEY = ['inbox'] as const;
const BASE = '/api/gateway/pattadar';
const RUNNING_POLL_MS = 5_000;

const watching = new Set<string>();
const files = new Map<string, File>();

export const watchJob = (job: string) => { watching.add(job); };
export const isWatched = (job: string) => watching.has(job);
/** The drawer stopped waiting. The inbox takes over, so it asks now. */
export function unwatchJob(job: string, qc?: QueryClient) {
  watching.delete(job);
  void qc?.invalidateQueries({ queryKey: INBOX_KEY });
}
export const rememberFile = (job: string, file: File) => { files.set(job, file); };
export const fileFor = (job: string) => files.get(job);

export function useInbox() {
  return useQuery({
    queryKey: INBOX_KEY,
    queryFn: async (): Promise<Inbox> => {
      const res = await apiFetch(`${BASE}/inbox`);
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Notifications could not be loaded.'));
      return res.json() as Promise<Inbox>;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // Only while a reading is in flight — the one time an answer is expected.
    refetchInterval: (q) => ((q.state.data?.running ?? 0) > 0 ? RUNNING_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: { ids?: string[]; jobId?: string; all?: boolean }) => {
      const res = await apiFetch(`${BASE}/inbox/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'That could not be marked as read.'));
      return res.json() as Promise<{ marked: number }>;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: INBOX_KEY }); },
  });
}

/** Mark a reading's notice read without a hook — the drawer that is showing
 *  the result calls this. Best-effort: a notice left unread is harmless. */
export async function markJobRead(job: string, qc?: QueryClient) {
  try {
    await apiFetch(`${BASE}/inbox/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job }),
    });
  } catch { /* the bell will say so; nothing is lost */ }
  void qc?.invalidateQueries({ queryKey: INBOX_KEY });
}

/** A finished reading, fetched again from its job. Readings are kept for a
 *  day; after that the server answers 404 with the sentence to show. */
export async function fetchReading(job: string): Promise<Reading> {
  const res = await apiFetch(`${BASE}/import-status/${encodeURIComponent(job)}`);
  if (!res.ok) {
    throw new Error(await apiErrorMessage(res, 'This reading is no longer available. Send the document again.'));
  }
  const body = await res.json() as { state?: string };
  if (body.state !== 'done') throw new Error('This reading has not finished yet.');
  return readingFromBody(body);
}

/** Where a notice opens: Add property, filled from that reading. */
export const reviewPath = (job: string) => `/app/properties?reading=${encodeURIComponent(job)}`;
