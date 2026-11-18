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

  // Hashed Vite assets are network-first. Never cache SPA HTML fallbacks as JS/CSS.
  const isHashedAsset = url.pathname.startsWith('/assets/') &&
    /[-.][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/i.test(url.pathname);
  if (isHashedAsset) {
    const hasExpectedContentType = (response) => {
      const contentType = response.headers.get('content-type') || '';
      const extension = url.pathname.split('.').pop().toLowerCase();
      if (extension === 'js') return /(?:javascript|ecmascript)/i.test(contentType);
      if (extension === 'css') return /text\/css/i.test(contentType);
      if (extension === 'woff' || extension === 'woff2') return /font\/|woff/i.test(contentType);
      if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(extension)) return /image\//i.test(contentType);
      return false;
    };

    event.respondWith((async () => {
      const cached = await caches.match(request);
      try {
        const response = await fetch(request);
        if (response.ok && hasExpectedContentType(response)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        }
        // A 200 text/html SPA fallback is not a valid JavaScript/CSS asset.
        if (cached && hasExpectedContentType(cached)) return cached;
        return response;
      } catch (error) {
        if (cached && hasExpectedContentType(cached)) return cached;
        throw error;
      }
    })());
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
