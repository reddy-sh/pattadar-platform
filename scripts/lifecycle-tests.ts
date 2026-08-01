/** Query focus/online rules — `bun run scripts/lifecycle-tests.ts`. */
import { isOnline, type NetworkStateLike } from '../packages/core/src/index';

let failures = 0;
const check = (name: string, got: boolean, want: boolean) => {
  if (got !== want) {
    failures += 1;
    console.error(`FAIL: ${name} — got ${got}, want ${want}`);
  }
};

// A phone on a village wifi with no route out is CONNECTED and useless. Trusting
// isConnected alone would keep firing requests that cannot arrive.
check('wifi with no route out is offline', isOnline({ isConnected: true, isInternetReachable: false }), false);
check('connected and reachable is online', isOnline({ isConnected: true, isInternetReachable: true }), true);
check('no radio at all is offline', isOnline({ isConnected: false, isInternetReachable: false }), false);
// The OS reports null while it is still probing. Blocking on that would delay a
// request that would have succeeded.
check('still probing counts as online', isOnline({ isConnected: true, isInternetReachable: null }), true);
check('nothing known counts as online', isOnline({}), true);
// isConnected false with reachability unknown must NOT be treated as online.
check('no connection, unknown reachability is offline', isOnline({ isConnected: false }), false);

console.log(failures === 0 ? 'LIFECYCLE TESTS PASS' : `LIFECYCLE TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
