// ============================================================
// BassCoach · Exportador MIDI estándar (formato 0)
// Escribe un archivo .mid válido con la secuencia transcrita.
// Implementación propia (sin dependencias) — bytes little/big
// endian según especificación SMF.
// ============================================================

const HEADER_CKID = 'MThd';
const TRACK_CKID = 'MTrk';

function toVarLen(value) {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function strBytes(s) {
  return Array.from(s, (c) => c.charCodeAt(0));
}

function u32(n) {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function u16(n) {
  return [(n >> 8) & 0xff, n & 0xff];
}

/**
 * Genera un MIDI tipo 0 con las notas dadas.
 * @param {Array<{midi:number, startTime:number, duration:number, velocity?:number}>} notes
 * @param {object} opts { bpm=120, program=33 (Electric Bass finger), trackName }
 * @returns {Uint8Array} bytes del archivo .mid
 */
export function notesToMidiFile(notes, opts = {}) {
  const bpm = opts.bpm ?? 120;
  const program = opts.program ?? 33; // 33 = Electric Bass (finger), GM
  const trackName = opts.trackName ?? 'BassCoach transcription';
  const ppq = 480; // ticks por negra
  const msPerTick = 60000 / (bpm * ppq);

  // Eventos [tickAbs, tipo, bytes...]
  const events = [];
  for (const n of notes) {
    const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? n.amplitude ?? 0.7) * 127)));
    const onTick = Math.round(n.startTime * 1000 / msPerTick);
    const offTick = Math.round((n.startTime + Math.max(0.05, n.duration)) * 1000 / msPerTick);
    events.push({ tick: onTick, order: 1, bytes: [0x90, n.midi & 0x7f, vel] });
    events.push({ tick: offTick, order: 0, bytes: [0x80, n.midi & 0x7f, 0x40] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  // Track: meta tempo + track name + eventos + end-of-track
  const track = [];
  // Meta: tempo (µs por negra)
  const usPerQuarter = Math.round(60000000 / bpm);
  track.push(0x00, 0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);
  // Meta: track name
  const name = strBytes(trackName);
  track.push(0x00, 0xff, 0x03, name.length, ...name);
  // Meta: program change (canal 0)
  track.push(0x00, 0xc0, program & 0x7f);

  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    track.push(...toVarLen(Math.max(0, delta)), ...ev.bytes);
  }
  // End of track
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    ...strBytes(HEADER_CKID), ...u32(6), ...u16(0), ...u16(1), ...u16(ppq),
  ];
  const trackHeader = [...strBytes(TRACK_CKID), ...u32(track.length)];
  return new Uint8Array([...header, ...trackHeader, ...track]);
}

export function downloadMidi(notes, filename = 'basscoach.mid', opts = {}) {
  const bytes = notesToMidiFile(notes, opts);
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJson(data, filename = 'basscoach.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
