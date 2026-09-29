<script>
  // Diario filtrabile, diviso per mesi, con esportazione in Word e stampa/PDF.
  import { filtra } from '../lib/dati.svelte.js';
  import { nomeMese, anno, oggi, lunga } from '../lib/date.js';
  import { word, stampa } from '../lib/esporta.js';
  import Filtri from './Filtri.svelte';
  import Voce from './Voce.svelte';
  import Icona from './Icona.svelte';

  let {
    voci, titolo, nomeFile, tipi = undefined, mostraSoggetto = false,
    filtro = $bindable({ tipi: [], tag: [], da: '', a: '', testo: '' }),
  } = $props();

  const scelte = $derived(filtra(voci, filtro));
  const mesi = $derived.by(() => {
    const out = [];
    for (const v of scelte) {
      const k = v.data.slice(0, 7);
      if (!out.length || out.at(-1).k !== k) out.push({ k, nome: `${nomeMese(v.data)} ${anno(v.data)}`, voci: [] });
      out.at(-1).voci.push(v);
    }
    return out;
  });
  const descrizione = $derived.by(() => {
    const p = [];
    if (filtro.tipi.length) p.push(filtro.tipi.join(', '));
    if (filtro.tag.length) p.push(filtro.tag.map((t) => '#' + t).join(' '));
    if (filtro.da || filtro.a) p.push(`${filtro.da ? 'dal ' + lunga(filtro.da, true) : ''} ${filtro.a ? 'al ' + lunga(filtro.a, true) : ''}`.trim());
    if (filtro.testo) p.push(`«${filtro.testo}»`);
    return p.length ? p.join(' · ') : 'Tutte le voci';
  });
  let esporto = $state(false);
  async function aWord() {
    esporto = true;
    try { await word(titolo, `${descrizione} · esportato il ${lunga(oggi(), true)}`, scelte, nomeFile); }
    finally { esporto = false; }
  }
  const alTag = (t) => { if (!filtro.tag.includes(t)) filtro.tag = [...filtro.tag, t]; };
</script>

<div class="diario">
  <div class="filtri-box no-stampa">
    <Filtri {voci} bind:filtro {tipi} />
  </div>
  <div class="barra-esporta">
    <p class="sotto piccolo" aria-live="polite">{scelte.length} {scelte.length === 1 ? 'voce' : 'voci'} · {descrizione}</p>
    <div class="no-stampa esporta">
      <button class="btn nudo piccolo" onclick={stampa} title="Stampa, o salva in PDF dalla finestra di stampa"><Icona nome="stampa" /> Stampa o PDF</button>
      <button class="btn nudo piccolo" onclick={aWord} disabled={esporto || !scelte.length}><Icona nome="esporta" /> {esporto ? 'Preparo…' : 'Word'}</button>
    </div>
  </div>
  <h2 class="solo-stampa display">{titolo}</h2>
  {#each mesi as m (m.k)}
    <section class="mese">
      <h3 class="nome-mese"><span class="display">{m.nome}</span><span class="eti">{m.voci.length}</span></h3>
      {#each m.voci as v (v.chiave)}<Voce {v} {alTag} {mostraSoggetto} />{/each}
    </section>
  {:else}
    <p class="vuoto sotto">Nessuna voce con questi filtri.</p>
  {/each}
</div>

<style>
  .diario { display: grid; gap: var(--s-4); }
  .filtri-box { padding: var(--s-4); background: var(--carta-2); border: 1px solid var(--matita); }
  .barra-esporta { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--s-2); }
  .esporta { display: flex; gap: 2px; }
  .nome-mese { display: flex; align-items: baseline; gap: var(--s-3); padding-top: var(--s-4); position: sticky; top: var(--barra); background: var(--carta); z-index: 2; padding-bottom: 6px; }
  .nome-mese .display { font-size: var(--t-lg); text-transform: lowercase; }
  .vuoto { padding: var(--s-6) 0; font-style: italic; }
  .solo-stampa { display: none; }
  @media (max-width: 720px) { .nome-mese { top: 52px; } .filtri-box { padding: var(--s-3); } }
  @media print {
    .solo-stampa { display: block; font-size: 26pt; margin-bottom: 8pt; }
    .nome-mese { position: static; background: none; }
    .barra-esporta { display: block; }
  }
</style>
