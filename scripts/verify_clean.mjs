// ============================================================
// Verificación de cleanBassLine v2 contra el output REAL medido
// del navegador (12 notas con el fantasma La2@0.61) y el ghost
// de smear Sol1@4.29 del diagnóstico Node.
// ============================================================
const bpNotes = [
  { midi: 28, startTime: 0.00, duration: 0.56, amplitude: 0.69 }, // E1 real
  { midi: 45, startTime: 0.61, duration: 0.17, amplitude: 0.28 }, // La2 GHOST (2\u00ba arm)
  { midi: 33, startTime: 0.63, duration: 0.55, amplitude: 0.76 }, // La1 real
  { midi: 38, startTime: 1.24, duration: 0.56, amplitude: 0.77 }, // D2 real
  { midi: 43, startTime: 1.85, duration: 0.60, amplitude: 0.72 }, // G2 real
  { midi: 31, startTime: 2.74, duration: 0.40, duration2: 0.40, amplitude: 0.62 }, // G1
  { midi: 31, startTime: 3.14, duration: 0.37, amplitude: 0.65 }, // G1
  { midi: 33, startTime: 3.54, duration: 0.35, amplitude: 0.70 }, // A1
  { midi: 36, startTime: 3.94, duration: 0.44, amplitude: 0.76 }, // C2
  { midi: 31, startTime: 4.29, duration: 0.10, amplitude: 0.43 }, // Sol1 SMEAR ghost
  { midi: 31, startTime: 4.40, duration: 0.38, amplitude: 0.65 }, // G1 real
  { midi: 38, startTime: 4.80, duration: 0.37, amplitude: 0.77 }, // D2
  { midi: 31, startTime: 5.20, duration: 0.45, amplitude: 0.76 }, // G1
];

function cleanBassLine(notes) {
  if (!notes.length) return notes;
  const TOL = 0.05;
  const MIN = 0.12;
  const HARM = [12, 19, 24, 31];
  const end = (n) => n.startTime + n.duration;
  const overlaps = (a, b) =>
    a.startTime < end(b) - TOL && b.startTime < end(a) - TOL;
  const ghost = new Set();
  for (const n of notes) {
    if (ghost.has(n)) continue;
    for (const m of notes) {
      if (m === n || ghost.has(m)) continue;
      if (!overlaps(n, m)) continue;
      if (m.midi < n.midi && HARM.includes(n.midi - m.midi) &&
          m.amplitude >= n.amplitude * 0.8) { ghost.add(n); break; }
      if (n.duration < MIN &&
          (m.midi === n.midi
            ? m.duration >= n.duration && m.amplitude >= n.amplitude * 0.8
            : m.amplitude > n.amplitude * 1.2)) { ghost.add(n); break; }
    }
  }
  return notes.filter((n) => !ghost.has(n));
}

const cleaned = cleanBassLine(bpNotes);
console.log('Input:', bpNotes.length, '\u2192 tras limpieza:', cleaned.length, 'notas');
for (const n of cleaned) console.log(`  M${n.midi} @${n.startTime.toFixed(2)} +${n.duration.toFixed(2)}s`);

const expected = [
  [28, 0.00], [33, 0.63], [38, 1.24], [43, 1.85], [31, 2.74], [31, 3.14],
  [33, 3.54], [36, 3.94], [31, 4.40], [38, 4.80], [31, 5.20],
];
let pass = cleaned.length === expected.length;
if (pass) {
  cleaned.forEach((n, i) => {
    if (n.midi !== expected[i][0] || Math.abs(n.startTime - expected[i][1]) > 0.05) pass = false;
  });
}
console.log(pass
  ? '\n\u2714 cleanBassLine v2 CORRECTO: 11 notas exactas, sin fantasmas'
  : '\n\u2718 difiere de lo esperado');
process.exit(pass ? 0 : 1);
