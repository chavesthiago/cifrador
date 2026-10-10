/* Cifrador — tela: lista de músicas, editor, folha A4 e leitura no celular. */
(function () {
  'use strict';

  var STORE = 'cifrador.v1';
  var MM = 96 / 25.4;            // 1 mm em px de CSS
  var GAP = 8;                   // espaço entre colunas, em mm
  var MIN_SIZE = 7, MAX_SIZE = 20;
  var FONTS = {
    sans: 'Arial, Helvetica, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", Menlo, monospace'
  };
  var DEFAULT_OPTS = { cols: 1, size: 11, color: '#000000', margin: 15, font: 'sans', acc: 'auto', notes: 'typed', repeats: 'label' };
  var EXAMPLE = [
    '[Intro]', 'C  G  Am  F', '',
    '[Verso 1]',
    'C               G', 'Abro a janela, vejo o sol',
    'Am              F', 'O dia começa devagar',
    'C               G', 'Pego o violão e a voz',
    'Am        F     G', 'E deixo a música entrar', '',
    '[Refrão]',
    'F        G', 'Canta comigo',
    'C          Am', 'Essa canção',
    'F          G          C', 'Que cabe inteira no coração', '',
    '[Solo]', 'Notas: mi sol lá sol mi ré dó', '',
    '[Verso 2]',
    'C               G', 'Fecho os olhos, sigo o som',
    'Am              F', 'O tempo passa sem pesar', '',
    '[Refrão]', ''
  ].join('\n');

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- dados ---------- */

  var db = load();
  var memoryOnly = false;

  function newSong(base) {
    return Object.assign({
      id: uid(), title: '', artist: '', key: '', capo: '', tempo: '', text: '',
      opts: clone(DEFAULT_OPTS), updated: Date.now()
    }, base || {});
  }
  function fixSong(s) {
    s = newSong(s);
    s.opts = Object.assign(clone(DEFAULT_OPTS), s.opts || {});
    s.text = Music.normalizeText(s.text);
    ['title', 'artist', 'key', 'capo', 'tempo'].forEach(function (k) { s[k] = s[k] == null ? '' : String(s[k]); });
    return s;
  }
  function load() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* sem armazenamento */ }
    if (!data || !Array.isArray(data.songs) || !data.songs.length) {
      var ex = newSong({ title: 'Música de exemplo', artist: 'Cifrador', key: 'C', text: EXAMPLE });
      return { songs: [ex], current: ex.id };
    }
    data.songs = data.songs.map(fixSong);
    return data;
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(db));
      $('saved').textContent = 'Salvo neste navegador';
    } catch (e) {
      if (!memoryOnly) toast('Este navegador não deixou salvar. Use "Backup" para não perder as músicas.');
      memoryOnly = true;
      $('saved').textContent = 'Não foi possível salvar neste navegador';
    }
  }
  function cur() {
    var s = db.songs.filter(function (x) { return x.id === db.current; })[0];
    if (!s) { s = db.songs[0]; db.current = s.id; }
    return s;
  }

  /* ---------- montagem da cifra ---------- */

  function applyVars(node, o) {
    node.style.setProperty('--fs', o.size + 'pt');
    node.style.setProperty('--cf', FONTS[o.font] || FONTS.sans);
    node.style.setProperty('--chord', o.color);
  }

  function buildHeader(song) {
    var hd = el('div', 'hd');
    hd.appendChild(el('h1', '', song.title || 'Sem título'));
    if (song.artist) hd.appendChild(el('div', 'artist', song.artist));
    var info = [];
    if (song.key) info.push(['Tom', song.key]);
    if (song.capo && song.capo !== '0') info.push(['Capotraste', song.capo + 'ª casa']);
    if (song.tempo) info.push(['Andamento', song.tempo + ' bpm']);
    if (info.length) {
      var line = el('div', 'info');
      info.forEach(function (it, i) {
        if (i) line.appendChild(document.createTextNode('   ·   '));
        line.appendChild(document.createTextNode(it[0] + ': '));
        line.appendChild(el('b', '', it[1]));
      });
      hd.appendChild(line);
    }
    return hd;
  }

  function lineEl(l, o) {
    if (l.t === 'pair') {
      var line = el('div', 'line pair');
      l.words.forEach(function (w) {
        var word = el('span', 'word');
        w.forEach(function (p) {
          var seg = el('span', 'seg');
          seg.appendChild(el('span', 'ch', p.chord));
          seg.appendChild(el('span', 'tx', p.text || ' '));
          word.appendChild(seg);
        });
        line.appendChild(word);
      });
      return line;
    }
    if (l.t === 'chords') return el('div', 'line chordline', l.raw);
    if (l.t === 'notes') return el('div', 'line notes', Music.renderNotes(l.body, o.notes));
    return el('div', 'line lyric', l.text);
  }

  function labelEl(text, repeat) {
    var lab = el('div', 'sec-label', text);
    if (repeat) lab.appendChild(el('span', 'rep', ' (repetir)'));
    return lab;
  }

  function buildBlocks(song) {
    var out = [];
    Music.parse(song.text).sections.forEach(function (s) {
      var cls = 'block' + (Music.sectionKind(s.label) === 'chorus' ? ' chorus' : '');
      var paras = s.paras;
      if (s.repeatOf && song.opts.repeats === 'full') paras = s.repeatOf.paras;
      if (!paras.length) {
        if (s.label) { var b0 = el('div', 'block'); b0.appendChild(labelEl(s.label, !!s.repeatOf)); out.push(b0); }
        return;
      }
      paras.forEach(function (p, pi) {
        var b = el('div', cls);
        if (pi === 0 && s.label) b.appendChild(labelEl(s.label));
        var body = el('div', 'body');
        p.forEach(function (l) { body.appendChild(lineEl(l, song.opts)); });
        b.appendChild(body);
        out.push(b);
      });
    });
    return out;
  }

  // Parágrafo mais alto que a coluna: divide linha a linha.
  function splitBlock(b) {
    var label = b.querySelector('.sec-label');
    var lines = Array.prototype.slice.call(b.querySelector('.body').children);
    return lines.map(function (ln, i) {
      var nb = el('div', b.className + (i < lines.length - 1 ? ' part' : ''));
      if (i === 0 && label) nb.appendChild(label);
      var body = el('div', 'body');
      body.appendChild(ln);
      nb.appendChild(body);
      return nb;
    });
  }

  // Distribui os blocos em colunas e páginas A4; devolve os elementos .page.
  function paginate(song) {
    var o = song.opts, measure = $('measure');
    var W = 210 - 2 * o.margin, H = 297 - 2 * o.margin;
    var colW = (W - GAP * (o.cols - 1)) / o.cols;
    var Hpx = H * MM - 1;
    applyVars(measure, o);

    measure.textContent = '';
    measure.style.width = W + 'mm';
    var hd = buildHeader(song);
    measure.appendChild(hd);
    var hdH = hd.getBoundingClientRect().height;

    measure.textContent = '';
    measure.style.width = colW + 'mm';
    var items = [];
    buildBlocks(song).forEach(function (b) {
      measure.appendChild(b);
      var h = b.getBoundingClientRect().height;
      if (h > Hpx - hdH && b.querySelector('.body')) {
        measure.removeChild(b);
        splitBlock(b).forEach(function (p) {
          measure.appendChild(p);
          items.push({ el: p, h: p.getBoundingClientRect().height });
        });
      } else items.push({ el: b, h: h });
    });

    var pages = [], i = 0;
    do {
      var first = !pages.length, avail = Hpx - (first ? hdH : 0);
      var page = el('div', 'page cifra');
      applyVars(page, o);
      page.style.padding = o.margin + 'mm';
      if (first) page.appendChild(hd);
      var cols = el('div', 'cols');
      for (var c = 0; c < o.cols; c++) {
        var col = el('div', 'col'), y = 0;
        col.style.width = colW + 'mm';
        while (i < items.length) {
          var it = items[i];
          var fits = y + it.h <= avail;
          if (!fits && !(y === 0 && it.h > Hpx)) break;
          col.appendChild(it.el);
          y += it.h;
          i++;
        }
        cols.appendChild(col);
      }
      page.appendChild(cols);
      pages.push(page);
    } while (i < items.length && pages.length < 60);

    if (pages.length > 1) {
      pages.forEach(function (p, n) { p.appendChild(el('div', 'page-num', (n + 1) + ' / ' + pages.length)); });
    }
    return pages;
  }

  function render() {
    var song = cur(), o = song.opts;
    var pages = paginate(song), box = $('pages');
    box.textContent = '';
    pages.forEach(function (p) { box.appendChild(p); });
    $('pageInfo').textContent = pages.length === 1 ? '1 página' : pages.length + ' páginas';
    $('sizeOut').textContent = String(o.size).replace('.', ',') + ' pt';

    var flow = $('flow');
    flow.textContent = '';
    applyVars(flow, o);
    flow.appendChild(buildHeader(song));
    buildBlocks(song).forEach(function (b) { flow.appendChild(b); });

    document.title = (song.title ? song.title + (song.artist ? ' - ' + song.artist : '') + ' · ' : '') + 'Cifrador';
    fitZoom();
    return pages.length;
  }

  function fitZoom() {
    var sc = $('pvScroll');
    if (!sc.clientWidth) return;
    var z = Math.min(1, (sc.clientWidth - 34) / (210 * MM));
    $('pages').style.zoom = z > 0 ? z : 1;
  }

  var renderTimer = null;
  function renderSoon() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 120);
  }

  /* ---------- lista ---------- */

  function renderList() {
    var q = $('search').value.trim().toLowerCase(), ul = $('songList');
    ul.textContent = '';
    var songs = db.songs.slice().sort(function (a, b) {
      return (a.title || 'Sem título').localeCompare(b.title || 'Sem título', 'pt-BR', { sensitivity: 'base' });
    }).filter(function (s) { return !q || (s.title + ' ' + s.artist).toLowerCase().indexOf(q) >= 0; });
    if (!songs.length) { ul.appendChild(el('li', 'empty', 'Nenhuma música encontrada.')); return; }
    songs.forEach(function (s) {
      var li = el('li'), b = el('button');
      b.type = 'button';
      b.setAttribute('aria-current', s.id === db.current ? 'true' : 'false');
      b.appendChild(el('span', 't', s.title || 'Sem título'));
      if (s.artist) b.appendChild(el('span', 'a', s.artist));
      b.addEventListener('click', function () { select(s.id); setTab('view'); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function fillForm() {
    var s = cur(), o = s.opts;
    $('fTitle').value = s.title; $('fArtist').value = s.artist; $('fKey').value = s.key;
    $('fCapo').value = s.capo; $('fTempo').value = s.tempo; $('text').value = s.text;
    $('oCols').value = o.cols; $('oFont').value = o.font; $('oColor').value = o.color;
    $('oMargin').value = o.margin; $('oRepeats').value = o.repeats; $('oNotes').value = o.notes; $('oAcc').value = o.acc;
  }
  function select(id) {
    db.current = id;
    save(); fillForm(); renderList(); render();
  }
  function touch() {
    cur().updated = Date.now();
    save();
    renderSoon();
  }
  function setTab(tab) {
    document.body.setAttribute('data-tab', tab);
    if (tab === 'view') fitZoom();
  }

  /* ---------- ações ---------- */

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 4200);
  }

  function addSongs(list) {
    list.forEach(function (s) { db.songs.push(s); });
    select(list[list.length - 1].id);
  }

  function transpose(n) {
    var s = cur();
    var key = s.key.trim() || Music.firstChord(s.text);
    var flat = s.opts.acc === 'flat' || (s.opts.acc === 'auto' && Music.prefersFlat(key, n));
    s.text = Music.transposeText(s.text, n, flat);
    s.key = Music.transposeKey(s.key, n, flat);
    $('text').value = s.text;
    $('fKey').value = s.key;
    touch();
    render();
  }

  // Move o acorde sob o cursor uma coluna, sem tirar os vizinhos do lugar.
  function nudge(dir) {
    var ta = $('text'), v = ta.value, pos = ta.selectionStart;
    var ls = v.lastIndexOf('\n', pos - 1) + 1, le = v.indexOf('\n', pos);
    if (le < 0) le = v.length;
    var line = v.slice(ls, le), col = pos - ls;
    if (Music.classify(line) !== 'chords') return false;
    var re = /\S+/g, m, tok = null;
    while ((m = re.exec(line))) if (m.index <= col && col <= m.index + m[0].length) { tok = m; break; }
    if (!tok) return false;
    var a = tok.index, b = a + tok[0].length, before = line.slice(0, a), after = line.slice(b);
    if (dir > 0) {
      before += ' ';
      if (/^ {2}/.test(after)) after = after.slice(1);
    } else {
      if (!/ $/.test(before) || /\S $/.test(before)) return true; // sem espaço para recuar
      before = before.slice(0, -1);
      if (after) after = ' ' + after;
    }
    ta.setRangeText(before + tok[0] + after, ls, le, 'preserve');
    ta.selectionStart = ta.selectionEnd = Math.max(ls, pos + dir);
    cur().text = ta.value;
    touch();
    return true;
  }

  function insertAtLine(snippet) {
    var ta = $('text'), v = ta.value, pos = ta.selectionStart;
    var ls = v.lastIndexOf('\n', pos - 1) + 1, le = v.indexOf('\n', pos);
    if (le < 0) le = v.length;
    var isNotes = /:\s$/.test(snippet), emptyLine = !v.slice(ls, le).trim();
    var at = emptyLine ? ls : le, endAt = emptyLine ? le : le;
    var prevBlank = ls === 0 || !v.slice(v.lastIndexOf('\n', ls - 2) + 1, ls - 1).trim();
    var lead = emptyLine ? (isNotes || prevBlank ? '' : '\n') : '\n' + (isNotes ? '' : '\n');
    var text = lead + snippet + (isNotes ? '' : '\n');
    ta.setRangeText(text, at, endAt, 'end');
    ta.focus();
    cur().text = ta.value;
    touch();
  }

  function download(name, content, type) {
    var a = el('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function slug(s) {
    return (s || 'musica').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'musica';
  }

  // Arquivos .txt do Windows costumam vir em ANSI; tenta UTF-8 e cai para Windows-1252.
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }

  function importFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var src = decode(buf).replace(/^﻿/, '');
      var base = file.name.replace(/\.[^.]+$/, '');
      if (/\.json$/i.test(file.name)) {
        var data = JSON.parse(src);
        var list = Array.isArray(data) ? data : data.songs;
        if (!Array.isArray(list)) throw new Error('formato');
        return list.map(function (s) {
          s = fixSong(s);
          var old = db.songs.filter(function (x) { return x.id === s.id; })[0];
          if (old) { Object.assign(old, s); return null; }   // mesma música: atualiza
          return s;
        }).filter(Boolean);
      }
      var opts = clone(cur().opts);
      if (Music.isChordPro(src)) {
        var s = Music.fromChordPro(src);
        return [newSong(Object.assign(s, { title: s.title || base, opts: opts }))];
      }
      return [newSong({ title: base, text: Music.normalizeText(src), opts: opts })];
    });
  }

  function onFiles(files) {
    var list = Array.prototype.slice.call(files), added = [], failed = [];
    list.reduce(function (p, f) {
      return p.then(function () { return importFile(f); })
        .then(function (songs) { added = added.concat(songs); })
        .catch(function () { failed.push(f.name); });
    }, Promise.resolve()).then(function () {
      if (added.length) addSongs(added);
      else { save(); fillForm(); renderList(); render(); }
      if (failed.length) toast('Não consegui ler: ' + failed.join(', '));
      else if (added.length) toast(added.length === 1 ? 'Música importada.' : added.length + ' músicas importadas.');
      else toast('Músicas atualizadas a partir do backup.');
      if (added.length) setTab('edit');
    });
  }

  function fitOnePage() {
    var s = cur(), start = s.opts.size;
    while (render() > 1 && s.opts.size > MIN_SIZE) s.opts.size = Math.max(MIN_SIZE, s.opts.size - 0.5);
    var ok = render() === 1;
    touch();
    if (!ok) toast('Não coube em 1 página nem com a menor letra. Experimente 2 colunas ou margem estreita.');
    else if (s.opts.size === start) toast('Já cabe em 1 página.');
    else toast('Letra ajustada para ' + String(s.opts.size).replace('.', ',') + ' pt.');
  }

  /* ---------- eventos ---------- */

  function bindField(id, key) {
    $(id).addEventListener('input', function () {
      cur()[key] = this.value;
      touch();
      if (key === 'title' || key === 'artist') renderList();
    });
  }
  function bindOpt(id, key, num) {
    $(id).addEventListener('change', function () {
      cur().opts[key] = num ? Number(this.value) : this.value;
      if (key === 'acc') { transpose(0); return; }
      touch();
      render();
    });
  }

  bindField('fTitle', 'title'); bindField('fArtist', 'artist'); bindField('fKey', 'key');
  bindField('fCapo', 'capo'); bindField('fTempo', 'tempo'); bindField('text', 'text');
  bindOpt('oCols', 'cols', true); bindOpt('oFont', 'font'); bindOpt('oColor', 'color');
  bindOpt('oMargin', 'margin', true); bindOpt('oRepeats', 'repeats'); bindOpt('oNotes', 'notes'); bindOpt('oAcc', 'acc');

  $('text').addEventListener('keydown', function (e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault(); // Alt + seta também é "voltar" no navegador
      nudge(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  $('btnNudgeL').addEventListener('click', function () { $('text').focus(); if (!nudge(-1)) toast('Coloque o cursor sobre um acorde.'); });
  $('btnNudgeR').addEventListener('click', function () { $('text').focus(); if (!nudge(1)) toast('Coloque o cursor sobre um acorde.'); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-insert]'), function (b) {
    b.addEventListener('click', function () { insertAtLine(b.getAttribute('data-insert')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });

  ['btnUp', 'btnUpM'].forEach(function (id) { $(id).addEventListener('click', function () { transpose(1); }); });
  ['btnDown', 'btnDownM'].forEach(function (id) { $(id).addEventListener('click', function () { transpose(-1); }); });

  function resize(d) {
    var o = cur().opts;
    o.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, o.size + d));
    touch(); render();
  }
  $('btnSmaller').addEventListener('click', function () { resize(-0.5); });
  $('btnBigger').addEventListener('click', function () { resize(0.5); });
  $('btnFit').addEventListener('click', fitOnePage);

  $('btnNew').addEventListener('click', function () {
    addSongs([newSong({ opts: clone(cur().opts) })]);
    setTab('edit');
    $('fTitle').focus();
  });
  $('btnDelete').addEventListener('click', function () {
    var s = cur();
    if (!window.confirm('Excluir "' + (s.title || 'Sem título') + '"? Isso não pode ser desfeito.')) return;
    db.songs = db.songs.filter(function (x) { return x.id !== s.id; });
    if (!db.songs.length) db.songs.push(newSong());
    select(db.songs[0].id);
  });
  $('btnImport').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () {
    if (this.files.length) onFiles(this.files);
    this.value = '';
  });
  $('btnExport').addEventListener('click', function () {
    var s = cur();
    download(slug(s.title) + '.cho', Music.toChordPro(s), 'text/plain;charset=utf-8');
  });
  $('btnBackup').addEventListener('click', function () {
    var d = new Date(), day = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    download('cifrador-backup-' + day + '.json', JSON.stringify({ app: 'cifrador', version: 1, songs: db.songs }, null, 1), 'application/json');
  });
  $('btnPrint').addEventListener('click', function () { render(); window.print(); });
  $('search').addEventListener('input', renderList);

  document.addEventListener('click', function (e) {
    var more = document.querySelector('.more');
    if (more.open && !more.contains(e.target)) more.open = false;
  });
  window.addEventListener('beforeprint', render);
  if (window.ResizeObserver) new ResizeObserver(fitZoom).observe($('pvScroll'));
  else window.addEventListener('resize', fitZoom);

  fillForm(); renderList(); render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
