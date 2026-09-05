// ============================================================
// BassCoach · Transcripción offline (Audio → Notas)
// Motor primario: Basic Pitch (Spotify) — modelo IA incluido,
// cargado perezosamente (tf.js + modelo solo si se usa).
// Fallback: transcriptor DSP propio (monofónico, optimizado a
// bajo: paso bajo IIR + YIN + segmentación por RMS).
// Ambos devuelven la misma estructura:
//   [{ midi, startTime, duration, amplitude }]
// ============================================================

import { freqToMidiFloat } from '../theory.js';
import { yinDetect } from '../audio/yin.js';

export const BP_SAMPLE_RATE = 22050;

function round3(x) { return Math.round(x * 1000) / 1000; }

// ------------------------------------------------------------
// Decodificación y remuestreo en el navegador
// ------------------------------------------------------------
export async function decodeAudioFile(arrayBuffer) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await ac.decodeAudioData(arrayBuffer);
  } finally {
    try { ac.close(); } catch {}
  }
}

export async function resampleTo(buffer, targetRate = BP_SAMPLE_RATE) {
  if (buffer.sampleRate === targetRate) return buffer;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OAC(1, Math.ceil(buffer.duration * targetRate), targetRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  return offline.startRendering();
}

export function bufferToMonoFloat32(buffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const out = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) out[i] = (L[i] + R[i]) / 2;
  return out;
}

