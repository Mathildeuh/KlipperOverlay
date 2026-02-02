const CACHE_NAME = 'klipper-overlay-v1';
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
  // Skip pour les requêtes API et WebSocket
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/webcam/stream') ||
      event.request.url.includes('/webcam/snapshot')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone la réponse avant de la mettre en cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
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
