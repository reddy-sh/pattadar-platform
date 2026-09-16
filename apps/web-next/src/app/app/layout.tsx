'use client';

// Guards everything under /app: unauthenticated visitors bounce to /login,
// then the Minimals-derived dashboard shell (nav, header, settings drawer,
// assistant) renders the routed page.
import type { ReactNode } from 'react';
import { RequireAuth } from 'src/auth/RequireAuth';
import { AppShell } from 'src/layout/AppShell';
import { apiFetch } from 'src/api/client';
import { MediaRefProvider } from 'src/components/kit';

/**
 * Card covers come from My Drive, and the kit must not know that. `CardGrid`
 * asks for a `fileRef` and this is the only place that knows the storage route
 * — so a gateway path change lands here rather than in twenty card call sites.
 * It sits under RequireAuth because every one of these reads is authenticated.
 */
async function resolveMedia(fileRef: string, signal: AbortSignal): Promise<Blob> {
  const res = await apiFetch(`/api/gateway/storage/files/${fileRef}/content`, { signal });
  if (!res.ok) throw new Error(`cover ${fileRef}: ${res.status}`);
  return res.blob();
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <MediaRefProvider resolve={resolveMedia}>
        <AppShell>{children}</AppShell>
      </MediaRefProvider>
    </RequireAuth>
  );
}
