import { Suite } from './harness.mjs';
import { transcribeMonophonic, lowpassIIR } from '../src/lib/transcription/transcribe.js';
import { synthBassNote } from '../src/lib/audio/yin.js';

const SR = 22050;

export function run() {
  const s = new Suite('Transcripción DSP · Fallback monofónico');

  s.section('Filtro paso bajo IIR');
  {
    // Genera una señal con 41 Hz + 4000 Hz y comprueba que el LP atenuó los agudos
    const n = SR;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = Math.sin(2 * Math.PI * 41 * i / SR) + 0.7 * Math.sin(2 * Math.PI * 4000 * i / SR);
    }
    const y = lowpassIIR(x, 500, SR);
    const rmsY = Math.sqrt(y.reduce((a, v) => a + v * v, 0) / y.length);
    const rmsX = Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
    // El componente de 4000 Hz se elimina: queda solo el grave (rms de un sine
    // unitario ≈ 0.707). La señal de entrada mezcla grave+agudo (rms ≈ 0.863).
    s.approx(rmsY, 0.707, 0.02, `LP elimina los agudos (rms ${rmsY.toFixed(3)} ≈ solo-grave 0.707; entrada ${rmsX.toFixed(3)})`);
    s.assert(rmsY < rmsX, `La salida es menor que la entrada mezclada (${rmsY.toFixed(3)} < ${rmsX.toFixed(3)})`);
    // El grave sobreviva intacto
    s.assert(rmsY > 0.5, `LP conserva el grave (rms ${rmsY.toFixed(3)})`);
  }

  s.section('Transcribe secuencia conocida: E1 A1 D2 G2 (0.4 s cada una)');
  {
    const segs = [
      { f0: 41.203, ms: 400 },
      { f0: 55.0, ms: 400 },
      { f0: 73.416, ms: 400 },
      { f0: 97.999, ms: 400 },
    ];
    const parts = [];
    let total = 0;
    for (const seg of segs) {
      parts.push(synthBassNote({ f0: seg.f0, seconds: seg.ms / 1000, sampleRate: SR, harmonics: 6 }));
      total += seg.ms / 1000;
    }
    // Une con un pequeño silencio entre notas
    const gap = new Float32Array(Math.floor(0.06 * SR));
    const joined = concatWithGaps(parts, gap, SR);
    const notes = transcribeMonophonic(joined, SR, { rmsGate: 0.01 });
    s.assert(notes.length === 4, `Encuentra 4 notas (obtenido ${notes.length}: ${notes.map((n) => n.midi).join(',')})`);
    if (notes.length === 4) {
      s.eq(notes.map((n) => n.midi), [28, 33, 38, 43], 'Midis correctos E1 A1 D2 G2');
      s.approx(notes[0].startTime, 0, 0.08, 'Inicio de la 1ª nota ≈ 0 s');
      s.approx(notes[1].startTime, 0.46, 0.08, 'Inicio de la 2ª nota ≈ 0.46 s');
      s.approx(notes[2].startTime, 0.92, 0.08, 'Inicio de la 3ª nota ≈ 0.92 s');
      s.assert(notes.every((n) => n.duration > 0.15 && n.duration < 0.55), `Duraciones plausibles (${notes.map((n) => n.duration.toFixed(2)).join(', ')})`);
    }
  }

  s.section('Riff: G1 G1 A1 C2 (tresillo de bombo clásico)');
  {
    const seq = [48.999, 48.999, 55.0, 65.406];
    const parts = seq.map((f0, i) => synthBassNote({ f0, seconds: 0.25, sampleRate: SR, harmonics: 6 }));
    const gap = new Float32Array(Math.floor(0.05 * SR));
    const joined = concatWithGaps(parts, gap, SR);
    const notes = transcribeMonophonic(joined, SR, { rmsGate: 0.01 });
    s.assert(notes.length >= 3, `Detecta las notas del riff (${notes.map((n) => n.midi).join(',')})`);
    const midis = notes.map((n) => n.midi);
    s.assert(midis.includes(31) && midis.includes(33) && midis.includes(36), 'G1, A1 y C2 presentes');
  }

  s.section('Oculta armónicos de púa y notas por debajo de A0');
  {
    // Señal de "guitarra" a 220 Hz no debe transcribirse como bajo
    const gtr = synthBassNote({ f0: 220, seconds: 0.5, sampleRate: SR, harmonics: 4 });
    const notes = transcribeMonophonic(gtr, SR, { rmsGate: 0.01 });
    s.assert(notes.length === 0, `220 Hz (A3) fuera de rango de bajo (${notes.map((n) => n.midi).join(',')})`);
  }

  return s;
}

function concatWithGaps(parts, gap) {
  const total = parts.reduce((a, p) => a + p.length, 0) + gap.length * Math.max(0, parts.length - 1);
  const out = new Float32Array(total);
  let off = 0;
  parts.forEach((p, i) => {
    out.set(p, off);
    off += p.length;
    if (i < parts.length - 1) { out.set(gap, off); off += gap.length; }
  });
  return out;
}
