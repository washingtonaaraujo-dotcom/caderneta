/* Caderneta — service worker v4
   network-first para o app (atualiza sozinho) + cache offline.
   Não intercepta a API nem os downloads do modelo de IA local. */
const CACHE = 'caderneta-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&display=swap'
];
// só faz cache próprio destes domínios de CDN (o modelo de IA usa o cache do próprio WebLLM)
const CDN_OK = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(APP_SHELL.map((u) => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('caderneta-')).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'api.anthropic.com') return;

  const sameOrigin = url.origin === self.location.origin;
  const cdn = CDN_OK.includes(url.hostname);
  if (!sameOrigin && !cdn) return; // modelo de IA, hugging face etc.: navegador cuida

  if (sameOrigin) {
    // NETWORK-FIRST: sempre tenta a versão nova; offline usa o cache
    e.respondWith(
      fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then((r) => r || caches.match('./index.html'))
      )
    );
  } else {
    // CDNs: cache-first (mudam raramente)
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        });
      })
    );
  }
});
