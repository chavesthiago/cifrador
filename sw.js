/* Cifrador — guarda o app no aparelho para abrir mesmo sem internet (no palco, por exemplo).
   A página é buscada na rede quando há conexão; sem conexão, vale a última cópia guardada.
   As músicas não passam por aqui: ficam no navegador e no grupo online. */
'use strict';

var CACHE = 'cifrador-app-v1';

// Guarda a página e os arquivos que ela pede (css/js com o número de versão).
function cacheApp(cache) {
  return fetch('./', { cache: 'no-cache' }).then(function (res) {
    if (!res.ok) return;
    var copy = res.clone();
    return res.text().then(function (html) {
      var urls = [], re = /(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g, m;
      while ((m = re.exec(html))) if (!/^https?:/.test(m[1])) urls.push(m[1]);
      return Promise.all([cache.put('./', copy), cache.addAll(urls)]);
    });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return cacheApp(cache);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // só os arquivos do próprio Cifrador; o Firebase vai direto à rede e só é usado com internet
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // página: rede primeiro (para receber atualizações); sem rede, a cópia guardada
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./', copy); });
      }
      return res;
    }).catch(function () {
      return caches.match('./').then(function (r) { return r || caches.match(req, { ignoreSearch: true }); });
    }));
    return;
  }

  // css e js: como os endereços têm número de versão, a cópia guardada vale
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  }));
});
