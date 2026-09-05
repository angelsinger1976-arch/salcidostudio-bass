import { Suite } from './harness.mjs';
import { NoteTracker, DEFAULT_TRACKER_SETTINGS } from '../src/lib/audio/NoteTracker.js';
import { synthBassNote, yinDetect } from '../src/lib/audio/yin.js';

const SR = 48000;
const HOP = 24; // ms entre frames (como el worklet)

/** Copia portátil del Butterworth LP 2º orden (misma fórmula corregida que transcribe.js) */
function lowpassCopy(x, cutoffHz, sampleRate) {
  const nyq = sampleRate / 2;
  const f = Math.min(cutoffHz / nyq, 0.98);
  const T = Math.tan(Math.PI * f);
  const D = 1 + Math.SQRT2 * T + T * T;
  const b0 = (T * T) / D;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = (2 * T * T - 2) / D;
  const a2 = (1 - Math.SQRT2 * T + T * T) / D;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = yn;
    x2 = x1; x1 = xn; y2 = y1; y1 = yn;
  }
  return y;
}

export function run() {
  const s = new Suite('NoteTracker · Estabilización y anti-octavas');

  s.section('Secuencia E1 → A1 → D2 estable (2 frames por nota)');
  {
    const tracker = new NoteTracker({ rmsGate: 0.004, medianN: 3, stableFrames: 2, minConfidence: 0.5, holdMs: 200 });
    const events = [];
    let t = 0;
    // Feed: silencio 100ms → E1 200ms → A1 200ms → D2 200ms → silencio
    const feed = [
      { f0: -1, conf: 0, rms: 0, ms: 100 },
      { f0: 41.2, conf: 0.9, rms: 0.05, ms: 200 },
      { f0: 55.0, conf: 0.9, rms: 0.05, ms: 200 },
      { f0: 75.0, conf: 0.9, rms: 0.05, ms: 200 },
      { f0: -1, conf: 0, rms: 0, ms: 200 },
    ];
    for (const seg of feed) {
      const frames = Math.max(1, Math.round(seg.ms / HOP));
      for (let i = 0; i < frames; i++) {
        t += HOP;
        const upd = tracker.update({ f0: seg.f0, confidence: seg.conf, rms: seg.rms }, t);
        if (upd.changed) events.push({ t, midi: upd.midi, onset: upd.onset });
      }
    }
    const onsets = events.filter((e) => e.onset || e.midi !== null);
    const midiSeq = events.filter((e) => e.midi !== null).map((e) => e.midi);
    // Debe reconocer 28 (E1), 33 (A1), 38 (D2)
    s.assert(midiSeq.includes(28), 'Reconoce E1 (midi 28)');
    s.assert(midiSeq.includes(33), 'Reconoce A1 (midi 33)');
    s.assert(midiSeq.includes(38), 'Reconoce D2 (midi 38)');
    const sawOthers = midiSeq.some((m) => ![28, 33, 38].includes(m));
    s.assert(!sawOthers, `Sin notas espurias (secuencia: ${midiSeq.join(',')})`);
  }

  s.section('Filtro anti-salto de octava (mediana)');
  {
    const tracker = new NoteTracker({ rmsGate: 0.004, medianN: 3, stableFrames: 2, minConfidence: 0.5, holdMs: 200 });
    let t = 0;
    const seq = [];
    // A1 real, pero con un frame espurio que reporta A2 (octava arriba)
    const frames = [
      { f0: 55, conf: 0.9, rms: 0.05 },
      { f0: 55, conf: 0.9, rms: 0.05 },
      { f0: 110, conf: 0.9, rms: 0.05 }, // espurio
      { f0: 55, conf: 0.9, rms: 0.05 },
      { f0: 55, conf: 0.9, rms: 0.05 },
      { f0: 55, conf: 0.9, rms: 0.05 },
    ];
    for (const f of frames) {
      t += HOP;
      const upd = tracker.update(f, t);
      seq.push(upd.midi);
    }
    s.assert(seq.every((m) => m === null || m === 33), `Un frame de octava espuria no contagia la mediana (${seq.join(',')})`);
  }

  s.section('Estabilización: ignora el transitorio del ataque');
  {
    // Nota real sintetizada: ruido de ataque 12 ms + tono estable
    const tracker = new NoteTracker({ rmsGate: 0.004, medianN: 3, stableFrames: 2, minConfidence: 0.5, holdMs: 200 });
    const buf = synthBassNote({ f0: 41.2, seconds: 0.4, sampleRate: SR, attackNoiseMs: 14, attackNoiseGain: 0.5 });
    const win = Math.floor(0.096 * SR);
    let t = 0;
    const detected = [];
    // Simula frames deslizantes como haría el worklet (con LP ~500 Hz)
    const lp = lowpassCopy(buf, 500, SR);
    for (let pos = 0; pos + win <= lp.length; pos += Math.floor(HOP / 1000 * SR)) {
      t += HOP;
      const chunk = lp.slice(pos, pos + win);
      const det = yinDetect(chunk, SR, { fMin: 27, fMax: 520, threshold: 0.15 });
      const upd = tracker.update(det, t);
      if (upd.midi !== null) detected.push(upd.midi);
    }
    s.assert(detected.length > 0, 'Detecta la nota dentro de la nota sostenida');
    s.assert(detected.every((m) => m === 28), `Ignora el ruido del ataque: solo E1 (${detected.slice(0, 5).join(',')}…)`);
  }

  s.section('Nota cambiante rápida (A1→A♯1 en 60 ms de cada una)');
  {
    const tracker = new NoteTracker({ rmsGate: 0.004, medianN: 3, stableFrames: 2, minConfidence: 0.5, holdMs: 150 });
    let t = 0;
    const midi = [];
    for (const f0 of [55, 55, 55, 58.27, 58.27, 58.27]) {
      t += HOP;
      const upd = tracker.update({ f0, conf: 0.9, rms: 0.05 }, t);
      if (upd.midi !== null) midi.push(upd.midi);
    }
    s.assert(midi.includes(33), 'A1 presente');
    s.assert(midi.includes(34), 'A♯1 detectada tras estabilizarse');
  }

  return s;
}
