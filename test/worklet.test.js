import { Suite } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { yinDetect } from '../src/lib/audio/yin.js';

const SR = 48000;
const WORKLET_PATH = new URL('../src/worklet/yin-processor.worklet.js', import.meta.url);

/**
 * Extrae el método `yin(buf)` y `_rms(buf)` del archivo del worklet
 * y los evalúa como funciones reales ligadas a un contexto con los
 * mismos parámetros por defecto del procesador. Así verificamos que
 * la copia inline del worklet es matemáticamente idéntica a la lib.
 */
function loadWorkletYin(overrides = {}) {
  const src = readFileSync(WORKLET_PATH, 'utf8');

  const extractMethod = (name) => {
    const re = new RegExp(`(?:^|\\n)\\s*${name}\\(([^)]*)\\)\\s*\\{`);
    const m = re.exec(src);
    if (!m) throw new Error(`No se encontró el método ${name}() en el worklet`);
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(bodyStart, i - 1);
    return { args: m[1], body };
  };

  const yinM = extractMethod('yin');
  const rmsM = extractMethod('_rms');

  const ctx = {
    sampleRate: SR,
    threshold: 0.15,
    fMin: 27,
    fMax: 520,
    ...overrides,
  };
  ctx._rms = new Function(`return function _rms(${rmsM.args}) {${rmsM.body}}`)();
  const yinFn = new Function(`return function yin(${yinM.args}) {${yinM.body}}`)();
  ctx.yin = yinFn;

  return (buf) => ctx.yin(buf);
}

/** Sintetiza un bajo simple de forma independiente (para el test de paridad) */
function synth(f0, seconds = 0.3) {
  const n = Math.floor(seconds * SR);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 1; k <= 8; k++) v += Math.sin(2 * Math.PI * f0 * k * t) / k;
    buf[i] = v * Math.exp(-1.2 * t) * 0.4;
  }
  return buf;
}

export function run() {
  const s = new Suite('AudioWorklet · Paridad YIN inline vs librería');
  const workletYin = loadWorkletYin();

  s.section('Mismo resultado en notas de bajo sintéticas');
  const cases = [
    { name: 'B0', f0: 30.868 },
    { name: 'E1', f0: 41.203 },
    { name: 'A1', f0: 55.0 },
    { name: 'D2', f0: 73.416 },
    { name: 'G2', f0: 97.999 },
    { name: 'C3', f0: 130.81 },
    { name: 'E2 (octava)', f0: 82.407 },
  ];
  let allMatch = true;
  for (const c of cases) {
    const a = yinDetect(synth(c.f0), SR, { fMin: 27, fMax: 520, threshold: 0.15 });
    const b = workletYin(synth(c.f0));
    const same = a.f0 > 0 && Math.abs(a.f0 - b.f0) < 0.01 && Math.abs(a.confidence - b.confidence) < 0.01;
    if (!same) allMatch = false;
    s.assert(same, `${c.name}: worklet f0=${b.f0.toFixed(3)} ≈ lib f0=${a.f0.toFixed(3)}`);
  }
  s.assert(allMatch, 'Paridad total worklet ↔ librería');

  s.section('Silencio y no-tono');
  {
    const silence = new Float32Array(8192);
    const a = yinDetect(silence, SR, { fMin: 27, fMax: 520, threshold: 0.15 });
    const b = workletYin(silence);
    s.eq(b.f0, -1, 'Worklet: silencio → f0 = -1');
    s.eq(a.f0, b.f0, 'Mismo criterio de "sin tono"');
  }

  s.section('Configuración por mensaje (estática del archivo)');
  {
    const src = readFileSync(WORKLET_PATH, 'utf8');
    s.assert(src.includes("d.type === 'config'"), 'Maneja mensajes de configuración');
    s.assert(src.includes('registerProcessor'), 'Registra el procesador');
    s.assert(src.includes('AudioWorkletProcessor'), 'Extiende AudioWorkletProcessor');
    s.assert(src.includes('postMessage') && src.includes("type: 'detection'"), 'Publica detecciones por puerto');
    s.assert(src.includes('YinRingBuffer'), 'Usa buffer circular para ventanas deslizantes');
    // El override de fMin debe respetarse: E1 (41 Hz) rechazado con fMin=50
    const yinHigh = loadWorkletYin({ fMin: 50 });
    const det = yinHigh(synth(41.203));
    s.eq(det.f0, -1, 'fMin configurable: E1 (41 Hz) rechazado con fMin=50');
  }

  return s;
}
