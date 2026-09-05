// ============================================================
// BassCoach · AudioEngine
// getUserMedia → filtro paso bajo (~500 Hz, configurable) →
// AudioWorklet YIN. Fallback: AnalyserNode + YIN en main thread.
// ============================================================

import { yinDetect } from './yin.js';
import { NoteTracker } from './NoteTracker.js';
import workletUrl from '../../worklet/yin-processor.worklet.js?url';

export class AudioEngine {
  constructor(settings = {}) {
    this.ctx = null;
    this.stream = null;
    this.node = null;          // worklet node
    this.srcNode = null;
    this.filterNode = null;
    this.analyser = null;      // fallback + medidor de entrada
    this.mode = 'none';        // 'worklet' | 'analyser'
    this.tracker = new NoteTracker(settings.tracker || {});
    this.onDetection = null;   // cb({f0, confidence, rms, cpuMs})
    this.onTrackerUpdate = null;
    this.onLevel = null;
    this._trackerSubs = new Set();   // listeners múltiples (App + vistas)
    this.running = false;
    this.settings = {
      lowpassHz: settings.lowpassHz ?? 500,
      deviceId: settings.deviceId ?? null,
      windowMs: settings.windowMs ?? 96,
      hopMs: settings.hopMs ?? 24,
      fMin: settings.fMin ?? 27,
      fMax: settings.fMax ?? 520,
      threshold: settings.threshold ?? 0.15,
      ...settings,
    };
    this._fallbackTimer = null;
    this._fallbackBuf = null;
    this._lastWorkletPush = 0;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  async listDevices() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  async start({ deviceId = null } = {}) {
    if (this.running) return;
    if (deviceId) this.settings.deviceId = deviceId;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await this.ctx.resume();

    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(this.settings.deviceId ? { deviceId: { exact: this.settings.deviceId } } : {}),
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    this.srcNode = this.ctx.createMediaStreamSource(this.stream);

    // Cadena: fuente → paso bajo (aisla graves) → detector
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = this.settings.lowpassHz;
    this.filterNode.Q.value = 0.707;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 8192;
    this.analyser.smoothingTimeConstant = 0.5;

    this.srcNode.connect(this.filterNode);
    this.filterNode.connect(this.analyser);

    try {
      const url = this.settings.workletUrl || workletUrl;
      await this.ctx.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(this.ctx, 'yin-detector-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,       // solo análisis
        processorOptions: {
          sampleRate: this.ctx.sampleRate,
          fMin: this.settings.fMin,
          fMax: Math.min(this.settings.fMax, this.settings.lowpassHz + 60),
          threshold: this.settings.threshold,
          windowMs: this.settings.windowMs,
          hopMs: this.settings.hopMs,
        },
      });
      this.filterNode.connect(this.node);
      this.node.port.onmessage = (e) => {
        if (e.data && e.data.type === 'detection') this._handleDetection(e.data);
      };
      this.mode = 'worklet';
    } catch (err) {
      // Fallback: Analyser + YIN en el hilo principal (rápido a 8192 muestras)
      this.mode = 'analyser';
      this._fallbackBuf = new Float32Array(this.analyser.fftSize);
      this.running = true;
      this._fallbackLoop();
    }

    this.running = true;
    return this.mode;
  }

  /** Suscripción múltiple a updates del tracker (devuelve unsubscribe) */
  addTrackerListener(fn) {
    this._trackerSubs.add(fn);
    return () => this._trackerSubs.delete(fn);
  }

  removeTrackerListener(fn) {
    this._trackerSubs.delete(fn);
  }

  _fallbackLoop = () => {
    if (!this.running || this.mode !== 'analyser' || !this.ctx) return;
    this.analyser.getFloatTimeDomainData(this._fallbackBuf);
    const now = performance.now();
    if (now - this._lastWorkletPush >= this.settings.hopMs) {
      this._lastWorkletPush = now;
      const res = yinDetect(this._fallbackBuf, this.ctx.sampleRate, {
        fMin: this.settings.fMin,
        fMax: Math.min(this.settings.fMax, this.settings.lowpassHz + 60),
        threshold: this.settings.threshold,
        W: Math.floor(this.settings.windowMs / 1000 * this.ctx.sampleRate) || undefined,
      });
      this._handleDetection(res);
    }
    this._fallbackTimer = requestAnimationFrame(this._fallbackLoop);
  };

  _handleDetection(det) {
    const tNow = performance.now();
    if (this.onDetection) this.onDetection(det);
    const upd = this.tracker.update(det, tNow);
    if (this.onTrackerUpdate) this.onTrackerUpdate(upd, det);
    if (this.onLevel) this.onLevel(det.rms);
  }

  setLowpass(hz) {
    this.settings.lowpassHz = hz;
    if (this.filterNode) this.filterNode.frequency.value = hz;
    this._postWorkletConfig({ fMax: Math.min(this.settings.fMax, hz + 60) });
  }

  setYinConfig(cfg = {}) {
    for (const k of ['fMin', 'fMax', 'threshold', 'windowMs', 'hopMs']) {
      if (typeof cfg[k] === 'number') this.settings[k] = cfg[k];
    }
    this._postWorkletConfig(cfg);
  }

  _postWorkletConfig(cfg) {
    if (this.node && this.node.port) {
      this.node.port.postMessage({ type: 'config', ...cfg });
    }
  }

  setTrackerSettings(s = {}) {
    this.tracker.settings = { ...this.tracker.settings, ...s };
  }

  async stop() {
    this.running = false;
    if (this._fallbackTimer) cancelAnimationFrame(this._fallbackTimer);
    if (this.node) { try { this.node.port.onmessage = null; this.node.disconnect(); } catch {} }
    if (this.analyser) { try { this.analyser.disconnect(); } catch {} }
    if (this.filterNode) { try { this.filterNode.disconnect(); } catch {} }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (this.ctx) { try { await this.ctx.close(); } catch {} this.ctx = null; }
  }
}
