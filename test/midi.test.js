import { Suite } from './harness.mjs';
import { notesToMidiFile } from '../src/lib/transcription/midiFile.js';

export function run() {
  const s = new Suite('Exportador MIDI · SMF tipo 0');

  s.section('Archivo válido y parseable');
  {
    const notes = [
      { midi: 28, startTime: 0, duration: 0.5, amplitude: 0.8 },
      { midi: 33, startTime: 0.5, duration: 0.5, amplitude: 0.7 },
      { midi: 38, startTime: 1.0, duration: 0.5, amplitude: 0.6 },
    ];
    const bytes = notesToMidiFile(notes, { bpm: 120 });
    s.assert(bytes instanceof Uint8Array, 'Devuelve Uint8Array');
    // MThd
    s.eq(String.fromCharCode(...bytes.slice(0, 4)), 'MThd', 'Chunk header MThd');
    s.eq(u32(bytes, 4), 6, 'Header length 6');
    s.eq(u16(bytes, 8), 0, 'Formato 0');
    s.eq(u16(bytes, 10), 1, '1 pista');
    s.eq(u16(bytes, 12), 480, '480 PPQ');
    // MTrk
    const off = 14;
    s.eq(String.fromCharCode(...bytes.slice(off, off + 4)), 'MTrk', 'Chunk MTrk');
    const trackLen = u32(bytes, off + 4);
    s.assert(trackLen > 10, `Pista con contenido (${trackLen} bytes)`);
    // End of track al final
    const tail = bytes.slice(off + 8 + trackLen - 4);
    s.eq(Array.from(tail), [0x00, 0xff, 0x2f, 0x00], 'Meta end-of-track presente');
    // Total file length = 14 + 8 + trackLen
    s.eq(bytes.length, 14 + 8 + trackLen, 'Longitud total coherente');

    // Parsea eventos note-on/note-off
    const evs = parseEvents(bytes.slice(off + 8, off + 8 + trackLen));
    const ons = evs.filter((e) => e.type === 'on');
    s.eq(ons.length, 3, '3 eventos note-on');
    s.eq(ons.map((e) => e.midi), [28, 33, 38], 'Midis en orden');
    const offs = evs.filter((e) => e.type === 'off');
    s.eq(offs.length, 3, '3 eventos note-off');
  }

  s.section('Tiempos con BPM distintos');
  {
    const notes = [{ midi: 28, startTime: 0.25, duration: 0.25 }];
    const b120 = notesToMidiFile(notes, { bpm: 120 });
    const b60 = notesToMidiFile(notes, { bpm: 60 });
    const evs120 = parseEvents(extractTrack(b120));
    const evs60 = parseEvents(extractTrack(b60));
    const on120 = evs120.find((e) => e.type === 'on');
    const on60 = evs60.find((e) => e.type === 'on');
    s.eq(on120.tick, 240, 'A 120 bpm: 0.25 s = 240 ticks');
    s.eq(on60.tick, 120, 'A 60 bpm: 0.25 s = 120 ticks');
  }

  return s;
}

function u32(b, o) { return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; }
function u16(b, o) { return (b[o] << 8) | b[o + 1]; }

function extractTrack(bytes) {
  const trackLen = u32(bytes, 18);
  return bytes.slice(22, 22 + trackLen);
}

function parseEvents(track) {
  const evs = [];
  let i = 0;
  let tick = 0;
  let runningStatus = 0;
  while (i < track.length) {
    // delta time
    let delta = 0;
    let b = track[i];
    while (b & 0x80) {
      delta = (delta << 7) | (b & 0x7f);
      i++;
      b = track[i];
    }
    delta = (delta << 7) | b;
    i++;
    tick += delta;
    let status = track[i];
    if (status & 0x80) { runningStatus = status; i++; } else { status = runningStatus; }
    if (status === 0x90) {
      evs.push({ tick, type: 'on', midi: track[i], vel: track[i + 1] });
      i += 2;
    } else if (status === 0x80) {
      evs.push({ tick, type: 'off', midi: track[i], vel: track[i + 1] });
      i += 2;
    } else if (status === 0xff) {
      const meta = track[i];
      const len = track[i + 1];
      i += 2 + len;
    } else if (status === 0xc0 || status === 0xd0) {
      i += 1;
    } else {
      i += 2;
    }
  }
  return evs;
}
