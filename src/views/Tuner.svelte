<script>
  // ============================================================
  // BassCoach · Vista TUNER
  // Aguja analógica + barra de cents ±50 + Hz detectados.
  // Sugerencia de cuerda más cercana. Requiere el motor de
  // audio activo (el estado llega por props desde App).
  // ============================================================
  import { onMount, onDestroy } from 'svelte';
  import { midiToFreq, midiToName, freqToMidiFloat, TUNINGS, tuningMidis } from '../lib/theory.js';

  export let live = null;        // {f0, confidence, rms, midi, cents}
  export let tuning = 'std4';
  export let latin = true;

  $: strings = tuningMidis(tuning);
  $: nearest = nearestString(live?.f0);

  function nearestString(f0) {
    if (!f0 || f0 <= 0) return null;
    let best = null;
    for (const m of strings) {
      const target = midiToFreq(m);
      const cents = 1200 * Math.log2(f0 / target);
      if (Math.abs(cents) <= 250 && (!best || Math.abs(cents) < Math.abs(best.cents))) {
        best = { midi: m, cents, target };
      }
    }
    return best;
  }

  // Aguja: -50..+50 cents → -60..+60 grados
  $: needleAngle = nearest ? Math.max(-60, Math.min(60, nearest.cents * 1.2)) : 0;
  $: inTune = nearest && Math.abs(nearest.cents) <= 8;
  $: centsClamped = nearest ? Math.max(-50, Math.min(50, nearest.cents)) : 0;
  $: barPct = ((centsClamped + 50) / 100) * 100;
</script>

<div class="panel tuner-panel">
  <h3>Afinador de bajo</h3>
  <div class="sub">
    Toca una cuerda al aire · afinación {TUNINGS[tuning]?.name} · umbral verde ±8 cents
  </div>

  {#if !live || live.f0 <= 0}
    <div class="waiting">
      <div class="waiting-icon">🎙️</div>
      <div>Esperando señal… activa el micrófono y toca una cuerda</div>
      {#if live}
        <div class="sub">RMS {live.rms?.toFixed(4)} · señal por debajo del umbral</div>
      {/if}
    </div>
  {:else}
    <div class="tuner-main">
      <div class="tuner-note-name {inTune ? 'ok' : ''}">
        {nearest ? midiToName(nearest.midi, { latin, withOctave: true }) : '—'}
      </div>
      <div class="tuner-hz">{live.f0.toFixed(2)} Hz</div>

      <!-- Aguja -->
      <svg viewBox="0 0 240 120" class="needle-svg">
        <g transform="translate(120, 112)">
          <!-- arco -->
          <path d="M -86 -8 A 86 86 0 0 1 86 -8" fill="none" stroke="#3e4450" stroke-width="3" />
          <!-- zona verde -->
          <path d="M -12 -94 A 86 86 0 0 1 12 -94" fill="none" stroke="#4ade80" stroke-width="6" opacity="0.8" />
          <!-- marcas -->
          {#each [-60, -30, 0, 30, 60] as a}
            <line
              x1={Math.sin((a * Math.PI) / 180) * 76}
              y1={-Math.cos((a * Math.PI) / 180) * 76}
              x2={Math.sin((a * Math.PI) / 180) * 86}
              y2={-Math.cos((a * Math.PI) / 180) * 86}
              stroke="#6b7280" stroke-width="2"
            />
          {/each}
          <!-- aguja -->
          <g transform="rotate({needleAngle})">
            <line x1="0" y1="6" x2="0" y2="-82" stroke={inTune ? '#4ade80' : '#a78bfa'} stroke-width="3" class="needle" />
          </g>
          <circle r="7" fill="#242830" stroke="#3e4450" stroke-width="2" />
        </g>
      </svg>

      <div class="tuner-cents-bar">
        <div class="zone-ok" style="left: 46%; width: 8%;"></div>
        <div class="needle" style="left: {barPct}%"></div>
      </div>
      <div class="cents-readout row" style="justify-content: center">
        <span class="{inTune ? 'ok-txt' : ''}">
          {nearest ? (nearest.cents > 0 ? '+' : '') + nearest.cents.toFixed(1) : '0.0'} cents
        </span>
        {#if nearest}
          <span class="target-txt">
            objetivo {nearest.target.toFixed(2)} Hz · {midiToName(nearest.midi, { latin, withOctave: true })}
          </span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Cuerdas de la afinación -->
  <div class="tuner-strings">
    {#each [...strings].reverse() as m (m)}
      <button class="str-chip {nearest && nearest.midi === m ? 'sel' : ''} {nearest && nearest.midi === m && inTune ? 'ok' : ''}">
        <b>{midiToName(m, { latin, withOctave: true })}</b>
        <span>{midiToFreq(m).toFixed(1)} Hz</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .tuner-panel { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
  .waiting {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 34px 0 22px; color: var(--fg-3); font-size: 13px;
  }
  .waiting-icon { font-size: 34px; opacity: 0.6; }
  .tuner-main { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .tuner-note-name.ok { color: var(--ok); text-shadow: 0 0 22px rgba(74, 222, 128, 0.45); }
  .needle-svg { width: 250px; max-width: 90%; }
  .needle { transition: transform 0.1s ease-out; transform-origin: center; }
  .cents-readout { font-family: var(--mono); font-size: 14px; color: var(--fg); gap: 14px; }
  .ok-txt { color: var(--ok); font-weight: 700; }
  .target-txt { color: var(--fg-3); font-size: 12px; }
  .str-chip {
    display: flex; flex-direction: column; align-items: center;
    min-width: 74px; padding: 7px 10px; line-height: 1.25;
  }
  .str-chip b { font-size: 13px; }
  .str-chip span { font-size: 10px; color: var(--fg-3); font-family: var(--mono); }
  .str-chip.sel { border-color: var(--accent); background: var(--accent-3); color: #fff; }
  .str-chip.sel span { color: var(--scale-2); }
  .str-chip.ok { border-color: var(--ok); }
  .str-chip.ok b { color: var(--ok); }
</style>
