const CACHE_NAME = 'telecom-analysis-v9';

// Relative paths work on both file:// and any HTTPS subdirectory (GitHub Pages, etc.)
const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/parser.js',
  './js/charts.js',
  './js/dashboard.js',
  './js/tasks.js',
  './js/category.js',
  './js/excel-export.js',
  './js/financials.js',
  './js/admin.js',
  './js/dropbox.js',
  './js/pwa.js',
  './js/app.js',
  './assets/logo.svg',
  './assets/landmark-plus-logo.png'
];

/* ── Install: cache each file individually so one 404 never blocks the rest ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        CACHE_FILES.map(url => cache.add(url).catch(() => {}))
      )
    )
  );
  self.skipWaiting();
});

/* ── Activate: clean up old cache versions ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Generate icon PNG via OffscreenCanvas (no physical file needed) ── */
function makeIconResponse(size) {
  try {
    var canvas = new OffscreenCanvas(size, size);
    var ctx    = canvas.getContext('2d');

    // Rounded blue background
    var r = size * 0.18;
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    // "TA" text
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold ' + Math.round(size * 0.36) + 'px system-ui,sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TA', size / 2, size / 2);

    return canvas.convertToBlob({ type: 'image/png' }).then(blob =>
      new Response(blob, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public,max-age=86400' } })
    );
  } catch (e) {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
}

/* ── Fetch ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Icons: try actual file first, generate fallback only if missing
  if (url.endsWith('/assets/icon-192.png') || url.endsWith('/assets/icon-512.png')) {
    const size = url.endsWith('/assets/icon-192.png') ? 192 : 512;
    event.respondWith(
      fetch(event.request)
        .then(res => res.ok ? res : makeIconResponse(size))
        .catch(() => makeIconResponse(size))
    );
    return;
  }

  // Never cache Dropbox calls
  if (url.includes('dropbox') || url.includes('dl=1')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // CDN: network first, cache fallback
  if (url.includes('cdn.jsdelivr') || url.includes('cdnjs.cloudflare')) {
    event.respondWith(
      fetch(event.request)
        .then(res => { caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone())); return res; })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App files: cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        return res;
      }).catch(() => cached);
    })
  );
});
