const CACHE_NAME = 'hsk-app-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './assets/data.json',
    './assets/icon.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});