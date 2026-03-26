const CACHE_NAME = 'telecom-analysis-v1';

const CACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/config.js',
  '/js/parser.js',
  '/js/charts.js',
  '/js/dashboard.js',
  '/js/tasks.js',
  '/js/category.js',
  '/js/financials.js',
  '/js/admin.js',
  '/js/dropbox.js',
  '/js/pwa.js',
  '/js/app.js',
  '/assets/logo.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_FILES))
      .catch(() => {}) // Graceful if some files missing
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never cache Dropbox API calls — always fetch fresh
  if (url.includes('dropbox') || url.includes('dl=1')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // CDN resources: try network first, fall back to cache
  if (url.includes('cdn.jsdelivr') || url.includes('cdnjs.cloudflare')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App files: cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
