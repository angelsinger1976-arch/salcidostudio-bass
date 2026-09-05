<script>
  // ============================================================
  // BassCoach · Vista QUIZ — dinámica estilo Rocksmith
  // Ciclo: nota objetivo iluminada → escucha activa (mic) →
  // validación (±cents) → destello verde → índice++ → siguiente.
  // Fuentes: escala (STUDIO), riff demo o transcripción (upload).
  // ============================================================
  import { onDestroy, onMount } from 'svelte';
  import Fretboard from '../components/Fretboard.svelte';
  import { PracticeSession } from '../lib/practice/PracticeSession.js';
  import { midiToName, preferredPosition, tuningMidis } from '../lib/theory.js';
  import { DEMO_RIFFS, riffToSequence } from '../lib/data/demoRiffs.js';

  export let engine = null;            // AudioEngine activo
  export let micOn = false;
  export let tuning = 'std4';
  export let latin = true;
  export let settings = {};            // {centsTolerance, octaveStrict, holdMs}
  export let pendingSequence = null;   // {name, notes} desde STUDIO/TRANSCRIPTION
  export let onConsumed = null;
  export let onStats = null;

  let session = null;
  let sessionName = '';
  let riffId = DEMO_RIFFS[0].id;
  let targetNote = null;
  let lastHitMidi = null;
  let flashUntil = 0;
  let wrongFlashAt = 0;
  let wrongFlashMidi = null;
  let done = false;
  let stats = { attempts: 0, hits: 0, streak: 0, bestStreak: 0, wrong: 0 };
  let liveMidi = null;
  let liveCents = 0;

  $: flashActive = Date.now() < flashUntil;
  $: wrongActive = Date.now() - wrongFlashAt < 380;
  $: precision = stats.attempts > 0 ? Math.round((stats.hits / stats.attempts) * 100) : 100;

  // ---------- Carga de secuencias ----------
  function loadSequence(seq, label) {
    const notes = (seq || []).map((n) => ({ ...n }));
    session = new PracticeSession(notes, {
      centsTolerance: settings.centsTolerance ?? 25,
      octaveStrict: settings.octaveStrict ?? false,
      holdMs: settings.holdMs ?? 120,
    });
    session.tuning = tuning;
    session.onAdvance = ({ note }) => { targetNote = note; };
    session.onHit = ({ note }) => {
      lastHitMidi = note.midi;
      flashUntil = Date.now() + 700;
    };
    session.onMiss = ({ playedMidi }) => {
      wrongFlashAt = Date.now();
      wrongFlashMidi = playedMidi;
    };
    session.onComplete = (st) => {
      done = true;
      stats = { ...st };
      if (onStats) onStats({ ...st });
    };
    done = false;
    stats = { attempts: 0, hits: 0, streak: 0, bestStreak: 0, wrong: 0 };
    sessionName = label;
    targetNote = session.current;
  }

  function startPractice() {
    if (!session) loadRiff();          // auto-carga del riff seleccionado
    if (!session) return;
    session.start();
    done = false;
    stats = { ...session.stats };
    targetNote = session.current;
  }

  function loadRiff() {
    const r = DEMO_RIFFS.find((x) => x.id === riffId);
    if (r) loadSequence(riffToSequence(r), r.name);
  }

  // Secuencia entrante de otra vista
  $: if (pendingSequence) {
    loadSequence(pendingSequence.notes, pendingSequence.name || 'Secuencia');
    pendingSequence = null;
    if (onConsumed) onConsumed();
  }

  // Carga inicial del riff seleccionado
  onMount(() => {
    if (!session) loadRiff();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  });

  // ---------- Escucha activa (suscripción al motor) ----------
  let unsubscribe = null;
  let boundEngine = null;

  $: if (engine && engine !== boundEngine) {
    if (unsubscribe) unsubscribe();
    boundEngine = engine;
    unsubscribe = engine.addTrackerListener(trackerHandler);
  }

  function trackerHandler(upd, det) {
    liveMidi = upd.midi;
    liveCents = upd.cents ?? 0;
    if (!session || session.state !== 'playing') return;
    if (upd.midi === null) return;
    session.check(
      { midi: upd.midi, cents: upd.cents, onset: upd.onset },
      performance.now()
    );
    stats = { ...session.stats };
  }

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });

  // ---------- Autopista ----------
  function laneFor(midi) {
    const strings = tuningMidis(tuning);
    const topMidi = strings[strings.length - 1] + 15;
    const botMidi = strings[0];
    const span = topMidi - botMidi || 1;
    const rel = (midi - botMidi) / span;
    const H = 158;
    return Math.max(4, Math.min(H - 32, (1 - rel) * (H - 36) + 8));
  }

  $: highwayNotes = session
    ? session.notes
        .map((n, i) => ({ ...n, i }))
        .filter((n) => n.i >= session.index - 1 && n.i < session.index + 11)
    : [];

  function nm(midi) {
    return midiToName(midi, { latin, withOctave: true });
  }

  $: targetLaneY = targetNote ? laneFor(targetNote.midi) : 60;
</script>

