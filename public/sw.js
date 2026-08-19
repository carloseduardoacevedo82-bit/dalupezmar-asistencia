const CACHE_NAME = 'dalupezmar-cache-v5.0';
const ASSETS_TO_CACHE = [
  '/',
  '/app.html',
  '/index.html',
  '/css/styles.css?v=5.0',
  '/js/api.js',
  '/js/auth.js?v=5.0',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request).then((response) => {
      return response;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
