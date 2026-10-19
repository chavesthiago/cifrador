/* Cifrador — motor musical: reconhecimento de acordes e notas, transposição,
   leitura do texto da cifra e conversão de/para ChordPro.
   Funciona no navegador (window.Music) e no Node (module.exports). */
(function (root) {
  'use strict';

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var SOLF = ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si'];
  var SOLF_TO_LETTER = {
    do: 'C', 'dó': 'C', re: 'D', 'ré': 'D', mi: 'E', fa: 'F', 'fá': 'F',
    sol: 'G', la: 'A', 'lá': 'A', si: 'B'
  };
  var FLAT_KEYS = {
    F: 1, Bb: 1, Eb: 1, Ab: 1, Db: 1, Gb: 1, Cb: 1,
    Dm: 1, Gm: 1, Cm: 1, Fm: 1, Bbm: 1, Ebm: 1, Abm: 1
  };

  var CHORD_RE = /^([A-G][#b♯♭]?)((?:maj|min|dim|aug|sus|add|m|M|º|°|ø|\+|-|\d+|[#b♯♭]\d+|\(|\)|,|\/\d+)*)(?:\/([A-G][#b♯♭]?))?$/;
  var FILLER_RE = /^(\|+|\|:|:\||%|-+|\/+|x\d+|\d+x|\(x\d+\)|\(\d+x\)|N\.?C\.?|\(|\)|:)$/i;
  // [Final] ou [Final] > anotação; [] sozinho encerra a seção anterior
  var SECTION_RE = /^\s*\[([^\[\]]*)\]\s*(?:>\s?(.*))?$/;
  var NOTES_RE = /^(\s*notas?\s*:)(.*)$/i;
  var MEMO_RE = /^\s*>\s?(.*)$/;   // anotação para os músicos
  var NOTE_S = /^(d[oó]|r[eé]|mi|f[aá]|sol|l[aá]|si)([#b♯♭]?)([\d']*)$/i;
  var NOTE_L = /^([A-Ga-g])([#b♯♭]?)([\d']*)$/;
  var NOTE_SPLIT = /(\s+|[-–—|,()~>]+)/;

  function normAcc(a) { return (a || '').replace(/♯/g, '#').replace(/♭/g, 'b'); }
  function mod12(i) { return ((i % 12) + 12) % 12; }
  function noteIndex(letter, acc) {
    var i = BASE[letter.toUpperCase()];
    acc = normAcc(acc);
    for (var k = 0; k < acc.length; k++) i += acc[k] === '#' ? 1 : -1;
    return mod12(i);
  }
  function spell(i, flat) { return (flat ? FLAT : SHARP)[mod12(i)]; }
  function shiftRoot(r, n, flat) { return spell(noteIndex(r[0], r.slice(1)) + n, flat); }

  /* ---------- acordes ---------- */

  // Aceita também acordes entre parênteses soltos, como "(Am" e "G)".
  function parseChord(tok) {
    var tries = [
      ['', tok, ''],
      [(/^\(+/.exec(tok) || [''])[0], tok.replace(/^\(+/, ''), ''],
      ['', tok.replace(/\)$/, ''), /\)$/.test(tok) ? ')' : ''],
      [(/^\(+/.exec(tok) || [''])[0], tok.replace(/^\(+/, '').replace(/\)$/, ''), /\)$/.test(tok) ? ')' : '']
    ];
    for (var i = 0; i < tries.length; i++) {
      var m = CHORD_RE.exec(tries[i][1]);
      if (m) return { pre: tries[i][0], root: m[1], quality: m[2] || '', bass: m[3] || '', suf: tries[i][2] };
    }
    return null;
  }
  function isChord(tok) { return !!parseChord(tok); }

  function isChordLine(line) {
    var toks = line.trim().split(/\s+/);
    if (!toks[0]) return false;
    var chords = 0;
    for (var i = 0; i < toks.length; i++) {
      if (isChord(toks[i])) chords++;
      else if (!FILLER_RE.test(toks[i])) return false;
    }
    return chords > 0;
  }

  // Anotação no fim da linha de acordes: "Bm  G  A  Bm7 > vem crescendo".
  function splitChordMemo(line) {
    var i = line.indexOf('>');
    if (i <= 0 || !isChordLine(line.slice(0, i))) return null;
    return { chords: line.slice(0, i).replace(/\s+$/, ''), memo: line.slice(i + 1).trim(), tail: line.slice(i), col: i };
  }
  function chordPart(line) {
    var sp = splitChordMemo(line);
    return sp ? sp.chords : line;
  }
  // Aplica fn só aos acordes e devolve a linha com a anotação de volta no lugar.
  function mapChordPart(line, fn) {
    var sp = splitChordMemo(line);
    if (!sp) return fn(line);
    var out = fn(sp.chords);
    if (!out.trim()) return sp.tail;
    var col = out.length >= sp.col ? out.length + 1 : sp.col;
    while (out.length < col) out += ' ';
    return out + sp.tail;
  }

  function transposeChord(tok, n, flat) {
    var c = parseChord(tok);
    if (!c) return tok;
    return c.pre + shiftRoot(c.root, n, flat) + c.quality +
      (c.bass ? '/' + shiftRoot(c.bass, n, flat) : '') + c.suf;
  }

  // Mantém cada acorde na mesma coluna sempre que houver espaço.
  function transposeChordLine(line, n, flat) {
    var out = '', re = /\S+/g, m;
    while ((m = re.exec(line))) {
      var col = m.index;
      if (out.length && out.length >= col) col = out.length + 1;
      while (out.length < col) out += ' ';
      out += transposeChord(m[0], n, flat);
    }
    return out;
  }

  // Nome do acorde sem os parênteses soltos: "(Cmaj9" e "Cmaj9)" contam como "Cmaj9".
  function chordName(tok) {
    var c = parseChord(tok);
    return c ? normAcc(c.root) + c.quality + (c.bass ? '/' + normAcc(c.bass) : '') : '';
  }
  // Troca um acorde por outro em toda a música (só nas linhas de acordes; letra e anotações ficam iguais).
  function replaceChord(text, from, to) {
    var count = 0, want = chordName(from);
    if (!want) return { text: text, count: 0 };
    var out = normalizeText(text).split('\n').map(function (line) {
      if (classify(line) !== 'chords') return line;
      return mapChordPart(line, function (part) {
        var res = '', re = /\S+/g, m;
        while ((m = re.exec(part))) {
          var tok = m[0], c = parseChord(tok);
          if (c && chordName(tok) === want) { tok = c.pre + to + c.suf; count++; }
          var col = m.index;
          if (res.length && res.length >= col) col = res.length + 1;
          while (res.length < col) res += ' ';
          res += tok;
        }
        return res;
      });
    }).join('\n');
    return { text: out, count: count };
  }
  // Quantas vezes cada acorde aparece na música, na ordem em que aparece.
  function chordCounts(text) {
    var order = [], n = {};
    normalizeText(text).split('\n').forEach(function (line) {
      if (classify(line) !== 'chords') return;
      chordPart(line).trim().split(/\s+/).forEach(function (t) {
        var k = chordName(t);
        if (!k) return;
        if (!n[k]) { n[k] = 0; order.push(k); }
        n[k]++;
      });
    });
    return order.map(function (k) { return { name: k, count: n[k] }; });
  }

  /* ---------- notas (frases de solo) ---------- */

  function parseNote(tok) {
    var m = NOTE_S.exec(tok);
    if (m) {
      return {
        kind: 'S', letter: SOLF_TO_LETTER[m[1].toLowerCase()], acc: normAcc(m[2]), oct: m[3],
        lower: m[1][0] === m[1][0].toLowerCase()
      };
    }
    m = NOTE_L.exec(tok);
    if (m) {
      return {
        kind: 'L', letter: m[1].toUpperCase(), acc: normAcc(m[2]), oct: m[3],
        lower: m[1] === m[1].toLowerCase()
      };
    }
    return null;
  }
  function formatNote(n) {
    var name = n.kind === 'S' ? SOLF[LETTERS.indexOf(n.letter)] : n.letter;
    if (n.lower) name = name.toLowerCase();
    return name + n.acc + n.oct;
  }
  function mapNotes(body, fn) {
    return body.split(NOTE_SPLIT).map(function (part) {
      var n = parseNote(part);
      return n ? formatNote(fn(n) || n) : part;
    }).join('');
  }
  function transposeNotes(body, n, flat) {
    return mapNotes(body, function (note) {
      var s = spell(noteIndex(note.letter, note.acc) + n, flat);
      note.letter = s[0]; note.acc = s.slice(1);
      return note;
    });
  }
  // mode: 'typed' (como digitado), 'solfege' (Dó Ré Mi) ou 'letters' (C D E)
  function renderNotes(body, mode) {
    if (mode !== 'solfege' && mode !== 'letters') return body.trim();
    var kind = mode === 'solfege' ? 'S' : 'L';
    return mapNotes(body, function (note) {
      if (note.kind !== kind) { note.kind = kind; note.lower = false; }
      return note;
    }).trim();
  }

  /* ---------- texto da cifra ---------- */

  function classify(line) {
    if (/^\s*$/.test(line)) return 'blank';
    if (SECTION_RE.test(line)) return 'section';
    if (NOTES_RE.test(line)) return 'notes';
    if (MEMO_RE.test(line)) return 'memo';
    if (isChordLine(line) || splitChordMemo(line)) return 'chords';
    return 'lyric';
  }

  function normalizeText(text) {
    return String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  }

  function firstChord(text) {
    var lines = normalizeText(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (classify(lines[i]) !== 'chords') continue;
      var toks = chordPart(lines[i]).trim().split(/\s+/);
      for (var k = 0; k < toks.length; k++) {
        var c = parseChord(toks[k]);
        if (c) return c.root + (/^m(?!aj)/.test(c.quality) ? 'm' : '');
      }
    }
    return '';
  }

  function transposeKey(key, n, flat) {
    var k = (key || '').trim();
    return isChord(k) ? transposeChord(k, n, flat) : key;
  }

  // Decide entre sustenidos e bemóis pelo tom de chegada.
  function prefersFlat(key, n) {
    var c = parseChord((key || '').trim());
    if (!c) return false;
    var idx = noteIndex(c.root[0], c.root.slice(1)) + (n || 0);
    var minor = /^m(?!aj)/.test(c.quality);
    return !!FLAT_KEYS[spell(idx, true) + (minor ? 'm' : '')];
  }

  function transposeText(text, n, flat) {
    return normalizeText(text).split('\n').map(function (line) {
      var t = classify(line);
      if (t === 'chords') return mapChordPart(line, function (c) { return transposeChordLine(c, n, flat); });
      if (t === 'notes') {
        var m = NOTES_RE.exec(line);
        return m[1] + transposeNotes(m[2], n, flat);
      }
      return line;
    }).join('\n');
  }

  // Junta linha de acordes + linha de letra em palavras formadas por pedaços
  // {chord, text}; cada acorde fica preso ao caractere sobre o qual foi digitado.
  function pairLine(chordLine, lyric) {
    var marks = [], re = /\S+/g, m;
    while ((m = re.exec(chordLine))) marks.push({ col: m.index, chord: m[0] });
    var last = marks[marks.length - 1];
    while (lyric.length < last.col) lyric += ' ';
    var segs = [];
    if (marks[0].col > 0) segs.push({ chord: '', text: lyric.slice(0, marks[0].col), col: 0 });
    marks.forEach(function (mk, i) {
      var end = i + 1 < marks.length ? marks[i + 1].col : lyric.length;
      segs.push({ chord: mk.chord, text: lyric.slice(mk.col, end), col: mk.col });
    });
    var words = [], cur = [];
    segs.forEach(function (seg) {
      var parts = seg.text.match(/\S+|\s+/g) || [''], at = seg.col;
      parts.forEach(function (p, i) {
        // col = coluna do pedaço na linha da letra (e do acorde na linha de acordes)
        var piece = { chord: i === 0 ? seg.chord : '', text: p, col: at };
        at += p.length;
        if (/^\s+$/.test(p)) {
          if (piece.chord || !cur.length) cur.push(piece);
          else cur[cur.length - 1].text += p;
          words.push(cur); cur = [];
        } else cur.push(piece);
      });
    });
    if (cur.length) words.push(cur);
    // Acorde mais largo que o trecho de letra sob ele (ex.: "Am" sobre "O "):
    // une a palavra seguinte para não abrir um buraco no meio da frase.
    for (var w = 0; w < words.length - 1; w++) {
      var lastP = words[w][words[w].length - 1], nxt = words[w + 1];
      if (lastP.chord && lastP.text.length < lastP.chord.length + 2 && !nxt[0].chord) {
        lastP.text += nxt[0].text;
        words[w] = words[w].concat(nxt.slice(1));
        words.splice(w + 1, 1);
        w--;
      }
    }
    return words;
  }

  function hasContent(s) {
    return s.paras.some(function (p) { return p.some(function (l) { return l.t !== 'memo'; }); });
  }
  function sectionMemos(s) {
    var out = [];
    s.paras.forEach(function (p) { p.forEach(function (l) { if (l.t === 'memo') out.push(l); }); });
    return out;
  }
  // Sigla curta para os atalhos de seção: Intro → It, Verso 2 → V2, Refrão → R.
  function sectionAbbr(label) {
    var l = (label || '').trim(), low = l.toLowerCase();
    var num = (/(\d+)\s*$/.exec(l) || [])[1] || '';
    var base = /^intro/.test(low) ? 'In'
      : /^pr[eé][- ]?refr/.test(low) ? 'PR'
      : /^(refr|chorus|coro)/.test(low) ? 'R'
      : /^(vers|estrofe)/.test(low) ? 'V'
      : /^(ponte|bridge)/.test(low) ? 'P'
      : /^solo/.test(low) ? 'So'
      : /^(final|outro|coda)/.test(low) ? 'F'
      : (l[0] || '?').toUpperCase() + (/^[a-zà-ú]$/i.test(l[1] || '') ? l[1].toLowerCase() : '');
    return base + num;
  }

  function sectionKind(label) {
    var l = (label || '').trim().toLowerCase();
    if (/^(refr|chorus|coro)/.test(l)) return 'chorus';
    if (/^(vers|estrofe|parte)/.test(l)) return 'verse';
    if (/^(ponte|bridge)/.test(l)) return 'bridge';
    return '';
  }

  function parse(text) {
    var lines = normalizeText(text).split('\n');
    var sections = [], sec = null, para = null, byName = {}, blanks = 0;
    function open(label) { sec = { label: label, paras: [], repeatOf: null, gap: sections.length ? blanks : 0 }; sections.push(sec); para = null; blanks = 0; }
    // gap: quantas linhas em branco vieram antes do parágrafo (cada Enter vira um respiro)
    function add(obj) {
      if (!sec) open('');
      if (!para) {
        para = [];
        para.gap = sec.paras.length ? blanks : 0;    // linhas em branco antes de um parágrafo
        para.lead = sec.paras.length ? 0 : blanks;   // linhas em branco logo depois do nome da seção
        sec.paras.push(para);
      }
      blanks = 0;
      para.push(obj);
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, ''), t = classify(line);
      if (t === 'blank') { para = null; blanks++; continue; }
      if (t === 'section') {
        var sm = SECTION_RE.exec(line);
        open(sm[1].trim());
        if (sm[2] != null && sm[2].trim()) { add({ t: 'memo', text: sm[2].trim() }); }
        continue;
      }
      if (t === 'notes') { add({ t: 'notes', body: NOTES_RE.exec(line)[2] }); continue; }
      if (t === 'memo') { add({ t: 'memo', text: MEMO_RE.exec(line)[1] }); continue; }
      if (t === 'chords') {
        var next = i + 1 < lines.length ? lines[i + 1] : '';
        var sp = splitChordMemo(line), cline = sp ? sp.chords : line, memo = sp ? sp.memo : '';
        if (classify(next) === 'lyric') {
          add({ t: 'pair', words: pairLine(cline, next.replace(/\s+$/, '')), cl: i, ln: i + 1, memo: memo });
          i++;
        } else add({ t: 'chords', raw: cline, memo: memo });
        continue;
      }
      add({ t: 'lyric', text: line, ln: i });
    }
    // Seção vazia com o nome de outra já escrita = repetição (ex.: o refrão).
    sections.forEach(function (s) {
      var k = s.label.toLowerCase();
      if (!k) return;
      if (hasContent(s)) { if (!byName[k]) byName[k] = s; }
      else if (byName[k]) s.repeatOf = byName[k];   // pode trazer anotações próprias
    });
    return { sections: sections };
  }

  /* ---------- colocar, mover e apagar acordes pela folha ---------- */

  function chordMarks(line) {
    var marks = [], re = /\S+/g, m;
    while ((m = re.exec(line || ''))) marks.push({ col: m.index, chord: m[0] });
    return marks;
  }
  function buildChordLine(marks) {
    var out = '';
    marks.sort(function (a, b) { return a.col - b.col; }).forEach(function (mk) {
      var col = mk.col;
      if (out.length && out.length >= col) col = out.length + 1;
      while (out.length < col) out += ' ';
      mk.col = col;
      out += mk.chord;
    });
    return out;
  }
  // Põe o acorde sobre a coluna `col` da linha de letra `ln` (troca o que já estiver ali).
  function setChordAt(text, ln, col, chord) {
    var lines = normalizeText(text).split('\n');
    if (ln < 0 || ln >= lines.length) return { text: text, cl: -1, col: col };
    var cl = ln - 1;
    if (!(ln > 0 && classify(lines[cl]) === 'chords')) { lines.splice(ln, 0, ''); cl = ln; }
    var mine = { col: col, chord: chord };
    lines[cl] = mapChordPart(lines[cl], function (c) {
      var marks = chordMarks(c).filter(function (m) { return m.col !== col; });
      marks.push(mine);
      return buildChordLine(marks);
    });
    return { text: lines.join('\n'), cl: cl, col: mine.col };
  }
  function removeChordAt(text, cl, col) {
    var lines = normalizeText(text).split('\n');
    if (cl < 0 || cl >= lines.length) return { text: text, removedLine: false };
    var left = 0, keep = !!splitChordMemo(lines[cl]);   // com anotação, a linha fica mesmo sem acordes
    var res = mapChordPart(lines[cl], function (c) {
      var marks = chordMarks(c).filter(function (m) { return m.col !== col; });
      left = marks.length;
      return buildChordLine(marks);
    });
    if (left || keep) lines[cl] = res; else lines.splice(cl, 1);
    return { text: lines.join('\n'), removedLine: !left && !keep };
  }
  function moveChord(text, cl, fromCol, ln, col) {
    var lines = normalizeText(text).split('\n');
    var mk = chordMarks(chordPart(lines[cl])).filter(function (m) { return m.col === fromCol; })[0];
    if (!mk) return { text: text, cl: cl, col: fromCol };
    var r = removeChordAt(text, cl, fromCol);
    if (r.removedLine && cl < ln) ln--;
    return setChordAt(r.text, ln, col, mk.chord);
  }

  /* ---------- campo harmônico ---------- */

  function spellDegree(tonicLetter, tonicIdx, steps, semis, flat) {
    var L = LETTERS[(LETTERS.indexOf(tonicLetter) + steps) % 7];
    var target = mod12(tonicIdx + semis), d = mod12(target - BASE[L]);
    if (d > 6) d -= 12;
    if (Math.abs(d) > 1) return spell(target, flat);
    return L + (d === 1 ? '#' : d === -1 ? 'b' : '');
  }
  // [passos de letra, semitons, tríade, tétrade, grau]
  var FIELDS = {
    major: {
      field: [[0, 0, '', '7M', 'I'], [1, 2, 'm', 'm7', 'IIm'], [2, 4, 'm', 'm7', 'IIIm'], [3, 5, '', '7M', 'IV'],
        [4, 7, '', '7', 'V'], [5, 9, 'm', 'm7', 'VIm'], [6, 11, 'º', 'm7(b5)', 'VIIº']],
      borrowed: [[0, 0, 'm', 'm7', 'Im'], [2, 3, '', '7M', 'bIII'], [3, 5, 'm', 'm7', 'IVm'], [4, 7, 'm', 'm7', 'Vm'],
        [5, 8, '', '7M', 'bVI'], [6, 10, '', '7', 'bVII']],
      dominants: [[5, 9, '7', '7', 'V7 do IIm'], [6, 11, '7', '7', 'V7 do IIIm'], [0, 0, '7', '7', 'V7 do IV'],
        [1, 2, '7', '7', 'V7 do V'], [2, 4, '7', '7', 'V7 do VIm']]
    },
    minor: {
      field: [[0, 0, 'm', 'm7', 'Im'], [1, 2, 'º', 'm7(b5)', 'IIº'], [2, 3, '', '7M', 'bIII'], [3, 5, 'm', 'm7', 'IVm'],
        [4, 7, 'm', 'm7', 'Vm'], [5, 8, '', '7M', 'bVI'], [6, 10, '', '7', 'bVII']],
      borrowed: [[4, 7, '', '7', 'V'], [0, 0, '', '7M', 'I'], [1, 2, 'm', 'm7', 'IIm'], [3, 5, '', '7M', 'IV'], [1, 1, '', '7M', 'bII']],
      dominants: [[0, 0, '7', '7', 'V7 do IVm'], [1, 2, '7', '7', 'V7 do Vm'], [2, 3, '7', '7', 'V7 do bVI'], [3, 5, '7', '7', 'V7 do bVII']]
    }
  };
  // Acordes do campo harmônico do tom, empréstimos do tom homônimo e dominantes secundários.
  function palette(key, tetrads) {
    var c = parseChord((key || '').trim());
    if (!c) return null;
    var minor = /^m(?!aj)/.test(c.quality);
    var letter = c.root[0], idx = noteIndex(letter, c.root.slice(1));
    var tonic = spellDegree(letter, idx, 0, 0, false) + (minor ? 'm' : '');
    var flat = prefersFlat(tonic, 0), def = FIELDS[minor ? 'minor' : 'major'], out = { tonic: tonic, minor: minor };
    ['field', 'borrowed', 'dominants'].forEach(function (g) {
      out[g] = def[g].map(function (d) {
        return { name: spellDegree(letter, idx, d[0], d[1], flat) + (tetrads ? d[3] : d[2]), degree: d[4] };
      });
    });
    return out;
  }
  function chordsUsed(text) {
    var seen = {}, list = [];
    normalizeText(text).split('\n').forEach(function (line) {
      if (classify(line) !== 'chords') return;
      chordPart(line).trim().split(/\s+/).forEach(function (t) {
        var c = parseChord(t);
        if (!c) return;
        var name = c.root + c.quality + (c.bass ? '/' + c.bass : '');
        if (!seen[name]) { seen[name] = 1; list.push(name); }
      });
    });
    return list;
  }

  /* ---------- ChordPro ---------- */

  function toChordPro(song) {
    var out = [];
    function dir(name, val) { if (val !== '' && val != null) out.push('{' + name + ': ' + val + '}'); }
    dir('title', song.title); dir('artist', song.artist); dir('key', song.key);
    dir('capo', song.capo); dir('tempo', song.tempo); dir('x_youtube', song.youtube);
    parse(song.text).sections.forEach(function (s) {
      var kind = sectionKind(s.label);
      out.push('');
      if (!hasContent(s)) {
        if (s.label) out.push(kind === 'chorus' && /^refrão$/i.test(s.label) ? '{chorus}' : '{comment: ' + s.label + '}');
        sectionMemos(s).forEach(function (l) { out.push('{ci: ' + l.text + '}'); });
        return;
      }
      if (kind) out.push('{start_of_' + kind + ': ' + s.label + '}');
      else if (s.label) out.push('{comment: ' + s.label + '}');
      s.paras.forEach(function (p, pi) {
        if (pi) out.push('');
        p.forEach(function (l) {
          if (l.memo) out.push('{ci: ' + l.memo + '}');
          if (l.t === 'pair') {
            out.push(l.words.map(function (w) {
              return w.map(function (x) { return (x.chord ? '[' + x.chord + ']' : '') + x.text; }).join('');
            }).join('').replace(/\s+$/, ''));
          } else if (l.t === 'chords') out.push(l.raw.replace(/\S+/g, function (c) { return '[' + c + ']'; }));
          else if (l.t === 'notes') out.push('{comment: Notas:' + l.body + '}');
          else if (l.t === 'memo') out.push('{ci: ' + l.text + '}');
          else out.push(l.text);
        });
      });
      if (kind) out.push('{end_of_' + kind + '}');
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function isChordPro(src) {
    return /\{\s*(title|t|artist|subtitle|st|key|capo|soc|sov|sob|chorus|start_of_\w+|comment|c)\s*[:}]/i.test(src) ||
      /\[[A-G][^\]\s]*\]\S/.test(src);
  }

  function fromChordPro(src) {
    var song = { title: '', artist: '', key: '', capo: '', tempo: '', youtube: '', text: '' }, out = [];
    var defaults = { chorus: 'Refrão', verse: 'Verso', bridge: 'Ponte', tab: 'Tablatura', grid: 'Grade' };
    function label(v) { return (v || '').replace(/^label\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim(); }
    normalizeText(src).split('\n').forEach(function (line) {
      if (/^\s*#/.test(line)) return;
      var d = /^\s*\{\s*([^:}\s]+)\s*(?::\s*(.*?))?\s*\}\s*$/.exec(line);
      if (d) {
        var name = d[1].toLowerCase(), val = d[2] || '';
        var alias = { t: 'title', st: 'artist', subtitle: 'artist', soc: 'start_of_chorus', sov: 'start_of_verse', sob: 'start_of_bridge' };
        name = alias[name] || name;
        if (name === 'x_youtube') name = 'youtube';
        if (name === 'title' || name === 'artist' || name === 'key' || name === 'capo' || name === 'tempo' || name === 'youtube') {
          if (!song[name]) song[name] = val;
        } else if (name.indexOf('start_of_') === 0) {
          var kind = name.slice(9);
          out.push('[' + (label(val) || defaults[kind] || kind) + ']');
        } else if (name === 'chorus') out.push('[' + (label(val) || 'Refrão') + ']');
        else if (name === 'ci' || name === 'comment_italic') out.push('> ' + val);
        else if (/^(comment|c|cb|comment_box)$/.test(name)) {
          out.push(/^notas?\s*:/i.test(val) ? val : '[' + val + ']');
        }
        return;
      }
      if (line.indexOf('[') < 0) { out.push(line); return; }
      if (!line.replace(/\[[^\]]*\]/g, '').trim()) { // linha só de acordes
        out.push(line.replace(/\[([^\]]*)\]/g, '$1'));
        return;
      }
      var chords = '', lyric = '', pos = 0, re = /\[([^\]]*)\]/g, m;
      while ((m = re.exec(line))) {
        lyric += line.slice(pos, m.index);
        pos = re.lastIndex;
        var col = lyric.length;
        if (chords.length && chords.length >= col) col = chords.length + 1;
        while (chords.length < col) chords += ' ';
        chords += m[1];
      }
      lyric += line.slice(pos);
      out.push(chords);
      if (lyric.trim()) out.push(lyric);
    });
    song.text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    return song;
  }

  // Link do YouTube → id do vídeo (11 caracteres) e segundo de início, se houver.
  function youtubeInfo(url) {
    var u = String(url || '').trim(), m;
    if (!u) return null;
    m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/.exec(u) ||
      /^([A-Za-z0-9_-]{11})$/.exec(u);
    if (!m) return null;
    var t = /[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?/.exec(u), start = 0;
    if (t) start = (+(t[1] || 0)) * 3600 + (+(t[2] || 0)) * 60 + (+(t[3] || 0));
    return { id: m[1], start: start };
  }

  var api = {
    youtubeInfo: youtubeInfo, replaceChord: replaceChord, chordCounts: chordCounts,
    isChord: isChord, isChordLine: isChordLine, classify: classify, normalizeText: normalizeText,
    transposeChord: transposeChord, transposeChordLine: transposeChordLine,
    transposeNotes: transposeNotes, renderNotes: renderNotes,
    transposeText: transposeText, transposeKey: transposeKey, prefersFlat: prefersFlat,
    firstChord: firstChord, parse: parse, sectionKind: sectionKind,
    setChordAt: setChordAt, removeChordAt: removeChordAt, moveChord: moveChord,
    palette: palette, chordsUsed: chordsUsed,
    chordPart: chordPart, hasContent: hasContent, sectionMemos: sectionMemos, sectionAbbr: sectionAbbr,
    toChordPro: toChordPro, fromChordPro: fromChordPro, isChordPro: isChordPro
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Music = api;
})(typeof window !== 'undefined' ? window : this);
