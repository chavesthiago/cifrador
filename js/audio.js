/* Cifrador — áudio de ensaio no modo palco.
   O arquivo fica guardado só neste aparelho (IndexedDB), por música.
   Tom e velocidade mudam em tempo real com a SoundTouchJS, carregada só quando é usada. */
(function (root) {
  'use strict';

  var LIB = 'js/vendor/soundtouch.js?v=0.3.0';
  var DB_NAME = 'cifrador-audio', STORE = 'audios';

  /* ---------- arquivos guardados no aparelho ---------- */

  var dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      dbp.catch(function () { dbp = null; });
    }
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    });
  }
  var store = {
    keys: function () { return tx('readonly', function (s) { return s.getAllKeys(); }).then(function (k) { return k || []; }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    put: function (rec) { return tx('readwrite', function (s) { return s.put(rec); }); },
    remove: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); }
  };

  /* ---------- player ---------- */

  var ctx = null, gain = null, shifter = null, buffer = null, playing = false;
  var state = { pitch: 0, speed: 1 }, listeners = {}, libp = null;

  function emit(name, data) { (listeners[name] || []).forEach(function (f) { f(data); }); }
  function loadLib() {
    if (root.SoundTouchLib) return Promise.resolve();
    if (!libp) {
      libp = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = LIB;
        s.onload = resolve;
        s.onerror = function () { libp = null; reject(new Error('lib')); };
        document.head.appendChild(s);
      });
    }
    return libp;
  }
  // O AudioContext precisa nascer de um toque da pessoa (regra dos navegadores).
  function context() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      ctx = new AC();
      gain = ctx.createGain();
      gain.connect(ctx.destination);
    }
    return ctx;
  }
  function decode(arrayBuffer) {
    var c = context();
    return new Promise(function (resolve, reject) {
      var p = c.decodeAudioData(arrayBuffer, resolve, reject);   // forma com callback: Safari antigo
      if (p && p.then) p.then(resolve, reject);
    });
  }
  // A biblioteca não devolve os últimos milissegundos: acrescenta 0,5 s de silêncio no fim.
  function padded(buf) {
    var extra = Math.round(buf.sampleRate * 0.5);
    var out = context().createBuffer(buf.numberOfChannels, buf.length + extra, buf.sampleRate);
    for (var ch = 0; ch < buf.numberOfChannels; ch++) out.getChannelData(ch).set(buf.getChannelData(ch));
    return out;
  }
  function realDuration() { return buffer ? buffer.duration - 0.5 : 0; }

  function build(fraction) {
    if (shifter) { try { shifter.disconnect(); } catch (e) { /* já desligado */ } shifter.off(); }
    shifter = new root.SoundTouchLib.PitchShifter(context(), buffer, 4096, function () {
      pause();
      build(0);
      emit('ended');
      emit('time', { time: 0, duration: realDuration() });
    });
    shifter.pitchSemitones = state.pitch;
    shifter.tempo = state.speed;
    if (fraction) shifter.percentagePlayed = fraction;
    shifter.on('play', function (d) {
      emit('time', { time: Math.min(d.timePlayed, realDuration()), duration: realDuration() });
    });
  }

  // Carrega o áudio (Blob) para tocar; devolve a duração em segundos.
  function load(blob, opts) {
    stop();
    state.pitch = (opts && opts.pitch) || 0;
    state.speed = (opts && opts.speed) || 1;
    return loadLib()
      .then(function () { return blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer(); })
      .then(decode)
      .then(function (buf) {
        buffer = padded(buf);
        build(0);
        emit('time', { time: 0, duration: realDuration() });
        return realDuration();
      });
  }
  function play() {
    if (!shifter || playing) return;
    context().resume();
    shifter.connect(gain);
    playing = true;
    emit('state', true);
  }
  function pause() {
    if (!shifter || !playing) return;
    try { shifter.disconnect(); } catch (e) { /* já desligado */ }
    playing = false;
    emit('state', false);
  }
  function stop() {
    pause();
    if (shifter) { shifter.off(); shifter = null; }
    buffer = null;
  }
  function seek(fraction) {
    if (!shifter) return;
    var was = playing;
    pause();
    build(Math.max(0, Math.min(fraction, 0.999)) * realDuration() / buffer.duration);
    emit('time', { time: fraction * realDuration(), duration: realDuration() });
    if (was) play();
  }
  function setPitch(semitones) { state.pitch = semitones; if (shifter) shifter.pitchSemitones = semitones; }
  function setSpeed(speed) { state.speed = speed; if (shifter) shifter.tempo = speed; }

  root.AudioRehearsal = {
    store: store, load: load, play: play, pause: pause, stop: stop, seek: seek,
    setPitch: setPitch, setSpeed: setSpeed,
    playing: function () { return playing; },
    loaded: function () { return !!shifter; },
    on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    supported: function () { return !!(root.indexedDB && (root.AudioContext || root.webkitAudioContext)); }
  };
})(window);
