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
  var EXAMPLE = [
    '[Intro]', 'C  G  Am  F', '',
    '[Verso 1]', '> Só violão e voz',
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
    '[Refrão]', '> Toda a banda, cresce', ''
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
  function lineEl(l, o) {
    var core = lineCore(l, o);
    if (!l.memo || l.t === 'memo' || o.memos === 'hide') return core;
    var row = el('div', 'line-row');
    row.appendChild(core);
    row.appendChild(el('span', 'memo side', l.memo));
    return row;
  }

  function lineCore(l, o) {
    if (l.t === 'memo') return el('div', 'line memo', l.text);
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

  function renderStage() {
    var song = cur(), prefs = stagePrefs(), stage = $('stage'), body = $('stBody'), nav = $('stNav');
    var keep = body.scrollTop, o = { notes: song.opts.notes, plain: true };
    stage.setAttribute('data-theme', prefs.theme);
    stage.setAttribute('data-chord', prefs.chord);
    Array.prototype.forEach.call(document.querySelectorAll('.st-sw'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-c') === prefs.chord);
    });
    body.style.setProperty('--fs', prefs.size + 'px');
    body.style.setProperty('--cf', FONTS[song.opts.font] || FONTS.sans);
    $('stTitle').textContent = song.title || 'Sem título';
    $('stKey').textContent = song.key || '—';
    $('stKey').hidden = !song.key;
    $('stLight').setAttribute('aria-pressed', prefs.theme === 'light');
    $('stDark').setAttribute('aria-pressed', prefs.theme === 'dark');
    body.textContent = '';
    nav.textContent = '';

    var info = [];
    if (song.artist) info.push(song.artist);
    if (song.capo && song.capo !== '0') info.push('Capotraste na ' + song.capo + 'ª casa');
    if (song.tempo) info.push(song.tempo + ' bpm');
    if (info.length) body.appendChild(el('div', 'st-info', info.join('  ·  ')));

    Music.parse(song.text).sections.forEach(function (s, i) {
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
    nav.hidden = !nav.firstChild;
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
  function closeStage(fromHistory) {
    if (!stageOn) return;
    stageOn = false;
    document.body.classList.remove('stage-on');
    $('stage').hidden = true;
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* já solto */ } wakeLock = null; }
    if (isPhone()) setTab('list');
    if (!fromHistory) { try { if (history.state && history.state.stage) history.back(); } catch (e) { /* sem histórico */ } }
    fitZoom();
  }

  /* ---------- grupo online (Firebase) ---------- */

  var saveTimers = {}, inflight = {}, online = false, joining = false, retryTimer = null;

  function inGroup() { return !!db.group && Cloud.configured(); }
  function pendingCount() { return db.songs.filter(function (s) { return s.pending; }).length; }

  // Grava no grupo pouco depois da última alteração; até a confirmação a música fica "pendente".
  function queueSave(s) {
    if (!inGroup()) return;
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
    if (!out.length) out.push(newSong({ draft: true }));
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
    btn.textContent = '● ' + db.group;
    btn.title = online ? 'Conectado ao grupo' : 'Sem conexão com o grupo';
    var n = pendingCount();
    saved.textContent = !online
      ? (n ? 'Sem conexão: ' + n + ' alteração(ões) guardada(s) neste aparelho' : 'Sem conexão: mostrando a última cópia do grupo')
      : (n ? 'Enviando ao grupo…' : 'Salvo no grupo');
  }

  var cloudHandlers = {
    onSongs: function (list) { mergeRemote(list); flushPending(); showCloud(); },
    onStatus: function (on) { online = on; if (on) flushPending(); showCloud(); },
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

  function joinGroup(code) {
    if (joining) return;
    var msg = $('gMsg'), previous = db.group;
    code = code.trim().toLowerCase();
    if (!Cloud.validCode(code)) { msg.textContent = 'O código deve ter de 6 a 60 letras, números, - ou _ (sem espaços).'; return; }
    if (previous === code) { $('groupDlg').close(); return; }
    if (previous) leaveGroup(true);
    joining = true;
    msg.textContent = 'Conectando…';
    var personal = db.songs;
    db.personal = personal;
    db.group = code;
    db.songs = personal.map(function (s) { return Object.assign({}, s); });   // cópia até chegar a lista do grupo
    db.songs.forEach(function (s) { delete s.pending; delete s.draft; });
    Cloud.connect(code, cloudHandlers).then(function () {
      joining = false;
      online = true;
      $('groupDlg').close();
      var mine = personal.filter(function (s) {
        return s.text.trim() && !db.songs.some(function (g) { return g.id === s.id; });
      });
      if (mine.length && window.confirm('Entrou no grupo "' + code + '". Enviar também as ' + mine.length +
          ' música(s) deste aparelho para o grupo?')) {
        mine.forEach(function (s) {
          var copy = fixSong(clone(s));
          db.songs.push(copy);
          queueSave(copy);
        });
        db.songs = db.songs.filter(function (s) { return !(s.draft && !s.text.trim()); });
        if (!db.songs.some(function (s) { return s.id === db.current; })) db.current = db.songs[0].id;
        save(); fillForm(); renderList(); render();
      }
      toast('Conectado ao grupo "' + code + '".');
      showCloud();
    }, function (e) {
      joining = false;
      db.group = previous || '';
      db.songs = personal;
      delete db.personal;
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
        ' música(s) do grupo? Assim elas continuam disponíveis depois de sair.');
      var n = pendingCount();
      if (!keep && n && !window.confirm(n + ' alteração(ões) ainda não chegaram ao grupo e serão perdidas. Sair mesmo assim?')) return false;
    }
    Object.keys(saveTimers).forEach(function (id) { clearTimeout(saveTimers[id]); });
    saveTimers = {};
    inflight = {};
    Cloud.disconnect();
    online = false;
    db.group = '';
    var mine = (db.personal || []).slice();
    if (keep || !mine.length) {
      group.forEach(function (g) {
        g = Object.assign({}, g);
        delete g.pending; delete g.draft;
        var i = mine.map(function (m) { return m.id; }).indexOf(g.id);
        if (i >= 0) mine[i] = g; else mine.push(g);   // a versão do grupo substitui a cópia antiga
      });
    }
    if (!mine.length) mine.push(newSong());
    db.songs = mine;
    delete db.personal;
    if (!db.songs.some(function (s) { return s.id === db.current; })) db.current = db.songs[0].id;
    sel = null;
    save(); fillForm(); renderList(); render(); showCloud();
    return true;
  }

  function openGroupDialog() {
    var dlg = $('groupDlg'), ok = Cloud.configured();
    $('gCode').value = db.group || '';
    $('gMsg').textContent = '';
    $('gInfo').textContent = !ok
      ? 'O banco online ainda não foi configurado neste Cifrador. Enquanto isso, as músicas ficam guardadas só neste navegador.'
      : db.group
        ? 'Você está no grupo "' + db.group + '". As músicas ficam online e todos com o mesmo código veem as mesmas músicas. As músicas pessoais deste aparelho voltam quando você sair do grupo.'
        : 'Com o código do grupo, as músicas ficam guardadas online e todos que usam o mesmo código veem e editam as mesmas músicas.';
    $('gJoin').disabled = !ok;
    $('gCode').disabled = !ok;
    $('gLeave').hidden = !db.group;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (ok && !db.group) $('gCode').focus();
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
      b.addEventListener('click', function () { select(s.id); setTab('view'); if (isPhone()) openStage(); });
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
    $('oTetrads').checked = !!o.tetrads; $('oMemos').value = o.memos;
  }
  function select(id) {
    db.current = id;
    sel = null;
    save(); fillForm(); renderList(); render();
  }
  function touch() {
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
      if (draft && inGroup()) s.draft = true; else queueSave(s);
    });
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
  bindField('fCapo', 'capo'); bindField('fTempo', 'tempo'); bindField('text', 'text');
  bindOpt('oCols', 'cols', true); bindOpt('oFont', 'font'); bindOpt('oColor', 'color');
  bindOpt('oMargin', 'margin', true); bindOpt('oRepeats', 'repeats'); bindOpt('oNotes', 'notes'); bindOpt('oAcc', 'acc'); bindOpt('oMemos', 'memos');

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

  $('btnTools').addEventListener('click', function () {
    var open = document.body.classList.toggle('tools-open');
    this.setAttribute('aria-expanded', open);
    this.textContent = open ? 'Menos ▴' : 'Mais ▾';
  });
  $('btnStage').addEventListener('click', openStage);
  $('btnGroup').addEventListener('click', openGroupDialog);
  $('gJoin').addEventListener('click', function () { joinGroup($('gCode').value); });
  $('gCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); joinGroup(this.value); } });
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
  $('stDown').addEventListener('click', function () { transpose(-1); });
  $('stUp').addEventListener('click', function () { transpose(1); });
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
    if (!db.songs.length) db.songs.push(newSong(inGroup() ? { draft: true } : null));
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
  // guarda o próprio Cifrador no aparelho para abrir mesmo sem internet
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sem modo offline */ });
  }
  if (inGroup()) connectGroup();
  if (isPhone()) openStage();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
