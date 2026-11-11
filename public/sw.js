/* GudangAI RUDY — versioned Service Worker */
const BUILD_VERSION = '2026-11-11T13:30:00.000Z';
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
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
    // Do not skipWaiting automatically: the page asks the user first.
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('gudangai-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App shell: always check the network first, use the last shell offline.
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Vite build assets contain content hashes: immutable cache-first is safe.
  const isHashedAsset = url.pathname.startsWith('/assets/') &&
    /[-.][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/i.test(url.pathname);
  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        });
      })
    );
    return;
  }

  // Other same-origin resources: network-first with a cache fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.pathname.startsWith('/icons/')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
