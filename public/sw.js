// Service worker: app instalable y consulta sin conexión.
// - Interfaz: se guarda en caché y se actualiza en segundo plano.
// - Datos GET (ofertas, pedidos, impacto): red primero; sin red se entrega la última copia marcada como desactualizada.
// - Escrituras (apartar, publicar, entregar): NUNCA se guardan ni se simulan sin conexión.
const VERSION = 'rd-v9';
const SHELL = [
  '/', '/index.html', '/css/styles.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/api.js', '/js/ui.js', '/js/shared/calc.js', '/js/shared/catalog.js', '/js/shared/parse.js',
  '/js/views/landing.js', '/js/views/market.js', '/js/views/lot.js', '/js/views/components.js', '/js/views/order.js',
  '/js/views/auth.js', '/js/views/producer.js', '/js/views/producerOrders.js', '/js/views/publish.js',
  '/js/views/buyer.js', '/js/views/impact.js', '/js/views/map.js', '/js/views/profile.js', '/js/views/admin.js',
  '/js/shared/shelf.js', '/js/weather.js', '/js/voice/speech.js', '/js/voice/assistant.js',
  '/js/camera.js', '/js/views/carrier.js', '/js/views/trip.js', '/js/views/legal.js', '/fonts/dmsans.woff', '/icons.svg',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/notifications') || url.pathname === '/api/me') return;
    ev.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION + '-data').then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => {
          const cached = await caches.open(VERSION + '-data').then((c) => c.match(req));
          if (!cached) return new Response(JSON.stringify({ error: 'Sin conexión y sin datos guardados' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
          const headers = new Headers(cached.headers);
          headers.set('X-From-Cache', '1');
          return new Response(await cached.blob(), { status: 200, headers });
        }),
    );
    return;
  }

  ev.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached || caches.match('/index.html'));
      return cached || net;
    }),
  );
});