// ------------------------------------------------------------
// Filtro Butterworth paso bajo 2º orden (portable, para Node y Web)
// Derivación bilineal con pre-warp: H(s)=1/(s²+√2·s+1), s←(1/T)(1−z⁻¹)/(1+z⁻¹)
// ------------------------------------------------------------
export function lowpassIIR(x, cutoffHz, sampleRate) {
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

// ------------------------------------------------------------
// Transcriptor DSP propio (fallback monofónico para bajo)
// ------------------------------------------------------------
export function transcribeMonophonic(float32, sampleRate, opts = {}) {
  const {
    windowMs = 80,
    hopMs = 20,
    rmsGate = 0.008,
    minNoteMs = 80,
    lowpassHz = 700,
    maxMidi = 48,          // C3
    minMidi = 21,          // A0
    yinThreshold = 0.15,
    minConfidence = 0.5,
    midiJumpTol = 0.65,    // semitonos para considerar la misma nota
  } = opts;

  const filtered = lowpassIIR(float32, lowpassHz, sampleRate);
  const win = Math.max(256, Math.floor((windowMs / 1000) * sampleRate));
  const hop = Math.max(64, Math.floor((hopMs / 1000) * sampleRate));

  const notes = [];
  let current = null; // {midiF, startT, endT, confSum, n, ampSum}

  const closeCurrent = (endT) => {
    if (!current) return;
    current.endT = endT;
    const ms = (current.endT - current.startT) * 1000;
    if (ms >= minNoteMs) {
      notes.push({
        midi: Math.round(current.midiF),
        startTime: round3(current.startT),
        duration: round3(Math.max(0.05, current.endT - current.startT)),
        amplitude: round3(Math.min(1, (current.ampSum / Math.max(1, current.n)) * 2.5)),
        confidence: round3(current.confSum / Math.max(1, current.n)),
      });
    }
    current = null;
  };

  for (let start = 0; start + win <= filtered.length; start += hop) {
    const chunk = filtered.subarray(start, start + win);
    let sumSq = 0;
    for (let i = 0; i < win; i++) sumSq += chunk[i] * chunk[i];
    const rms = Math.sqrt(sumSq / win);
    const t = start / sampleRate;

    if (rms < rmsGate) { closeCurrent(t); continue; }

    const det = yinDetect(chunk, sampleRate, {
      fMin: 27, fMax: 900, threshold: yinThreshold, W: Math.floor(win / 2),
    });
    if (det.f0 <= 0 || det.confidence < minConfidence) { closeCurrent(t); continue; }

    const midiF = freqToMidiFloat(det.f0);
    const midi = Math.round(midiF);
    if (midi < minMidi || midi > maxMidi) { closeCurrent(t); continue; }

    if (current && Math.abs(midiF - current.midiF) <= midiJumpTol) {
      // misma nota: media móvil y extiende duración
      current.midiF = current.midiF + (midiF - current.midiF) * 0.25;
      current.endT = t + win / sampleRate;
      current.confSum += det.confidence;
      current.ampSum += rms;
      current.n++;
    } else {
      closeCurrent(t);
      current = {
        midiF, startT: t, endT: t + win / sampleRate,
        confSum: det.confidence, ampSum: rms, n: 1,
      };
    }
  }
  closeCurrent(filtered.length / sampleRate);
  return notes;
}

// ------------------------------------------------------------
// Basic Pitch (carga perezosa)
// ------------------------------------------------------------
let basicPitchPromise = null;

export async function loadBasicPitch() {
  if (!basicPitchPromise) {
    basicPitchPromise = (async () => {
      // basic-pitch trae su propia copia de @tensorflow/tfjs (dependencia
      // directa del paquete) — no la importamos aparte para evitar duplicados.
      const bpModule = await import('@spotify/basic-pitch');
      // Modelo servido localmente desde /basic-pitch (shard binario resuelto
      // por tf.io relative a model.json)
      const modelUrl = new URL('basic-pitch/model.json', document.baseURI).href;
      const bp = new bpModule.BasicPitch(modelUrl);
      await bp.model;
      return { bp, outputToNotesPoly: bpModule.outputToNotesPoly, noteFramesToTime: bpModule.noteFramesToTime };
    })();
  }
  return basicPitchPromise;
}

export function isBasicPitchAvailable() {
  try {
    // WebAssembly + WebGL/CPU backend deben existir en el navegador
    return typeof WebAssembly === 'object' && typeof window !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Transcribe con Basic Pitch.
 * @param {Float32Array} audioFloat32 señal mono a 22 050 Hz
 */
export async function transcribeWithBasicPitch(audioFloat32, { onProgress = null } = {}) {
  const { bp, outputToNotesPoly, noteFramesToTime } = await loadBasicPitch();

  return new Promise((resolve, reject) => {
    let allFrames = [], allOnsets = [];
    let finished = false;

    bp.evaluateModel(
      audioFloat32,
      (frames, onsets, contours) => {
        allFrames = allFrames.concat(frames);
        allOnsets = allOnsets.concat(onsets);
      },
      (p) => {
        if (onProgress) onProgress(Math.round(p * 100));
        if (p >= 1.0 && !finished) {
          finished = true;
          try {
            // Rango de bajo: A0 (21) hasta C4. minNoteLen ≈ 80 ms.
            // ¡OJO! minFreq NO puede ser < 27.5 Hz (A0, piso del modelo):
            // constrainFrequency calcula hzToMidi(25)-21 = -1.65 y
            // Array.fill(0, 0, -1.65) interpreta el índice negativo como
            // relativo-al-final → ¡borra TODA la matriz de pitches!
            // Por eso minFreq = null (el filtro 21-60 se aplica después).
            const noteEvents = outputToNotesPoly(
              allFrames, allOnsets,
              0.5,   // onsetThresh
              0.3,   // frameThresh
              7,     // minNoteLen en frames (86 fps → ~80 ms)
              true,  // inferOnsets
              500,   // maxFreq Hz (sube hasta B4, bajo + armónicos)
              null,  // minFreq — ver advertencia arriba
              true   // melodiaTrick
            );
            const timed = noteFramesToTime(noteEvents);
            resolve(timed.map((n) => ({
              midi: n.pitchMidi,
              startTime: round3(n.startTimeSeconds),
              duration: round3(n.durationSeconds),
              amplitude: round3(n.amplitude ?? 0.5),
            })));
          } catch (err) {
            reject(err);
          }
        }
      }
    ).catch(reject);
  });
}

// ------------------------------------------------------------
// Limpieza de línea de bajo (cuasi-monofónica):
//  1) Fantasmas armónicos: nota más aguda que arranca dentro del
//     intervalo de una nota más grave activa (el modelo reporta los
//     armónicos 2º/3º/5º como notas propias).
//  2) Fantasmas de anticipación: micro-notas (<120 ms) solapadas con
//     una nota más larga (smear del onset hacia el ataque siguiente).
// ------------------------------------------------------------
export function cleanBassLine(notes) {
  if (!notes.length) return notes;
  const TOL = 0.05;                  // tolerancia de solapamiento
  const MIN = 0.12;                  // duración máxima de nota fantasma
  const HARM = [12, 19, 24, 31];     // armónicos 2º/3º/4º/5º (+12=octava)

  const end = (n) => n.startTime + n.duration;
  const overlaps = (a, b) =>
    a.startTime < end(b) - TOL && b.startTime < end(a) - TOL;

  // Evaluación por pares contra TODAS las notas (los fantasmas pueden
  // anticiparse a su fundamental — el orden secuencial no basta).
  const ghost = new Set();
  for (const n of notes) {
    if (ghost.has(n)) continue;
    for (const m of notes) {
      if (m === n || ghost.has(m)) continue;
      if (!overlaps(n, m)) continue;

      // 1) Armónico: m (grave y dominante) explica a n (agudo).
      //    Cubre octava fantasma del mismo onset y armónicos superiores.
      if (m.midi < n.midi && HARM.includes(n.midi - m.midi) &&
          m.amplitude >= n.amplitude * 0.8) {
        ghost.add(n); break;
      }
      // 2) Smear de onset: micro-nota solapada con una nota dominante
      //    (el modelo difumina el ataque hacia la nota siguiente).
      if (n.duration < MIN &&
          (m.midi === n.midi
            ? m.duration >= n.duration && m.amplitude >= n.amplitude * 0.8
            : m.amplitude > n.amplitude * 1.2)) {
        ghost.add(n); break;
      }
    }
  }
  return notes.filter((n) => !ghost.has(n));
}

/**
 * Pipeline completo: ArrayBuffer (mp3/wav/ogg) → [{midi, startTime, duration}]
 * Usa Basic Pitch; si falla (modelo, WASM, memoria) → fallback DSP.
 */
export async function transcribeAudioFile(arrayBuffer, { onProgress = null, onEngine = null, decodedBuffer = null } = {}) {
  // decodedBuffer: AudioBuffer ya decodificado (evita re-decodificar un
  // ArrayBuffer detachado — decodeAudioData separa el buffer tras la 1ª vez).
  const buffer = decodedBuffer || await decodeAudioFile(arrayBuffer);
  const mono = bufferToMonoFloat32(buffer);
  const resampled = await resampleTo(buffer, BP_SAMPLE_RATE);
  const data = resampled.getChannelData(0);

  if (isBasicPitchAvailable()) {
    try {
      if (onEngine) onEngine('basic-pitch');
      const notes = await transcribeWithBasicPitch(data, { onProgress });
      // Limpieza de armónicos/fantasmas + filtro al rango de bajo
      // (E1=28 hasta C4=60 con 15 trastes) y orden temporal.
      const bassNotes = cleanBassLine(notes)
        .filter((n) => n.midi >= 21 && n.midi <= 60)
        .sort((a, b) => a.startTime - b.startTime);
      if (bassNotes.length) return { engine: 'basic-pitch', notes: bassNotes };
    } catch (err) {
      console.warn('[BassCoach] Basic Pitch falló, usando fallback DSP:', err);
    }
  }

  if (onEngine) onEngine('dsp');
  const notes = transcribeMonophonic(mono, buffer.sampleRate);
  return { engine: 'dsp', notes };
}
