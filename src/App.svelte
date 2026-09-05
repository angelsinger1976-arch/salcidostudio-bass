<script>
  // ============================================================
  // BassCoach · Aplicación principal
  // Orquesta el AudioEngine (tiempo real), el sidebar Bassmate
  // (tónica + categorías/escalas) y las vistas STUDIO/QUIZ/
  // TUNER/METRO/TRANSCRIPTION + Ajustes.
  // ============================================================
  import { onMount, onDestroy } from 'svelte';
  import Studio from './views/Studio.svelte';
  import Tuner from './views/Tuner.svelte';
  import Metro from './views/Metro.svelte';
  import Quiz from './views/Quiz.svelte';
  import Transcription from './views/Transcription.svelte';
  import SettingsView from './views/Settings.svelte';
  import { AudioEngine } from './lib/audio/AudioEngine.js';
  import { SCALES, SCALE_CATEGORIES, midiToName } from './lib/theory.js';

  const TABS = [
    { id: 'studio', label: 'STUDIO' },
    { id: 'quiz', label: 'QUIZ' },
    { id: 'tuner', label: 'TUNER' },
    { id: 'metro', label: 'METRO' },
    { id: 'transcription', label: 'TRANSCRIPTION' },
    { id: 'settings', label: '⚙' },
  ];

  let tab = 'studio';
  let engine = null;
  let micOn = false;
  let micError = '';
  let mode = ''; // worklet | analyser
  let live = null;      // {f0, confidence, rms, midi, cents}
  let level = 0;
  let cpuMs = 0;
  let toasts = [];
  let toastId = 0;

  // Estado de teoría (sidebar)
  let rootPc = 0;
  let scaleKey = 'majPent';
  let selectedCategory = 'majPent';
  let latin = true;
  let showDegrees = true;
  let tuning = 'std4';

  // Config del motor (vive en Settings y se aplica en vivo)
  let settings = {
    lowpassHz: 500,
    centsTolerance: 25,
    windowMs: 96,
    hopMs: 24,
    rmsGate: 0.008,
    minConfidence: 0.55,
    stableFrames: 2,
    octaveStrict: false,
    holdMs: 120,
    deviceId: '',
    tuning: 'std4',
  };

  // Secuencia pendiente hacia QUIZ
  let pendingSequence = null;

  // Suscripción a detecciones
  function detectionHandler(det) {
    level = det.rms ?? 0;
    cpuMs = det.avgCpuMs ?? det.cpuMs ?? 0;
  }

  function trackerHandler(upd) {
    live = {
      f0: upd.f0,
      midi: upd.midi,
      cents: upd.cents,
      confidence: upd.confidence ?? 0,
    };
  }

  async function toggleMic() {
    if (micOn) {
      await engine.stop();
      micOn = false;
      live = null;
      level = 0;
    } else {
      if (!engine) engine = new AudioEngine({ lowpassHz: settings.lowpassHz, deviceId: settings.deviceId || null });
      engine.settings.lowpassHz = settings.lowpassHz;
      engine.settings.deviceId = settings.deviceId || null;
      engine.onDetection = detectionHandler;
      engine.onTrackerUpdate = trackerHandler;
      try {
        mode = await engine.start({ deviceId: settings.deviceId || null });
        micOn = true;
        micError = '';
        applyEngineSettings();
        toast(`🎙️ Micrófono activo (${mode === 'worklet' ? 'AudioWorklet' : 'Analyser fallback'})`, 'ok');
      } catch (err) {
        micError = err?.message || 'No se pudo acceder al micrófono';
        toast(`⚠️ ${micError}`, 'err');
      }
    }
  }

  function applyEngineSettings() {
    if (!engine || !micOn) return;
    engine.setLowpass(settings.lowpassHz);
    engine.setYinConfig({
      windowMs: settings.windowMs,
      hopMs: settings.hopMs,
    });
    engine.setTrackerSettings({
      rmsGate: settings.rmsGate,
      minConfidence: settings.minConfidence,
      stableFrames: settings.stableFrames,
    });
  }

  async function restartMic() {
    if (micOn) {
      await engine.stop();
      micOn = false;
    }
    await toggleMic();
  }

  function onSettingsChange(s) {
    settings = { ...settings, ...s };
    tuning = settings.tuning || 'std4';
    applyEngineSettings();
  }

  function sendToQuiz(seq) {
    pendingSequence = seq;
    tab = 'quiz';
    toast(`🎮 "${seq.name}" cargada en QUIZ (${seq.notes.length} notas)`, 'ok');
  }

  function toast(msg, kind = '') {
    const id = ++toastId;
    toasts = [...toasts, { id, msg, kind }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 3200);
  }

  // Sidebar: picking de tónica y escala
  const NOTE_PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  $: scaleOptions = Object.entries(SCALES).filter(([, v]) => v.category === selectedCategory);
  $: pcName = (pc) => midiToName(12 + pc, { latin });

  onDestroy(async () => {
    if (engine) await engine.stop();
  });
</script>

