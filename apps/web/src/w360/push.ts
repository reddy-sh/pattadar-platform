/** Browser notifications: opt in, opt out, and say which of the two you are.
 *
 *  Opt-in only, from a button — never asked on page load, which browsers
 *  now punish and people dislike. The subscription's endpoint is the only
 *  thing sent to the server; the push itself carries nothing (see sw.js). */
import { apiErrorMessage, apiFetch } from '../api/client';

const BASE = '/api/gateway/pattadar';

export type PushState =
  | 'unsupported'  // this browser cannot do it
  | 'unavailable'  // the server has no keys yet
  | 'blocked'      // the person said no in the browser
  | 'on'
  | 'off';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator
  && 'PushManager' in window && 'Notification' in window;

async function serverKey(): Promise<string> {
  const res = await apiFetch(`${BASE}/push/key`);
  if (!res.ok) return '';
  const body = await res.json() as { enabled?: boolean; key?: string };
  return body.enabled ? body.key ?? '' : '';
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

const registration = () => navigator.serviceWorker.register('/sw.js', { scope: '/' });

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (!(await serverKey())) return 'unavailable';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const key = await serverKey();
  if (!key) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const res = await apiFetch(`${BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  if (!res.ok) {
    await sub.unsubscribe().catch(() => false);
    throw new Error(await apiErrorMessage(res, 'Browser notifications could not be switched on.'));
  }
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiFetch(`${BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => null);
    await sub.unsubscribe().catch(() => false);
  }
  return 'off';
}
