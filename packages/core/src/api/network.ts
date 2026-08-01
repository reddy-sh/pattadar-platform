/**
 * Is a reported network state usable?
 *
 * Lives here, away from any React Native import, because it is a decision
 * rather than plumbing — and a decision that is wrong in either direction is
 * expensive. Treat a usable phone as offline and its queries are paused and
 * nothing loads; treat a dead one as online and every request retries into a
 * radio that cannot answer, with nothing queued for when signal returns.
 */
export interface NetworkStateLike {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

export function isOnline(s: NetworkStateLike): boolean {
  // Reachability beats connection: a phone joined to a village wifi with no
  // route out is "connected" and completely useless. Either being unknown
  // (the OS is still probing) counts as online, so a slow probe never blocks a
  // request that would have succeeded.
  return s.isInternetReachable ?? s.isConnected ?? true;
}
