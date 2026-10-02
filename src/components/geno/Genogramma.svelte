<script>
  // Un genogramma di GenoGram Creator ridisegnato nel tema di PsyDiary.
  // anteprima: solo il disegno, adattato al riquadro. Altrimenti si sposta
  // trascinando, si ingrandisce con rotella o due dita, e toccando una
  // persona se ne vedono età, segni e note.
  import { disegna, campione, scheda as schedaDi, SESSI } from '../../lib/genogramma.js';
  import Primitiva from './Primitiva.svelte';

  let { data, titolo = '', anteprima = false } = $props();
  const d = $derived(disegna(data || { nodes: [], edges: [] }));

  let vista = $state(null);              // viewBox corrente (zoom e spostamento)
  $effect(() => { vista = { ...d.vista }; });
  const vb = $derived(vista ? `${vista.x} ${vista.y} ${vista.w} ${vista.h}` : `${d.vista.x} ${d.vista.y} ${d.vista.w} ${d.vista.h}`);
  let svg = $state();
  let scelta = $state(null);
  let legenda = $state(false);

  // --- spostamento e zoom ---
  const punti = new Map();
  let inizio = null, mosso = false;
  function aUnita(e) {
    const r = svg.getBoundingClientRect();
    const k = Math.max(vista.w / r.width, vista.h / r.height);
    return { k, r };
  }
  function zoom(f, cx, cy) {
    const { k, r } = aUnita();
    const ox = vista.x + (cx - r.left) * k - (r.width * k - vista.w) / 2, oy = vista.y + (cy - r.top) * k - (r.height * k - vista.h) / 2;
    const w = Math.min(d.vista.w * 4, Math.max(d.vista.w / 8, vista.w * f)), fx = w / vista.w;
    vista = { x: ox - (ox - vista.x) * fx, y: oy - (oy - vista.y) * fx, w, h: vista.h * fx };
  }
  function ruota(e) { if (anteprima) return; e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }
  function giu(e) {
    if (anteprima) return;
    punti.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    mosso = false;
    inizio = { vista: { ...vista }, punti: new Map(punti), bersaglio: e.target.closest?.('.g-persona')?.dataset.id || null };
  }
  function muovi(e) {
    if (!punti.has(e.pointerId) || !inizio) return;
    punti.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { k } = aUnita();
    if (punti.size === 1) {
      const p0 = inizio.punti.get(e.pointerId);
      if (!p0) return;
      const dx = e.clientX - p0.x, dy = e.clientY - p0.y;
      if (Math.hypot(dx, dy) > 4) mosso = true;
      vista = { ...vista, x: inizio.vista.x - dx * k * (vista.w / inizio.vista.w), y: inizio.vista.y - dy * k * (vista.w / inizio.vista.w) };
    } else if (punti.size === 2) {
      mosso = true;
      const [a, b] = [...punti.values()], [a0, b0] = [...inizio.punti.values()];
      if (!a0 || !b0) return;
      const f = Math.hypot(a0.x - b0.x, a0.y - b0.y) / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const w = Math.min(d.vista.w * 4, Math.max(d.vista.w / 8, inizio.vista.w * f));
      vista = { ...inizio.vista, w, h: inizio.vista.h * (w / inizio.vista.w), x: inizio.vista.x + (inizio.vista.w - w) / 2, y: inizio.vista.y + (inizio.vista.h - inizio.vista.h * (w / inizio.vista.w)) / 2 };
    }
  }
  function su(e) {
    punti.delete(e.pointerId);
    if (!mosso && inizio && punti.size === 0) {
      const n = inizio.bersaglio && d.persone.find((x) => x.id === inizio.bersaglio);
      scelta = n ? schedaDi(n) : null;
    }
    if (punti.size === 0) inizio = null; else inizio = { vista: { ...vista }, punti: new Map(punti), bersaglio: null };
  }
  const adatta = () => { vista = { ...d.vista }; };
</script>

