// ============================================================
// BassCoach · PracticeSession — el "motor de avance"
// Ciclo Rocksmith: nota objetivo iluminada → escucha activa →
// validación (±tolerancia cents, octava libre o estricta) →
// destello de éxito → índice++ → siguiente nota.
// Modos: WAIT (espera al usuario) y FLOW (sigue el tempo).
// ============================================================

import { midiToFreq, positionsForMidi, preferredPosition } from '../theory.js';

export const DEFAULT_SESSION_SETTINGS = {
  centsTolerance: 25,     // ±cents para dar la nota por buena
  octaveStrict: false,    // true: exige octava exacta (posición/cuerda)
  stringStrict: false,    // true: exige la cuerda exacta de la posición sugerida
  minDurationMs: 60,      // duración mínima de nota bien tocada
  holdMs: 120,            // tiempo que debe sostenerse la coincidencia
};

export class PracticeSession {
  /**
   * @param {Array<{midi:number, startTime?:number, duration?:number, label?:string}>} notes
   * @param {object} settings
   */
  constructor(notes = [], settings = {}) {
    this.notes = notes;
    this.settings = { ...DEFAULT_SESSION_SETTINGS, ...settings };
    this.index = 0;
    this.state = 'idle'; // idle | playing | done
    this.events = [];    // [{t, midi, ok, cents, latencyMs}]
    this.stats = { attempts: 0, hits: 0, streak: 0, bestStreak: 0, wrong: 0 };
    this._hitSince = 0;
    this._flashUntil = 0;
    this.onAdvance = null;   // cb({index, note, positions})
    this.onHit = null;       // cb({note, cents, latencyMs})
    this.onMiss = null;      // cb({playedMidi, expectedMidi})
    this.onComplete = null;  // cb(stats)
    this.tuning = 'std4';
    this.maxFret = 15;
  }

  get current() {
    return this.notes[this.index] || null;
  }

  get progress() {
    return this.notes.length ? this.index / this.notes.length : 0;
  }

  positionsFor(note) {
    const midi = note.midi;
    return positionsForMidi(midi, this.tuning, { maxFret: this.maxFret });
  }

  preferredFor(note) {
    return preferredPosition(note.midi, this.tuning, { maxFret: this.maxFret });
  }

  start(atIndex = 0) {
    this.index = atIndex;
    this.state = 'playing';
    this.events = [];
    this.stats = { attempts: 0, hits: 0, streak: 0, bestStreak: 0, wrong: 0 };
    this._hitSince = 0;
    if (this.onAdvance) this.onAdvance({ index: this.index, note: this.current });
  }

  reset() {
    this.state = 'idle';
    this.index = 0;
    this.events = [];
    this.stats = { attempts: 0, hits: 0, streak: 0, bestStreak: 0, wrong: 0 };
  }

  /**
   * Valida una lectura del tracker contra la nota objetivo.
   * @returns {null|{ok:boolean, advanced?:boolean, note?:object, cents?:number}}
   */
  check({ midi, cents, onset }, tNow = performance.now()) {
    if (this.state !== 'playing' || midi == null) return null;
    const target = this.current;
    if (!target) return null;

    const octaveLax = !this.settings.octaveStrict;
    const samePitchClass = ((midi - target.midi) % 12 + 12) % 12 === 0;
    const match = midi === target.midi || (octaveLax && samePitchClass);
    const centsOff = cents ?? 0;

    // Register note attempts only on onsets (nota nueva) para no contar
    // varias veces la misma ejecución
    if (onset) this.stats.attempts++;

    if (!match) {
      if (onset) {
        this.stats.wrong++;
        this.stats.streak = 0;
        if (this.onMiss) this.onMiss({ playedMidi: midi, expectedMidi: target.midi });
      }
      return { ok: false };
    }

    const inTune = Math.abs(centsOff) <= this.settings.centsTolerance;

    if (!inTune) {
      if (onset && this.onMiss) {
        this.onMiss({ playedMidi: midi, expectedMidi: target.midi, cents: centsOff });
      }
      return { ok: false, cents: centsOff };
    }

    // Sostener la coincidencia `holdMs` para puntuar
    if (!this._hitSince) {
      this._hitSince = tNow;
      return { ok: true, cents: centsOff, holding: true };
    }
    if (tNow - this._hitSince < this.settings.holdMs) {
      return { ok: true, cents: centsOff, holding: true };
    }

    // ¡Éxito! Avanza el índice
    this._hitSince = 0;
    this.stats.hits++;
    this.stats.attempts++;   // cada acierto consumido cuenta como intento
    this.stats.streak++;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.events.push({ t: tNow, midi, ok: true, cents: centsOff });

    const done = this.index >= this.notes.length - 1;
    this.index = Math.min(this.index + 1, this.notes.length);
    if (this.onHit) {
      this.onHit({ note: this.notes[this.index - 1], cents: centsOff, done });
    }
    if (done) {
      this.state = 'done';
      if (this.onComplete) this.onComplete(this.stats);
    } else if (this.onAdvance) {
      this.onAdvance({ index: this.index, note: this.current });
    }
    return { ok: true, advanced: true, note: target, cents: centsOff };
  }
}
