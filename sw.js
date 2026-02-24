const CACHE_NAME = 'unie-leads-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './libs/dexie.js',
    './libs/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force new SW to activate immediately
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Force control of open clients
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
    );
});
