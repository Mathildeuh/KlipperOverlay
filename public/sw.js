const CACHE_NAME = 'klipper-overlay-v2';
const urlsToCache = [
  '/webcam',
  '/overlay',
  '/overlay.css',
  '/overlay.js',
  '/manifest.json'
];

// Install - cache les ressources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate - nettoie les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - stratégie network-first avec cache fallback
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip pour les requêtes non HTTP(S), non-GET, API et origines externes
  if (
    !['http:', 'https:'].includes(requestUrl.protocol) ||
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith('/api/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone la réponse avant de la mettre en cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache).catch(() => {
            // Ignore cache errors (ex: schémas non supportés)
          });
        });
        return response;
      })
      .catch(() => {
        // En cas d'erreur réseau, utiliser le cache
        return caches.match(event.request);
      })
  );
});

// Message handler pour skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
