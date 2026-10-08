const CACHE_NAME = 'minago-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './chofer.html',
  './login_chofer.html',
  './assets/css/styles.css',
  './assets/js/config.js',
  './assets/js/firebaseClient.js',
  './assets/js/map.js',
  './assets/js/driver.js',
  './assets/img/logo.jpg',
  './camion.webp',
  './rutaazul.geojson',
  './rutaamarillo.geojson'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
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
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // No interceptar mapas, Firebase, fuentes ni CDNs externos. Si el Service Worker
  // intenta manejar esos recursos, algunos navegadores reportan "Failed to fetch".
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || caches.match('./index.html'));

      return cachedResponse || networkFetch;
    })
  );
});
