const CACHE_NAME = 'od-pos-v3';
const PRECACHE_URLS = ['/', '/index.html', '/src/main.js', '/src/styles/main.css'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(networkFirst(event.request));
  } else {
    event.respondWith(cacheFirst(event.request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), { headers: { 'Content-Type': 'application/json' } });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response(new Blob(['<!DOCTYPE html><html><body><h1>Open Doors POS</h1><p>Working offline.</p></body></html>'], { type: 'text/html' }));
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncPendingOperations());
  }
});

async function syncPendingOperations() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    const apiRequests = requests.filter(r => r.url.includes('/api/') && r.method === 'POST');
    for (const req of apiRequests) {
      try {
        await fetch(req);
        await cache.delete(req);
      } catch { /* Will retry on next sync */ }
    }
  } catch (e) { /* Will retry later */ }
}