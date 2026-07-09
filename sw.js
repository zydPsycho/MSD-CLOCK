// Service Worker for MSD Clock
const CACHE_NAME = 'msd-clock-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached response if found
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Otherwise, fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Cache the fetched response
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(() => {
            // Return offline fallback if available
            if (event.request.url.includes('index.html')) {
              return caches.match('/index.html');
            }
            return new Response('Offline - Please check your connection', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Background sync for alarms
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-alarms') {
    event.waitUntil(syncAlarms());
  }
});

function syncAlarms() {
  // Handle offline alarm sync
  return new Promise((resolve) => {
    // Load alarms from IndexedDB or localStorage
    // This would require additional implementation
    resolve();
  });
}

// Push notification support
self.addEventListener('push', (event) => {
  const options = {
    body: event.data.text(),
    icon: 'icon-192x192.png',
    badge: 'badge-icon.png',
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'dismiss',
        title: 'Dismiss'
      },
      {
        action: 'snooze',
        title: 'Snooze (5 min)'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('MSD Clock', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'snooze') {
    // Snooze logic - set alarm 5 minutes later
    const snoozeTime = new Date(Date.now() + 5 * 60 * 1000);
    // Store snooze alarm
  }
  
  event.waitUntil(
    clients.openWindow('/')
  );
});