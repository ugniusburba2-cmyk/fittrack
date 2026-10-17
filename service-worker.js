/* =========================================================
   FitTrack service worker
   - Saves the app files on the phone so the app opens offline.
   - Saves the scanner / OCR libraries the first time they load,
     so they can also work offline later.
   - Never stores food searches or AI requests (those always go online).

   When you change any app file, raise CACHE_VERSION by one
   so phones download the new version.
   ========================================================= */

const CACHE_VERSION = 'fittrack-v1';
const LIB_CACHE = 'fittrack-libs-v1';

// The "app shell": every file the app needs to start
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './foods-db.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Hosts whose files (scanner + OCR libraries, OCR language data) we keep after first use
const LIB_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'tessdata.projectnaptha.com'];

// 1) Install: download and store the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

// 2) Activate: delete old app versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== LIB_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// The page sends this message when you tap "Update" on the update notice
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// 3) Fetch: decide where each request is answered from
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;            // e.g. AI requests: always network

  const url = new URL(req.url);

  // Our own app files: cache first, fall back to network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(req).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Scanner / OCR libraries: cache first, store on first download
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(LIB_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      })
    );
  }
  // Everything else (Open Food Facts, Anthropic API): normal network request
});
