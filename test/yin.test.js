import { Suite } from './harness.mjs';
import { yinDetect, synthBassNote } from '../src/lib/audio/yin.js';

const SR = 48000;

export function run() {
  const s = new Suite('YIN · Detección de tono (bajo)');

  // Frecuencias afinadas de las cuerdas de bajo (4 y 5 cuerdas)
  const cases = [
    { name: 'B0 (bajo 5 cuerdas)', f0: 30.868, midi: 23 },
    { name: 'E1', f0: 41.203, midi: 28 },
    { name: 'A1', f0: 55.0, midi: 33 },
    { name: 'D2', f0: 73.416, midi: 38 },
    { name: 'G2', f0: 97.999, midi: 43 },
    { name: 'C2 (traste 8 de E1)', f0: 65.406, midi: 36 },
    { name: 'G1 (traste 3 de E1)', f0: 48.999, midi: 31 },
  ];

  s.section('Notas de bajo sintéticas (8 armónicos + ruido de ataque)');
  for (const c of cases) {
    const buf = synthBassNote({ f0: c.f0, seconds: 0.35, sampleRate: SR });
    const det = yinDetect(buf, SR, { fMin: 27, fMax: 520, threshold: 0.15 });
    s.assert(det.f0 > 0, `${c.name}: se detecta tono (f0=${det.f0.toFixed(2)})`);
    s.approx(det.f0, c.f0, 0.9, `${c.name}: frecuencia precisa`);
    s.assert(det.confidence > 0.6, `${c.name}: confianza alta (${det.confidence.toFixed(2)})`);
    const midi = Math.round(12 * Math.log2(det.f0 / 440) + 69);
    s.eq(midi, c.midi, `${c.name}: MIDI correcto`);
  }

  s.section('Desafío: fundamental débil (riesgo de error de octava)');
  {
    const buf = synthBassNote({ f0: 41.203, seconds: 0.35, sampleRate: SR, f0Gain: 0.25, harmonics: 10 });
    const det = yinDetect(buf, SR, { fMin: 27, fMax: 520, threshold: 0.15 });
    s.assert(det.f0 > 0 && det.f0 < 60, `Fundamental E1 hallada pese a armónicos dominantes (f0=${det.f0.toFixed(2)})`);
    s.approx(det.f0, 41.203, 1.2, 'E1 con fundamental débil: frecuencia');
  }

  s.section('Tolerancia de afinación (cents)');
  for (const centsOff of [-18, -8, 0, 9, 19]) {
    const buf = synthBassNote({ f0: 55.0, seconds: 0.3, sampleRate: SR, centsOff });
    const det = yinDetect(buf, SR, { fMin: 27, fMax: 520, threshold: 0.15 });
    const midiFloat = 12 * Math.log2(det.f0 / 440) + 69;
    const cents = (midiFloat - 33) * 100;
    s.approx(cents, centsOff, 6, `A1 ${centsOff > 0 ? '+' : ''}${centsOff} cents → leído ${cents.toFixed(1)} cents`);
    s.eq(Math.round(midiFloat), 33, `A1 ${centsOff} cents sigue siendo La1`);
  }

  s.section('Silencio y ruido puro');
  {
    const silence = new Float32Array(8192);
    const det = yinDetect(silence, SR, { fMin: 27, fMax: 520 });
    s.eq(det.f0, -1, 'Silencio: sin tono');
  }
  {
    const noise = new Float32Array(16384);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
    const det = yinDetect(noise, SR, { fMin: 27, fMax: 520, threshold: 0.15 });
    // El ruido blanco puede dar un "tono" espurio: la confianza debe ser baja
    s.assert(det.f0 === -1 || det.confidence < 0.75, `Ruido blanco: sin detección confiable (f0=${det.f0}, conf=${det.confidence.toFixed(2)})`);
  }

  s.section('Nota corta (staccato, 150 ms)');
  {
    const buf = synthBassNote({ f0: 73.416, seconds: 0.15, sampleRate: SR });
    const det = yinDetect(buf, SR, { fMin: 27, fMax: 520, threshold: 0.15, W: Math.floor(buf.length / 2) });
    s.assert(det.f0 > 0, `D2 staccato detectada (f0=${det.f0?.toFixed(2)})`);
  }

  return s;
}
