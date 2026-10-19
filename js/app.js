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
  var DEFAULT_OPTS = { cols: 1, size: 11, color: '#000000', margin: 15, font: 'sans', acc: 'auto', notes: 'typed', repeats: 'label', tetrads: false, memos: 'show' };
  // música vazia que só aparece na lista depois de ganhar título ou texto
  function blankSong(base) { return newSong(Object.assign({ draft: true }, base || {})); }

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
      id: uid(), title: '', artist: '', key: '', capo: '', tempo: '', youtube: '', text: '', extra: [],
      opts: clone(DEFAULT_OPTS), updated: Date.now()
    }, base || {});
  }
  function fixSong(s) {
    s = newSong(s);
    s.opts = Object.assign(clone(DEFAULT_OPTS), s.opts || {});
    s.text = Music.normalizeText(s.text);
    s.extra = Array.isArray(s.extra) ? s.extra.filter(function (c) { return typeof c === 'string' && Music.isChord(c); }) : [];
    ['title', 'artist', 'key', 'capo', 'tempo', 'youtube'].forEach(function (k) { s[k] = s[k] == null ? '' : String(s[k]); });
    return s;
  }
  function load() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* sem armazenamento */ }
    // a antiga música de exemplo sai da lista (as que foram editadas e renomeadas ficam)
    function isExample(s) { return s && s.title === 'Música de exemplo' && s.artist === 'Cifrador' && !data.group; }
    if (data && Array.isArray(data.songs)) data.songs = data.songs.filter(function (s) { return !isExample(s); });
    if (data && Array.isArray(data.personal)) data.personal = data.personal.filter(function (s) { return !isExample(s); });
    if (!data || !Array.isArray(data.songs) || !data.songs.length) {
      var blank = blankSong();
      data = Object.assign(data || {}, { songs: [blank], current: blank.id });
    }
    data.songs = data.songs.map(fixSong);
    data.setlists = (Array.isArray(data.setlists) ? data.setlists : []).map(fixSetlist);
    return data;
  }
  // Repertório: nome, data (aaaa-mm-dd) e a ordem das músicas (ids).
  function fixSetlist(r) {
    r = r || {};
    var ids = Array.isArray(r.musicas) ? r.musicas : (r.musicas && typeof r.musicas === 'object' ? Object.keys(r.musicas).sort(function (a, b) { return a - b; }).map(function (k) { return r.musicas[k]; }) : []);
    var out = {
      id: r.id || uid(), nome: String(r.nome || ''), data: /^\d{4}-\d{2}-\d{2}$/.test(r.data || '') ? r.data : '',
      musicas: ids.filter(function (x) { return typeof x === 'string'; }), updated: Number(r.updated) || Date.now()
    };
    if (r.pending) out.pending = true;
    return out;
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(db));
      showCloud();
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

  // Linha com anotação no fim dos acordes: a anotação fica à direita, na altura dos acordes.
  // "> Banda suave > Teclado 1 - Pad": cada ">" vira uma anotação separada.
  function memoParts(text) {
    return String(text || '').split('>').map(function (t) { return t.trim(); }).filter(Boolean);
  }
  function memoEl(text, o, cls) {
    var parts = memoParts(text);
    if (!o.plain) return el(cls === 'side' ? 'span' : 'div', cls === 'side' ? 'memo side' : 'line memo',
      parts.map(function (t) { return t.replace('\\', ''); }).join('  ·  '));
    var row = el('div', 'line memo-row');   // modo palco: uma faixa para cada anotação, lado a lado
    parts.forEach(function (t) {
      // no palco a anotação sai em maiúsculas; depois de "\" o texto fica como foi digitado
      var i = t.indexOf('\\'), chip = el('span', 'memo', i < 0 ? t : t.slice(0, i));
      if (i >= 0) chip.appendChild(el('span', 'as-typed', t.slice(i + 1)));
      row.appendChild(chip);
    });
    return row;
  }

  function lineEl(l, o) {
    var core = lineCore(l, o);
    if (!l.memo || l.t === 'memo' || o.memos === 'hide') return core;
    if (o.plain) {   // modo palco: a anotação vira uma faixa acima da linha
      var box = el('div', 'line-memo');
      box.appendChild(memoEl(l.memo, o));
      box.appendChild(core);
      return box;
    }
    var row = el('div', 'line-row');
    row.appendChild(core);
    row.appendChild(memoEl(l.memo, o, 'side'));
    return row;
  }

  function lineCore(l, o) {
    if (l.t === 'memo') return memoEl(l.text, o);
    if (l.t === 'pair') {
      var line = el('div', 'line pair'), end = 0;
      l.words.forEach(function (w) {
        var word = el('span', 'word');
        w.forEach(function (p) {
          var seg = el('span', 'seg'), ch = el('span', 'ch', p.chord), tx = el('span', 'tx');
          if (p.chord && !o.plain) {
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

  // Conteúdo de uma seção repetida, sem as anotações da primeira vez.
  function repeatParas(s) {
    return s.repeatOf.paras.map(function (p) {
      var q = p.filter(function (l) { return l.t !== 'memo'; });
      q.gap = p.gap;
      q.lead = p.lead;
      return q;
    }).filter(function (p) { return p.length; });
  }

  function buildBlocks(song) {
    var out = [], o = song.opts, showMemos = o.memos !== 'hide';
    function fill(body, lines) {
      lines.forEach(function (l) { if (l.t !== 'memo' || showMemos) body.appendChild(lineEl(l, o)); });
    }
    Music.parse(song.text).sections.forEach(function (s) {
      var cls = 'block' + (Music.sectionKind(s.label) === 'chorus' ? ' chorus' : '');
      var paras = s.paras, memos = [];
      if (s.repeatOf) {               // repetição: nome da seção + anotações próprias
        memos = Music.sectionMemos(s);
        paras = o.repeats === 'full' ? repeatParas(s) : [];
      }
      if (!paras.length) {
        if (!s.label && !memos.length) return;
        var b0 = el('div', 'block'), body0 = el('div', 'body');
        if (s.label) b0.appendChild(labelEl(s.label, !!s.repeatOf));
        fill(body0, memos);
        if (body0.firstChild) b0.appendChild(body0);
        if (s.gap > 1) b0.style.paddingTop = ((s.gap - 1) * 1.22) + 'em';
        if (b0.firstChild) out.push(b0);
        return;
      }
      var first = true;
      paras.forEach(function (p) {
        var b = el('div', cls), body = el('div', 'body');
        if (first) fill(body, memos);
        fill(body, p);
        if (!body.firstChild && !(first && s.label)) return;
        if (first && s.label) b.appendChild(labelEl(s.label));
        if (body.firstChild) b.appendChild(body);
        // cada linha em branco a mais no texto vira uma linha de espaço na folha
        // antes da seção, vale o espaço digitado antes do nome dela ([Coro], por exemplo)
        var gap = first ? s.gap : p.gap;
        if (gap > 1) b.style.paddingTop = ((gap - 1) * 1.22) + 'em';
        if (first && p.lead && body.firstChild) body.style.paddingTop = (p.lead * 1.22) + 'em';
        first = false;
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
    clearTimeout(renderTimer);   // um redesenho agendado trocaria os elementos no meio de um arrasto
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
    if (stageOn) renderStage();
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
    renderTimer = setTimeout(function () { if (drag) renderSoon(); else render(); }, 120);
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
  // Ordem dos acordes: C D E F G A B; na mesma letra, natural, depois # e b; depois o restante do nome.
  function chordOrder(a, b) {
    function key(c) {
      var m = /^([A-G])([#b♯♭]?)(.*)$/.exec(c) || [c, 'Z', '', c];
      return ['CDEFGAB'.indexOf(m[1]), { '': 0, '#': 1, '♯': 1, 'b': 2, '♭': 2 }[m[2]] || 0, m[3]];
    }
    var x = key(a), y = key(b);
    return (x[0] - y[0]) || (x[1] - y[1]) || x[2].localeCompare(y[2], 'en', { numeric: true });
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
    var others = s.extra.concat(Music.chordsUsed(s.text)).filter(function (c, i, a) { return !known[c] && a.indexOf(c) === i; })
      .sort(chordOrder);
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
    if (!canEdit()) return;
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
    if (!canEdit()) return;
    if (!sel) { toast('Clique na letra onde o acorde entra e depois no acorde, ou arraste o acorde até a letra.'); return; }
    var ln = sel.type === 'char' ? sel.ln : sel.cl + 1;
    var r = Music.setChordAt(cur().text, ln, sel.col, chord);
    sel = { type: 'chord', cl: r.cl, col: r.col };
    commit(r.text);
  }
  function dropOn(target) {
    if (!drag || !target || !canEdit()) return;
    var ln = Number(target.getAttribute('data-ln')), col = Number(target.getAttribute('data-c'));
    var r = drag.from
      ? Music.moveChord(cur().text, drag.from.cl, drag.from.col, ln, col)
      : Music.setChordAt(cur().text, ln, col, drag.chord);
    sel = { type: 'chord', cl: r.cl, col: r.col };
    commit(r.text);
  }
  function eraseSel() {
    if (!sel || sel.type !== 'chord' || !canEdit()) return;
    var r = Music.removeChordAt(cur().text, sel.cl, sel.col);
    sel = null;
    commit(r.text);
  }
  function stepSel(d) {
    if (!sel || sel.type !== 'chord' || sel.col + d < 0 || !canEdit()) return;
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

  /* ---------- modo palco: a cifra limpa para tocar pelo celular ---------- */

  var stageOn = false, wakeLock = null;
  var KIND_NAMES = { chorus: 1, verse: 1, bridge: 1 };
  var CHORD_COLORS = ['auto', 'ink', 'blue', 'green', 'red', 'orange', 'purple'];

  function isPhone() { return window.matchMedia('(max-width: 899px)').matches; }
  function stagePrefs() {
    if (!db.stage) db.stage = {};
    if (db.stage.theme !== 'light' && db.stage.theme !== 'dark') {
      db.stage.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (!(db.stage.size >= 12 && db.stage.size <= 34)) db.stage.size = 17;
    if (CHORD_COLORS.indexOf(db.stage.chord) < 0) db.stage.chord = 'auto';
    return db.stage;
  }

  // Transposição do palco: só neste aparelho e só até recarregar a página (não altera a música).
  var stageShift = {};
  function stageView(song) {
    var n = stageShift[song.id] || 0;
    if (!n) return { text: song.text, key: song.key, shift: 0 };
    var key = song.key.trim() || Music.firstChord(song.text);
    var flat = song.opts.acc === 'flat' || (song.opts.acc === 'auto' && Music.prefersFlat(key, n));
    return { text: Music.transposeText(song.text, n, flat), key: Music.transposeKey(song.key, n, flat), shift: n };
  }
  function shiftLabel(n) {
    var tones = Math.abs(n) / 2, txt = String(tones).replace('.5', '½').replace(/^0½$/, '½');
    return (n > 0 ? '+' : '−') + txt + (tones > 1 ? ' tons' : ' tom');
  }

  function renderStage() {
    var song = cur(), prefs = stagePrefs(), stage = $('stage'), body = $('stBody'), nav = $('stNav');
    var view = stageView(song);
    var keep = body.scrollTop, o = { notes: song.opts.notes, plain: true };
    stage.setAttribute('data-theme', prefs.theme);
    stage.setAttribute('data-chord', prefs.chord);
    Array.prototype.forEach.call(document.querySelectorAll('.st-sw'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-c') === prefs.chord);
    });
    body.style.setProperty('--fs', prefs.size + 'px');
    body.style.setProperty('--cf', FONTS[song.opts.font] || FONTS.sans);
    $('stTitle').textContent = song.title || 'Sem título';
    renderPlayer(song);
    renderAudio(song);
    $('stKey').textContent = view.key || '—';
    $('stKey').hidden = !view.key && !view.shift;
    $('stKey').classList.toggle('shifted', !!view.shift);
    $('stKey').title = view.shift ? 'Tom original: ' + (song.key || '?') + ' (alterado só neste aparelho)' : 'Tom';
    $('stShift').textContent = view.shift ? shiftLabel(view.shift) + ' só neste aparelho' : 'Tom original';
    $('stReset').hidden = !view.shift;
    $('stLight').setAttribute('aria-pressed', prefs.theme === 'light');
    $('stDark').setAttribute('aria-pressed', prefs.theme === 'dark');
    body.textContent = '';
    nav.textContent = '';

    var info = [];
    if (song.artist) info.push(song.artist);
    if (song.capo && song.capo !== '0') info.push('Capotraste na ' + song.capo + 'ª casa');
    if (song.tempo) info.push(song.tempo + ' bpm');
    if (info.length) body.appendChild(el('div', 'st-info', info.join('  ·  ')));

    Music.parse(view.text).sections.forEach(function (s, i) {
      var memos = [], paras = s.paras;
      if (s.repeatOf) { memos = Music.sectionMemos(s); paras = repeatParas(s); }   // no palco, sempre por extenso
      if (!s.label && !paras.length) return;
      var kind = Music.sectionKind(s.label);
      kind = KIND_NAMES[kind] ? kind : (/^intro/i.test(s.label) ? 'intro' : 'other');
      var sec = el('section', 'st-sec k-' + kind);
      if (s.gap > 1) sec.style.paddingTop = ((s.gap - 1) * 1.3) + 'em';
      sec.id = 'st-sec-' + i;
      if (s.label) {
        var abbr = Music.sectionAbbr(s.label), head = el('div', 'st-head');
        head.appendChild(el('span', 'st-badge', abbr));
        head.appendChild(el('span', 'st-label', s.label));
        head.appendChild(el('span', 'st-rule'));
        sec.appendChild(head);
        var chipB = el('button', 'st-chip k-' + kind, abbr);
        chipB.type = 'button';
        chipB.title = s.label;
        chipB.setAttribute('aria-label', 'Ir para ' + s.label);
        chipB.setAttribute('data-target', sec.id);
        nav.appendChild(chipB);
      }
      var head = paras.length ? memos.concat(paras[0]) : memos;
      if (paras.length) head.lead = paras[0].lead;   // a junção com as anotações não pode perder o respiro
      [head].concat(paras.slice(1)).forEach(function (p) {
        if (!p.length) return;
        var para = el('div', 'st-para');
        if (p.gap > 1) para.style.paddingTop = ((p.gap - 1) * 1.3) + 'em';
        if (p.lead) para.style.paddingTop = (p.lead * 1.3) + 'em';
        p.forEach(function (l) { para.appendChild(lineEl(l, o)); });
        sec.appendChild(para);
      });
      body.appendChild(sec);
    });
    nav.hidden = true;   // sem atalhos de seção: cada seção tem a sua faixa
    renderSetBar();
    body.scrollTop = keep;
    spyStage();
  }

  // Marca o atalho da seção que está no topo da tela.
  function spyStage() {
    var body = $('stBody'), top = body.scrollTop + 70, current = null;
    Array.prototype.forEach.call(body.querySelectorAll('.st-sec'), function (sec) {
      if (sec.offsetTop <= top) current = sec.id;
    });
    Array.prototype.forEach.call($('stNav').children, function (b) {
      var on = b.getAttribute('data-target') === current;
      if (on && !b.classList.contains('on') && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' });
      b.classList.toggle('on', on);
    });
  }

  function openStage() {
    if (stageOn) { renderStage(); return; }
    stageOn = true;
    document.body.classList.add('stage-on');
    $('stage').hidden = false;
    $('stMenu').hidden = true;
    $('stBody').scrollTop = 0;
    renderStage();
    try { history.pushState({ stage: 1 }, ''); } catch (e) { /* sem histórico */ }
    try {   // mantém a tela acesa enquanto toca
      if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }, function () {});
    } catch (e) { /* sem suporte */ }
  }
  // Vídeo do YouTube no palco: só carrega quando a pessoa toca no botão.
  var ytShown = '';   // id da música com o vídeo aberto
  function renderPlayer(song) {
    var info = Music.youtubeInfo(song.youtube), btnY = $('stYt');
    btnY.hidden = !info;
    var open = !!info && ytShown === song.id;
    btnY.setAttribute('aria-pressed', open);
    $('stPlayer').hidden = !open;
    var box = $('stVideo'), want = open ? info.id + ':' + info.start : '';
    if (box.getAttribute('data-v') === want) return;   // não recarrega o vídeo que já está tocando
    box.setAttribute('data-v', want);
    box.textContent = '';
    if (!open) return;
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + info.id + '?playsinline=1&rel=0&autoplay=1' + (info.start ? '&start=' + info.start : '');
    f.title = 'Vídeo da música no YouTube';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.setAttribute('allowfullscreen', '');
    box.appendChild(f);
    $('stYtLink').href = 'https://www.youtube.com/watch?v=' + info.id + (info.start ? '&t=' + info.start + 's' : '');
  }

  /* ---------- áudio de ensaio (arquivo guardado no aparelho, com tom e velocidade) ---------- */

  var AR = window.AudioRehearsal, audioIds = {}, audioShown = '', audioLoaded = '', audioLoading = '';
  var audioPrefs = {}, seeking = false;   // tom e velocidade por música, só até recarregar a página
  if (AR && AR.supported()) AR.store.keys().then(function (k) { k.forEach(function (id) { audioIds[id] = 1; }); if (stageOn) renderAudio(cur()); }, function () {});

  function fmtTime(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }
  function prefs(id) { return audioPrefs[id] || (audioPrefs[id] = { pitch: 0, speed: 1 }); }
  function auMsg(t) { $('auMsg').textContent = t || ''; }

  function stopAudio() {
    if (AR) AR.stop();
    audioLoaded = '';
    $('auPlay').textContent = '▶';
  }
  function renderAudio(song) {
    var btnA = $('stAudio');
    if (!AR || !AR.supported()) { btnA.hidden = true; return; }
    if (audioShown && audioShown !== song.id) { audioShown = ''; stopAudio(); }   // trocou de música
    if (audioLoaded && audioLoaded !== song.id) stopAudio();
    var has = !!audioIds[song.id], open = audioShown === song.id;
    btnA.classList.toggle('has', has);
    btnA.setAttribute('aria-pressed', open);
    $('stAudioPanel').hidden = !open;
    if (!open) return;
    $('auEmpty').hidden = has;
    $('auFull').hidden = !has;
    var pr = prefs(song.id);
    $('auPitch').textContent = pr.pitch ? shiftLabel(pr.pitch) : 'Original';
    $('auPitch').classList.toggle('on', !!pr.pitch);
    $('auWarn').hidden = Math.abs(pr.pitch) <= 3;
    Array.prototype.forEach.call(document.querySelectorAll('#auSpeeds button'), function (b) {
      b.setAttribute('aria-pressed', Number(b.getAttribute('data-speed')) === pr.speed);
    });
    if (has && audioLoaded !== song.id && audioLoading !== song.id) loadAudio(song.id);
  }
  function loadAudio(id) {
    audioLoading = id;
    auMsg('Carregando o áudio…');
    AR.store.get(id).then(function (rec) {
      if (!rec) { delete audioIds[id]; audioLoading = ''; auMsg(''); renderAudio(cur()); return; }
      $('auName').textContent = rec.name || 'Áudio';
      return AR.load(rec.blob, prefs(id)).then(function () {
        if (audioLoading !== id) return;
        audioLoading = '';
        audioLoaded = id;
        auMsg('');
      });
    }).catch(function () {
      audioLoading = '';
      auMsg('Não foi possível abrir este arquivo de áudio. Tente outro formato (MP3 ou M4A).');
    });
  }
  function toggleAudioPanel() {
    var id = cur().id;
    if (audioShown === id) { audioShown = ''; stopAudio(); }
    else { audioShown = id; ytShown = ''; renderPlayer(cur()); }   // um player por vez
    auMsg('');
    renderAudio(cur());
  }
  function pickedAudio(file) {
    var id = cur().id;
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name)) { auMsg('Escolha um arquivo de áudio (MP3, M4A ou WAV).'); return; }
    stopAudio();
    auMsg('Guardando no aparelho…');
    AR.store.put({ id: id, name: file.name, type: file.type, size: file.size, blob: file, saved: Date.now() }).then(function () {
      audioIds[id] = 1;
      auMsg('');
      renderAudio(cur());
    }, function () { auMsg('Não foi possível guardar o áudio neste aparelho (pode faltar espaço).'); });
  }
  if (AR) {
    AR.on('time', function (t) {
      if (!seeking) $('auSeek').value = t.duration ? Math.round(1000 * t.time / t.duration) : 0;
      $('auTime').textContent = fmtTime(t.time) + ' / ' + fmtTime(t.duration);
    });
    AR.on('state', function (on) { $('auPlay').textContent = on ? '❚❚' : '▶'; $('auPlay').setAttribute('aria-label', on ? 'Pausar' : 'Tocar'); });
  }

  function closeStage(fromHistory) {
    if (!stageOn) return;
    ytShown = '';
    audioShown = '';
    stopAudio();
    renderPlayer({ youtube: '' });
    stageOn = false;
    document.body.classList.remove('stage-on');
    $('stage').hidden = true;
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* já solto */ } wakeLock = null; }
    if (isPhone()) setTab('list');
    if (stagePlay) { listMode = 'sets'; openSet = stagePlay.set; renderList(); }
    if (!fromHistory) { try { if (history.state && history.state.stage) history.back(); } catch (e) { /* sem histórico */ } }
    fitZoom();
  }

  /* ---------- grupo online (Firebase) ---------- */

  var saveTimers = {}, inflight = {}, online = false, joining = false, retryTimer = null;

  function inGroup() { return !!db.group && Cloud.configured(); }
  function pendingCount() { return db.songs.filter(function (s) { return s.pending; }).length; }

  // Grava no grupo pouco depois da última alteração; até a confirmação a música fica "pendente".
  function queueSave(s) {
    if (!inGroup() || !canEdit()) return;
    s.pending = true;
    clearTimeout(saveTimers[s.id]);
    saveTimers[s.id] = setTimeout(function () { pushSong(s); }, 700);
    showCloud();
  }
  function pushSong(s) {
    delete saveTimers[s.id];
    if (!Cloud.connected() || inflight[s.id]) return;   // vai na próxima conexão / já está a caminho
    var at = s.updated;
    inflight[s.id] = true;
    // o set() do Firebase avisa a própria lista na hora; inflight evita regravar em seguida
    Cloud.saveSong(s).then(function () {
      delete inflight[s.id];
      if (s.updated === at) { delete s.pending; save(); } else if (!saveTimers[s.id]) pushSong(s);
      showCloud();
    }, function () {
      delete inflight[s.id];
      toast('O grupo recusou a gravação de "' + (s.title || 'Sem título') + '".');
      showCloud();
    });
  }
  function flushPending() {
    db.songs.forEach(function (s) { if (s.pending && !saveTimers[s.id] && !inflight[s.id]) pushSong(s); });
  }

  // Junta a lista do grupo com o que ainda não foi confirmado neste aparelho.
  function mergeRemote(list) {
    var before = cur(), local = {}, ids = {};
    db.songs.forEach(function (s) { local[s.id] = s; });
    var out = list.map(function (r) {
      var l = local[r.id];
      ids[r.id] = 1;
      return l && l.pending ? l : fixSong(r);
    });
    db.songs.forEach(function (l) {
      if (!ids[l.id] && (l.pending || (l.draft && l.id === db.current))) out.push(l);
    });
    if (!out.length) out.push(blankSong());
    db.songs = out;
    var now = db.songs.filter(function (s) { return s.id === db.current; })[0];
    if (!now) { db.current = db.songs[0].id; sel = null; fillForm(); }
    else if (now !== before) refreshForm();
    save();
    renderList();
    renderSoon();
  }
  // Atualiza o editor com a versão que chegou do grupo sem tirar o cursor do lugar.
  function refreshForm() {
    var ta = $('text'), a = ta.selectionStart, b = ta.selectionEnd, focused = document.activeElement === ta;
    fillForm();
    if (focused) { ta.selectionStart = Math.min(a, ta.value.length); ta.selectionEnd = Math.min(b, ta.value.length); }
  }

  function showCloud() {
    var btn = $('btnGroup'), saved = $('saved');
    btn.classList.toggle('is-on', inGroup());
    btn.classList.toggle('is-off', inGroup() && !online);
    if (!inGroup()) {
      btn.textContent = 'Grupo';
      btn.title = 'Guardar as músicas online e compartilhar com o grupo';
      if (!memoryOnly) saved.textContent = 'Salvo neste navegador';
      return;
    }
    btn.textContent = '● ' + db.group + ' · ' + (db.role === 'editor' ? 'Editor' : 'Músico');
    btn.title = online ? 'Conectado ao grupo' : 'Sem conexão com o grupo';
    var n = pendingCount();
    saved.textContent = !online
      ? (n ? 'Sem conexão: ' + n + ' alteração(ões) guardada(s) neste aparelho' : 'Sem conexão: mostrando a última cópia do grupo')
      : (n ? 'Enviando ao grupo…' : 'Salvo no grupo');
  }

  var cloudHandlers = {
    onSongs: function (list) { mergeRemote(list); flushPending(); showCloud(); },
    onSetlists: function (list) { mergeRemoteSets(list); flushSets(); },
    onStatus: function (on) { online = on; if (on) { flushPending(); flushSets(); } showCloud(); },
    onError: function (e) { online = false; showCloud(); scheduleRetry(); }
  };

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { if (inGroup() && !Cloud.connected()) connectGroup(); }, 30000);
  }
  // Conexão ao abrir o Cifrador já dentro de um grupo.
  function connectGroup() {
    if (!inGroup()) return;
    Cloud.connect(db.group, cloudHandlers).catch(function (e) {
      online = false;
      if (e.message === 'denied') {
        toast('O código "' + db.group + '" não dá mais acesso ao grupo. As músicas do grupo ficaram guardadas neste aparelho.');
        leaveGroup(true, true);
      } else { showCloud(); scheduleRetry(); }
    });
  }

  // Ao virar editor, oferece enviar ao grupo as músicas e repertórios que já estavam neste aparelho.
  function offerUpload() {
    var personal = db.personal || [], personalSets = db.personalSets || [];
    var mine = personal.filter(function (s) {
      return s.text.trim() && !db.songs.some(function (g) { return g.id === s.id; });
    });
    if (!mine.length || !window.confirm('Enviar também as ' + mine.length + ' música(s) deste aparelho para o grupo?')) return;
    mine.forEach(function (s) {
      var copy = fixSong(clone(s));
      db.songs.push(copy);
      queueSave(copy);
    });
    db.songs = db.songs.filter(function (s) { return !(s.draft && !s.text.trim()); });
    if (!db.songs.some(function (s) { return s.id === db.current; })) db.current = db.songs[0].id;
    personalSets.forEach(function (r) {   // os repertórios deste aparelho vão junto
      if (db.setlists.some(function (g) { return g.id === r.id; })) return;
      var copy = fixSetlist(clone(r));
      db.setlists.push(copy);
      persistSet(copy);
    });
    save(); fillForm(); renderList(); render();
  }

  function joinGroup(code, wantEditor, pass) {
    if (joining) return;
    var msg = $('gMsg'), previous = db.group;
    code = code.trim().toLowerCase();
    if (!Cloud.validCode(code)) { msg.textContent = 'O código deve ter de 6 a 60 letras, números, - ou _ (sem espaços).'; return; }
    if (previous === code) { $('groupDlg').close(); return; }
    if (previous) leaveGroup(true);
    joining = true;
    msg.textContent = 'Conectando…';
    var personal = db.songs, personalSets = db.setlists || [];
    db.personal = personal;
    db.personalSets = personalSets;
    db.setlists = [];
    db.group = code;
    db.songs = personal.map(function (s) { return Object.assign({}, s); });   // cópia até chegar a lista do grupo
    db.songs.forEach(function (s) { delete s.pending; delete s.draft; });
    Cloud.connect(code, cloudHandlers).then(function () {
      joining = false;
      online = true;
      db.role = 'musico';   // todo aparelho entra como músico; editor só com a senha
      save();
      applyRole();
      toast('Conectado ao grupo "' + code + '".');
      showCloud();
      if (wantEditor) {
        afterEditor = offerUpload;
        dlgMode = 'becomeEditor';
        renderGroupDlg();
        becomeEditor(pass);
      } else $('groupDlg').close();
    }, function (e) {
      joining = false;
      db.group = previous || '';
      db.songs = personal;
      db.setlists = personalSets;
      delete db.personal;
      delete db.personalSets;
      save();
      msg.textContent = e.message === 'denied' ? 'Código não encontrado. Confira com quem criou o grupo.'
        : e.message === 'code' ? 'Código inválido.'
        : 'Não foi possível conectar. Verifique a internet e tente de novo.';
      showCloud();
    });
  }

  // keep: guarda neste aparelho uma cópia das músicas do grupo (junto das pessoais).
  function leaveGroup(silent, keep) {
    var group = db.songs.filter(function (s) { return !(s.draft && !s.text.trim()); });
    if (!silent) {
      keep = group.length > 0 && window.confirm('Guardar neste aparelho uma cópia das ' + group.length +
        ' música(s) e dos repertórios do grupo? Assim eles continuam disponíveis depois de sair.');
      var n = pendingCount();
      if (!keep && n && !window.confirm(n + ' alteração(ões) ainda não chegaram ao grupo e serão perdidas. Sair mesmo assim?')) return false;
    }
    Object.keys(saveTimers).forEach(function (id) { clearTimeout(saveTimers[id]); });
    saveTimers = {};
    inflight = {};
    Cloud.disconnect();
    online = false;
    db.group = '';
    delete db.role;
    var mine = (db.personal || []).slice();
    if (keep || !mine.length) {
      group.forEach(function (g) {
        g = Object.assign({}, g);
        delete g.pending; delete g.draft;
        var i = mine.map(function (m) { return m.id; }).indexOf(g.id);
        if (i >= 0) mine[i] = g; else mine.push(g);   // a versão do grupo substitui a cópia antiga
      });
    }
    if (!mine.length) mine.push(blankSong());
    db.songs = mine;
    delete db.personal;
    var mySets = (db.personalSets || []).slice();
    if (keep) {
      (db.setlists || []).forEach(function (g) {
        g = fixSetlist(g);
        delete g.pending;
        var i = mySets.map(function (m) { return m.id; }).indexOf(g.id);
        if (i >= 0) mySets[i] = g; else mySets.push(g);
      });
    }
    db.setlists = mySets;
    delete db.personalSets;
    openSet = null;
    stagePlay = null;
    if (!db.songs.some(function (s) { return s.id === db.current; })) db.current = db.songs[0].id;
    sel = null;
    save(); fillForm(); renderList(); render(); showCloud();
    applyRole();
    return true;
  }

  /* ---------- perfis: músico (só vê) e editor (acesso total) ---------- */

  function canEdit() { return !inGroup() || db.role === 'editor'; }
  function applyRole() {
    var mus = !canEdit();
    document.body.classList.toggle('role-musico', mus);
    if (mus) {
      sel = null;
      if (document.body.getAttribute('data-tab') === 'edit') setTab('view');
    }
    renderList();
    render();
    showCloud();
  }
  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function editorHash(pass) { return sha256('cifrador:' + db.group + ':' + pass); }

  var dlgMode = 'join', afterEditor = null;
  function roleChoice() { var r = document.querySelector('input[name=gRole]:checked'); return r ? r.value : 'musico'; }

  function becomeEditor(pass) {
    var msg = $('gMsg');
    if (!pass) { msg.textContent = 'Digite a senha de editor.'; $('gPass').focus(); return; }
    msg.textContent = 'Conferindo…';
    Cloud.getEditorHash().then(function (h) {
      if (!h) {
        dlgMode = 'newPassword';
        renderGroupDlg('Este grupo ainda não tem senha de editor. Crie uma agora: ela vale para todos os editores do grupo.');
        return;
      }
      return editorHash(pass).then(function (mine) {
        if (mine !== h) { msg.textContent = 'Senha incorreta.'; $('gPass').select(); return; }
        setRole('editor');
      });
    }).catch(function () { msg.textContent = 'Não foi possível conferir a senha. Verifique a internet.'; });
  }
  function setRole(r) {
    db.role = r;
    save();
    applyRole();
    if (r === 'editor') {
      $('groupDlg').close();
      toast('Edição liberada neste aparelho.');
      var f = afterEditor;
      afterEditor = null;
      if (f) f();
    }
  }
  function savePassword() {
    var a = $('gPass').value, b = $('gPass2').value, msg = $('gMsg'), creating = dlgMode === 'newPassword';
    if (a.length < 4) { msg.textContent = 'Use pelo menos 4 caracteres.'; return; }
    if (a !== b) { msg.textContent = 'As duas senhas não são iguais.'; return; }
    msg.textContent = 'Salvando…';
    editorHash(a).then(Cloud.setEditorHash).then(function () {
      if (creating) setRole('editor');
      else { $('groupDlg').close(); toast('Senha de editor trocada.'); }
    }, function () { msg.textContent = 'Não foi possível salvar a senha. Confira a internet e se as regras do banco foram atualizadas.'; });
  }

  function renderGroupDlg(info) {
    var ok = Cloud.configured(), m = dlgMode, editor = db.role === 'editor';
    function show(id, on) { $(id).hidden = !on; }
    $('gInfo').textContent = info || (!ok
      ? 'O banco online ainda não foi configurado neste Cifrador. Enquanto isso, as músicas ficam guardadas só neste navegador.'
      : m === 'join' ? 'Com o código do grupo, as músicas ficam guardadas online e todos que usam o mesmo código veem as mesmas músicas.'
      : m === 'member' ? 'Você está no grupo "' + db.group + '" como ' + (editor
          ? 'editor: pode criar e alterar músicas e repertórios.'
          : 'músico: vê as músicas, usa o modo palco e imprime, sem alterar nada.') +
        ' As músicas pessoais deste aparelho voltam quando você sair do grupo.'
      : m === 'becomeEditor' ? 'Digite a senha de editor do grupo para liberar a edição neste aparelho.'
      : m === 'changePassword' ? 'Escolha a nova senha de editor. Ela passa a valer para todos os editores do grupo.' : '');
    show('gCodeBox', m === 'join');
    show('gRoleBox', m === 'join' && ok);
    var pass = (m === 'join' && roleChoice() === 'editor') || m === 'becomeEditor' || m === 'newPassword' || m === 'changePassword';
    var twice = m === 'newPassword' || m === 'changePassword';
    show('gPassBox', pass && ok);
    show('gPass2Box', twice);
    $('gPassLabel').textContent = twice ? 'Nova senha de editor' : 'Senha de editor';
    show('gLeave', m === 'member');
    show('gRole', m === 'member');
    $('gRole').textContent = editor ? 'Usar como músico' : 'Entrar como editor';
    show('gChangePw', m === 'member' && editor);
    show('gJoin', m !== 'member');
    $('gJoin').textContent = m === 'join' ? 'Entrar' : m === 'becomeEditor' ? 'Confirmar' : m === 'newPassword' ? 'Criar senha' : 'Salvar senha';
    $('gJoin').disabled = !ok;
    $('gCode').disabled = !ok;
  }

  function openGroupDialog() {
    var dlg = $('groupDlg');
    dlgMode = db.group ? 'member' : 'join';
    afterEditor = null;
    $('gCode').value = db.group || '';
    $('gPass').value = '';
    $('gPass2').value = '';
    $('gMsg').textContent = '';
    renderGroupDlg();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (Cloud.configured() && !db.group) $('gCode').focus();
  }
  function groupAction() {
    var m = dlgMode;
    if (m === 'join') joinGroup($('gCode').value, roleChoice() === 'editor', $('gPass').value);
    else if (m === 'becomeEditor') becomeEditor($('gPass').value);
    else savePassword();
  }

  /* ---------- lista ---------- */

  var listMode = 'songs', openSet = null;   // a lista mostra músicas ou repertórios
  function songById(id) { return db.songs.filter(function (s) { return s.id === id; })[0]; }
  function setById(id) { return (db.setlists || []).filter(function (r) { return r.id === id; })[0]; }
  function setSongs(r) { return r.musicas.map(songById).filter(Boolean); }
  function fmtDate(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : 'Sem data'; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function renderList() {
    var sets = listMode === 'sets';
    $('segSongs').setAttribute('aria-selected', !sets);
    $('segSets').setAttribute('aria-selected', sets);
    $('search').hidden = sets;
    $('songList').hidden = sets;
    $('setPane').hidden = !sets;
    if (sets) { renderSets(); return; }
    var q = $('search').value.trim().toLowerCase(), ul = $('songList');
    ul.textContent = '';
    var songs = db.songs.slice().sort(function (a, b) {
      return (a.title || 'Sem título').localeCompare(b.title || 'Sem título', 'pt-BR', { sensitivity: 'base' });
    }).filter(function (s) {
      if (s.draft && !s.title.trim() && !s.text.trim()) return false;   // nova e ainda vazia
      return !q || (s.title + ' ' + s.artist).toLowerCase().indexOf(q) >= 0;
    });
    if (!songs.length && q) { ul.appendChild(el('li', 'empty', 'Nenhuma música encontrada.')); return; }
    if (!songs.length) {
      var li0 = el('li', 'empty');
      li0.appendChild(el('p', '', inGroup() ? 'O grupo ainda não tem músicas.' : 'Nenhuma música por aqui ainda.'));
      if (!inGroup() && Cloud.configured()) {
        var g = el('button', 'primary', 'Entrar no grupo');
        g.type = 'button';
        g.addEventListener('click', openGroupDialog);
        li0.appendChild(g);
      }
      if (canEdit()) {
        var nb = el('button', '', 'Nova música');
        nb.type = 'button';
        nb.addEventListener('click', function () { $('btnNew').click(); });
        li0.appendChild(nb);
      }
      ul.appendChild(li0);
      return;
    }
    songs.forEach(function (s) {
      var li = el('li'), b = el('button');
      b.type = 'button';
      b.setAttribute('aria-current', s.id === db.current ? 'true' : 'false');
      b.appendChild(el('span', 't', s.title || 'Sem título'));
      if (s.artist) b.appendChild(el('span', 'a', s.artist));
      b.addEventListener('click', function () { stagePlay = null; select(s.id); setTab('view'); if (isPhone()) openStage(); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function btn(text, cls, fn, label) {
    var b = el('button', cls || '', text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }

  function renderSets() {
    var pane = $('setPane'), list = db.setlists || [];
    pane.textContent = '';
    var r = openSet && setById(openSet);
    if (!r) {
      openSet = null;
      if (canEdit()) pane.appendChild(btn('+ Novo repertório', 'primary set-new', function () { openSetDialog(null); }));
      if (!list.length) {
        pane.appendChild(el('p', 'set-empty', !canEdit() ? 'O grupo ainda não tem repertórios.'
          : 'Monte a lista de músicas de um culto ou ensaio, na ordem em que serão tocadas.' + (inGroup() ? ' Todos do grupo veem os repertórios.' : '')));
        return;
      }
      var ul = el('ul', 'set-list'), now = today();
      list.slice().sort(function (a, b) { return (b.data || '').localeCompare(a.data || '') || a.nome.localeCompare(b.nome, 'pt-BR'); })
        .forEach(function (x) {
          var li = el('li'), b = btn('', 'set-card' + (x.data && x.data < now ? ' past' : ''), function () { openSet = x.id; renderSets(); });
          b.appendChild(el('span', 't', x.nome || 'Sem nome'));
          b.appendChild(el('span', 'a', fmtDate(x.data) + ' · ' + x.musicas.length + (x.musicas.length === 1 ? ' música' : ' músicas')));
          li.appendChild(b);
          ul.appendChild(li);
        });
      pane.appendChild(ul);
      return;
    }
    pane.appendChild(btn('‹ Repertórios', 'set-back', function () { openSet = null; renderSets(); }));
    var head = el('div', 'set-head');
    head.appendChild(el('h3', '', r.nome || 'Sem nome'));
    head.appendChild(el('span', 'a', fmtDate(r.data)));
    pane.appendChild(head);
    var acts = el('div', 'set-acts'), songs = setSongs(r);
    var play = btn('▶ Tocar', 'primary', function () { playSet(r.id, 0); });
    play.disabled = !songs.length;
    acts.appendChild(play);
    if (canEdit()) {
      acts.appendChild(btn('Editar', '', function () { openSetDialog(r); }));
      acts.appendChild(btn('Excluir', 'danger', function () { deleteSet(r); }));
    }
    pane.appendChild(acts);
    if (!songs.length) { pane.appendChild(el('p', 'set-empty', 'Nenhuma música ainda. Toque em "Editar" para adicionar.')); return; }
    var ol = el('ol', 'set-songs');
    songs.forEach(function (s, i) {
      var li = el('li'), b = btn('', '', function () { playSet(r.id, i); });
      b.appendChild(el('span', 'n', String(i + 1)));
      var t = el('span', 'tt');
      t.appendChild(el('span', 't', s.title || 'Sem título'));
      if (s.artist) t.appendChild(el('span', 'a', s.artist));
      b.appendChild(t);
      if (s.key) b.appendChild(el('span', 'k', s.key));
      li.appendChild(b);
      ol.appendChild(li);
    });
    pane.appendChild(ol);
    var missing = r.musicas.length - songs.length;
    if (missing) pane.appendChild(el('p', 'set-empty', missing + ' música(s) deste repertório foram excluídas.'));
  }

  /* ---------- repertório: tocar em sequência ---------- */

  var stagePlay = null;   // { set, idx } quando o palco foi aberto por um repertório
  function playSet(id, idx) {
    var r = setById(id), songs = r ? setSongs(r) : [];
    if (!songs.length) return;
    idx = Math.max(0, Math.min(idx, songs.length - 1));
    stagePlay = { set: id, idx: idx };
    select(songs[idx].id);
    setTab('view');
    openStage();
    $('stBody').scrollTop = 0;
  }
  function stepSet(d) {
    if (!stagePlay) return;
    var r = setById(stagePlay.set), songs = r ? setSongs(r) : [], i = stagePlay.idx + d;
    if (i < 0 || i >= songs.length) return;
    stagePlay.idx = i;
    select(songs[i].id);
    $('stBody').scrollTop = 0;
    renderStage();
  }
  function renderSetBar() {
    var bar = $('stSetBar'), r = stagePlay && setById(stagePlay.set), songs = r ? setSongs(r) : [];
    if (!r || !songs.length) { stagePlay = null; bar.hidden = true; return; }
    var i = songs.map(function (s) { return s.id; }).indexOf(cur().id);
    if (i < 0) { bar.hidden = true; return; }   // abriu outra música fora do repertório
    stagePlay.idx = i;
    bar.hidden = false;
    $('stSetPos').textContent = (r.nome || 'Repertório') + ' · ' + (i + 1) + ' de ' + songs.length;
    $('stSetNext').textContent = i + 1 < songs.length ? 'Próxima: ' + (songs[i + 1].title || 'Sem título') : 'Última música';
    $('stPrev').disabled = i === 0;
    $('stNext').disabled = i + 1 >= songs.length;
  }

  /* ---------- repertório: montar e editar ---------- */

  var setDraft = null;
  function openSetDialog(r) {
    if (!canEdit()) return;
    setDraft = r ? clone(r) : fixSetlist({ nome: '', data: today(), musicas: [] });
    setDraft.isNew = !r;
    $('sTitle').textContent = r ? 'Editar repertório' : 'Novo repertório';
    $('sName').value = setDraft.nome;
    $('sDate').value = setDraft.data;
    $('sFind').value = '';
    $('sMsg').textContent = '';
    renderSetItems();
    renderSetFound();
    var dlg = $('setDlg');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (!r) $('sName').focus();
  }
  function renderSetItems() {
    var ol = $('sItems');
    ol.textContent = '';
    if (!setDraft.musicas.length) { ol.appendChild(el('li', 'set-none', 'Nenhuma música ainda. Busque abaixo para adicionar.')); return; }
    setDraft.musicas.forEach(function (id, i) {
      var s = songById(id), li = el('li');
      li.appendChild(el('span', 'n', String(i + 1)));
      li.appendChild(el('span', 't', s ? (s.title || 'Sem título') + (s.key ? '  ·  ' + s.key : '') : '(música excluída)'));
      var up = btn('↑', '', function () { moveItem(i, -1); }, 'Subir'), dn = btn('↓', '', function () { moveItem(i, 1); }, 'Descer');
      up.disabled = i === 0;
      dn.disabled = i === setDraft.musicas.length - 1;
      li.appendChild(up);
      li.appendChild(dn);
      li.appendChild(btn('✕', 'danger', function () { setDraft.musicas.splice(i, 1); renderSetItems(); renderSetFound(); }, 'Tirar do repertório'));
      ol.appendChild(li);
    });
  }
  function moveItem(i, d) {
    var m = setDraft.musicas, j = i + d;
    if (j < 0 || j >= m.length) return;
    var t = m[i]; m[i] = m[j]; m[j] = t;
    renderSetItems();
  }
  function renderSetFound() {
    var q = $('sFind').value.trim().toLowerCase(), ul = $('sFound');
    ul.textContent = '';
    var found = db.songs.filter(function (s) {
      if (s.draft && !s.title.trim() && !s.text.trim()) return false;
      return !q || (s.title + ' ' + s.artist).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (a.title || '').localeCompare(b.title || '', 'pt-BR', { sensitivity: 'base' }); });
    if (!found.length) { ul.appendChild(el('li', 'set-none', db.songs.length ? 'Nenhuma música encontrada.' : 'Nenhuma música cadastrada.')); return; }
    found.slice(0, 60).forEach(function (s) {
      var inSet = setDraft.musicas.indexOf(s.id) >= 0, li = el('li');
      var b = btn('', inSet ? 'in' : '', function () { setDraft.musicas.push(s.id); renderSetItems(); renderSetFound(); });
      b.appendChild(el('span', 't', s.title || 'Sem título'));
      b.appendChild(el('span', 'a', (s.artist ? s.artist + ' · ' : '') + (inSet ? 'já está na lista · adicionar de novo' : '+ adicionar')));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  function saveSetDialog() {
    var nome = $('sName').value.trim();
    if (!nome) { $('sMsg').textContent = 'Dê um nome ao repertório.'; $('sName').focus(); return; }
    var isNew = setDraft.isNew;
    delete setDraft.isNew;
    setDraft.nome = nome;
    setDraft.data = $('sDate').value || '';
    var r = fixSetlist(setDraft), list = db.setlists || (db.setlists = []);
    var i = list.map(function (x) { return x.id; }).indexOf(r.id);
    if (i >= 0) list[i] = r; else list.push(r);
    persistSet(r);
    $('setDlg').close();
    openSet = r.id;
    listMode = 'sets';
    renderList();
    if (stageOn) renderStage();
    toast(isNew ? 'Repertório criado.' : 'Repertório salvo.');
  }
  function deleteSet(r) {
    if (!canEdit()) return;
    var who = inGroup() ? ' para todos do grupo' : '';
    if (!window.confirm('Excluir o repertório "' + (r.nome || 'Sem nome') + '"' + who + '? As músicas continuam guardadas.')) return;
    db.setlists = db.setlists.filter(function (x) { return x.id !== r.id; });
    if (inGroup()) Cloud.removeSetlist(r.id).catch(function () { toast('Sem conexão: a exclusão não chegou ao grupo.'); });
    openSet = null;
    save();
    renderList();
  }

  // Grava o repertório (no grupo, quando houver); até a confirmação ele fica "pendente".
  function persistSet(r) {
    if (!canEdit()) return;
    r.updated = Date.now();
    if (inGroup()) { r.pending = true; pushSet(r); }
    save();
  }
  var setInflight = {};
  function pushSet(r) {
    if (!Cloud.connected() || setInflight[r.id]) return;
    var at = r.updated;
    setInflight[r.id] = true;
    Cloud.saveSetlist(r).then(function () {
      delete setInflight[r.id];
      if (r.updated === at) { delete r.pending; save(); } else pushSet(r);
    }, function () {
      delete setInflight[r.id];
      toast('O grupo recusou o repertório "' + (r.nome || 'Sem nome') + '".');
    });
  }
  function mergeRemoteSets(list) {
    var local = {}, ids = {};
    (db.setlists || []).forEach(function (r) { local[r.id] = r; });
    var out = list.map(function (x) {
      ids[x.id] = 1;
      var l = local[x.id];
      return l && l.pending ? l : fixSetlist(x);
    });
    (db.setlists || []).forEach(function (l) { if (!ids[l.id] && l.pending) out.push(l); });
    db.setlists = out;
    save();
    if (listMode === 'sets') renderList();
    if (stageOn) renderSetBar();
  }
  function flushSets() {
    (db.setlists || []).forEach(function (r) { if (r.pending) pushSet(r); });
  }

  function fillForm() {
    var s = cur(), o = s.opts;
    $('fTitle').value = s.title; $('fArtist').value = s.artist; $('fKey').value = s.key;
    $('fCapo').value = s.capo; $('fTempo').value = s.tempo; $('fYoutube').value = s.youtube; $('text').value = s.text;
    $('oCols').value = o.cols; $('oFont').value = o.font; $('oColor').value = o.color;
    $('oMargin').value = o.margin; $('oRepeats').value = o.repeats; $('oNotes').value = o.notes; $('oAcc').value = o.acc;
    $('oTetrads').checked = !!o.tetrads; $('oMemos').value = o.memos;
  }
  function select(id) {
    db.current = id;
    sel = null;
    save(); fillForm(); renderList(); render();
  }
  function touch() {
    if (!canEdit()) { renderSoon(); return; }   // músico: nada é gravado
    var s = cur();
    s.updated = Date.now();
    delete s.draft;
    queueSave(s);
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

  // draft: música nova e vazia no grupo; só vai para o banco quando for editada.
  function addSongs(list, draft) {
    list.forEach(function (s) {
      db.songs.push(s);
      if (draft) s.draft = true; else queueSave(s);
    });
    select(list[list.length - 1].id);
  }

  function transpose(n) {
    if (!canEdit()) return;
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
    var re = /\S+/g, m, tok = null, limit = Music.chordPart(line).length;   // não mexe na anotação
    while ((m = re.exec(line))) if (m.index < limit && m.index <= col && col <= m.index + m[0].length) { tok = m; break; }
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
    var isNotes = /\s$/.test(snippet), emptyLine = !v.slice(ls, le).trim();
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
          if (old) { Object.assign(old, s); queueSave(old); return null; }   // mesma música: atualiza
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
  bindField('fCapo', 'capo'); bindField('fTempo', 'tempo'); bindField('fYoutube', 'youtube'); bindField('text', 'text');
  bindOpt('oCols', 'cols', true); bindOpt('oFont', 'font'); bindOpt('oColor', 'color');
  bindOpt('oMargin', 'margin', true); bindOpt('oRepeats', 'repeats'); bindOpt('oNotes', 'notes'); bindOpt('oAcc', 'acc'); bindOpt('oMemos', 'memos');

  // Depois de digitar ou transpor, o "Desfazer" da folha não pode trazer um texto antigo de volta.
  $('text').addEventListener('input', function () { undoStack.length = 0; applySel(); });

  // Colchetes de seção: "[" já fecha com "]"; e o "~" que alguns teclados brasileiros
  // soltam antes do "]" (tecla de acento) é descartado na linha da seção.
  $('text').addEventListener('beforeinput', function (e) {
    if (e.inputType !== 'insertText' || !e.data) return;
    var ta = this, v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    var ls = v.lastIndexOf('\n', a - 1) + 1, before = v.slice(ls, a);
    var close = /^~?\]$/.test(e.data), sectionLine = /^\s*\[[^\]]*$/.test(before.replace(/~$/, ''));
    if (e.data === '[' && a === b && !/\S/.test(v.charAt(a) || '')) {
      e.preventDefault();
      ta.setRangeText('[]', a, b, 'start');
      ta.selectionStart = ta.selectionEnd = a + 1;
    } else if (close && sectionLine) {
      e.preventDefault();
      var from = /~$/.test(before) ? a - 1 : a;   // tira o "~" que veio junto
      if (v.charAt(b) === ']') { ta.setRangeText('', from, a, 'end'); ta.selectionStart = ta.selectionEnd = from + 1; }
      else ta.setRangeText(']', from, b, 'end');
    } else return;
    cur().text = ta.value;
    undoStack.length = 0;
    touch();
  });

  $('text').addEventListener('keydown', function (e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault(); // Alt + seta também é "voltar" no navegador
      nudge(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  // Trocar um acorde por outro em toda a música (ex.: Cmaj9 → C(9)).
  function openReplace() {
    if (!canEdit()) return;
    var list = Music.chordCounts(cur().text), sel0 = $('rFrom');
    sel0.textContent = '';
    list.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.name;
      o.textContent = c.name + '  (' + c.count + (c.count === 1 ? ' vez)' : ' vezes)');
      sel0.appendChild(o);
    });
    $('rMsg').textContent = list.length ? '' : 'Esta música ainda não tem acordes.';
    $('rTo').value = '';
    $('rOk').disabled = !list.length;
    var dlg = $('repDlg');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (list.length) $('rTo').focus();
  }
  function doReplace() {
    var from = $('rFrom').value, to = $('rTo').value.trim(), msg = $('rMsg');
    if (!from) return;
    if (!to) { msg.textContent = 'Digite o acorde novo.'; $('rTo').focus(); return; }
    if (/\s/.test(to) || !Music.isChord(to)) { msg.textContent = '"' + to + '" não parece um acorde. Exemplos: C(9), F#m7, Bb7M, D/F#.'; $('rTo').focus(); return; }
    var r = Music.replaceChord(cur().text, from, to);
    if (!r.count) { msg.textContent = 'Nada para trocar.'; return; }
    commit(r.text);   // entra no "Desfazer" da paleta
    $('repDlg').close();
    toast(from + ' → ' + to + ': ' + r.count + (r.count === 1 ? ' troca.' : ' trocas.'));
  }
  $('btnReplace').addEventListener('click', openReplace);
  $('rOk').addEventListener('click', doReplace);
  $('rCancel').addEventListener('click', function () { $('repDlg').close(); });
  $('rTo').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doReplace(); } });

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
    if (!canEdit()) return;
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

  $('btnTools').addEventListener('click', function () {
    var open = document.body.classList.toggle('tools-open');
    this.setAttribute('aria-expanded', open);
    this.textContent = open ? 'Menos ▴' : 'Mais ▾';
  });
  $('btnStage').addEventListener('click', openStage);
  $('btnGroup').addEventListener('click', openGroupDialog);
  $('segSongs').addEventListener('click', function () { listMode = 'songs'; renderList(); });
  $('segSets').addEventListener('click', function () { listMode = 'sets'; renderList(); });
  $('sFind').addEventListener('input', renderSetFound);
  $('sSave').addEventListener('click', saveSetDialog);
  $('sCancel').addEventListener('click', function () { $('setDlg').close(); });
  $('sName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveSetDialog(); } });
  $('stPrev').addEventListener('click', function () { stepSet(-1); });
  $('stNext').addEventListener('click', function () { stepSet(1); });
  // pedais de virar página costumam enviar as setas ou Page Up/Down
  document.addEventListener('keydown', function (e) {
    if (!stageOn || !stagePlay || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); stepSet(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepSet(-1); }
  });
  $('gJoin').addEventListener('click', groupAction);
  ['gCode', 'gPass', 'gPass2'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); groupAction(); } });
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[name=gRole]'), function (r) {
    r.addEventListener('change', function () { renderGroupDlg(); if (roleChoice() === 'editor') $('gPass').focus(); });
  });
  $('gRole').addEventListener('click', function () {
    if (db.role === 'editor') { setRole('musico'); renderGroupDlg(); toast('Este aparelho agora está como músico.'); return; }
    dlgMode = 'becomeEditor';
    $('gMsg').textContent = '';
    renderGroupDlg();
    $('gPass').focus();
  });
  $('gChangePw').addEventListener('click', function () {
    dlgMode = 'changePassword';
    $('gPass').value = ''; $('gPass2').value = ''; $('gMsg').textContent = '';
    renderGroupDlg();
    $('gPass').focus();
  });
  $('gLeave').addEventListener('click', function () { if (leaveGroup(false)) { $('groupDlg').close(); toast('Você saiu do grupo.'); } });
  $('gClose').addEventListener('click', function () { $('groupDlg').close(); });
  window.addEventListener('online', function () { if (inGroup() && !Cloud.connected()) connectGroup(); });
  $('stBack').addEventListener('click', function () { closeStage(false); });
  window.addEventListener('popstate', function () { closeStage(true); });
  $('stMore').addEventListener('click', function () { $('stMenu').hidden = !$('stMenu').hidden; });
  $('stBody').addEventListener('scroll', spyStage, { passive: true });
  $('stBody').addEventListener('click', function () { $('stMenu').hidden = true; });
  $('stNav').addEventListener('click', function (e) {
    var b = e.target.closest('.st-chip');
    if (!b) return;
    var sec = document.getElementById(b.getAttribute('data-target'));
    $('stMenu').hidden = true;
    if (sec) $('stBody').scrollTo({ top: Math.max(0, sec.offsetTop - 6), behavior: 'smooth' });
  });
  function setTheme(t) { stagePrefs().theme = t; save(); renderStage(); }
  $('stYt').addEventListener('click', function () {
    ytShown = ytShown === cur().id ? '' : cur().id;
    if (ytShown && audioShown) { audioShown = ''; stopAudio(); renderAudio(cur()); }   // um player por vez
    renderPlayer(cur());
  });
  $('stAudio').addEventListener('click', toggleAudioPanel);
  ['auClose1', 'auClose2'].forEach(function (id) { $(id).addEventListener('click', toggleAudioPanel); });
  ['auPick', 'auChange'].forEach(function (id) { $(id).addEventListener('click', function () { $('auFile').click(); }); });
  $('auFile').addEventListener('change', function () { pickedAudio(this.files[0]); this.value = ''; });
  $('auRemove').addEventListener('click', function () {
    var id = cur().id;
    if (!window.confirm('Remover o áudio desta música deste aparelho?')) return;
    stopAudio();
    AR.store.remove(id).then(function () { delete audioIds[id]; renderAudio(cur()); });
  });
  $('auPlay').addEventListener('click', function () {
    if (!AR.loaded()) return;
    if (AR.playing()) AR.pause(); else AR.play();
  });
  $('auSeek').addEventListener('input', function () { seeking = true; });
  $('auSeek').addEventListener('change', function () { seeking = false; AR.seek(this.value / 1000); });
  function auPitch(d) {
    var pr = prefs(cur().id);
    pr.pitch = Math.max(-6, Math.min(6, pr.pitch + d));
    AR.setPitch(pr.pitch);
    renderAudio(cur());
  }
  $('auDown').addEventListener('click', function () { auPitch(-1); });
  $('auUp').addEventListener('click', function () { auPitch(1); });
  $('auSpeeds').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    prefs(cur().id).speed = Number(b.getAttribute('data-speed'));
    AR.setSpeed(prefs(cur().id).speed);
    renderAudio(cur());
  });
  $('stYtClose').addEventListener('click', function () { ytShown = ''; renderPlayer(cur()); });
  $('stLight').addEventListener('click', function () { setTheme('light'); });
  $('stDark').addEventListener('click', function () { setTheme('dark'); });
  $('stChordColors').addEventListener('click', function (e) {
    var b = e.target.closest('.st-sw');
    if (!b) return;
    stagePrefs().chord = b.getAttribute('data-c');
    save(); renderStage();
  });
  function stageSize(d) {
    var p = stagePrefs();
    p.size = Math.min(34, Math.max(12, p.size + d));
    save(); renderStage();
  }
  $('stSmaller').addEventListener('click', function () { stageSize(-1); });
  $('stBigger').addEventListener('click', function () { stageSize(1); });
  function stageTranspose(d) {
    var id = cur().id, n = ((stageShift[id] || 0) + d) % 12;
    if (n > 6) n -= 12; else if (n < -6) n += 12;
    stageShift[id] = n;
    renderStage();
  }
  $('stDown').addEventListener('click', function () { stageTranspose(-1); });
  $('stUp').addEventListener('click', function () { stageTranspose(1); });
  $('stReset').addEventListener('click', function () { delete stageShift[cur().id]; renderStage(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stageOn) closeStage(false); });

  $('btnSmaller').addEventListener('click', function () { resize(-0.5); });
  $('btnBigger').addEventListener('click', function () { resize(0.5); });
  $('btnFit').addEventListener('click', fitOnePage);

  $('btnNew').addEventListener('click', function () {
    addSongs([newSong({ opts: clone(cur().opts) })], true);
    setTab('edit');
    $('fTitle').focus();
  });
  $('btnDelete').addEventListener('click', function () {
    var s = cur();
    var who = inGroup() ? ' para todos do grupo' : '';
    if (!window.confirm('Excluir "' + (s.title || 'Sem título') + '"' + who + '? Isso não pode ser desfeito.')) return;
    db.songs = db.songs.filter(function (x) { return x.id !== s.id; });
    if (inGroup() && !s.draft) {
      clearTimeout(saveTimers[s.id]);
      Cloud.removeSong(s.id).catch(function () { toast('Sem conexão: a exclusão não chegou ao grupo.'); });
    }
    if (!db.songs.length) db.songs.push(blankSong());
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
  showCloud();
  document.body.classList.toggle('role-musico', !canEdit());
  // guarda o próprio Cifrador no aparelho para abrir mesmo sem internet
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sem modo offline */ });
  }
  if (inGroup()) connectGroup();
  // no celular, começa pela lista de músicas; o palco abre ao tocar em uma música
  if (isPhone()) setTab('list');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
