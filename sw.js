/* Keeps the Wednesday app on the phone so the home-screen icon opens fast.
   - The page: network first (so new versions show right away), saved copy if the
     signal is slow (over 2.5 s) or gone.
   - Firebase code and player photos: saved copy first (they rarely change).
   - Everything else, including all live database traffic, is left alone.
   To turn this off, replace this file with one that only calls self.registration.unregister(). */
const CACHE = 'wns-live-v2';
const PAGES = ["/app.html"];
// The photo list is checked fresh each time (tiny file), so new head shots show on the next open;
// the pictures themselves and the Firebase code come from the saved copy.
const FRESH = ['/photos/photos.js'];
const SAVED_FIRST = [/^https:\/\/www\.gstatic\.com\/firebasejs\//, /\/photos\/[^?]+\.jpg$/];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...PAGES.map(u => c.add(u).catch(() => {})),
    c.add('/photos/photos.js').catch(() => {}),
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith('wns-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function networkFirst(req) {
  const key = new URL(req.url).pathname; // one saved copy per page, whatever ?v= it was opened with
  return caches.open(CACHE).then(cache => new Promise(resolve => {
    let done = false;
    const fallback = () => cache.match(key).then(hit => hit || fetch(req));
    const timer = setTimeout(() => { if (!done) { done = true; resolve(fallback()); } }, 2500);
    fetch(req).then(res => {
      if (res && res.ok) cache.put(key, res.clone());
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(fallback()); } });
  }));
}
function savedFirst(req) {
  return caches.open(CACHE).then(cache => cache.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; });
    return hit || net;
  }));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && (PAGES.includes(url.pathname) || FRESH.includes(url.pathname))) { e.respondWith(networkFirst(req)); return; }
  if (SAVED_FIRST.some(rx => rx.test(req.url))) { e.respondWith(savedFirst(req)); return; }
});
