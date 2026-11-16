// Dev-friendly cache control: always revalidate game files so the browser never mixes old and new modules
// (Apache here sends no Cache-Control header, so Chrome would otherwise guess and serve stale code).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\.(js|mjs|json|css|html|glb|bin|png)$/.test(url.pathname) || url.pathname.endsWith('/')) e.respondWith(fetch(e.request, { cache: 'no-cache' }));
});
