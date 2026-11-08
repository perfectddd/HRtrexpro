const CACHE = 'hr-trainer-v1';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/alerts.js',
  'js/hr-parse.js',
  'js/hr-source.js',
  'js/pip.js',
  'js/session-recorder.js',
  'js/session-summary.js',
  'js/settings-defaults.js',
  'js/storage.js',
  'js/workout-model.js',
  'js/workout-timer.js',
  'js/zones.js',
  'js/ui/charts.js',
  'js/ui/dom.js',
  'js/ui/workout-screen.js',
  'js/ui/workouts-screen.js',
  'js/ui/builder-screen.js',
  'js/ui/summary-screen.js',
  'js/ui/history-screen.js',
  'js/ui/settings-screen.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network-first so updates show up immediately; cache is the offline fallback.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))),
  );
});
