// ============================================================
// BassCoach · NoteTracker (hilo principal)
// Convierte detecciones YIN crudas en notas estables:
//  · RMS gate (umbral de señal)
//  · mediana móvil anti-saltos de octava
//  · estabilización (N frames consecutivos) para ignorar el
//    ruido transitorio del ataque de púa/dedo
//  · conversión Hz → cents sobre la nota afinada más cercana
// ============================================================

import { freqToMidiFloat, midiRoundToCents } from '../theory.js';

export const DEFAULT_TRACKER_SETTINGS = {
  rmsGate: 0.008,        // silencio por debajo de este RMS
  medianN: 3,            // mediana de las últimas N detecciones
  stableFrames: 2,       // frames iguales consecutivos para aceptar nota
  minConfidence: 0.55,   // confianza YIN mínima
  holdMs: 260,           // tiempo que se mantiene la última nota sin señal
};

export class NoteTracker {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_TRACKER_SETTINGS, ...settings };
    this.history = [];        // [{t, f0, confidence, rms}]
    this.midiHistory = [];    // midis flotantes recientes (para mediana)
    this.currentMidi = null;  // midi redondeado actual
    this.currentCents = 0;    // cents respecto a la nota afinada
    this.currentF0 = -1;
    this.confidence = 0;
    this.rms = 0;
    this.lastOnsetTime = 0;
    this.lastNoteTime = 0;
    this.onsets = [];         // eventos de inicio de nota
  }

  reset() {
    this.history = [];
    this.midiHistory = [];
    this.currentMidi = null;
    this.currentCents = 0;
    this.currentF0 = -1;
    this.confidence = 0;
    this.rms = 0;
    this.onsets = [];
  }

  _medianMidi() {
    const arr = this.midiHistory.slice(-this.settings.medianN);
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /**
   * @param {{f0:number, confidence:number, rms:number}} det detección cruda
   * @param {number} tNow tiempo en ms (performance.now())
   * @returns {{changed:boolean, midi:number|null, cents:number, f0:number,
   *            onset:boolean, silence:boolean}}
   */
  update(det, tNow) {
    const { rmsGate, minConfidence, stableFrames, holdMs } = this.settings;
    const silence = det.rms < rmsGate;
    const expired = this.currentMidi !== null && tNow - this.lastNoteTime > holdMs;

    if (silence || det.f0 <= 0 || det.confidence < minConfidence) {
      if (silence && this.currentMidi !== null && tNow - this.lastNoteTime > holdMs) {
        this.currentMidi = null;
        this.currentF0 = -1;
        this.currentCents = 0;
        this.history.push({ t: tNow, f0: -1, confidence: det.confidence, rms: det.rms });
        return { changed: true, midi: null, cents: 0, f0: -1, onset: false, silence: true };
      }
      return { changed: false, midi: this.currentMidi, cents: this.currentCents, f0: this.currentF0, onset: false, silence };
    }

    const midiFloat = freqToMidiFloat(det.f0);
    const midi = Math.round(midiFloat);
    const cents = Math.round((midiFloat - midi) * 100);

    this.history.push({ t: tNow, f0: det.f0, confidence: det.confidence, rms: det.rms });
    this.midiHistory.push(midiFloat);
    if (this.midiHistory.length > 24) this.midiHistory.shift();
    this.lastNoteTime = tNow;

    const medianMidi = Math.round(this._medianMidi());
    const sameAsCurrent = medianMidi === this.currentMidi;

    // ¿N frames consecutivos con la misma mediana? (estabilización anti-ataque)
    const tail = this.midiHistory.slice(-stableFrames).map((m) => Math.round(m));
    const stable = tail.length >= stableFrames && tail.every((m) => m === medianMidi);

    let onset = false;
    if (stable && !sameAsCurrent) {
      onset = this.currentMidi !== null;
      this.currentMidi = medianMidi;
      this.currentCents = Math.round((midiFloat - medianMidi) * 100);
      this.currentF0 = det.f0;
      if (onset || this.onsets.length === 0) this.onsets.push({ t: tNow, midi: medianMidi });
      return { changed: true, midi: medianMidi, cents: this.currentCents, f0: det.f0, onset: true, silence: false };
    }

    this.currentCents = Math.round((midiFloat - (this.currentMidi ?? medianMidi)) * 100);
    return {
      changed: false,
      midi: this.currentMidi,
      cents: this.currentCents,
      f0: det.f0,
      onset: false,
      silence: false,
    };
  }

  /** Registro completo de notas (para la vista de transcripción en vivo) */
  noteLog() {
    return [...this.onsets];
  }
}
