# BassCoach · Entrenador interactivo de bajo

**PWA** que combina la interfaz visual de *Bassmate* (diapasón interactivo, exploración de escalas) con la dinámica de respuesta en tiempo real de *Rocksmith* (nota objetivo, escucha por micrófono, validación y avance). Todo el procesamiento ocurre **localmente en el navegador** — ningún audio se sube a servidores.

![BassCoach](.screenshots/studio.png)

---

## 1. Arquitectura

```
┌────────────────────────────────────────────────────────────┐
│                     Svelte 4 + Vite 5                      │
│                                                            │
│  App.svelte ── orquesta tabs, micrófono, ajustes globales  │
│   ├── views/Studio.svelte      escalas · modos · arpegios  │
│   ├── views/Quiz.svelte        bucle Rocksmith de avance   │
│   ├── views/Tuner.svelte       afinación con aguja y cents │
│   ├── views/Metro.svelte       metrónomo con acentos       │
│   ├── views/Transcription.svelte  audio IA → notas         │
│   └── views/Settings.svelte    parámetros del motor        │
│                                                            │
│  components/Fretboard.svelte  diapasón SVG 4/5 cuerdas     │
│                             × 15 trastes, círculos         │
│                             naranja (tónica) / celeste     │
│                             (escala), modo objetivo/acierto│
│  components/NoteHighway.svelte autopista estilo Rocksmith  │
│                                                            │
│  lib/theory.js               teoría musical (escalas,      │
│                              solfège/anglo, afinaciones)   │
│  lib/audio/yin.js            YIN + sintetizador de test    │
│  lib/audio/worklet           YIN en AudioWorklet (RT)      │
│  lib/audio/engine.js         mic → lowpass → detector      │
│  lib/audio/tracker.js        mediana anti-octavas +        │
│                              estabilización anti-ataque    │
│  lib/transcription/          Basic Pitch IA + DSP fallback │
│  lib/export/midi.js          escritor SMF tipo 0           │
│  lib/practice/engine.js      ciclo de avance nota a nota   │
└────────────────────────────────────────────────────────────┘
```

**Stack**: Svelte 4 (framework), Vite 5 (bundler), SVG para el diapasón (escalable, sin canvas), Web Audio API para captura y análisis, `@spotify/basic-pitch` 1.0.1 (IA) con su copia anidada de tf.js 3.21 (deduplicada deliberadamente de la raíz para evitar el doble registro de kernels), service worker propio para offline.

## 2. Detección en tiempo real (YIN)

La cadena de audio sigue exactamente el flujo pedido:

```
micrófono → filtro paso bajo ~500 Hz → detector YIN → RMS/confianza
                                                    → cents y validación
```

- **YIN en AudioWorklet** (`yin-processor.worklet.js`): procesamiento por chunks de 128 frames en el hilo de audio, mediana de diferencias normalizadas, umbral 0.15, sin GC en el hot path. Fallback automático a `AnalyserNode` si el navegador no soporta worklets.
- **Filtro paso bajo** (Butterworth 2º orden, derivación bilineal): elimina armónicos y ruido de púa antes del detector. Justificación: en subgraves (B0 ≈ 31 Hz) el error de octava es el fallo clásico de YIN; recortar a ~500 Hz deja solo la fundamental.
- **NoteTracker**: mediana móvil de 5 frames anti-errores-de-octava, **estabilización de N frames iguales consecutivos** para ignorar el transitorio de ataque, cálculo de **cents** `±1200·log2(f/f0)`, y validación **±20 cents** (configurable 5–50).
- Rendimiento: ~3–5 ms de CPU por frame en el worklet (visible en el panel lateral cuando el micrófono está activo).

## 3. Transcripción offline con IA (Basic Pitch)

```
mp3/wav/ogg/m4a → decodeAudioData → mono → 22 050 Hz
              → Basic Pitch (IA, modelo servado localmente)
              → cleanBassLine (limpieza de fantasmas)
              → [{midi, startTime, duration, amplitude}]
              → tabla + MIDI + JSON + práctica en QUIZ
```

- **Modelo IA incluido** en `public/basic-pitch/` (model.json + shard, Apache-2.0 de Spotify) — **no requiere internet** tras la primera carga.
- Carga perezosa: tf.js + el modelo solo se descargan al entrar a la vista Transcripción.
- Post-proceso `cleanBassLine` (propio, por pares):
  - **armónicos fantasma** — el modelo reporta la octava/quinta superior como nota propia; se eliminan si su intervalo es +12/+19/+24/+31 y la fundamental solapada domina en amplitud;
  - **smear de onset** — micro-notas (<120 ms) solapadas con una nota dominante más larga/intensa.
