// ============================================================
// BassCoach · Motor de teoría musical
// Notas (anglo + solfège latino), escalas, modos, arpegios,
// afinaciones de bajo y mapeo nota <-> posición del diapasón.
// ============================================================

export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// Solfège latino (convención latina: Do Re Mi Fa Sol La Si)
export const SOLFEGE_SHARP = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
export const SOLFEGE_FLAT = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];

export const A4 = 440;

export function midiToFreq(midi) {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiFloat(hz) {
  return 12 * (Math.log2(hz / A4)) + 69;
}

export function freqToNearestMidi(hz) {
  return Math.round(freqToMidiFloat(hz));
}

export function centsBetween(hz, targetHz) {
  return 1200 * Math.log2(hz / targetHz);
}

export function midiRoundToCents(midiFloat, midiTarget) {
  return Math.round((midiFloat - midiTarget) * 100);
}

/**
 * Nombre de la nota. `latin` => Do Re Mi…, si no C D E…
 * `withOctave` añade la octava científica (ej. "Sol1" / "G1").
 */
export function midiToName(midi, { latin = true, withOctave = false, flats = false } = {}) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  const name = latin
    ? (flats ? SOLFEGE_FLAT : SOLFEGE_SHARP)[pc]
    : (flats ? FLAT_NAMES : SHARP_NAMES)[pc];
  return withOctave ? `${name}${oct}` : name;
}

export function pitchClassLatin(pc, { flats = false } = {}) {
  return (flats ? SOLFEGE_FLAT : SOLFEGE_SHARP)[((pc % 12) + 12) % 12];
}

// ------------------------------------------------------------
// Escalas, modos y arpegios
// ------------------------------------------------------------
export const SCALES = {
  major: { name: 'Major', latin: 'Mayor', intervals: [0, 2, 4, 5, 7, 9, 11], category: 'major' },
  minor: { name: 'Natural Minor', latin: 'Menor natural', intervals: [0, 2, 3, 5, 7, 8, 10], category: 'minor' },
  harmonicMinor: { name: 'Harmonic Minor', latin: 'Menor armónica', intervals: [0, 2, 3, 5, 7, 8, 11], category: 'minor' },
  melodicMinor: { name: 'Melodic Minor', latin: 'Menor melódica', intervals: [0, 2, 3, 5, 7, 9, 11], category: 'minor' },
  ionian: { name: 'Ionian', latin: 'Jónico', intervals: [0, 2, 4, 5, 7, 9, 11], category: 'modes' },
  dorian: { name: 'Dorian', latin: 'Dórico', intervals: [0, 2, 3, 5, 7, 9, 10], category: 'modes' },
  phrygian: { name: 'Phrygian', latin: 'Frigio', intervals: [0, 1, 3, 5, 7, 8, 10], category: 'modes' },
  lydian: { name: 'Lydian', latin: 'Lidio', intervals: [0, 2, 4, 6, 7, 9, 11], category: 'modes' },
  mixolydian: { name: 'Mixolydian', latin: 'Mixolidio', intervals: [0, 2, 4, 5, 7, 9, 10], category: 'modes' },
  locrian: { name: 'Locrian', latin: 'Locrio', intervals: [0, 1, 3, 5, 6, 8, 10], category: 'modes' },
  majPent: { name: 'Major Pentatonic', latin: 'Pentatónica mayor', intervals: [0, 2, 4, 7, 9], category: 'majPent' },
  minPent: { name: 'Minor Pentatonic', latin: 'Pentatónica menor', intervals: [0, 3, 5, 7, 10], category: 'minPent' },
  blues: { name: 'Blues', latin: 'Blues', intervals: [0, 3, 5, 6, 7, 10], category: 'blues' },
  maj: { name: 'Major Arp', latin: 'Arpegio mayor', intervals: [0, 4, 7], category: 'arps' },
  min: { name: 'Minor Arp', latin: 'Arpegio menor', intervals: [0, 3, 7], category: 'arps' },
  dim: { name: 'Diminished Arp', latin: 'Arp. disminuido', intervals: [0, 3, 6], category: 'arps' },
  aug: { name: 'Augmented Arp', latin: 'Arp. aumentado', intervals: [0, 4, 8], category: 'arps' },
  maj7: { name: 'Maj7 Arp', latin: 'Arp. Maj7', intervals: [0, 4, 7, 11], category: 'arps' },
  dom7: { name: 'Dom7 Arp', latin: 'Arp. Dom7', intervals: [0, 4, 7, 10], category: 'arps' },
  min7: { name: 'Min7 Arp', latin: 'Arp. Min7', intervals: [0, 3, 7, 10], category: 'arps' },
  min7b5: { name: 'm7b5 Arp', latin: 'Arp. m7b5', intervals: [0, 3, 6, 10], category: 'arps' },
  dim7: { name: 'Dim7 Arp', latin: 'Arp. Dim7', intervals: [0, 3, 6, 9], category: 'arps' },
  maj6: { name: 'Maj6 Arp', latin: 'Arp. Maj6', intervals: [0, 4, 7, 9], category: 'arps' },
  min6: { name: 'Min6 Arp', latin: 'Arp. Min6', intervals: [0, 3, 7, 9], category: 'arps' },
  chromatic: { name: 'Chromatic', latin: 'Cromática', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], category: 'other' },
  wholeTone: { name: 'Whole Tone', latin: 'Tonos enteros', intervals: [0, 2, 4, 6, 8, 10], category: 'other' },
  dimWH: { name: 'Diminished (W-H)', latin: 'Disminuida (T-S)', intervals: [0, 2, 3, 5, 6, 8, 9, 11], category: 'other' },
  bluesMaj: { name: 'Major Blues', latin: 'Blues mayor', intervals: [0, 2, 3, 4, 7, 9], category: 'blues' },
};

