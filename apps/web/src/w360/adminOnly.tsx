/** What only Pattadar's own operators see on an owner's screen.
 *
 *  AI cost details (tokens, dollars, the model, the Anthropic credit balance,
 *  a reply's or a reading's cost) are admin-only (founder, 06/10/2026). The
 *  gate is the one the desk already uses: `platform_settings('admin.uids')`,
 *  surfaced as `Portfolio.isPlatformAdmin`. It fails CLOSED: while the
 *  portfolio is loading, or if it failed, nobody is an admin. */
import type { ReactNode } from 'react';
import { usePortfolio } from './api';
import type { Portfolio } from './api';

/** True only for a loaded portfolio that says so. */
export const isPlatformAdmin = (portfolio: Pick<Portfolio, 'isPlatformAdmin'> | undefined | null) =>
  portfolio?.isPlatformAdmin === true;

/** Whether the signed-in account may see AI cost details. */
export function useIsPlatformAdmin(): boolean {
  return isPlatformAdmin(usePortfolio().data);
}

/** Its children for a platform admin; nothing for an owner. */
export function AdminOnly({ children }: { children: ReactNode }) {
  return useIsPlatformAdmin() ? <>{children}</> : null;
}