- **Fallback DSP propio** si la IA falla (sin WASM, sin memoria): lowpass + YIN + segmentación por RMS — monofónico, optimizado a graves, probado con 12 tests.
- **Bug de librería documentado y esquivado**: pasar `minFreq` < 27.5 Hz (A0, el piso del modelo) a `outputToNotesPoly` hace que `constrainFrequency` calcule un índice negativo y `Array.fill(0, 0, índiceNegativo)` de JS interprete el negativo como relativo-al-final, **borrando toda la matriz de pitches** (0 notas) — por eso la primera implementación caía silenciosamente al fallback DSP. Solución: `minFreq: null` + filtro MIDI 21–60 después.
- E2E verificado: WAV sintético de 5.7 s (afinación E1-A1-D2-G2 + riff) → **11/11 notas exactas** con motor `basic-pitch`, tiempos dentro de ±20 ms de la verdad de tierra.

## 4. Motor de práctica (ciclo de avance)

```
cargar secuencia JSON → índice 0 → iluminar nota en diapasón
  → escucha activa del micrófono → frecuencia → nota (ej. 48.99 Hz → Sol1)
  → si coincide con la esperada (±tolerancia, octava libre opcional)
     → destello verde + avance de índice → siguiente nota
  → racha / precisión / errores en vivo
```

- La nota objetivo se dibuja **naranja** en el diapasón y desciende por la **autopista** hasta el cursor; al validar, destella verde y avanza.
- Validación por **pitch-class + octava libre** (cualquier posición del diapasón que produzca la nota vale) o modo estricto por octava.
- Fuentes de secuencia: transcripción propia, 5 riffs demo integrados (minimalista E pentatónica, blues walking, funk tónica-octava, cromático, escala mayor en posición).

## 5. Desafíos técnicos y cómo se resuelven

| Desafío | Solución implementada |
|---|---|
| **Subgraves B0 ≈ 31 Hz** con errores de octava | Filtro paso bajo ~500 Hz antes de YIN + ventana YIN ≥ 96 ms (B0 necesita ≥ 3 ciclos) + mediana de 5 frames |
| **Tolerancia de afinación** | Validación configurable ±5–50 **cents** (por defecto ±20, como pediste) |
| **Ruido de ataque** | Estabilización: N frames consecutivos iguales (por defecto 2) antes de aceptar la nota — ignora el transitorio |
| **Armonicos de Basic Pitch** | cleanBassLine: regla de pares intervalo+amplitud |
| **minFreq < 27.5 Hz en la librería** | Evitado (null) + filtro post-hoc MIDI 21–60 |
| **tf.js duplicado** | Se usa la copia anidada de basic-pitch; sin dependencia raíz |
| **Estado al cambiar de vista** | Todas las vistas montadas, ocultas por CSS — la transcripción/sesión sobrevive |

## 6. Tests

138 pruebas en Node, todas en verde:

```
npm test
```

- Teoría musical (escalas, modos, arpegios, solfège, afinaciones)
- YIN: precisión en E1..G2 sintético, armónicos de púa, ruido de ataque, B0 subgrave
- NoteTracker: anti-octavas, estabilización, cents
- Transcriptor DSP fallback: secuencias conocidas, ocultar armónicos
- Exportador MIDI: SMF válido, tiempos con distintos BPM
- Paridad YIN inline (worklet) vs librería

## 7. Uso

```bash
npm install
npm run dev      # desarrollo (http://localhost:5173)
npm run build    # producción → dist/
npm run preview  # servir dist/ localmente
npm test         # 138 tests
```

- **MIC OFF/ON**: activar micrófono (pedirá permiso) — aparece el panel de diagnóstico con Hz/cents/CPU.
- **STUDIO**: elegir tónica, categoría y escala → practicar en QUIZ.
- **TRANSCRIPTION**: arrastrar un audio de bajo → tabla de notas + MIDI/JSON + "Practicar en QUIZ".
- Requiere HTTPS o localhost para el micrófono (limitación del navegador, no de la app).

## 8. Despliegue público

**URL verificada E2E** (carga, subida de WAV, motor `basic-pitch`, 11/11 notas, exportación JSON/MIDI):

```
https://sites.super.myninja.ai/695831ba-733e-461a-8050-c534361cfff8/410133af/index.html
```

El build usa `base: './'` en `vite.config.js` (rutas relativas) para poder servirse desde cualquier subdirectorio. `dist/` es desplegable tal cual en cualquier hosting estático (S3, GitHub Pages con base correcta, Netlify, etc.).

## 9. Estructura del zip

```
basscoach/
├── dist/            ← build de producción (desplegable tal cual)
├── public/          ├── manifest, sw.js, iconos, modelo IA, sample-bass.wav
├── src/             ├── código fuente completo
├── scripts/         ├── make_icons, make_sample_wav, diag/verify Basic Pitch
├── test/            ├── 138 pruebas Node
├── package.json     └── dependencias (@spotify/basic-pitch únicamente)
└── README.md        └── este documento
```

## 10. Créditos

- **Basic Pitch** © Spotify, Apache-2.0 — modelo de transcripción polyphonic.
- **YIN** — de Cheveigné & Kawahara, 2002.
- Interfaz inspirada en Bassmate; dinámica de práctica inspirada en Rocksmith (Ubisoft) — sin afiliación.
