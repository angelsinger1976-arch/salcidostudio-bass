#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aplica el parche cleanBassLine a transcribeAudioFile."""
import io

path = 'src/lib/transcription/transcribe.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

old = """      const notes = await transcribeWithBasicPitch(data, { onProgress });
      // Filtra al rango de bajo (E1=28 hasta C4=60 con 15 trastes) y ordena
      const bassNotes = notes
        .filter((n) => n.midi >= 21 && n.midi <= 60)
        .sort((a, b) => a.startTime - b.startTime);
      if (bassNotes.length) return { engine: 'basic-pitch', notes: bassNotes };"""

new = """      const notes = await transcribeWithBasicPitch(data, { onProgress });
      // Limpieza de arm\u00f3nicos/fantasmas + filtro al rango de bajo
      // (E1=28 hasta C4=60 con 15 trastes) y orden temporal.
      const bassNotes = cleanBassLine(notes)
        .filter((n) => n.midi >= 21 && n.midi <= 60)
        .sort((a, b) => a.startTime - b.startTime);
      if (bassNotes.length) return { engine: 'basic-pitch', notes: bassNotes };"""

count = src.count(old)
assert count == 1, f'expected 1 occurrence, found {count}'
src = src.replace(old, new)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: parche cleanBassLine aplicado')