<figure class="geno" class:anteprima>
  <svg
    bind:this={svg} viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img"
    aria-label={'Genogramma' + (titolo ? ': ' + titolo : '')}
    onwheel={ruota} onpointerdown={giu} onpointermove={muovi} onpointerup={su} onpointercancel={su}
  >
    <g class="liv-nuclei">{#each d.livelli.nuclei as p, i (i)}<Primitiva {p} />{/each}</g>
    <g class="liv-legami">{#each d.livelli.legami as p, i (i)}<Primitiva {p} />{/each}</g>
    <g class="liv-persone">{#each d.livelli.persone as p, i (i)}<Primitiva {p} />{/each}</g>
    <g class="liv-note">{#each d.livelli.note as p, i (i)}<Primitiva {p} />{/each}</g>
  </svg>

  {#if !anteprima}
    <div class="comandi no-stampa">
      <button type="button" class="btn nudo piccolo" onclick={() => zoom(0.8, svg.getBoundingClientRect().left + svg.clientWidth / 2, svg.getBoundingClientRect().top + svg.clientHeight / 2)} aria-label="Ingrandisci">+</button>
      <button type="button" class="btn nudo piccolo" onclick={() => zoom(1.25, svg.getBoundingClientRect().left + svg.clientWidth / 2, svg.getBoundingClientRect().top + svg.clientHeight / 2)} aria-label="Rimpicciolisci">−</button>
      <button type="button" class="btn nudo piccolo" onclick={adatta}>Adatta</button>
      {#if d.usati.length}<button type="button" class="btn nudo piccolo" aria-pressed={legenda} onclick={() => (legenda = !legenda)}>Legenda</button>{/if}
    </div>
    {#if legenda}
      <aside class="legenda" aria-label="Legenda dei legami">
        <ul>
          {#each d.usati as u (u.tipo)}
            <li><svg viewBox="0 0 74 24" aria-hidden="true">{#each campione(u.tipo, u.cfg) as p, i (i)}<Primitiva {p} />{/each}</svg><span>{u.cfg[0]}</span></li>
          {/each}
        </ul>
      </aside>
    {/if}
    {#if scelta}
      <aside class="persona" aria-live="polite">
        <header><b class="display">{scelta.nome}</b><button type="button" class="btn nudo piccolo" onclick={() => (scelta = null)} aria-label="Chiudi">×</button></header>
        <p class="sotto piccolo">{[scelta.sesso, scelta.eta ? scelta.eta + ' anni' : '', scelta.nascita && !/^\d{1,3}$/.test(scelta.nascita) ? 'nato/a ' + scelta.nascita : ''].filter(Boolean).join(' · ')}</p>
        {#if scelta.etichetta}<p>{scelta.etichetta}</p>{/if}
        {#if scelta.segni.length}<p class="segni">{#each scelta.segni as s (s)}<span class="tag">{s}</span>{/each}</p>{/if}
        {#each scelta.note as n (n.id || n.text)}<p class="nota"><span class="eti">{n.date || ''}</span> {n.text}</p>{/each}
      </aside>
    {/if}
  {/if}
</figure>

<style>
  .geno {
    --g-nero: var(--inchiostro); --g-carta: var(--carta); --g-grigio: var(--inchiostro-3);
    position: relative; margin: 0; width: 100%; height: 100%; min-height: 0;
    background: var(--carta); color: var(--inchiostro); border-radius: inherit; overflow: hidden;
  }
  svg { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; user-select: none; }
  svg:active { cursor: grabbing; }
  .anteprima svg { cursor: inherit; pointer-events: none; }
  :global(.geno .g-nome) { font-family: var(--f-testo); font-size: 11.5px; font-weight: 650; fill: var(--inchiostro); paint-order: stroke; stroke: var(--carta); stroke-width: 4px; stroke-linejoin: round; }
  :global(.geno .g-sotto) { font-family: var(--f-testo); font-size: 9.5px; fill: var(--inchiostro-2); paint-order: stroke; stroke: var(--carta); stroke-width: 3px; }
  :global(.geno .g-eta) { font-family: var(--f-display); font-size: 14px; fill: var(--inchiostro); }
  :global(.geno .g-nucleo) { font-family: var(--f-mano); font-size: 20px; paint-order: stroke; stroke: var(--carta); stroke-width: 5px; }
  :global(.geno .g-etichetta-legame) { font-family: var(--f-testo); font-size: 9.5px; font-style: italic; paint-order: stroke; stroke: var(--carta); stroke-width: 3px; }
  :global(.geno .g-segno) { opacity: 0.85; }
  :global(.geno .g-persona) { cursor: pointer; }
  :global(.geno .g-foglietto) { fill: var(--carta-2); stroke: var(--matita-forte); stroke-width: 1; }
  :global(.geno .g-nota-testo) { padding: 8px 10px; font-family: var(--f-mano); font-size: 17px; line-height: 1.25; color: var(--inchiostro); white-space: pre-wrap; overflow: hidden; height: 100%; box-sizing: border-box; }
  .comandi { position: absolute; top: var(--s-2); right: var(--s-2); display: flex; gap: 2px; padding: 2px; background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r); }
  .legenda, .persona { position: absolute; left: var(--s-2); bottom: var(--s-2); max-width: min(320px, calc(100% - 16px)); max-height: 60%; overflow: auto; padding: var(--s-2) var(--s-3); background: var(--carta-2); border: 1px solid var(--matita-forte); border-radius: var(--r); box-shadow: var(--ombra); font-size: var(--t-sm); }
  .persona { left: auto; right: var(--s-2); }
  .legenda ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .legenda li { display: flex; align-items: center; gap: var(--s-2); }
  .legenda svg { width: 74px; height: 24px; flex: none; pointer-events: none; }
  .persona header { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); }
  .persona .display { font-size: var(--t-md); }
  .persona p { margin: 4px 0; }
  .segni { display: flex; flex-wrap: wrap; gap: 4px; }
  .nota { border-top: 1px dashed var(--matita); padding-top: 4px; white-space: pre-wrap; }
  @media print { .geno { background: none; } }
</style>
