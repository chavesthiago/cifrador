/* Cifrador — músicas do grupo no Firebase Realtime Database.
   O SDK só é baixado quando alguém entra em um grupo. */
(function (root) {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/11.10.0/';
  var app = null, songsRef = null, connRef = null, loading = null;

  function config() { return root.CIFRADOR_FIREBASE || null; }
  function configured() {
    var c = config();
    return !!(c && c.apiKey && c.databaseURL);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('sdk')); };
      document.head.appendChild(s);
    });
  }
  function loadSdk() {
    if (!loading) {
      loading = loadScript(SDK + 'firebase-app-compat.js')
        .then(function () { return loadScript(SDK + 'firebase-database-compat.js'); })
        .then(function () { app = app || root.firebase.initializeApp(config()); return app; });
      loading.catch(function () { loading = null; });
    }
    return loading;
  }

  // Firebase não aceita "undefined" e descarta listas vazias: grava uma cópia limpa.
  function clean(song) {
    var s = JSON.parse(JSON.stringify(song));
    delete s.pending;
    delete s.draft;
    return s;
  }
  function validCode(code) { return /^[A-Za-z0-9_-]{6,60}$/.test(code || ''); }

  // Conecta ao grupo. onSongs recebe a lista completa a cada mudança;
  // a promessa falha com 'denied' quando o código não existe.
  function connect(code, handlers) {
    disconnect();
    if (!validCode(code)) return Promise.reject(new Error('code'));
    return loadSdk().then(function () {
      var db = root.firebase.database(), first = true;
      return new Promise(function (resolve, reject) {
        songsRef = db.ref('grupos/' + code + '/musicas');
        songsRef.on('value', function (snap) {
          var val = snap.val() || {}, list = [];
          Object.keys(val).forEach(function (id) {
            var s = val[id];
            if (s && typeof s === 'object') { s.id = id; list.push(s); }
          });
          if (first) { first = false; resolve(); }
          handlers.onSongs(list);
        }, function (err) {
          var denied = /permission/i.test(String(err && (err.code || err.message)));
          var e = new Error(denied ? 'denied' : 'net');
          if (first) { first = false; reject(e); } else if (handlers.onError) handlers.onError(e);
          disconnect();
        });
        connRef = db.ref('.info/connected');
        connRef.on('value', function (snap) { if (handlers.onStatus) handlers.onStatus(snap.val() === true); });
      });
    });
  }

  function disconnect() {
    if (songsRef) { songsRef.off(); songsRef = null; }
    if (connRef) { connRef.off(); connRef = null; }
  }

  function saveSong(song) {
    if (!songsRef) return Promise.reject(new Error('offline'));
    return songsRef.child(song.id).set(clean(song));
  }
  function removeSong(id) {
    if (!songsRef) return Promise.reject(new Error('offline'));
    return songsRef.child(id).remove();
  }

  root.Cloud = {
    configured: configured, validCode: validCode,
    connect: connect, disconnect: disconnect, saveSong: saveSong, removeSong: removeSong,
    connected: function () { return !!songsRef; }
  };
})(window);
