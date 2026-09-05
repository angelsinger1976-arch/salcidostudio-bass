<script>
  // ============================================================
  // BassCoach · Ajustes (motor de audio y validación)
  // Dispositivo de entrada, cutoff del paso bajo, tolerancia en
  // cents, ventana YIN, estabilización, octava estricta.
  // ============================================================
  import { onMount } from 'svelte';
  import { TUNINGS } from '../lib/theory.js';

  export let settings = {
    lowpassHz: 500,
    centsTolerance: 25,
    windowMs: 96,
    hopMs: 24,
    rmsGate: 0.008,
    minConfidence: 0.55,
    stableFrames: 2,
    octaveStrict: false,
    holdMs: 120,
  };
  export let engineOn = false;
  export let onChange = null;
  export let onRestartMic = null;

  let devices = [];

  onMount(async () => {
    try {
      if (navigator.mediaDevices) {
        // permiso aún no concedido: lista etiquetas genéricas
        devices = await navigator.mediaDevices.enumerateDevices();
      }
    } catch {}
  });

  function emit() {
    if (onChange) onChange({ ...settings });
  }

  async function refreshDevices() {
    try { devices = await navigator.mediaDevices.enumerateDevices(); } catch {}
  }
</script>

<div class="panel">
  <h3>⚙️ Ajustes del motor</h3>
  <div class="sub">
    {#if engineOn}
      Algunos cambios requieren reiniciar el micrófono.
    {:else}
      Activa el micrófono para enumerar dispositivos con etiquetas.
    {/if}
  </div>

  <div class="settings-grid">
    <div class="setting">
      <label>Dispositivo de entrada</label>
      <div class="row" style="gap: 6px">
        <select bind:value={settings.deviceId} on:change={emit} style="flex: 1">
          <option value="">Por defecto</option>
          {#each devices as d}
            {#if d.kind === 'audioinput'}
              <option value={d.deviceId}>{d.label || `Micrófono ${d.deviceId.slice(0, 6)}`}</option>
            {/if}
          {/each}
        </select>
        <button on:click={refreshDevices}>↻</button>
      </div>
    </div>

    <div class="setting">
      <label>Afinación del diapasón</label>
      <select bind:value={settings.tuning} on:change={emit}>
        {#each Object.entries(TUNINGS) as [k, t]}
          <option value={k}>{t.name}</option>
        {/each}
      </select>
    </div>

    <div class="setting">
      <label>Filtro paso bajo · <span class="val">{settings.lowpassHz} Hz</span></label>
      <input type="range" min="200" max="1200" step="20" bind:value={settings.lowpassHz} on:input={emit} />
      <span class="hint">Aísla los graves antes del detector (500 Hz recomendado para bajo)</span>
    </div>

    <div class="setting">
      <label>Tolerancia de afinación · <span class="val">±{settings.centsTolerance} cents</span></label>
      <input type="range" min="5" max="60" step="5" bind:value={settings.centsTolerance} on:input={emit} />
      <span class="hint">Margen para dar la nota por buena (15–25 típico)</span>
    </div>

    <div class="setting">
      <label>Ventana YIN · <span class="val">{settings.windowMs} ms</span></label>
      <input type="range" min="64" max="160" step="8" bind:value={settings.windowMs} on:input={emit} />
      <span class="hint">Más ventana = más estable en subgraves (B0 necesita ≥ 96 ms)</span>
    </div>

    <div class="setting">
      <label>Estabilización · <span class="val">{settings.stableFrames} frames</span></label>
      <input type="range" min="1" max="5" step="1" bind:value={settings.stableFrames} on:input={emit} />
      <span class="hint">Frames iguales consecutivos para aceptar la nota (ignora el ataque)</span>
    </div>

    <div class="setting">
      <label>Umbral de señal RMS · <span class="val">{settings.rmsGate.toFixed(3)}</span></label>
      <input type="range" min="0.002" max="0.05" step="0.002" bind:value={settings.rmsGate} on:input={emit} />
      <span class="hint">Sube si hay ruido de fondo; baja si el bajo es suave</span>
    </div>

    <div class="setting">
      <label>Umbral de confianza YIN · <span class="val">{settings.minConfidence.toFixed(2)}</span></label>
      <input type="range" min="0.3" max="0.9" step="0.05" bind:value={settings.minConfidence} on:input={emit} />
    </div>

    <div class="setting">
      <label>Sostener acierto · <span class="val">{settings.holdMs} ms</span></label>
      <input type="range" min="0" max="400" step="20" bind:value={settings.holdMs} on:input={emit} />
      <span class="hint">Cuánto debe sostenerse la nota correcta antes de avanzar</span>
    </div>

    <div class="setting">
      <label>Validación de octava</label>
      <div class="row" style="gap: 8px">
        <span class="switch {settings.octaveStrict ? 'on' : ''}" role="switch" tabindex="0"
          on:click={() => { settings.octaveStrict = !settings.octaveStrict; emit(); }}
          on:keydown={(e) => e.key === 'Enter' && ((settings.octaveStrict = !settings.octaveStrict), emit())}
        ></span>
        <span class="hint">{settings.octaveStrict ? 'Exige la octava exacta de la posición' : 'Cualquier octava de la nota valida (recomendado)'}</span>
      </div>
    </div>
  </div>

  {#if engineOn && onRestartMic}
    <div class="row" style="margin-top: 14px">
      <button on:click={onRestartMic}>↻ Reiniciar micrófono con nueva configuración</button>
    </div>
  {/if}
</div>

<style>
  .hint { font-size: 10.5px; color: var(--fg-3); }
  .val { color: var(--accent); font-family: var(--mono); }
</style>
