import { Suite } from './harness.mjs';
import {
  midiToFreq, freqToMidiFloat, centsBetween, midiToName,
  scaleNotes, scalePitchClasses, SCALES, midiFromPosition, positionsForMidi,
  preferredPosition, TUNINGS, tuningMidis,
} from '../src/lib/theory.js';

export function run() {
  const s = new Suite('Teoría musical · Notas, escalas, diapasón');

  s.section('Conversión Hz ↔ MIDI ↔ cents');
  {
    s.approx(midiToFreq(28), 41.203, 0.01, 'E1 = 41.20 Hz');
    s.approx(midiToFreq(23), 30.868, 0.01, 'B0 = 30.87 Hz');
    s.approx(midiToFreq(33), 55.0, 0.01, 'A1 = 55 Hz');
    s.approx(freqToMidiFloat(48.999), 31.0, 0.01, 'G1 (48.99 Hz) → midi 31');
    s.approx(centsBetween(55.64, 55), 20, 1, '20 cents sobre A1');
    s.eq(midiToName(28), 'Mi', 'MIDI 28 = Mi (solfège)');
    s.eq(midiToName(28, { latin: false }), 'E', 'MIDI 28 = E (anglo)');
    s.eq(midiToName(31), 'Sol', 'MIDI 31 = Sol');
    s.eq(midiToName(40, { withOctave: true }), 'Mi2', 'MIDI 40 = Mi2');
  }

  s.section('Escalas y grados');
  {
    const maj = scaleNotes(0, 'major', 1); // Do mayor desde Do1
    s.eq(maj.length, 7, 'Do mayor tiene 7 notas');
    s.eq(maj.map((n) => n.pc), [0, 2, 4, 5, 7, 9, 11], 'Semitonos de la mayor');
    s.eq(maj[0].degree, 'R', 'Tónica marcada como R');
    // Do pentatónica mayor (como en la imagen de Bassmate): Do Re Mi Sol La
    const pcs = scalePitchClasses(0, 'majPent');
    s.eq([...pcs].sort((a, b) => a - b), [0, 2, 4, 7, 9], 'Do pentatónica mayor = Do Re Mi Sol La');
    const blues = scaleNotes(2, 'blues', 1);
    s.eq(blues.map((n) => n.pc).sort((a, b) => a - b), [2, 5, 7, 8, 9, 0].sort((a, b) => a - b), 'Blues: 6 notas con ♭5');
    const dim7 = scaleNotes(7, 'dim7', 1);
    s.eq(dim7.map((n) => n.interval), [0, 3, 6, 9], 'Arp diminuido: 0-3-6-9');
  }

  s.section('Diapasón: nota ↔ posición');
  {
    // Afinación estándar 4 cuerdas: E1 A1 D2 G2 (graves → agudas)
    s.eq(tuningMidis('std4'), [28, 33, 38, 43], 'Std4 = E A D G');
    s.eq(midiFromPosition(0, 0), 28, 'Cuerda grave al aire = E1');
    s.eq(midiFromPosition(3, 0), 43, 'Cuerda aguda al aire = G2');
    s.eq(midiFromPosition(0, 3), 31, 'E1 + 3 trastes = G1 (Sol)');
    const g1Positions = positionsForMidi(31, 'std4');
    s.assert(g1Positions.some((p) => p.string === 0 && p.fret === 3), 'G1 en 4ª cuerda 3er traste');
    // G2 (43) sí existe en la 3ª cuerda (A1) al traste 10
    const g2Positions = positionsForMidi(43, 'std4');
    s.assert(g2Positions.some((p) => p.string === 1 && p.fret === 10), 'G2 en 3ª cuerda 10º traste');
    s.assert(g2Positions.some((p) => p.string === 3 && p.fret === 0), 'G2 al aire en 1ª cuerda');
    const pref = preferredPosition(31);
    s.eq(pref.string, 0, 'Posición preferida de G1: cuerda grave');
    s.assert(pref.fret >= 3 && pref.fret <= 12, `Posición preferida de G1: traste razonable (${pref.fret})`);
  }

  s.section('Afinaciones alternativas');
  {
    s.eq(tuningMidis('std5'), [23, 28, 33, 38, 43], 'Std5 con B0');
    s.eq(tuningMidis('dropD'), [26, 33, 38, 43], 'Drop D');
    const b0 = positionsForMidi(23, 'std5');
    s.assert(b0.some((p) => p.string === 0 && p.fret === 0), 'B0 al aire en bajo de 5');
  }

  return s;
}
