/**
 * GudangAI RUDY — Service Worker V6.7.3 (build optimized)
 * - API: network-only (no-store)
 * - /assets/* hashed: cache-first immutable
 * - App shell (html/js/css): network-first, fallback cache
 */
const CACHE_NAME = 'gudangai-v6.7.3';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.pathname.includes('/exec') ||
    url.searchParams.has('action')
  );
}

function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/');
}

function isStaticMedia(url) {
  const p = url.pathname;
  return (
    p.endsWith('.svg') ||
    p.endsWith('.png') ||
    p.endsWith('.jpg') ||
    p.endsWith('.jpeg') ||
    p.endsWith('.webp') ||
    p.endsWith('.woff2') ||
    p === '/manifest.json' ||
    p === '/favicon.svg'
  );
}

function isAppShell(request, url) {
  return (
    request.mode === 'navigate' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/' ||
    url.pathname === '/index.html'
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(
        () =>
          new Response(JSON.stringify({ success: false, error: 'Offline', offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  if (isStaticMedia(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  if (isAppShell(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then(async (res) => {
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, res.clone());
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(event.request)) ||
            (await cache.match('/index.html')) ||
            Response.error()
          );
        })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
