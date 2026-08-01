import { isOnline, type NetworkStateLike } from '@pattadar/core';
import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Teach react-query what "focused" and "online" mean on a phone.
 *
 * Both of its defaults are written for a browser. `refetchOnWindowFocus` waits
 * for a DOM `focus` event that React Native never fires, so the option was set
 * to `true` and did nothing: coming back from WhatsApp after ten minutes showed
 * whatever was on screen when you left, and a "can't reach the server" banner
 * survived until someone thought to pull down. `onlineManager` likewise reads
 * `navigator.onLine`, which does not exist here, so every query behaved as if
 * the network were permanently up — retrying into a dead radio in a field with
 * no signal, then having nothing queued when the signal came back.
 *
 * Wiring these is what makes `refetchOnWindowFocus` real, which in turn is what
 * lets the query defaults stop refetching on every single screen mount.
 *
 * Called once from the root layout; returns a teardown for symmetry, though in
 * practice the app owns these for its whole life.
 */
export function installQueryLifecycle(): () => void {
  // FOCUS — 'active' is the only state where the user can see anything. On iOS
  // 'inactive' is the brief limbo during the app switcher or a system prompt;
  // treating it as unfocused is correct and costs nothing, because returning to
  // 'active' is exactly when a refetch is wanted.
  const onAppState = (status: AppStateStatus) => focusManager.setFocused(status === 'active');
  focusManager.setFocused(AppState.currentState === 'active');
  const appSub = AppState.addEventListener('change', onAppState);

  // ONLINE — `isInternetReachable` rather than `isConnected`: a phone attached
  // to a wifi network with no route out is connected and useless, which is the
  // normal state of a village hotspot. It can be null while the OS is still
  // deciding; treat that as online so a slow probe never blocks a request that
  // would have worked.
  const apply = (s: NetworkStateLike) => onlineManager.setOnline(isOnline(s));
  Network.getNetworkStateAsync().then(apply).catch(() => onlineManager.setOnline(true));
  const netSub = Network.addNetworkStateListener(apply);

  return () => {
    appSub.remove();
    netSub.remove();
  };
}
