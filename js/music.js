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
  var SECTION_RE = /^\s*\[([^\[\]]+)\]\s*$/;
  var NOTES_RE = /^(\s*notas?\s*:)(.*)$/i;
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
    if (isChordLine(line)) return 'chords';
    return 'lyric';
  }

  function normalizeText(text) {
    return String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  }

  function firstChord(text) {
    var lines = normalizeText(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (classify(lines[i]) !== 'chords') continue;
      var toks = lines[i].trim().split(/\s+/);
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
      if (t === 'chords') return transposeChordLine(line, n, flat);
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
    if (marks[0].col > 0) segs.push({ chord: '', text: lyric.slice(0, marks[0].col) });
    marks.forEach(function (mk, i) {
      var end = i + 1 < marks.length ? marks[i + 1].col : lyric.length;
      segs.push({ chord: mk.chord, text: lyric.slice(mk.col, end) });
    });
    var words = [], cur = [];
    segs.forEach(function (seg) {
      var parts = seg.text.match(/\S+|\s+/g) || [''];
      parts.forEach(function (p, i) {
        var piece = { chord: i === 0 ? seg.chord : '', text: p };
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

  function sectionKind(label) {
    var l = (label || '').trim().toLowerCase();
    if (/^(refr|chorus|coro)/.test(l)) return 'chorus';
    if (/^(vers|estrofe|parte)/.test(l)) return 'verse';
    if (/^(ponte|bridge)/.test(l)) return 'bridge';
    return '';
  }

  function parse(text) {
    var lines = normalizeText(text).split('\n');
    var sections = [], sec = null, para = null, byName = {};
    function open(label) { sec = { label: label, paras: [], repeatOf: null }; sections.push(sec); para = null; }
    function add(obj) {
      if (!sec) open('');
      if (!para) { para = []; sec.paras.push(para); }
      para.push(obj);
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, ''), t = classify(line);
      if (t === 'blank') { para = null; continue; }
      if (t === 'section') { open(SECTION_RE.exec(line)[1].trim()); continue; }
      if (t === 'notes') { add({ t: 'notes', body: NOTES_RE.exec(line)[2] }); continue; }
      if (t === 'chords') {
        var next = i + 1 < lines.length ? lines[i + 1] : '';
        if (classify(next) === 'lyric') {
          add({ t: 'pair', words: pairLine(line, next.replace(/\s+$/, '')) });
          i++;
        } else add({ t: 'chords', raw: line });
        continue;
      }
      add({ t: 'lyric', text: line });
    }
    // Seção vazia com o nome de outra já escrita = repetição (ex.: o refrão).
    sections.forEach(function (s) {
      var k = s.label.toLowerCase();
      if (!k) return;
      if (s.paras.length) { if (!byName[k]) byName[k] = s; }
      else if (byName[k]) s.repeatOf = byName[k];
    });
    return { sections: sections };
  }

  /* ---------- ChordPro ---------- */

  function toChordPro(song) {
    var out = [];
    function dir(name, val) { if (val !== '' && val != null) out.push('{' + name + ': ' + val + '}'); }
    dir('title', song.title); dir('artist', song.artist); dir('key', song.key);
    dir('capo', song.capo); dir('tempo', song.tempo);
    parse(song.text).sections.forEach(function (s) {
      var kind = sectionKind(s.label);
      out.push('');
      if (!s.paras.length) {
        if (s.label) out.push(kind === 'chorus' && /^refrão$/i.test(s.label) ? '{chorus}' : '{comment: ' + s.label + '}');
        return;
      }
      if (kind) out.push('{start_of_' + kind + ': ' + s.label + '}');
      else if (s.label) out.push('{comment: ' + s.label + '}');
      s.paras.forEach(function (p, pi) {
        if (pi) out.push('');
        p.forEach(function (l) {
          if (l.t === 'pair') {
            out.push(l.words.map(function (w) {
              return w.map(function (x) { return (x.chord ? '[' + x.chord + ']' : '') + x.text; }).join('');
            }).join('').replace(/\s+$/, ''));
          } else if (l.t === 'chords') out.push(l.raw.replace(/\S+/g, function (c) { return '[' + c + ']'; }));
          else if (l.t === 'notes') out.push('{comment: Notas:' + l.body + '}');
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
    var song = { title: '', artist: '', key: '', capo: '', tempo: '', text: '' }, out = [];
    var defaults = { chorus: 'Refrão', verse: 'Verso', bridge: 'Ponte', tab: 'Tablatura', grid: 'Grade' };
    function label(v) { return (v || '').replace(/^label\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim(); }
    normalizeText(src).split('\n').forEach(function (line) {
      if (/^\s*#/.test(line)) return;
      var d = /^\s*\{\s*([^:}\s]+)\s*(?::\s*(.*?))?\s*\}\s*$/.exec(line);
      if (d) {
        var name = d[1].toLowerCase(), val = d[2] || '';
        var alias = { t: 'title', st: 'artist', subtitle: 'artist', soc: 'start_of_chorus', sov: 'start_of_verse', sob: 'start_of_bridge' };
        name = alias[name] || name;
        if (name === 'title' || name === 'artist' || name === 'key' || name === 'capo' || name === 'tempo') {
          if (!song[name]) song[name] = val;
        } else if (name.indexOf('start_of_') === 0) {
          var kind = name.slice(9);
          out.push('[' + (label(val) || defaults[kind] || kind) + ']');
        } else if (name === 'chorus') out.push('[' + (label(val) || 'Refrão') + ']');
        else if (/^(comment|c|ci|cb|comment_italic|comment_box)$/.test(name)) {
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

  var api = {
    isChord: isChord, isChordLine: isChordLine, classify: classify, normalizeText: normalizeText,
    transposeChord: transposeChord, transposeChordLine: transposeChordLine,
    transposeNotes: transposeNotes, renderNotes: renderNotes,
    transposeText: transposeText, transposeKey: transposeKey, prefersFlat: prefersFlat,
    firstChord: firstChord, parse: parse, sectionKind: sectionKind,
    toChordPro: toChordPro, fromChordPro: fromChordPro, isChordPro: isChordPro
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Music = api;
})(typeof window !== 'undefined' ? window : this);
