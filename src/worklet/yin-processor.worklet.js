// ============================================================
// BassCoach · AudioWorklet YIN
// Se registra como 'yin-detector-processor'. Recibe Float32 frames
// del micrófono (ya filtrados), mantiene un buffer circular y
// publica {f0, confidence, rms, cpu} por message cada bloque.
//
// NOTA: este archivo se sirve como texto y se ejecuta en el
// AudioWorkletGlobalScope (sin imports). YIN vive inline aquí.
// ============================================================

class YinRingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buf = new Float32Array(capacity);
    this.len = 0;
    this.start = 0;
  }
  push(arr) {
    for (let i = 0; i < arr.length; i++) this._pushOne(arr[i]);
  }
  _pushOne(v) {
    const idx = (this.start + this.len) % this.capacity;
    this.buf[idx] = v;
    if (this.len < this.capacity) this.len++;
    else this.start = (this.start + 1) % this.capacity;
  }
  /** Copia los últimos n muestras en orden temporal */
  last(n) {
    const count = Math.min(n, this.len);
    const out = new Float32Array(count);
    const from = (this.start + this.len - count + this.capacity) % this.capacity;
    for (let i = 0; i < count; i++) out[i] = this.buf[(from + i) % this.capacity];
    return out;
  }
}

class YinDetectorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.sampleRate = opts.sampleRate || sampleRate;
    this.fMin = opts.fMin || 27;      // B0 ≈ 30.87 Hz → cubre bajos de 5 cuerdas
    this.fMax = opts.fMax || 520;     // G2+6 semitonos; el LP del main thread recorta >500
    this.threshold = opts.threshold || 0.15;
    this.windowMs = opts.windowMs || 96;   // ~3 periodos de B0 → YIN estable
    this.hopMs = opts.hopMs || 24;         // publicar ~41/s

    this.winSamples = Math.floor((this.windowMs / 1000) * this.sampleRate);
    this.hopSamples = Math.floor((this.hopMs / 1000) * this.sampleRate);
    this.ring = new YinRingBuffer(this.winSamples + 4096);
    this.sinceLast = 0;
    this.cpuAccum = 0;
    this.blocks = 0;

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'config') {
        if (typeof d.fMin === 'number') this.fMin = d.fMin;
        if (typeof d.fMax === 'number') this.fMax = d.fMax;
        if (typeof d.threshold === 'number') this.threshold = d.threshold;
        if (typeof d.windowMs === 'number') {
          this.windowMs = d.windowMs;
          this.winSamples = Math.floor((this.windowMs / 1000) * this.sampleRate);
          this.ring = new YinRingBuffer(this.winSamples + 4096);
        }
        if (typeof d.hopMs === 'number') {
          this.hopMs = d.hopMs;
          this.hopSamples = Math.floor((this.hopMs / 1000) * this.sampleRate);
        }
      }
    };
  }

  yin(buf) {
    const sampleRate = this.sampleRate;
    const threshold = this.threshold;
    const fMin = this.fMin;
    const fMax = this.fMax;
    const W = Math.floor(buf.length / 2);
    const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
    const tauMax = Math.min(W - 1, Math.ceil(sampleRate / fMin));
    if (tauMax <= tauMin || buf.length < W + tauMax) {
      return { f0: -1, confidence: 0, rms: this._rms(buf) };
    }
    const d = new Float32Array(tauMax + 1);
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        const diff = buf[j] - buf[j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    const cmnd = new Float32Array(tauMax + 1);
    let runningSum = 0;
    cmnd[tauMin] = 1;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) {
      runningSum += d[tau];
      cmnd[tau] = runningSum === 0 ? 1 : (d[tau] * (tau - tauMin + 1)) / runningSum;
    }
    let tauEstimate = -1;
    for (let tau = tauMin + 1; tau < tauMax; tau++) {
      if (cmnd[tau] < threshold) {
        while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
        tauEstimate = tau;
        break;
      }
    }
    if (tauEstimate === -1) {
      let best = Infinity;
      for (let tau = tauMin; tau <= tauMax; tau++) {
        if (cmnd[tau] < best) { best = cmnd[tau]; tauEstimate = tau; }
      }
      if (best > 0.6) return { f0: -1, confidence: Math.max(0, 1 - best), rms: this._rms(buf) };
    }
    const x0 = tauEstimate > tauMin ? tauEstimate - 1 : tauEstimate;
    const x2 = tauEstimate + 1 < cmnd.length ? tauEstimate + 1 : tauEstimate;
    let betterTau = tauEstimate;
    if (x0 !== tauEstimate && x2 !== tauEstimate) {
      const s0 = cmnd[x0], s1 = cmnd[tauEstimate], s2 = cmnd[x2];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
    }
    const f0 = sampleRate / betterTau;
    if (f0 < fMin || f0 > fMax) return { f0: -1, confidence: 0, rms: this._rms(buf) };
    return { f0, confidence: Math.max(0, Math.min(1, 1 - cmnd[tauEstimate])), rms: this._rms(buf) };
  }

  _rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / Math.max(1, buf.length));
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]) {
      return true;
    }
    const ch = input[0];
    this.ring.push(ch);
    this.sinceLast += ch.length;
    if (this.sinceLast >= this.hopSamples && this.ring.len >= this.winSamples) {
      this.sinceLast = 0;
      const t0 = currentTime;
      const result = this.yin(this.ring.last(this.winSamples));
      const cpuMs = (currentTime - t0) * 1000;
      this.cpuAccum += cpuMs;
      this.blocks++;
      this.port.postMessage({
        type: 'detection',
        f0: result.f0,
        confidence: result.confidence,
        rms: result.rms,
        cpuMs,
        avgCpuMs: this.cpuAccum / Math.max(1, this.blocks),
        windowMs: this.windowMs,
      });
    }
    return true;
  }
}

registerProcessor('yin-detector-processor', YinDetectorProcessor);
