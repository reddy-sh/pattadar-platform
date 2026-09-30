/* Pattadar service worker — browser notifications only.
 *
 * It has no fetch handler and caches nothing: the app is served as it always
 * was. Its one job is to turn a push into a notification.
 *
 * A push carries NO payload (services/api/src/inbox.py): it travels through
 * Google/Mozilla/Microsoft/Apple, so nothing about the document is put in it.
 * The sentence below is fixed; the signed-in app fetches the detail.
 */
const BODY = 'A document reading has finished. Open Pattadar to see it.';
const OPEN = '/app/notifications?open=latest';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // An open tab asks the server now, instead of on its next poll.
    wins.forEach((c) => c.postMessage({ type: 'inbox-changed' }));
    // Someone looking at the app sees the in-app notice; a system banner on
    // top of it would say the same thing twice.
    if (wins.some((c) => c.focused && c.visibilityState === 'visible')) return;
    await self.registration.showNotification('Pattadar', {
      body: BODY,
      tag: 'pattadar-reading',
      renotify: true,
      data: { url: OPEN },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || OPEN,
    self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      await c.focus();
      if ('navigate' in c) { await c.navigate(target); }
      return;
    }
    await self.clients.openWindow(target);
  })());
});
