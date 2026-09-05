<script>
  // ============================================================
  // BassCoach · Vista STUDIO
  // Visualizador de escalas/modos/arpegios sobre el diapasón,
  // con selector de tónica (Do..Si), categorías y escalas.
  // Muestra la franja de grados tipo Bassmate y permite enviar
  // la escala al modo QUIZ para practicarla con el micrófono.
  // ============================================================
  import Fretboard from '../components/Fretboard.svelte';
  import {
    SCALES, SCALE_CATEGORIES, scalePitchClasses, scaleNotes,
    midiToName, TUNINGS,
  } from '../lib/theory.js';

  export let rootPc = 0;               // Do por defecto (como la imagen)
  export let scaleKey = 'majPent';
  export let tuning = 'std4';
  export let latin = true;
  export let showDegrees = true;
  export let onSendToQuiz = null;

  const NOTE_PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  export let selectedCategory = 'majPent';   // vinculante con el sidebar de App
  let hoverNote = null;

  $: category = SCALE_CATEGORIES.find((c) => c.id === selectedCategory);
  $: scaleOptions = Object.entries(SCALES).filter(([, v]) => v.category === selectedCategory);
  $: pcs = scalePitchClasses(rootPc, scaleKey);
  $: scale = SCALES[scaleKey];
  $: notesInScale = scaleNotes(rootPc, scaleKey, 1);
  $: rootName = midiToName(12 * 2 + rootPc, { latin });
  $: scaleTitle = `${rootName} ${latin ? scale.latin : scale.name}`;

  function pickNote(pc) { rootPc = pc; }
  function pickScale(k) { scaleKey = k; }
  function pickCategory(id) {
    selectedCategory = id;
    const first = Object.entries(SCALES).find(([, v]) => v.category === id);
    if (first) scaleKey = first[0];
  }

  function quizScale() {
    // Genera secuencia ascendente/descendente de la escala (2 octavas)
    const seq = [];
    const base = 12 * 2 + rootPc; // octava 1
    const ivs = scale.intervals;
    for (const oct of [0, 12]) {
      for (const iv of ivs) seq.push({ midi: base + oct + iv });
    }
    for (const iv of [...ivs].reverse().slice(1)) seq.push({ midi: base + 12 + iv });
    seq.push({ midi: base + 12 });
    if (onSendToQuiz) onSendToQuiz({
      name: scaleTitle,
      notes: seq,
      source: 'scale',
    });
  }
</script>

<div class="panel head-panel">
  <div class="row grow">
    <div class="col" style="gap:2px">
      <h3>{scaleTitle}</h3>
      <div class="sub">
        {scale.intervals.length} notas · categoría: {category ? (latin ? category.latin : category.label) : ''}
        · afinación: {TUNINGS[tuning]?.name}
      </div>
    </div>
    <div class="spacer"></div>
    <div class="row">
      <label class="kv"><span class="lbl">Solfeo</span>
        <span class="switch" class:on={latin} role="switch" tabindex="0"
          on:click={() => (latin = !latin)} on:keydown={(e) => e.key === 'Enter' && (latin = !latin)}></span>
      </label>
      <label class="kv"><span class="lbl">Grados</span>
        <span class="switch" class:on={showDegrees} role="switch" tabindex="0"
          on:click={() => (showDegrees = !showDegrees)} on:keydown={(e) => e.key === 'Enter' && (showDegrees = !showDegrees)}></span>
      </label>
      <button class="primary" on:click={quizScale}>🎮 Practicar en QUIZ</button>
    </div>
  </div>

  <!-- Franja de grados de la escala -->
  <div class="degrees-strip">
    {#each notesInScale as n (n.midi)}
      <div class="deg-chip {n.isRoot ? 'is-root' : ''}">
        <span class="d">{n.degree}</span>
        <span class="n">{midiToName(n.midi, { latin })}</span>
      </div>
    {/each}
  </div>
</div>

<Fretboard {tuning} markedPcs={pcs} {rootPc} showLatin={latin} {showDegrees} />

<style>
  .head-panel { display: flex; flex-direction: column; gap: 10px; }
  .spacer { flex: 1; }
  .degrees-strip {
    display: flex; gap: 6px; flex-wrap: wrap;
    background: var(--bg-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    padding: 8px 10px;
  }
  .deg-chip {
    display: flex; flex-direction: column; align-items: center;
    background: var(--bg-4);
    border: 1px solid var(--line-2);
    border-radius: 6px;
    padding: 4px 10px;
    min-width: 46px;
  }
  .deg-chip .d { font-size: 9px; color: var(--fg-3); letter-spacing: 0.5px; }
  .deg-chip .n { font-size: 13px; font-weight: 600; color: var(--scale-2); }
  .deg-chip.is-root { border-color: var(--root); background: rgba(245, 158, 11, 0.12); }
  .deg-chip.is-root .n { color: var(--root-2); }
  .deg-chip.is-root .d { color: var(--root); font-weight: 700; }
</style>