<div class="panel">
  <div class="row grow">
    <div class="col" style="gap: 2px">
      <h3>🎯 Quiz · {sessionName || '—'}</h3>
      <div class="sub">
        Toca la nota iluminada para avanzar · ±{settings.centsTolerance ?? 25} cents
        {#if settings.octaveStrict}· octava estricta{:else}· octava libre{/if}
        {#if !micOn}· <b class="warn-txt">activa el micrófono</b>{/if}
      </div>
    </div>
    <div class="spacer"></div>
    <div class="row">
      <select bind:value={riffId} on:change={loadRiff}>
        {#each DEMO_RIFFS as r}
          <option value={r.id}>{r.name} · {r.bpm} BPM</option>
        {/each}
      </select>
      <button class="primary" on:click={startPractice}>▶ Practicar</button>
    </div>
  </div>

  <div class="stat-cards" style="margin-top: 10px">
    <div class="stat-card">
      <div class="v">{session ? session.index : 0}/{session ? session.notes.length : 0}</div>
      <div class="l">Progreso</div>
    </div>
    <div class="stat-card quiz"><div class="v">{stats.streak}</div><div class="l">Racha</div></div>
    <div class="stat-card warn"><div class="v">{stats.bestStreak}</div><div class="l">Mejor racha</div></div>
    <div class="stat-card ok"><div class="v">{precision}%</div><div class="l">Precisión</div></div>
    <div class="stat-card err"><div class="v">{stats.wrong}</div><div class="l">Errores</div></div>
  </div>
</div>

{#if done}
  <div class="panel done-panel">
    <div class="done-title">🎉 ¡Secuencia completada! Precisión {precision}% · mejor racha {stats.bestStreak}</div>
    <div class="row" style="justify-content: center">
      <button class="primary" on:click={startPractice}>↻ Repetir</button>
      <button on:click={loadRiff}>↺ Otra vez</button>
    </div>
  </div>
{/if}

{#key flashActive}
  <div class="hit-overlay {flashActive ? 'boom' : ''}"></div>
{/key}

<Fretboard
  {tuning}
  markedPcs={new Set()}
  rootPc={null}
  targetMidi={targetNote ? targetNote.midi : null}
  playedMidi={liveMidi ?? null}
  showLatin={latin}
/>

<!-- Autopista de notas (vista Rocksmith) -->
<div class="highway-wrap">
  <div class="highway-head">
    <b>🛣️ Autopista</b>
    <span>Toca la nota naranja cuando llegue al cursor</span>
    <div class="spacer"></div>
    <span class="hint">🟠 objetivo · 🟢 acierto · <span class="live">🔵 {liveMidi !== null ? nm(liveMidi) + ` ${liveCents > 0 ? '+' : ''}${liveCents}¢` : '—'}</span></span>
  </div>
  <div class="highway">
    <div class="cursor" style="top: {targetLaneY - 13}px"></div>
    {#each highwayNotes as hn (hn.i)}
      <div
        class="hnote {hn.i === session.index ? 'is-target' : ''} {hn.i === session.index - 1 && flashActive ? 'was-hit' : ''}"
        style="left: {44 + (hn.i - session.index) * 92}px; top: {laneFor(hn.midi)}px"
      >
        <span class="hn-name">{nm(hn.midi)}</span>
      </div>
    {/each}
    {#if wrongActive && wrongFlashMidi !== null}
      <div class="wrong-flash" style="left: 50px; top: {laneFor(wrongFlashMidi)}px">✗</div>
    {/if}
  </div>
</div>

<style>
  .spacer { flex: 1; }
  .warn-txt { color: var(--warn); }
  .done-panel { text-align: center; }
  .done-title { font-size: 17px; color: var(--ok); font-weight: 700; margin-bottom: 10px; }

  .hit-overlay {
    position: fixed; inset: 0; pointer-events: none; z-index: 40;
    background: radial-gradient(circle at 50% 45%, rgba(74, 222, 128, 0.22), transparent 55%);
    opacity: 0; transition: opacity 0.12s;
  }
  .hit-overlay.boom { opacity: 1; animation: hitFade 0.7s forwards; }
  @keyframes hitFade { 70% { opacity: 1; } 100% { opacity: 0; } }

  .highway {
    position: relative;
    height: 158px;
    overflow: hidden;
    background:
      repeating-linear-gradient(90deg, transparent 0 91px, rgba(62, 68, 80, 0.35) 91px 92px),
      linear-gradient(180deg, var(--bg-3), var(--bg-2));
  }
  .cursor {
    position: absolute; left: 40px;
    width: 62px; height: 30px;
    border: 2px solid var(--accent);
    border-radius: 8px;
    box-shadow: 0 0 14px var(--accent-glow), inset 0 0 10px var(--accent-glow);
    z-index: 2;
    transition: top 0.25s ease;
  }
  .hnote {
    position: absolute;
    width: 58px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    background: var(--scale);
    color: #0b1220; font-weight: 700; font-size: 11px;
    border-radius: 6px;
    border: 1px solid #0369a1;
    transition: left 0.1s linear, background 0.2s, opacity 0.3s;
    z-index: 1;
    opacity: 0.55;
  }
  .hnote .hn-name { font-family: var(--mono); }
  .hnote.is-target {
    background: var(--root);
    border-color: var(--root-2);
    opacity: 1;
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.5);
    animation: hnPulse 1s infinite;
  }
  .hnote.was-hit { background: var(--ok); border-color: #14532d; opacity: 1; }
  @keyframes hnPulse { 50% { filter: brightness(1.45); } }
  .wrong-flash {
    position: absolute;
    color: var(--err); font-size: 20px; font-weight: 900;
    z-index: 3;
    animation: wrongFade 0.38s forwards;
  }
  @keyframes wrongFade { to { opacity: 0; transform: translateY(-10px); } }
  .hint .live { color: var(--scale-2); font-family: var(--mono); }
</style>
