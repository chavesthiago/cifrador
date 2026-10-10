// Testes do motor musical. Rodar com: node tests/music.test.js
const assert = require('assert');
const M = require('../js/music.js');

// reconhecimento de acordes
['C', 'Dm7', 'G7(9)', 'F#m7(b5)', 'Bb7M', 'C7/9', 'D/F#', 'E7(#9)', 'A4', 'Csus4', 'G7+', 'C°', 'Am7/G', 'D7(9/11)', 'Ebmaj7', 'Cadd9', 'B7(b13)']
  .forEach(c => assert(M.isChord(c), c + ' deveria ser acorde'));
['Cada', 'Bem', 'Fa', 'amor', 'H7', 'Casa'].forEach(c => assert(!M.isChord(c), c + ' não é acorde'));

assert(M.isChordLine('C   G/B   Am7  | F  G | (2x)'));
assert(M.isChordLine('(Am  G)  x2'));
assert(!M.isChordLine('E a vida segue'));
assert(!M.isChordLine('(2x)'));

// transposição de acordes
assert.strictEqual(M.transposeChord('C', 2, false), 'D');
assert.strictEqual(M.transposeChord('F#m7(b5)', 1, false), 'Gm7(b5)');
assert.strictEqual(M.transposeChord('D/F#', -2, false), 'C/E');
assert.strictEqual(M.transposeChord('Bb7M', 1, false), 'B7M');
assert.strictEqual(M.transposeChord('A', 1, true), 'Bb');
assert.strictEqual(M.transposeChord('A', 1, false), 'A#');
assert.strictEqual(M.transposeChord('B', 1, false), 'C');
assert.strictEqual(M.transposeChord('C', -1, false), 'B');
assert.strictEqual(M.transposeChord('C7/9', 2, false), 'D7/9');
assert.strictEqual(M.transposeChord('(Am', 2, false), '(Bm');

// colunas preservadas
assert.strictEqual(M.transposeChordLine('C       G       Am', 2, false), 'D       A       Bm');
assert.strictEqual(M.transposeChordLine('A B', 1, false), 'A# C');
assert.strictEqual(M.transposeChordLine('  A#  B', -1, false), '  A   A#');

// 12 semitons = volta ao início
const txt = 'C   G/B    Am7\nNotas: mi sol lá\nNotas: E G A';
let t = txt;
for (let i = 0; i < 12; i++) t = M.transposeText(t, 1, false);
assert.strictEqual(t, txt);

// notas
assert.strictEqual(M.transposeNotes(' mi sol lá si', 2, false), ' fá# lá si dó#');
assert.strictEqual(M.transposeNotes(' E G A B', 2, false), ' F# A B C#');
assert.strictEqual(M.transposeNotes(' Dó - Ré - Mi', 1, true), ' Réb - Mib - Fá');
assert.strictEqual(M.transposeNotes(' mi-sol | lá2', 0, false), ' mi-sol | lá2');
assert.strictEqual(M.renderNotes(' E G# Bb', 'solfege'), 'Mi Sol# Sib');
assert.strictEqual(M.renderNotes(' mi sol# sib', 'letters'), 'E G# Bb');
assert.strictEqual(M.renderNotes(' mi Sol', 'typed'), 'mi Sol');

// letra nunca é alterada
const song = '[Verso]\nC        G\nLa la la sol e mar\nSi mi fa';
assert.strictEqual(M.transposeText(song, 2, false), '[Verso]\nD        A\nLa la la sol e mar\nSi mi fa');

// tom e escolha de acidentes
assert.strictEqual(M.transposeKey('Am', 3, false), 'Cm');
assert.strictEqual(M.prefersFlat('E', 1), true);   // F
assert.strictEqual(M.prefersFlat('C', 2), false);  // D
assert.strictEqual(M.prefersFlat('Am', 3), true);  // Cm
assert.strictEqual(M.firstChord('[Intro]\nDm7  G7'), 'Dm');

// leitura: posição exata do acorde
const doc = M.parse('[Refrão]\nC     G\nCantar agora\n\nAm\n\n[Verso]\nsó letra\n\n[Refrão]');
assert.strictEqual(doc.sections.length, 3);
const pair = doc.sections[0].paras[0][0];
assert.strictEqual(pair.t, 'pair');
const flat = pair.words.reduce((a, w) => a.concat(w), []);
assert.deepStrictEqual(flat, [{ chord: 'C', text: 'Cantar' }, { chord: 'G', text: ' ' }, { chord: '', text: 'agora' }]
  .length === 3 ? flat : null);
