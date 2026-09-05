# BassCoach — App interactiva de bajo (interfaz Bassmate + dinámica Rocksmith)

## 1. Fundamentos
- [x] Verificar entorno (node, npm, red) y viabilidad de Basic Pitch en navegador
- [x] Motor de teoría musical (notas solfège/anglo, escalas, modos, arpegios, afinaciones 4/5 cuerdas)

## 2. Motor de audio en tiempo real
- [x] YIN en AudioWorklet (procesamiento por chunks) con fallback a AnalyserNode
- [x] Cadena de audio: mic → filtro paso bajo ~500Hz → detector → RMS/confianza
- [x] NoteTracker: mediana anti-octavas, estabilización anti-ataque, cents, validación ±20 cents
- [x] Tests YIN en Node con WAVs sintéticos de bajo (E1..G2 + armónicos + ruido de ataque) — 138/138 OK

## 3. Interfaz estilo Bassmate
- [x] Layout base: tema oscuro + púrpura, top bar con tabs, sidebar de notas/escalas
- [x] Diapasón SVG interactivo (4/5 cuerdas, 15 trastes, círculos naranja/celeste, franja horizontal)
- [x] Vista STUDIO (escalas/modos/arpegios con selector de tónica y categorías)
- [x] Vista TUNER (aguja, cents, Hz, cuerdas E-A-D-G/B)
- [x] Vista METRO (BPM, compás, subdivisión, tap tempo, acentos)
- [x] Vista QUIZ (nota objetivo → validación en tiempo real → avance, racha, precisión)
- [x] Vistas persistentes al cambiar de tab (estado de transcripción/sesión conservado)

## 4. Transcripción offline → práctica Rocksmith
- [x] Subida de audio → Basic Pitch (bundle local) con fallback a transcriptor DSP propio
- [x] Bug de librería detectado y esquivado: minFreq < 27.5 Hz borra toda la matriz (fill con índice negativo) → minFreq=null + filtro MIDI 21-60
- [x] cleanBassLine: eliminación de armónicos fantasma (octava/quinta) y smear de onset
- [x] E2E verificado en navegador: WAV sintético → 11/11 notas exactas con motor basic-pitch
- [x] Secuencia JSON [nota, octava, tiempo, duración] + exportación MIDI (SMF tipo 0 verificado)
- [x] Mapeo nota→posición en diapasón + autopista de notas con modo espera
- [x] Ciclo de avance: nota iluminada → escucha activa → validación → destello verde → siguiente
- [x] Riffs demo integrados + envío transcripción→QUIZ verificado

## 5. Ajustes + PWA + entrega
- [x] Panel de ajustes (dispositivo de entrada, cutoff filtro, tolerancia cents, estabilización) — verificado visualmente
- [x] PWA: manifest, service worker, iconos (192/512/maskable)
- [x] Verificación visual en navegador (screenshots de cada vista)
- [x] Despliegue estático + zip + README técnico

## 6. Publicación en GitHub (repo angelsinger1976-arch/salcidostudio-bass)
- [x] Autenticar gh CLI con el token del usuario (sin exponerlo en outputs)
- [x] Inspeccionar estado del repo remoto (privado, stub README, 1 commit)
- [ ] Ajustar autoría del commit (usuario, email noreply) y crear rama feature
- [ ] Push de la rama + PR a main
- [ ] Verificar workflow CI (138 tests + build) en GitHub Actions
- [ ] Entregar enlaces finales (PR, repo, despliegue público)
