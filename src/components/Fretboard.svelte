<script>
  // ============================================================
  // BassCoach · Diapasón interactivo (SVG)
  // Réplica del layout Bassmate: cuerdas horizontales, nut a la
  // izquierda, trastes 1..15 con inlays, notas tónica (naranja) y
  // escala (celeste). Estados extra para dinámica Rocksmith:
  // target (pulsante), hit (destello verde), played (en vivo).
  // ============================================================
  import {
    TUNINGS, tuningMidis, midiToName, pitchClassLatin,
  } from '../lib/theory.js';

  export let tuning = 'std4';
  export let markedPcs = new Set();     // pitch-classes de la escala
  export let rootPc = null;             // tónica
  export let targetPosition = null;     // {string, fret} nota objetivo (Rocksmith)
  export let targetMidi = null;
  export let playedMidi = null;         // nota detectada en vivo (feedback)
  export let showDegrees = true;
  export let showLatin = true;
  export let frets = 15;
  export let onNoteClick = null;

  $: strings = tuningMidis(tuning);
  $: nStrings = strings.length;

  // Geometría (SVG coords)
  const PAD_L = 118;   // zona de nombres de cuerda
  const PAD_R = 26;
  const PAD_T = 26;
  const PAD_B = 18;
  const FRET_H = 46;   // alto por cuerda
  const FRET_W_MIN = 64;  // ancho mínimo del primer traste
  $: fretX = computeFretX();  // borde izquierdo de cada traste
  $: width = PAD_L + fretX[frets] + PAD_R;
  $: height = PAD_T + nStrings * FRET_H + PAD_B;

  function computeFretX() {
    // Trastes con ancho decreciente (estética real de diapasón)
    const xs = [0];
    let x = 0;
    let w = FRET_W_MIN * 1.7;
    for (let f = 1; f <= frets; f++) {
      x += w;
      xs.push(x);
      w *= 0.935;
    }
    return xs;
  }

  $: stringY = (s) => PAD_T + (nStrings - 1 - s) * FRET_H + FRET_H / 2; // s=0 grave abajo

  $: view = { width, height };

  function noteInfo(s, f) {
    const midi = strings[s] + f;
    const pc = ((midi % 12) + 12) % 12;
    const isScale = markedPcs && markedPcs.has(pc);
    const isRoot = rootPc !== null && rootPc !== undefined && pc === rootPc;
    const degree = degreeFor(pc);
    const name = showLatin ? pitchClassLatin(pc) : midiToName(midi, { latin: false });
    return { midi, pc, isScale, isRoot, degree, name };
  }

  function degreeFor(pc) {
    if (rootPc === null || rootPc === undefined) return '';
    const iv = ((pc - rootPc) % 12 + 12) % 12;
    return iv === 0 ? 'R' : DEG[iv] || '';
  }

  const DEG = { 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♯4', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7' };

  function isTarget(s, f) {
    if (!targetPosition) return false;
    if (targetMidi === null || targetMidi === undefined) return false;
    return strings[s] + f === targetMidi;
  }

  function isPlayed(s, f) {
    if (playedMidi === null || playedMidi === undefined) return false;
    return strings[s] + f === playedMidi;
  }

  function clickNote(e, s, f) {
    if (onNoteClick) onNoteClick({ string: s, fret: f, midi: strings[s] + f });
  }
</script>