export const SCALE_CATEGORIES = [
  { id: 'modes', label: 'Modes', latin: 'Modos' },
  { id: 'arps', label: 'Arps', latin: 'Arpegios' },
  { id: 'other', label: 'Other', latin: 'Otras' },
  { id: 'major', label: 'Major', latin: 'Mayor' },
  { id: 'minor', label: 'Minor', latin: 'Menor' },
  { id: 'majPent', label: 'Maj-Pent', latin: 'Pent. M' },
  { id: 'minPent', label: 'Min-Pent', latin: 'Pent. m' },
  { id: 'blues', label: 'Blues', latin: 'Blues' },
];

const DEGREE_LABELS = ['1', '♯2/♭3', '2', '♯3/♭4', '3', '4', '♯4/♭5', '5', '♯5/♭6', '6', '♯6/♭7', '7'];
const DEGREE_LABELS_SIMPLE = ['R', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];

/** Grados de una escala sobre una tónica. Devuelve lista de {midi, pc, degree, isRoot} */
export function scaleNotes(rootPc, scaleKey, rootOctave = 1) {
  const scale = SCALES[scaleKey];
  if (!scale) return [];
  const rootMidi = 12 * (rootOctave + 1) + rootPc; // pc en octava `rootOctave`
  return scale.intervals.map((iv) => {
    const midi = rootMidi + iv;
    return {
      midi,
      pc: midi % 12,
      interval: iv,
      degree: iv === 0 ? 'R' : DEGREE_LABELS_SIMPLE[iv % 12],
      isRoot: iv === 0,
    };
  });
}

/** Set de pitch-classes de la escala (para marcar todo el diapasón) */
export function scalePitchClasses(rootPc, scaleKey) {
  const scale = SCALES[scaleKey];
  if (!scale) return new Set();
  return new Set(scale.intervals.map((iv) => (rootPc + iv) % 12));
}

// ------------------------------------------------------------
// Afinaciones (stringIndex 0 = cuerda más grave)
// ------------------------------------------------------------
export const TUNINGS = {
  std4: { name: 'Standard 4', strings: [28, 33, 38, 43] }, // E1 A1 D2 G2
  dropD: { name: 'Drop D', strings: [26, 33, 38, 43] }, // D1 A1 D2 G2
  eb4: { name: 'Eb Standard', strings: [27, 32, 37, 42] },
  dStd4: { name: 'D Standard', strings: [26, 31, 36, 41] },
  std5: { name: 'Standard 5 (B0)', strings: [23, 28, 33, 38, 43] }, // B0 E1 A1 D2 G2
  dropCsharp4: { name: 'Drop C♯', strings: [25, 30, 35, 40] },
};

export function tuningMidis(tuningKey) {
  const t = TUNINGS[tuningKey] || TUNINGS.std4;
  return t.strings;
}

/** stringIndex: 0 = grave (Mi/E). Visualmente se invierte en el SVG (tab: aguda arriba). */
export function midiFromPosition(stringIndex, fret, tuningKey = 'std4') {
  const strings = tuningMidis(tuningKey);
  if (stringIndex < 0 || stringIndex >= strings.length) return null;
  if (fret < 0) return null;
  return strings[stringIndex] + fret;
}

/**
 * Todas las posiciones (cuerda, traste) que producen `midi`.
 * stringIndex 0 = cuerda más grave.
 */
export function positionsForMidi(midi, tuningKey = 'std4', { minFret = 0, maxFret = 15 } = {}) {
  const strings = tuningMidis(tuningKey);
  const out = [];
  for (let s = 0; s < strings.length; s++) {
    const fret = midi - strings[s];
    if (fret >= minFret && fret <= maxFret) out.push({ string: s, fret });
  }
  return out;
}

/** Posición "natural" preferida para dibujar una nota objetivo (traste bajo, cuerda grave). */
export function preferredPosition(midi, tuningKey = 'std4', { minFret = 0, maxFret = 15 } = {}) {
  const all = positionsForMidi(midi, tuningKey, { minFret, maxFret });
  if (!all.length) return null;
  // Preferimos posiciones entre traste 3 y 12 para no saturar la cejilla
  const scored = all.map((p) => {
    let score = p.fret;
    if (p.fret < 3) score += 6; // castigo a aire/trastes 1-2 salvo que no haya opción
    return { p, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].p;
}

export const FRET_INLAYS = [3, 5, 7, 9, 15]; // 12 va con doble punto
export const DOUBLE_INLAY = 12;

/** Octavas de bajo razonables según afinación */
export function bassMidiRange(tuningKey = 'std4', maxFret = 15) {
  const strings = tuningMidis(tuningKey);
  return { min: strings[0], max: strings[strings.length - 1] + maxFret };
}
