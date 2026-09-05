// ============================================================
// BassCoach · Riffs y ejercicios demo
// Estructura: { id, name, bpm, notes: [{midi, dur (beat units), label}] }
// midi: nota absoluta; dur en tiempos de negra.
// Se generan los startTime al vuelo a partir de bpm.
// ============================================================

const N = (midi, dur = 1, label = '') => ({ midi, dur, label });

export const DEMO_RIFFS = [
  {
    id: 'seven-nation-army-ish',
    name: 'Riff minimalista (E pentatónica)',
    bpm: 120,
    notes: [
      N(40, 0.5, 'E2'), N(40, 0.5), N(40, 0.75), N(47, 0.25, 'B2'),
      N(45, 0.75, 'A2'), N(40, 0.25), N(38, 1, 'D2'),
      N(40, 0.5), N(40, 0.5), N(40, 0.75), N(47, 0.25),
      N(45, 0.75), N(40, 0.25), N(43, 1, 'G2'),
    ],
  },
  {
    id: 'walking-blues',
    name: 'Blues en Mi (walking)',
    bpm: 96,
    notes: [
      N(40, 1, 'E2'), N(43, 1, 'G2'), N(46, 1, 'A♯2'), N(43, 1),
      N(40, 1), N(38, 1, 'D2'), N(36, 1, 'C2'), N(35, 1, 'B1'),
    ],
  },
  {
    id: 'root-octave-funk',
    name: 'Funk tónica-octava',
    bpm: 104,
    notes: [
      N(33, 0.5, 'A1'), N(45, 0.5, 'A2'), N(33, 0.5), N(45, 0.5),
      N(36, 0.5, 'C2'), N(48, 0.5, 'C3'), N(33, 0.5), N(45, 0.5),
      N(38, 0.5, 'D2'), N(50, 0.5, 'D3'), N(33, 0.5), N(45, 0.5),
      N(40, 0.5, 'E2'), N(52, 0.5, 'E3'), N(33, 1),
    ],
  },
  {
    id: 'chromatic-warmup',
    name: 'Calentamiento cromático',
    bpm: 80,
    notes: [
      N(40, 1), N(41, 1), N(42, 1), N(43, 1),
      N(45, 1), N(46, 1), N(47, 1), N(48, 1),
    ],
  },
  {
    id: 'major-scale-e',
    name: 'Escala mayor de Mi (posición)',
    bpm: 72,
    notes: [
      N(40, 0.5), N(42, 0.5), N(44, 0.5), N(45, 0.5),
      N(47, 0.5), N(49, 0.5), N(51, 0.5), N(52, 0.5),
      N(51, 0.5), N(49, 0.5), N(47, 0.5), N(45, 0.5),
      N(44, 0.5), N(42, 0.5), N(41, 0.5), N(40, 0.5),
    ],
  },
];

/** Convierte un riff demo en la secuencia con tiempos (startTime s) */
export function riffToSequence(riff) {
  const spb = 60 / riff.bpm;
  let t = 0;
  const notes = riff.notes.map((n) => {
    const startTime = t;
    t += n.dur * spb;
    return { midi: n.midi, startTime: round3(startTime), duration: round3(n.dur * spb * 0.9), label: n.label || '' };
  });
  return notes;
}

function round3(x) { return Math.round(x * 1000) / 1000; }

// Ejercicios generados: progresión de acordes ii-V-I en Do con fundamentales
export function generateTwoFiveOne(rootPc = 0, octave = 1) {
  const spb = 60 / 100;
  const roots = [rootPc + 2, rootPc + 7, rootPc];
  let t = 0;
  const notes = [];
  roots.forEach((pc) => {
    const midi = 12 * (octave + 1) + ((pc % 12) + 12) % 12;
    for (let i = 0; i < 4; i++) {
      notes.push({ midi, startTime: round3(t), duration: round3(spb * 0.9), label: '' });
      t += spb;
    }
  });
  return { id: 'ii-v-i', name: 'ii-V-I (tónicas)', bpm: 100, notes };
}
