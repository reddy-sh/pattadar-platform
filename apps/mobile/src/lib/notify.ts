import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

/**
 * Telling someone a slow job finished, when they are no longer watching.
 *
 * Reading a deed takes the better part of two minutes. Nobody stares at a
 * spinner for that long — they switch to WhatsApp, and the result lands on a
 * screen they are not looking at. These are LOCAL notifications, posted by the
 * app itself: no server, no APNs registration, no push token. That matters,
 * because the honest alternative — real remote push — needs an Apple push key
 * and a server that holds device tokens, and neither exists yet. A local
 * notification does the whole job here, since the work is happening on this
 * device and the app is the thing that knows when it finished.
 *
 * The rule throughout: never notify about something the user is already
 * looking at. A banner for a result already on screen is noise.
 */

/**
 * iOS shows nothing for a foreground notification unless told to. We WANT that
 * default — this handler exists so the behaviour is a decision on record
 * rather than a platform accident.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** True when the app is not the thing the user is currently looking at. */
export function isBackgrounded(): boolean {
  return AppState.currentState !== 'active';
}

let asked = false;

/**
 * Ask for permission at the moment it earns its keep — as a long read starts,
 * not on first launch when there is nothing to notify about and the request
 * reads as a demand.
 *
 * Returns false when denied; every caller treats notification as a bonus, so a
 * refusal changes nothing about whether the work completes or is shown.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    // Only ever ask once per app run. iOS shows the system prompt a single
    // time regardless; asking again just burns a round-trip.
    if (asked || !current.canAskAgain) return false;
    asked = true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

/**
 * Post a notification now, but only if the user has looked away.
 *
 * Deliberately fire-and-forget: a failure to notify must never surface as an
 * error on a job that actually succeeded.
 */
export async function notifyIfAway(title: string, body: string): Promise<void> {
  try {
    if (!isBackgrounded()) return;
    if (!(await ensureNotificationPermission())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: false },
      trigger: null, // deliver immediately
    });
  } catch {
    // Notification delivery is never load-bearing.
  }
}

/** Clear anything this app has posted — called when a screen is re-entered. */
export async function clearNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
}
