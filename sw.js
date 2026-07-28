/* Service worker — Vacanze 2026
   - I file del sito usano network-first: quando c'è connessione arriva
     sempre l'ultima versione pubblicata; solo se la rete non risponde
     (offline vero) si serve la copia in cache, così l'itinerario resta
     consultabile anche senza segnale.
   - Le tile delle mappe (cartocdn) usano cache-first con aggiornamento in
     background: le zone già viste restano visibili senza rete.
   - Bump del nome cache (v1 -> v2): elimina la cache precedente, che con
     la vecchia strategia cache-first restava bloccata sulla prima versione
     visitata e non si aggiornava mai da sola. */
const CORE = 'vacanze-core-v2';
const TILES = 'vacanze-tiles-v1';
const MAX_TILES = 800;
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![CORE, TILES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function trimTiles(cache) {
  cache.keys().then((keys) => {
    if (keys.length > MAX_TILES) {
      keys.slice(0, keys.length - MAX_TILES).forEach((k) => cache.delete(k));
    }
  });
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Tile delle mappe: cache-first, aggiornamento in background
  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(e.request);
        const net = fetch(e.request)
          .then((res) => {
            if (res.ok) { cache.put(e.request, res.clone()); trimTiles(cache); }
            return res;
          })
          .catch(() => null);
        return hit || net.then((res) => res || new Response('', { status: 408 }));
      })
    );
    return;
  }

  // File del sito: network-first, con la cache solo come rete di sicurezza offline
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CORE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