<div class="fretboard-wrap">
  <svg {width} {height} viewBox="0 0 {width} {height}">
    <!-- Nut -->
    <rect x={PAD_L - 5} y={PAD_T - 4} width="6" height={nStrings * FRET_H + 8} fill="#e5e7eb" rx="2" />

    <!-- Trastes -->
    {#each Array.from({ length: frets + 1 }, (_, i) => i) as fi}
      <line
        x1={PAD_L + fretX[fi]} y1={PAD_T - 4}
        x2={PAD_L + fretX[fi]} y2={PAD_T + nStrings * FRET_H + 4}
        stroke={fi === 0 ? 'none' : '#4b5563'} stroke-width={fi === 12 || fi === 15 ? 3 : 2}
      />
    {/each}

    <!-- Inlays (3,5,7,9 y doble en 12) -->
    {#each [3, 5, 7, 9, 15] as fi}
      <circle cx={PAD_L + (fretX[fi - 1] + fretX[fi]) / 2} cy={PAD_T + nStrings * FRET_H / 2} r="5" fill="#3a3f49" />
    {/each}
    <circle cx={PAD_L + (fretX[11] + fretX[12]) / 2} cy={PAD_T + nStrings * FRET_H / 2 - FRET_H} r="5" fill="#3a3f49" />
    <circle cx={PAD_L + (fretX[11] + fretX[12]) / 2} cy={PAD_T + nStrings * FRET_H / 2 + FRET_H} r="5" fill="#3a3f49" />

    <!-- Números de traste -->
    {#each Array.from({ length: frets }, (_, i) => i + 1) as fn}
      <text
        x={PAD_L + (fretX[fn - 1] + fretX[fn]) / 2}
        y={PAD_T - 8}
        text-anchor="middle" font-size="10.5" fill="#6b7280"
        font-family="var(--mono)"
      >{fn}</text>
    {/each}

    <!-- Cuerdas -->
    {#each Array.from({ length: nStrings }, (_, i) => i) as si}
      <line
        x1={PAD_L - 5} y1={stringY(si)}
        x2={PAD_L + fretX[frets]} y2={stringY(si)}
        stroke="#9ca3af" stroke-width={0.8 + si * 0.45}
        opacity="0.85"
      />
    {/each}

    <!-- Nombre de cuerdas (izquierda) -->
    {#each Array.from({ length: nStrings }, (_, i) => i) as si}
      <text
        x={PAD_L - 34} y={stringY(si) + 4}
        text-anchor="middle" font-size="12" fill="#9aa0ab"
        font-weight="600"
      >{midiToName(strings[si], { latin: showLatin })}</text>
      <text
        x={PAD_L - 66} y={stringY(si) + 4}
        text-anchor="middle" font-size="10" fill="#6b7280"
      >{midiToName(strings[si], { latin: false })}</text>
    {/each}

    <!-- Notas -->
    {#each Array.from({ length: nStrings }, (_, i) => i) as si}
      {#each Array.from({ length: frets + 1 }, (_, j) => j) as fj}
        {@const info = noteInfo(si, fj)}
        {#if info.isRoot || info.isScale || isTarget(si, fj) || isPlayed(si, fj)}
          <g
            class="fb-note {info.isRoot ? 'root' : 'scale'}"
            class:target={isTarget(si, fj)}
            class:played={isPlayed(si, fj)}
            on:click={(e) => clickNote(e, si, fj)}
          >
            <circle
              class="body"
              cx={PAD_L + (fretX[Math.max(0, fj - 1)] + fretX[fj]) / 2 + (fj === 0 ? -26 : 0)}
              cy={stringY(si)}
              r="13"
              stroke-width="1.5"
            />
            {#if showDegrees && info.degree}
              <text
                class="fb-deg"
                x={PAD_L + (fretX[Math.max(0, fj - 1)] + fretX[fj]) / 2 + (fj === 0 ? -26 : 0)}
                y={stringY(si) + 3}
                text-anchor="middle"
              >{info.degree}</text>
            {/if}
          </g>
        {/if}
      {/each}
    {/each}
  </svg>

  <div class="legend">
    <div class="item"><span class="dot root"></span> Tónica (R)</div>
    <div class="item"><span class="dot scale"></span> Nota de escala</div>
    <div class="item"><span class="dot target"></span> Objetivo</div>
    <div class="item"><span class="dot hit"></span> Acierto</div>
    <span class="spacer" style="flex:1"></span>
    <span>Afinación: {TUNINGS[tuning]?.name}</span>
  </div>
</div>

<style>
  .spacer { flex: 1; }
</style>
