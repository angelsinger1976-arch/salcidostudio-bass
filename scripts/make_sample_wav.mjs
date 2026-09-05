#!/usr/bin/env node
// Genera sample-bass.wav: E1 A1 D2 G2 + riff G1 G1 A1 C2 para probar TRANSCRIPTION en el navegador.
import { synthBassNote } from '../src/lib/audio/yin.js';
import { writeFileSync } from 'fs';

const SR = 44100;

function writeWav(path, samples, sr) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);   // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40); // tamaño del chunk data (¡faltaba!)
  for (let i = 0; i < samples.length; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// --- 1) Secuencia afinación: E1 A1 D2 G2 (0.5 s c/u con gaps)
const tuningSeq = [
  { f0: 41.203, ms: 500 },
  { f0: 55.0, ms: 500 },
  { f0: 73.416, ms: 500 },
  { f0: 97.999, ms: 500 },
];

function buildSeq(seq, gapMs) {
  const gap = new Float32Array(Math.floor((gapMs / 1000) * SR));
  let out = [];
  let first = true;
  for (const s of seq) {
    const note = synthBassNote({ f0: s.f0, seconds: s.ms / 1000, sampleRate: SR, harmonics: 8, attackNoiseMs: 14 });
    if (!first) out.push(gap);
    out.push(note);
    first = false;
  }
  const total = out.reduce((a, b) => a + b.length, 0);
  const joined = new Float32Array(total);
  let off = 0;
  for (const p of out) { joined.set(p, off); off += p.length; }
  return joined;
}

const t = buildSeq(tuningSeq, 120);
const riff = buildSeq([
  { f0: 48.999, ms: 300 }, { f0: 48.999, ms: 300 }, { f0: 55.0, ms: 300 }, { f0: 65.406, ms: 400 },
  { f0: 48.999, ms: 300 }, { f0: 73.416, ms: 300 }, { f0: 48.999, ms: 500 },
], 90);

const silence = new Float32Array(Math.floor(0.4 * SR));
const all = new Float32Array(t.length + silence.length + riff.length);
all.set(t, 0);
all.set(silence, t.length);
all.set(riff, t.length + silence.length);

writeWav('public/sample-bass.wav', all, SR);
console.log('OK public/sample-bass.wav', (all.length / SR).toFixed(2) + 's', 'E1 A1 D2 G2 + riff G1 G1 A1 C2 G1 D2 G1');
