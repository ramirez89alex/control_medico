/* PowerDent — service worker: la app funciona sin conexión */
const CACHE = 'powerdent-v1';
const FICHEROS = ['./PowerDent_Clinica.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHEROS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => { try { c.put(e.request, copia); } catch (err) {} });
      return res;
    }).catch(() => caches.match('./PowerDent_Clinica.html')))
  );
});