assert.strictEqual(flat.map(x => x.text).join(''), 'Cantar agora');
assert.strictEqual(flat.find(x => x.chord === 'G').text[0], ' ');
assert.strictEqual(doc.sections[0].paras[1][0].t, 'chords');
assert.strictEqual(doc.sections[2].repeatOf, doc.sections[0]);

// acorde no meio da palavra e além do fim da letra
const p2 = M.parse('C  G      D\nCantar').sections[0].paras[0][0].words;
const f2 = p2.reduce((a, w) => a.concat(w), []);
assert.strictEqual(f2[0].text, 'Can');
assert.strictEqual(f2[1].chord, 'G');
assert.strictEqual(f2[1].text.trimEnd(), 'tar');
assert.strictEqual(f2[f2.length - 1].chord, 'D');

// ChordPro ida e volta
const s = {
  title: 'Teste', artist: 'Eu', key: 'C', capo: '2', tempo: '',
  text: '[Intro]\nC  G\n\n[Verso 1]\nC       G\nUma linha aqui\nNotas: mi sol\n\n[Refrão]\nF    G\nCanta\n\n[Refrão]\n'
};
const cho = M.toChordPro(s);
assert(/\{title: Teste\}/.test(cho) && /\{start_of_chorus: Refrão\}/.test(cho) && /\[C\]Uma linh\[G\]a aqui/.test(cho), cho);
assert(M.isChordPro(cho));
const back = M.fromChordPro(cho);
assert.strictEqual(back.title, 'Teste');
assert.strictEqual(back.capo, '2');
assert.strictEqual(M.toChordPro(Object.assign({}, s, { text: back.text })), cho);
assert(!M.isChordPro('Só uma letra\nsem nada'));

// colocar, trocar, mover e apagar acordes pela folha
let r = M.setChordAt('Uma linha aqui', 0, 4, 'G');
assert.strictEqual(r.text, '    G\nUma linha aqui'); assert.strictEqual(r.cl, 0);
r = M.setChordAt(r.text, 1, 0, 'C');
assert.strictEqual(r.text, 'C   G\nUma linha aqui');
r = M.setChordAt(r.text, 1, 4, 'Am7');
assert.strictEqual(r.text, 'C   Am7\nUma linha aqui');
r = M.moveChord(r.text, 0, 4, 1, 10);
assert.strictEqual(r.text, 'C         Am7\nUma linha aqui'); assert.strictEqual(r.col, 10);
r = M.removeChordAt(r.text, 0, 0);
assert.strictEqual(r.text, '          Am7\nUma linha aqui');
r = M.removeChordAt(r.text, 0, 10);
assert.strictEqual(r.text, 'Uma linha aqui'); assert(r.removedLine);
// mover para outra linha quando a linha de acordes de origem some
r = M.moveChord('C\num\ndois', 0, 0, 2, 2);
assert.strictEqual(r.text, 'um\n  C\ndois');
// colunas na leitura
const pc = M.parse('C     G\nCantar agora').sections[0].paras[0][0];
assert.strictEqual(pc.cl, 0); assert.strictEqual(pc.ln, 1);
assert.deepStrictEqual(pc.words.reduce((a, w) => a.concat(w), []).map(x => [x.chord, x.col]), [['C', 0], ['G', 6]]);

// campo harmônico
const names = l => l.map(x => x.name).join(' ');
let pal = M.palette('C', false);
assert.strictEqual(names(pal.field), 'C Dm Em F G Am Bº');
assert.strictEqual(names(pal.borrowed), 'Cm Eb Fm Gm Ab Bb');
assert.strictEqual(names(pal.dominants), 'A7 B7 C7 D7 E7');
assert.strictEqual(names(M.palette('C', true).field), 'C7M Dm7 Em7 F7M G7 Am7 Bm7(b5)');
assert.strictEqual(names(M.palette('E', false).field), 'E F#m G#m A B C#m D#º');
assert.strictEqual(names(M.palette('Bb', false).field), 'Bb Cm Dm Eb F Gm Aº');
assert.strictEqual(names(M.palette('F#', false).field), 'F# G#m A#m B C# D#m E#º');
pal = M.palette('Am', false);
assert.strictEqual(names(pal.field), 'Am Bº C Dm Em F G');
assert.strictEqual(names(pal.borrowed), 'E A Bm D Bb');
assert.strictEqual(M.palette('', false), null);
pal.field.concat(pal.borrowed, pal.dominants).forEach(x => assert(M.isChord(x.name), x.name));
assert.deepStrictEqual(M.chordsUsed('C  G/B  Am\nletra\nC  D7(9)'), ['C', 'G/B', 'Am', 'D7(9)']);

console.log('ok — todos os testes passaram');
