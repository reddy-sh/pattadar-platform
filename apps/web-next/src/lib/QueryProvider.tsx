'use client';

/**
 * TanStack Query provider — mirrors apps/web/src/main.tsx's QueryClient
 * config exactly (retry: 1, staleTime: 30_000). Framework adaptation: the
 * client is created inside useState (not at module scope like the SPA's
 * main.tsx) so each request/session gets its own instance under Next's
 * App Router instead of one shared across server-rendered requests.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
