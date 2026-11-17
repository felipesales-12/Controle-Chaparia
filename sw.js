// Cleanup worker for installations migrating from the old offline activity app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('compasso-')) await caches.delete(key);
  await self.registration.unregister();
  await self.clients.claim();
})()));
