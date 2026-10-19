// Confere a mudança de tom e de velocidade da SoundTouchJS (sem navegador).
// Rodar com: node tests/audio.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
global.window = {};
new Function(fs.readFileSync(path.join(__dirname, '../js/vendor/soundtouch.js'), 'utf8'))();
const { SoundTouch, SimpleFilter, WebAudioBufferSource } = window.SoundTouchLib;

const SR = 44100, SECS = 4, FREQ = 440;
// o Cifrador acrescenta 0,5 s de silêncio no fim, porque a biblioteca não devolve os últimos milissegundos
const PAD = 0.5;
const data = new Float32Array(Math.round(SR * (SECS + PAD))).map((_, i) => i < SR * SECS ? 0.5 * Math.sin(2 * Math.PI * FREQ * i / SR) : 0);
const buffer = { numberOfChannels: 1, duration: SECS, length: data.length, getChannelData: () => data };

function run(semitones, tempo) {
  const st = new SoundTouch();
  st.pitchSemitones = semitones;
  st.tempo = tempo;
  const filter = new SimpleFilter(new WebAudioBufferSource(buffer), st);
  const out = [], chunk = new Float32Array(4096 * 2);
  let n;
  while ((n = filter.extract(chunk, 4096)) > 0) for (let i = 0; i < n; i++) out.push(chunk[i * 2]);
  // frequência pelos cruzamentos de zero, no meio do áudio
  const mid = out.slice(Math.floor(out.length * 0.2), Math.floor(out.length * 0.6));
  let cross = 0;
  for (let i = 1; i < mid.length; i++) if (mid[i - 1] < 0 && mid[i] >= 0) cross++;
  let last = out.length - 1;   // fim do som (ignora o silêncio acrescentado)
  while (last > 0 && Math.abs(out[last]) < 0.01) last--;
  return { freq: cross / (mid.length / SR), secs: last / SR };
}

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, msg + ': ' + a.toFixed(2) + ' (esperado ' + b.toFixed(2) + ')');
let r = run(0, 1);
near(r.freq, 440, 3, 'original'); near(r.secs, 4, 0.3, 'duração original');
r = run(-1, 1);
near(r.freq, 440 * Math.pow(2, -1 / 12), 3, '−½ tom'); near(r.secs, 4, 0.3, 'duração com −½ tom');
r = run(2, 1);
near(r.freq, 440 * Math.pow(2, 2 / 12), 4, '+1 tom'); near(r.secs, 4, 0.3, 'duração com +1 tom');
r = run(0, 0.75);
near(r.freq, 440, 3, 'tom a 75%'); near(r.secs, 4 / 0.75, 0.4, 'duração a 75%');
r = run(-1, 0.9);
near(r.freq, 415.3, 3, '−½ tom a 90%'); near(r.secs, 4 / 0.9, 0.4, 'duração a 90%');
console.log('ok — tom e velocidade conferidos');
