// ============================================================
// Diagnóstico: Basic Pitch en Node sobre el WAV sintético
// Replica exactamente el pipeline del navegador y aísla el bug
// de constrainFrequency(minFreq<27.5) con copias frescas.
// ============================================================
import * as fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const NESTED_TFJS = '@spotify/basic-pitch/node_modules/@tensorflow/tfjs';
const tf = require(NESTED_TFJS);
const bpPkg = require('@spotify/basic-pitch');
const toMidi = require('@spotify/basic-pitch/cjs/toMidi.js');

// ---------- 1. Cargar modelo con IOHandler desde disco ----------
const modelJson = JSON.parse(fs.readFileSync('public/basic-pitch/model.json', 'utf8'));
const shard = fs.readFileSync('public/basic-pitch/group1-shard1of1.bin');
const ioHandler = {
  load: async () => ({
    modelTopology: modelJson.modelTopology,
    format: 'graph-model',
    generatedBy: modelJson.generatedBy,
    convertedBy: modelJson.convertedBy,
    weightSpecs: modelJson.weightsManifest[0].weights,
    weightData: shard.buffer.slice(shard.byteOffset, shard.byteOffset + shard.byteLength),
  }),
};

// ---------- 2. Parse WAV ----------
function parseWav(path) {
  const buf = fs.readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, sampleRate = 44100, channels = 1, bits = 16, dataOff = 0, dataLen = 0;
  while (off < buf.length - 8) {
    const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off+1), dv.getUint8(off+2), dv.getUint8(off+3));
    const size = dv.getUint32(off+4, true);
    if (id === 'fmt ') {
      channels = dv.getUint16(off+10, true);
      sampleRate = dv.getUint32(off+12, true);
      bits = dv.getUint16(off+22, true);
    } else if (id === 'data') { dataOff = off + 8; dataLen = size; break; }
    off += 8 + size + (size % 2);
  }
  const n = Math.floor(dataLen / (bits / 8));
  const f32 = new Float32Array(n);
  for (let i = 0; i < n; i++) f32[i] = dv.getInt16(dataOff + i * 2, true) / 32768;
  return { data: f32, sampleRate, channels };
}

// ---------- 3. Decimación 44100 → 22050 ----------
function decimate2(x) {
  const out = new Float32Array(Math.floor(x.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = (x[2*i] + x[2*i+1]) / 2;
  return out;
}

// ---------- 4. Ejecutar ----------
const t0 = Date.now();
const wav = parseWav('public/sample-bass.wav');
const audio = wav.sampleRate === 22050 ? wav.data : decimate2(wav.data);
console.log(`Audio a 22050 Hz: ${audio.length} muestras (${(audio.length/22050).toFixed(2)} s)`);

const modelPromise = tf.loadGraphModel(ioHandler);
const bp = new bpPkg.BasicPitch(modelPromise);

let allFrames = [], allOnsets = [];
await bp.evaluateModel(
  audio,
  (frames, onsets) => {
    allFrames = allFrames.concat(frames);
    allOnsets = allOnsets.concat(onsets);
  },
  () => {}
);
console.log(`Frames: ${allFrames.length} · backend ${tf.getBackend()} · ${(Date.now()-t0)/1000}s`);

// ---------- 5. Verificación del bug de constrainFrequency ----------
const T = toMidi.testables;
const hzToMidi = (hz) => 12 * (Math.log2(hz) - Math.log2(440.0)) + 69;
console.log(`\n>>> minFreqIdx para 25 Hz = ${hzToMidi(25) - 21} (negativo → fill(0,0,-1.6) → [0..86] borrado)`);
const probe = [Array(88).fill(0.9)];
probe[0][10] = 0.9;  // MIDI 31
const probeF = probe.map(r => r.slice());
T.constrainFrequency(probe, probeF, 500, 25);
console.log(`>>> tras constrainFrequency(500, 25): valor en idx 10 = ${probe[0][10]} (debería seguir 0.9)\n`);

// ---------- 6. Matriz de configuraciones CON COPIAS FRESCAS ----------
const deepCopy = (a) => a.map(r => r.slice());
const configs = [
  ['defaults            ', [null, null]],
  ['minFreq=25 (bug)    ', [500, 25]],
  ['FIX: maxFreq=500    ', [500, null]],
  ['FIX: sin constrain  ', [null, null]],
];
for (const [name, [mx, mn]] of configs) {
  const ev = bpPkg.outputToNotesPoly(deepCopy(allFrames), deepCopy(allOnsets), 0.5, 0.3, 7, true, mx, mn, true);
  const t = bpPkg.noteFramesToTime(ev);
  const bass = t.filter((n) => n.pitchMidi >= 21 && n.pitchMidi <= 60);
  console.log(`${name}: ${t.length} notas · ${bass.length} en rango bajo`);
  if (name.startsWith('FIX')) {
    for (const n of bass) console.log(`    M${n.pitchMidi} @${n.startTimeSeconds.toFixed(2)}s +${n.durationSeconds.toFixed(2)}s amp ${n.amplitude.toFixed(2)}`);
  }
}
