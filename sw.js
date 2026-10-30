const V = 'sanin-v14';
const CORE = ['index.html', 'output.css', 'bg-day.svg', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const CDN = [
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
    'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js'
];
const LAZY = [
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(V).then(c => Promise.all([...CORE, ...CDN].map(u => c.add(u).catch(() => { })))));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, key) {
    const c = await caches.open(V);
    const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()); return r; });
    const cached = await c.match(key);
    if (!cached) return net;
    return Promise.race([net.catch(() => cached), new Promise(r => setTimeout(() => r(cached), 3000))]);
}

async function cacheFirst(req) {
    const c = await caches.open(V);
    const hit = await c.match(req.url);
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok) c.put(req.url, r.clone());
    return r;
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req, 'index.html'));
    if (url.origin === location.origin) return e.respondWith(networkFirst(req, url.pathname.slice(1) || 'index.html'));
    if (CDN.includes(url.href) || LAZY.includes(url.href)) return e.respondWith(cacheFirst(req));
});
