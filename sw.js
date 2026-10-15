/* Service worker: la web abre al instante en visitas repetidas y sigue abriendo sin conexión.
   - Archivos de la propia web: se sirven de la caché y se actualizan en segundo plano (la siguiente visita ya trae la versión nueva).
   - Fuentes y SDK de Firebase (URLs con versión): primero la caché.
   - Todo lo demás (la base de datos, por ejemplo) pasa directo a la red, sin tocarlo. */
const VERSION = '__BUILD__';
const CACHE = 'masarte-' + VERSION;
const SHELL = ['./', 'index.html', 'estilismos.html', 'manifest.webmanifest', 'css/styles.css',
  'js/config.js', 'js/pricing.js', 'js/store.js', 'js/styling.js', 'js/app.js', 'js/customers.js', 'js/styling-ui.js', 'js/estilismos-page.js',
  'img/logo.png', 'img/favicon.png', 'img/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('masarte-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const staticExt = url.origin !== location.origin && (STATIC_HOSTS.includes(url.hostname) || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')));
  if (staticExt) {                       // caché primero
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;   // otras peticiones externas: directas a la red
  e.respondWith(caches.open(CACHE).then(async c => {   // propia web: caché + actualización en segundo plano
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
