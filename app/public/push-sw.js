// Reco's service worker: shows push notifications (sent by webpush.py) and opens the
// chat when one is clicked. It does nothing else: no caching, no offline mode.
// (/sw.js is a different, retired worker that only cleans up after the old frontend.)

// Fixed texts the server names by code: it doesn't know the reader's language
const TEXT = {
  match_found: { en: 'Found someone to chat with', zh: '找到聊天对象了' },
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // not a payload of ours
  }
  const lang = (self.navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const body = (data.code && TEXT[data.code] && TEXT[data.code][lang]) || data.body || '';
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reco', {
      body,
      // One notification per chat: a newer message replaces the older one
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // The app navigates itself (keeps its state instead of reloading)
        await open.focus();
        open.postMessage({ type: 'reco-open', path: url.pathname + url.search });
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
