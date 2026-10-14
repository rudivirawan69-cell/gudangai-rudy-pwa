/* GudangAI RUDY — Service Worker */
/* BUILD_VERSION diganti otomatis oleh scripts/write-sw-version.mjs saat npm run build */
const BUILD_VERSION = '2026-10-14T13:36:54.373Z';
const CACHE_NAME = `gudangai-${BUILD_VERSION}`;
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE).catch(() => undefined)
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('gudangai-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Jangan cache API Google Apps Script / Google — offline queue tetap di IndexedDB/localStorage app
  if (url.hostname.includes('google') || url.hostname.includes('script.google')) return;

  // Navigasi: network-first, fallback index offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Aset hashed /assets/: network-first agar build baru langsung terambil, lalu cache
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Ikon & statis lain: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok && url.pathname.startsWith('/icons/')) {
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => undefined);
        }
        return res;
      });
    })
  );
});