<div id="app">
  <!-- ============ Top bar ============ -->
  <header class="topbar">
    <div class="brand"><b>BassCoach</b><span>bass trainer · PWA</span></div>
    <nav class="tabs">
      {#each TABS as t}
        <button class:on={tab === t.id} on:click={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </nav>
    <div class="spacer"></div>
    <div class="mic-state {micOn ? 'on' : ''}" title={micError || (micOn ? 'Motor de escucha activo' : 'Micrófono apagado')}>
      <span class="mic-dot"></span>
      {micOn ? `LIVE · ${mode === 'worklet' ? 'Worklet' : 'Fallback'}` : 'MIC OFF'}
    </div>
    <button class="primary" on:click={toggleMic}>{micOn ? '⏹' : '🎙'} Mic</button>
  </header>

  <div class="main">
    <!-- ============ Sidebar Bassmate ============ -->
    <aside class="sidebar" class:hide={tab === 'settings'}>
      <h4>Nota raíz</h4>
      <div class="note-grid">
        {#each NOTE_PCS as pc}
          <button class:sel={rootPc === pc} on:click={() => (rootPc = pc)}>{pcName(pc)}</button>
        {/each}
      </div>

      <h4>Categorías</h4>
      <div class="cat-list">
        {#each SCALE_CATEGORIES as c}
          <button class:sel={selectedCategory === c.id} on:click={() => { selectedCategory = c.id; const f = Object.entries(SCALES).find(([, v]) => v.category === c.id); if (f) scaleKey = f[0]; }}>
            {latin ? c.latin : c.label}
          </button>
        {/each}
      </div>

      <h4>Escalas · {scaleOptions.length}</h4>
      <div class="scale-list">
        {#each scaleOptions as [k, sc]}
          <button class:sel={scaleKey === k} on:click={() => (scaleKey = k)}>
            {latin ? sc.latin : sc.name}
          </button>
        {/each}
      </div>

      {#if micOn && live}
        <h4>Detección en vivo</h4>
        <div class="kv"><span class="lbl">Nota</span> <b>{live.midi !== null ? midiToName(live.midi, { latin, withOctave: true }) : '—'}</b></div>
        <div class="kv"><span class="lbl">Hz</span> <b>{live.f0 > 0 ? live.f0.toFixed(1) : '—'}</b></div>
        <div class="kv"><span class="lbl">Cents</span> <b>{live.midi !== null ? (live.cents > 0 ? '+' : '') + live.cents : '—'}</b></div>
        <div class="kv"><span class="lbl">CPU</span> <b>{cpuMs.toFixed(1)} ms</b></div>
        <div class="level-bar"><div style="width: {Math.min(100, level * 600)}%"></div></div>
      {/if}
    </aside>

    <!-- ============ Contenido ============ -->
    <main class="content">
      <!-- Todas las vistas montadas: se ocultan por CSS para conservar el
           estado (transcripción, sesión QUIZ, afinación) al cambiar de tab. -->
      <div class="view" class:active={tab === 'studio'}>
        <Studio bind:rootPc bind:scaleKey bind:tuning bind:selectedCategory {latin} {showDegrees} onSendToQuiz={sendToQuiz} />
      </div>
      <div class="view" class:active={tab === 'quiz'}>
        <Quiz {engine} {micOn} {tuning} {latin} {settings} bind:pendingSequence onConsumed={() => {}} onStats={() => {}} />
      </div>
      <div class="view" class:active={tab === 'tuner'}>
        <Tuner {live} {tuning} {latin} />
      </div>
      <div class="view" class:active={tab === 'metro'}>
        <Metro />
      </div>
      <div class="view" class:active={tab === 'transcription'}>
        <Transcription onSendToQuiz={sendToQuiz} />
      </div>
      <div class="view" class:active={tab === 'settings'}>
        <SettingsView bind:settings engineOn={micOn} onChange={onSettingsChange} onRestartMic={restartMic} />
      </div>
    </main>
  </div>

  <footer class="footer">
    <span>BassCoach · interfaz inspirada en Bassmate + dinámica Rocksmith</span>
    <span>Basic Pitch © Spotify (Apache-2.0) · YIN (de Cheveigné & Kawahara)</span>
    <span class="spacer"></span>
    <span>Hecho con 🎸 para bajistas — 2026</span>
  </footer>
</div>

<div class="toast-zone">
  {#each toasts as t (t.id)}
    <div class="toast {t.kind}">{t.msg}</div>
  {/each}
</div>

<style>
  .sidebar.hide { display: none; }
  .level-meter {
    width: 90px; height: 8px;
    background: var(--bg-4);
    border: 1px solid var(--line);
    border-radius: 5px;
    overflow: hidden;
    opacity: 0.4;
  }
  .level-meter.on { opacity: 1; }
  .level-meter .level-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--ok), var(--accent));
    transition: width 0.08s linear;
  }
  .level-bar {
    height: 6px; background: var(--bg-4); border-radius: 4px;
    margin-top: 8px; overflow: hidden; border: 1px solid var(--line);
  }
  .level-bar > div {
    height: 100%;
    background: linear-gradient(90deg, var(--ok), var(--accent));
    transition: width 0.08s;
  }
  .spacer { flex: 1; }
</style>
