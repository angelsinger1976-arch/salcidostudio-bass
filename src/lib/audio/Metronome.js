// ============================================================
// BassCoach · Metrónomo (Web Audio, osciladores sintetizados)
// BPM, compás, subdivisión, acento en el primer tiempo.
// ============================================================

export const SUBDIVISIONS = [
  { id: 'quarter', label: '♩', latin: 'Negras', clicks: 1 },
  { id: 'eighth', label: '♪♪', latin: 'Corcheas', clicks: 2 },
  { id: 'triplet', label: '3', latin: 'Tresillos', clicks: 3 },
  { id: 'sixteenth', label: '♬♬', latin: 'Semicorcheas', clicks: 4 },
];

export class Metronome {
  constructor() {
    this.ctx = null;
    this.timer = null;
    this.running = false;
    this.bpm = 90;
    this.beatsPerBar = 4;
    this.subdivision = 'quarter';
    this.countIn = 0;        // 0 = desactivado; N = cuenta atrás de N tiempos
    this.countInLeft = 0;
    this.beatNumber = 0;     // índice global de clic
    this.onBeat = null;      // cb({beatInBar, isDownbeat, isCountIn})
    this._scheduledUntil = 0;
    this._nextNoteTime = 0;
  }

  get subClicks() {
    return (SUBDIVISIONS.find((s) => s.id === this.subdivision) || SUBDIVISIONS[0]).clicks;
  }

  async start({ bpm = this.bpm, beatsPerBar = this.beatsPerBar, subdivision = this.subdivision, countIn = this.countIn } = {}) {
    if (this.running) return;
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.subdivision = subdivision;
    this.countIn = countIn;
    this.countInLeft = countIn;
    this.beatNumber = 0;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.running = true;
    this._nextNoteTime = this.ctx.currentTime + 0.08;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.ctx) { try { this.ctx.close(); } catch {} this.ctx = null; }
    this.countInLeft = 0;
  }

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(280, Math.round(bpm)));
  }

  _loop = () => {
    if (!this.running || !this.ctx) return;
    // Programa hasta 200 ms por delante (lookahead scheduler)
    while (this._nextNoteTime < this.ctx.currentTime + 0.2) {
      this._scheduleClick(this._nextNoteTime, this.beatNumber);
      const secPerBeat = 60 / this.bpm;
      const sub = this.subClicks;
      // _scheduleClick avanza un tiempo completo; subdividimos entre clics
      if (sub === 1) {
        this._nextNoteTime += secPerBeat;
        this.beatNumber++;
      } else {
        // primer clic del grupo ya sonó: programa el resto del grupo
        for (let i = 1; i < sub; i++) {
          this._playTone(this._nextNoteTime + (secPerBeat * i) / sub, 'sub');
        }
        this._nextNoteTime += secPerBeat;
        this.beatNumber++;
      }
    }
    this.timer = setTimeout(this._loop, 40);
  };

  _scheduleClick(time, beatNumber) {
    const inCountIn = this.countInLeft > 0;
    if (inCountIn) this.countInLeft--;
    const beatInBar = beatNumber % this.beatsPerBar;
    const isDownbeat = beatInBar === 0;
    const type = inCountIn ? 'count' : isDownbeat ? 'down' : 'beat';
    this._playTone(time, type);
    const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      if (this.onBeat) this.onBeat({ beatInBar, isDownbeat, isCountIn: inCountIn, beatNumber });
    }, delay);
  }

  _playTone(time, type) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    let freq = 1000, vol = 0.5, dur = 0.05;
    if (type === 'down') { freq = 1500; vol = 0.8; dur = 0.07; }
    else if (type === 'beat') { freq = 1000; vol = 0.55; }
    else if (type === 'sub') { freq = 800; vol = 0.22; dur = 0.03; }
    else if (type === 'count') { freq = 660; vol = 0.4; }
    osc.frequency.value = freq;
    osc.type = 'square';
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }
}

/** Tap tempo: acumula deltas y devuelve el BPM estimado */
export class TapTempo {
  constructor(maxTaps = 8) {
    this.taps = [];
    this.maxTaps = maxTaps;
  }
  tap(tNow = performance.now()) {
    if (this.taps.length && tNow - this.taps[this.taps.length - 1] > 2500) this.taps = [];
    this.taps.push(tNow);
    if (this.taps.length > this.maxTaps) this.taps.shift();
    if (this.taps.length < 2) return null;
    const deltas = this.taps.slice(1).map((t, i) => t - this.taps[i]);
    const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    return Math.max(30, Math.min(280, Math.round(60000 / avg)));
  }
  reset() { this.taps = []; }
}
