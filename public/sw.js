// Only job: show kiosk call alerts and open the staff page when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Kiosk call', body: event.data?.text() || '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kiosk is calling', {
      body: data.body || 'A customer wants to talk. Tap to answer.',
      tag: data.callId ? `call-${data.callId}` : 'kiosk',
      renotify: true,
      requireInteraction: true,
      icon: '/icons/icon-192.png',
      data: { callId: data.callId || '' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const callId = event.notification.data?.callId || '';
  const url = callId ? `/answer.html?call=${encodeURIComponent(callId)}` : '/answer.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => new URL(c.url).pathname === '/answer.html');
      if (open) {
        open.postMessage({ type: 'open-call', callId });
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
