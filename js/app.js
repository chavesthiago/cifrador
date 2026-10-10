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
  var DEFAULT_OPTS = { cols: 1, size: 11, color: '#000000', margin: 15, font: 'sans', acc: 'auto', notes: 'typed', repeats: 'label', tetrads: false };
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
      id: uid(), title: '', artist: '', key: '', capo: '', tempo: '', text: '', extra: [],
      opts: clone(DEFAULT_OPTS), updated: Date.now()
    }, base || {});
  }
  function fixSong(s) {
    s = newSong(s);
    s.opts = Object.assign(clone(DEFAULT_OPTS), s.opts || {});
    s.text = Music.normalizeText(s.text);
    s.extra = Array.isArray(s.extra) ? s.extra.filter(function (c) { return typeof c === 'string' && Music.isChord(c); }) : [];
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

  // Cada letra vira um alvo: guarda a linha e a coluna dela no texto da cifra.
  function chars(parent, text, ln, col) {
    for (var i = 0; i < text.length; i++) {
      var c = el('span', 'c', text[i]);
      c.setAttribute('data-ln', ln);
      c.setAttribute('data-c', col + i);
      parent.appendChild(c);
    }
  }

  function lineEl(l, o) {
    if (l.t === 'pair') {
      var line = el('div', 'line pair'), end = 0;
      l.words.forEach(function (w) {
        var word = el('span', 'word');
        w.forEach(function (p) {
          var seg = el('span', 'seg'), ch = el('span', 'ch', p.chord), tx = el('span', 'tx');
          if (p.chord) {
            ch.setAttribute('data-cl', l.cl);
            ch.setAttribute('data-col', p.col);
            ch.draggable = true;
          }
          chars(tx, p.text || ' ', l.ln, p.col);
          end = Math.max(end, p.col + p.text.length);
          seg.appendChild(ch);
          seg.appendChild(tx);
          word.appendChild(seg);
        });
        line.appendChild(word);
      });
      var tail = el('span', 'seg'), ttx = el('span', 'tx');
      tail.appendChild(el('span', 'ch'));
      chars(ttx, ' ', l.ln, end);   // alvo depois do fim da frase
      tail.appendChild(ttx);
      line.appendChild(tail);
      return line;
    }
    if (l.t === 'chords') return el('div', 'line chordline', l.raw);
    if (l.t === 'notes') return el('div', 'line notes', Music.renderNotes(l.body, o.notes));
    var ly = el('div', 'line lyric');
    chars(ly, l.text, l.ln, 0);
    chars(ly, ' ', l.ln, l.text.length);
    return ly;
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
    renderPalette();
    applySel();
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

  /* ---------- paleta de acordes e edição pela folha ---------- */

  var sel = null;     // {type:'char', ln, col} ou {type:'chord', cl, col}
  var drag = null;    // {chord, from:{cl, col}} enquanto arrasta
  var undoStack = [];

  function chip(name, title) {
    var b = el('button', 'chip', name);
    b.type = 'button';
    b.draggable = true;
    b.setAttribute('data-chord', name);
    if (title) b.title = title;
    return b;
  }
  function renderPalette() {
    var s = cur(), box = $('palGroups');
    var key = s.key.trim() || Music.firstChord(s.text);
    var pal = Music.palette(key, s.opts.tetrads), known = {};
    box.textContent = '';
    function group(cls, title, list) {
      if (!list.length) return;
      var g = el('div', 'pal-group ' + cls), chips = el('div', 'chips');
      g.appendChild(el('span', 'pal-title', title));
      list.forEach(function (c) { known[c.name] = 1; chips.appendChild(chip(c.name, c.degree)); });
      g.appendChild(chips);
      box.appendChild(g);
    }
    if (pal) {
      group('field', 'Campo harmônico de ' + pal.tonic, pal.field);
      group('borrowed', pal.minor ? 'Empréstimos (tom maior e V)' : 'Empréstimos (tom menor)', pal.borrowed);
      group('dominants', 'Dominantes secundários', pal.dominants);
    } else {
      box.appendChild(el('div', 'pal-empty', 'Preencha o Tom da música para ver o campo harmônico.'));
    }
    var others = s.extra.concat(Music.chordsUsed(s.text)).filter(function (c, i, a) { return !known[c] && a.indexOf(c) === i; });
    group('others', 'Outros desta música', others.map(function (c) { return { name: c, degree: '' }; }));
  }

  function applySel() {
    var box = $('pvScroll');
    Array.prototype.forEach.call(box.querySelectorAll('.sel'), function (n) { n.classList.remove('sel'); });
    if (sel) {
      var q = sel.type === 'char'
        ? '.c[data-ln="' + sel.ln + '"][data-c="' + sel.col + '"]'
        : '.ch[data-cl="' + sel.cl + '"][data-col="' + sel.col + '"]';
      var found = box.querySelectorAll(q);
      if (!found.length) sel = null;
      Array.prototype.forEach.call(found, function (n) { n.classList.add('sel'); });
    }
    $('btnErase').disabled = !(sel && sel.type === 'chord');
    $('btnUndo').disabled = !undoStack.length;
  }

  function commit(text) {
    var s = cur();
    if (text === s.text) { applySel(); return; }
    undoStack.push({ id: s.id, text: s.text });
    if (undoStack.length > 200) undoStack.shift();
    s.text = text;
    $('text').value = text;
    touch();
    render();
  }
  function undo() {
    var u = undoStack.pop();
    while (u && u.id !== cur().id) u = undoStack.pop();
    if (!u) { applySel(); return; }
    cur().text = u.text;
    $('text').value = u.text;
    sel = null;
    touch();
    render();
  }

  function placeChord(chord) {
    if (!sel) { toast('Clique na letra onde o acorde entra e depois no acorde, ou arraste o acorde até a letra.'); return; }
    var ln = sel.type === 'char' ? sel.ln : sel.cl + 1;
    var r = Music.setChordAt(cur().text, ln, sel.col, chord);
    sel = { type: 'chord', cl: r.cl, col: r.col };
    commit(r.text);
  }
  function dropOn(target) {
    if (!drag || !target) return;
    var ln = Number(target.getAttribute('data-ln')), col = Number(target.getAttribute('data-c'));
    var r = drag.from
      ? Music.moveChord(cur().text, drag.from.cl, drag.from.col, ln, col)
      : Music.setChordAt(cur().text, ln, col, drag.chord);
    sel = { type: 'chord', cl: r.cl, col: r.col };
    commit(r.text);
  }
  function eraseSel() {
    if (!sel || sel.type !== 'chord') return;
    var r = Music.removeChordAt(cur().text, sel.cl, sel.col);
    sel = null;
    commit(r.text);
  }
  function stepSel(d) {
    if (!sel || sel.type !== 'chord' || sel.col + d < 0) return;
    var r = Music.moveChord(cur().text, sel.cl, sel.col, sel.cl + 1, sel.col + d);
    sel = { type: 'chord', cl: r.cl, col: r.col };
    commit(r.text);
  }

  // Letra sob o ponteiro: vale soltar na própria letra ou na faixa de acordes logo acima dela.
  function targetAt(e) {
    var t = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    if (!t) return null;
    // Mede pela posição, não pelo elemento sob o ponteiro: em letras estreitas ("l", "i")
    // o navegador pode apontar a letra vizinha.
    var scope = t.closest('.line.pair, .line.lyric');
    if (!scope) return null;
    var best = null, bestD = Infinity;
    Array.prototype.forEach.call(scope.querySelectorAll('.c'), function (c) {
      var r = c.getBoundingClientRect();
      var dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
      var dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      var d = dx + dy * 3;
      if (d < bestD) { bestD = d; best = c; }
    });
    return best;
  }
  function clearOver() {
    Array.prototype.forEach.call($('pvScroll').querySelectorAll('.over'), function (n) { n.classList.remove('over'); });
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
    $('oTetrads').checked = !!o.tetrads;
  }
  function select(id) {
    db.current = id;
    sel = null;
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
    undoStack.length = 0;
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

  // Depois de digitar ou transpor, o "Desfazer" da folha não pode trazer um texto antigo de volta.
  $('text').addEventListener('input', function () { undoStack.length = 0; applySel(); });

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
  $('palette').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (b) placeChord(b.getAttribute('data-chord'));
  });
  $('palette').addEventListener('dragstart', function (e) {
    var b = e.target.closest && e.target.closest('.chip');
    if (!b) return;
    drag = { chord: b.getAttribute('data-chord'), from: null };
    e.dataTransfer.setData('text/plain', drag.chord);
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  $('pvScroll').addEventListener('dragstart', function (e) {
    var ch = e.target.closest && e.target.closest('.ch[data-cl]');
    if (!ch) return;
    drag = { chord: ch.textContent, from: { cl: Number(ch.getAttribute('data-cl')), col: Number(ch.getAttribute('data-col')) } };
    e.dataTransfer.setData('text/plain', drag.chord);
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  $('pvScroll').addEventListener('dragover', function (e) {
    if (!drag) return;
    var t = targetAt(e);
    clearOver();
    if (!t) return;
    e.preventDefault();
    t.classList.add('over');
  });
  $('pvScroll').addEventListener('drop', function (e) {
    if (!drag) return;
    e.preventDefault();
    var t = targetAt(e);
    clearOver();
    dropOn(t);
    drag = null;
  });
  document.addEventListener('dragend', function () { drag = null; clearOver(); });
  $('pvScroll').addEventListener('click', function (e) {
    var ch = e.target.closest('.ch[data-cl]'), c = ch ? null : targetAt(e);
    if (ch) sel = { type: 'chord', cl: Number(ch.getAttribute('data-cl')), col: Number(ch.getAttribute('data-col')) };
    else if (c) sel = { type: 'char', ln: Number(c.getAttribute('data-ln')), col: Number(c.getAttribute('data-c')) };
    else sel = null;
    applySel();
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (!sel || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { sel = null; applySel(); }
    else if (sel.type === 'chord' && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); eraseSel(); }
    else if (sel.type === 'chord' && e.key === 'ArrowLeft') { e.preventDefault(); stepSel(-1); }
    else if (sel.type === 'chord' && e.key === 'ArrowRight') { e.preventDefault(); stepSel(1); }
  });
  $('btnUndo').addEventListener('click', undo);
  $('btnErase').addEventListener('click', eraseSel);
  $('oTetrads').addEventListener('change', function () { cur().opts.tetrads = this.checked; touch(); render(); });
  $('palNew').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var c = this.value.trim(), s = cur();
    if (!c) return;
    if (!Music.isChord(c)) { toast('"' + c + '" não parece um acorde. Exemplos: F#m7, Bb7M, D/F#.'); return; }
    if (s.extra.indexOf(c) < 0) s.extra.push(c);
    this.value = '';
    touch();
    if (sel) placeChord(c); else render();
  });

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
