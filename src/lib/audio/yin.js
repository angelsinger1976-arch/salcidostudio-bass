// ============================================================
// BassCoach · YIN (implementación de referencia, hilo principal)
// Detección de tono robusta para graves (B0 ≈ 30.87 Hz).
// La misma lógica vive inline en src/worklet/yin-processor.worklet.js
// (se evalúa en tests para garantizar paridad).
// ============================================================

/**
 * Detecta f0 con YIN + interpolación parabólica.
 * @param {Float32Array} buf   señal (se recomienda ≥ 2 periodos de la f0 mínima)
 * @param {number} sampleRate
 * @param {object} opts {threshold=0.12, fMin=25, fMax=520, W} W = ventana de integración
 * @returns {{f0:number, confidence:number, rms:number}} f0 en Hz (-1 si no hay tono)
 */
export function yinDetect(buf, sampleRate, opts = {}) {
  const threshold = opts.threshold ?? 0.12;
  const fMin = opts.fMin ?? 25;
  const fMax = opts.fMax ?? 520;
  const W = opts.W ?? Math.floor(buf.length / 2); // ventana de integración

  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  const tauMax = Math.min(W - 1, Math.ceil(sampleRate / fMin));

  if (tauMax <= tauMin || buf.length < W + tauMax) {
    return { f0: -1, confidence: 0, rms: rmsOf(buf) };
  }

  // Función de diferencia d(τ) = Σ (x[j] − x[j+τ])²
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Normalización acumulativa CMND
  const cmnd = new Float32Array(tauMax + 1);
  let runningSum = 0;
  cmnd[tauMin] = 1;
  for (let tau = tauMin + 1; tau <= tauMax; tau++) {
    runningSum += d[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (d[tau] * (tau - tauMin + 1)) / runningSum;
  }

  // Búsqueda del primer mínimo local bajo el umbral (si no, mínimo global)
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
      if (cmnd[tau] < best) {
        best = cmnd[tau];
        tauEstimate = tau;
      }
    }
    if (best > 0.6) return { f0: -1, confidence: Math.max(0, 1 - best), rms: rmsOf(buf) };
  }

  // Interpolación parabólica sobre el mínimo
  const x0 = tauEstimate > tauMin ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate + 1 < cmnd.length ? tauEstimate + 1 : tauEstimate;
  let betterTau = tauEstimate;
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = cmnd[x0];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }

  const f0 = sampleRate / betterTau;
  if (f0 < fMin || f0 > fMax) return { f0: -1, confidence: 0, rms: rmsOf(buf) };

  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tauEstimate]));
  return { f0, confidence, rms: rmsOf(buf) };
}

export function rmsOf(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

/**
 * Sintetiza una nota de bajo "realista" para tests:
 * armónicos 1/k, ligera inharmonicidad, envolvente de púa y
 * ráfaga de ruido de ataque (transitorio no armónico).
 */
export function synthBassNote({
  f0,
  seconds = 1.0,
  sampleRate = 48000,
  harmonics = 8,
  f0Gain = 1.0,
  attackNoiseMs = 12,
  attackNoiseGain = 0.5,
  centsOff = 0,
  decay = 1.2,
} = {}) {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  const actualF0 = f0 * Math.pow(2, centsOff / 1200);
  const noiseEnd = Math.floor((attackNoiseMs / 1000) * sampleRate);
  const attackEnd = Math.floor(0.006 * sampleRate);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (let k = 1; k <= harmonics; k++) {
      const g = (k === 1 ? f0Gain : 1) / k;
      // Inharmonicidad realista de cuerda entorchada de bajo (B ≈ 8e-5)
      const inh = 1 + 0.00008 * (k * k - 1);
      v += g * Math.sin(2 * Math.PI * actualF0 * k * inh * t);
    }
    const env = Math.min(1, i / attackEnd) * Math.exp(-decay * t);
    out[i] = v * env * 0.4;
  }
  // Ruido de ataque (púa/dedo)
  for (let i = 0; i < noiseEnd && i < n; i++) {
    out[i] += (Math.random() * 2 - 1) * attackNoiseGain * (1 - i / noiseEnd);
  }
  return out;
}
