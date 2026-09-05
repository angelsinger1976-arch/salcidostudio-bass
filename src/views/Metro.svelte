<script>
  // ============================================================
  // BassCoach · Vista METRO (metrónomo)
  // BPM, compás, subdivisión, acento, cuenta atrás y tap tempo.
  // ============================================================
  import { onDestroy } from 'svelte';
  import { Metronome, TapTempo, SUBDIVISIONS } from '../lib/audio/Metronome.js';

  export let countInForQuiz = 0;
  export let onSettings = null;

  const metro = new Metronome();
  const tapper = new TapTempo();
  let bpm = 90;
  let beatsPerBar = 4;
  let subdivision = 'quarter';
  let running = false;
  let currentBeat = -1;
  let tapHint = '';

  $: subOptions = SUBDIVISIONS;

  function restart() {
    if (running) {
      metro.stop();
      start();
    }
  }

  async function start() {
    metro.onBeat = (b) => {
      currentBeat = b.isCountIn ? -2 : b.beatInBar;
    };
    await metro.start({ bpm, beatsPerBar, subdivision });
    running = true;
  }

  function toggle() {
    if (running) {
      metro.stop();
      running = false;
      currentBeat = -1;
    } else {
      start();
    }
  }

  function tap() {
    const est = tapper.tap();
    if (est) {
      bpm = est;
      metro.setBpm(est);
      tapHint = `${tapper.taps.length} taps`;
    } else {
      tapHint = 'sigue tocando…';
    }
  }

  onDestroy(() => metro.stop());
</script>

<div class="panel">
  <h3>Metrónomo</h3>
  <div class="sub">Precisión Web Audio (scheduler con lookahead de 200 ms)</div>

  <div class="metro-dots">
    {#each Array.from({ length: beatsPerBar }, (_, i) => i) as i}
      <div class="metro-dot {currentBeat === i ? (i === 0 ? 'down' : 'beat') : ''}"></div>
    {/each}
  </div>

  <div class="bpm-big">{bpm} <span class="bpm-l">BPM</span></div>

  <div class="row" style="justify-content: center; margin-top: 6px">
    <button on:click={() => { bpm = Math.max(30, bpm - 5); metro.setBpm(bpm); }}>−5</button>
    <button on:click={() => { bpm = Math.max(30, bpm - 1); metro.setBpm(bpm); }}>−1</button>
    <input
      type="range" min="30" max="280" step="1" bind:value={bpm}
      on:input={() => metro.setBpm(bpm)} style="width: 180px"
    />
    <button on:click={() => { bpm = Math.min(280, bpm + 1); metro.setBpm(bpm); }}>+1</button>
    <button on:click={() => { bpm = Math.min(280, bpm + 5); metro.setBpm(bpm); }}>+5</button>
    <button on:click={tap}>👆 Tap {tapHint ? `· ${tapHint}` : ''}</button>
    <button class="primary" on:click={toggle}>{running ? '⏹ Parar' : '▶ Iniciar'}</button>
  </div>

  <div class="row" style="justify-content: center; margin-top: 10px">
    <label class="kv"><span class="lbl">Compás</span>
      <select value={beatsPerBar} on:change={(e) => { beatsPerBar = +e.target.value; restart(); }}>
        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as b}
          <option value={b}>{b}</option>
        {/each}
      </select>
    </label>
    <label class="kv"><span class="lbl">Subdivisión</span>
      <select value={subdivision} on:change={(e) => { subdivision = e.target.value; restart(); }}>
        {#each subOptions as so}
          <option value={so.id}>{so.latin} ({so.label})</option>
        {/each}
      </select>
    </label>
  </div>
</div>

<style>
  .bpm-l { font-size: 14px; color: var(--fg-3); font-weight: 400; }
</style>
