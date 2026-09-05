<script>
  // ============================================================
  // BassCoach · Vista TRANSCRIPTION
  // Sube mp3/wav/ogg → Basic Pitch (IA) o fallback DSP →
  // secuencia [{midi, startTime, duration}] → práctica en QUIZ
  // o exportación MIDI/JSON. Muestra progreso y motor usado.
  // ============================================================
  import { midiToName } from '../lib/theory.js';
  import {
    transcribeAudioFile, transcribeMonophonic, decodeAudioFile,
    bufferToMonoFloat32, lowpassIIR, BP_SAMPLE_RATE,
  } from '../lib/transcription/transcribe.js';
  import { downloadMidi, downloadJson } from '../lib/transcription/midiFile.js';

  export let onSendToQuiz = null;

  let file = null;
  let status = 'idle'; // idle | decoding | transcribing | done | error
  let progress = 0;
  let engineUsed = '';
  let notes = [];
  let errorMsg = '';
  let fileName = '';
  let duration = 0;
  let dragging = false;
  let inputEl;
  let previewUrl = null;
  let autoPractice = true;

  async function handleFiles(files) {
    const f = files && files[0];
    if (!f) return;
    if (!/audio|mp3|wav|ogg|flac|m4a|aiff/i.test(f.type + f.name)) {
      errorMsg = 'Formato no soportado. Usa mp3, wav, ogg, m4a o flac.';
      status = 'error';
      return;
    }
    file = f;
    fileName = f.name;
    errorMsg = '';
    status = 'decoding';
    progress = 5;
    try {
      const buf = await f.arrayBuffer();
      previewUrl = URL.createObjectURL(f);
      duration = 0;
      const audioBuffer = await decodeAudioFile(buf);
      duration = audioBuffer.duration;
      status = 'transcribing';
      progress = 12;
      const result = await transcribeAudioFile(buf, {
        decodedBuffer: audioBuffer,
        onProgress: (p) => {
          // 12–95% corresponde a la inferencia
          progress = 12 + Math.round(p * 0.83);
        },
        onEngine: (e) => { engineUsed = e; },
      });
      notes = result.notes;
      engineUsed = result.engine;
      progress = 100;
      status = 'done';
    } catch (err) {
      console.error(err);
      errorMsg = err && err.message ? err.message : 'Error al transcribir';
      status = 'error';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dragging = false;
    handleFiles(e.dataTransfer.files);
  }
  function onDragOver(e) {
    e.preventDefault();
    dragging = true;
  }
  function onDragLeave() { dragging = false; }

  function sendToQuiz() {
    if (!notes.length || !onSendToQuiz) return;
    onSendToQuiz({
      name: fileName.replace(/\.[^.]+$/, '') || 'Transcripción',
      notes: notes.map((n) => ({ ...n })),
    });
  }

  function exportMidi() {
    if (!notes.length) return;
    downloadMidi(notes, (fileName.replace(/\.[^.]+$/, '') || 'basscoach') + '.mid');
  }
  function exportJson() {
    if (!notes.length) return;
    downloadJson(
      { source: fileName, engine: engineUsed, duration, notes },
      (fileName.replace(/\.[^.]+$/, '') || 'basscoach') + '.json'
    );
  }

  function nm(midi) { return midiToName(midi, { latin: true, withOctave: true }); }

  $: totalNotes = notes.length;
  $: density = duration > 0 ? (totalNotes / duration).toFixed(1) : '0';
</script>

<div class="panel">
  <h3>📝 Transcripción (Audio → Notas)</h3>
  <div class="sub">
    Sube una grabación de bajo (mp3/wav/ogg/m4a) · motor IA Basic Pitch (Spotify) con
    fallback DSP especializado en graves · exportable a MIDI/JSON
  </div>

  <div
    class="dropzone {dragging ? 'over' : ''}"
    role="button" tabindex="0"
    on:click={() => inputEl && inputEl.click()}
    on:keydown={(e) => e.key === 'Enter' && inputEl && inputEl.click()}
    on:drop={onDrop} on:dragover={onDragOver} on:dragleave={onDragLeave}
  >
    {#if status === 'idle'}
      <div class="dz-icon">🎵</div>
      <div><b>Arrastra tu audio de bajo aquí</b> o haz clic para elegir un archivo</div>
      <div class="sub">El archivo se procesa localmente en tu navegador — nada se sube a ningún servidor</div>
    {:else if status === 'decoding'}
      <div class="dz-icon spin">💿</div>
      <div>Decodificando <b>{fileName}</b>…</div>
    {:else if status === 'transcribing'}
      <div class="dz-icon spin">🧠</div>
      <div>Transcribiendo con {engineUsed === 'basic-pitch' ? 'Basic Pitch (IA)' : 'DSP YIN'}…</div>
      <div class="progressbar" style="margin-top: 10px; width: 70%">
        <div style="width: {progress}%"></div>
      </div>
      <div class="sub">{progress}%</div>
    {:else if status === 'error'}
      <div class="dz-icon">⚠️</div>
      <div class="err-txt">{errorMsg}</div>
      <button style="margin-top: 8px" on:click={() => { status = 'idle'; file = null; }}>Intentar de nuevo</button>
    {:else}
      <div class="dz-icon ok">✅</div>
      <div><b>{fileName}</b> · {duration.toFixed(1)} s · {totalNotes} notas · motor: <span class="mono">{engineUsed}</span></div>
      <div class="row" style="justify-content: center; margin-top: 10px">
        {#if previewUrl}
          <audio controls src={previewUrl} style="height: 30px"></audio>
        {/if}
        <button on:click={() => { status = 'idle'; file = null; notes = []; previewUrl = null; }}>↺ Otro archivo</button>
      </div>
    {/if}
    <input
      type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
      bind:this={inputEl}
      style="display: none"
      on:change={(e) => handleFiles(e.target.files)}
    />
  </div>

  {#if status === 'done' && notes.length}
    <div class="row" style="margin-top: 12px">
      <button class="primary" on:click={sendToQuiz}>🎮 Practicar en QUIZ</button>
      <button on:click={exportMidi}>⬇ MIDI</button>
      <button on:click={exportJson}>⬇ JSON</button>
      <div class="spacer"></div>
      <span class="sub">{density} notas/s</span>
    </div>

    <div class="notes-table">
      <div class="nt-head">
        <span>#</span><span>Nota</span><span>MIDI</span><span>Inicio (s)</span><span>Duración (s)</span>
      </div>
      <div class="nt-body">
        {#each notes.slice(0, 400) as n, i}
          <div class="nt-row">
            <span class="dim">{i + 1}</span>
            <span class="nm">{nm(n.midi)}</span>
            <span class="mono">{n.midi}</span>
            <span class="mono">{n.startTime.toFixed(2)}</span>
            <span class="mono">{n.duration.toFixed(2)}</span>
          </div>
        {/each}
        {#if notes.length > 400}
          <div class="nt-row dim">… {notes.length - 400} notas más (exporta el JSON para verlas todas)</div>
        {/if}
      </div>
    </div>
  {:else if status === 'done' && !notes.length}
    <div class="panel" style="margin-top: 12px; border-color: var(--warn)">
      No se detectaron notas de bajo en el archivo. Prueba con una grabación más limpia
      o revisa que el bajo esté bien presente en la mezcla.
    </div>
  {/if}
</div>

<style>
  .dz-icon { font-size: 30px; margin-bottom: 6px; }
  .dz-icon.spin { animation: dzspin 1.2s linear infinite; display: inline-block; }
  .dz-icon.ok { color: var(--ok); }
  @keyframes dzspin { to { transform: rotate(360deg); } }
  .err-txt { color: var(--err); }
  .spacer { flex: 1; }
  .mono { font-family: var(--mono); font-size: 12px; color: var(--fg-2); }
  .notes-table { margin-top: 12px; border: 1px solid var(--line); border-radius: var(--radius-s); overflow: hidden; }
  .nt-head, .nt-row {
    display: grid; grid-template-columns: 42px 90px 60px 1fr 1fr;
    gap: 8px; padding: 4px 10px; font-size: 12px; align-items: center;
  }
  .nt-head { background: var(--bg-3); color: var(--fg-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; }
  .nt-body { max-height: 260px; overflow-y: auto; }
  .nt-row:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
  .nt-row .nm { color: var(--scale-2); font-weight: 600; }
  .dim { color: var(--fg-3); }
</style>
