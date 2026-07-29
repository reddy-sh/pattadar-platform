import { EmptyState } from './EmptyState';

/**
 * H-6 (error != empty): the empty-state slot on every list screen gates on
 * `isSample` — a fetch failure is not a genuinely empty account, and the two
 * must never render the same "No X yet, do this" copy (that told a landowner
 * they own nothing when the server was just unreachable). This is the other
 * branch: same layout as EmptyState, one message, one action — try the fetch
 * again.
 */
export function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon="cloud-off-outline"
      title="Can't reach your records"
      body="Your connection or the server may be down. Your existing records are safe — retry when you're back online."
      primary={{ label: 'Retry', icon: 'refresh', onPress: onRetry }}
    />
  );
}
