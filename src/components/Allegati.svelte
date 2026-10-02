<script>
  // Allegati dell'anagrafica: genogrammi, relazioni, documenti. Cifrati e
  // sincronizzati come le foto; li vede solo chi vede l'anagrafica.
  import { salvaAllegato, urlAllegato, urlImmagine, togliImmagine } from '../lib/immagini.js';
  import { breveAnno } from '../lib/date.js';
  import Icona from './Icona.svelte';

  let { elenco = [], gestisce = false, alCambio } = $props();
  let scelta = $state(), lavoro = $state(false), errore = $state('');
  let vista = $state(null);          // { url, nome } dell'immagine aperta
  let dialogo = $state();

  const eImmagine = (a) => /^image\//.test(a.tipo || '');
  const peso = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const estensione = (a) => (String(a.nome).split('.').pop() || '').slice(0, 4).toUpperCase();

  async function aggiungi(e) {
    const file = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!file.length) return;
    lavoro = true; errore = '';
    const nuovi = [];
    for (const f of file) {
      try { nuovi.push(await salvaAllegato(f)); } catch (x) { errore = x.message; }
    }
    lavoro = false;
    if (nuovi.length) alCambio([...(elenco || []), ...nuovi]);
  }
  async function apri(a) {
    const url = await urlAllegato(a.id, a.tipo);
    if (!url) { errore = `«${a.nome}» non è ancora su questo dispositivo: riprova quando c'è rete.`; return; }
    if (eImmagine(a)) { vista = { url, nome: a.nome }; queueMicrotask(() => dialogo?.showModal()); return; }
    // PDF e documenti: nel visualizzatore del sistema, o scaricati se non si possono mostrare
    const w = /pdf|text\//.test(a.tipo) ? window.open(url, '_blank') : null;
    if (!w) scarica(a, url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function scarica(a, url0) {
    const url = url0 || (await urlAllegato(a.id, a.tipo));
    if (!url) return;
    const l = document.createElement('a');
    l.href = url; l.download = a.nome || 'allegato'; document.body.appendChild(l); l.click(); l.remove();
  }
  function rinomina(a) {
    const n = prompt('Nome dell\'allegato', a.nome);
    if (!n || !n.trim() || n.trim() === a.nome) return;
    alCambio(elenco.map((x) => (x.id === a.id ? { ...x, nome: n.trim() } : x)));
  }
  function togli(a) {
    if (!confirm(`Togliere «${a.nome}» dall'anagrafica?`)) return;
    alCambio(elenco.filter((x) => x.id !== a.id));
    togliImmagine(a.id);
  }
  function chiudiVista() { dialogo?.close(); if (vista) URL.revokeObjectURL(vista.url); vista = null; }
</script>

<section class="allegati">
  <h3 class="eti titolo-sez"><Icona nome="graffetta" /> Allegati e genogrammi</h3>
  {#if elenco?.length}
    <ul class="carte">
      {#each elenco as a (a.id)}
        <li class="carta">
          <button type="button" class="anteprima" onclick={() => apri(a)} aria-label={'Apri ' + a.nome}>
            {#if eImmagine(a)}
              {#await urlImmagine(a.id, true) then u}
                {#if u}<img src={u} alt="" loading="lazy" />{:else}<span class="segno"><Icona nome="graffetta" /></span>{/if}
              {/await}
            {:else}
              <span class="segno"><Icona nome="documento" /><b>{estensione(a)}</b></span>
            {/if}
          </button>
          <div class="info">
            <button type="button" class="nome" onclick={() => apri(a)} title={a.nome}>{a.nome}</button>
            <span class="sotto piccolo">{a.peso ? peso(a.peso) : ''}{a.aggiunto ? ' · ' + breveAnno(a.aggiunto) : ''}</span>
          </div>
          <div class="azioni no-stampa">
            <button type="button" class="btn nudo piccolo" onclick={() => scarica(a)} aria-label={'Scarica ' + a.nome} title="Scarica"><Icona nome="esporta" /></button>
            {#if gestisce}
              <button type="button" class="btn nudo piccolo" onclick={() => rinomina(a)} aria-label={'Rinomina ' + a.nome} title="Rinomina"><Icona nome="matita" /></button>
              <button type="button" class="btn nudo piccolo" onclick={() => togli(a)} aria-label={'Togli ' + a.nome} title="Togli"><Icona nome="cestino" /></button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="sotto piccolo">Genogrammi, relazioni, certificazioni: immagini (anche SVG), PDF e documenti fino a 5 MB.</p>
  {/if}
  {#if errore}<p class="avviso">{errore}</p>{/if}
  {#if gestisce}
    <label class="btn nudo piccolo aggiungi no-stampa" class:lavoro>
      <Icona nome="piu" /> {lavoro ? 'Preparo…' : 'Allega un file'}
      <input bind:this={scelta} type="file" multiple accept="image/*,.svg,application/pdf,.pdf,.doc,.docx,.odt,.txt" onchange={aggiungi} disabled={lavoro} />
    </label>
  {/if}
</section>

{#if vista}
  <dialog bind:this={dialogo} class="vista" onclose={chiudiVista} aria-label={vista.nome}>
    <header><span class="display">{vista.nome}</span><button type="button" class="btn nudo" onclick={chiudiVista} aria-label="Chiudi"><Icona nome="chiudi" /></button></header>
    <div class="tela"><img src={vista.url} alt={vista.nome} /></div>
  </dialog>
{/if}

<style>
  .allegati { display: grid; gap: var(--s-3); }
  .titolo-sez { display: flex; align-items: center; gap: 6px; }
  .carte { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s-3); }
  .carta { display: grid; grid-template-rows: auto auto auto; background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r); overflow: hidden; }
  .anteprima { display: grid; place-items: center; height: 120px; padding: 0; border: 0; border-bottom: 1px dashed var(--matita); background: var(--carta-3); cursor: zoom-in; }
  .anteprima img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .segno { display: grid; justify-items: center; gap: 2px; color: var(--inchiostro-2); }
  .segno :global(.ico) { width: 34px; height: 34px; }
  .segno b { font-size: var(--t-xs); letter-spacing: 0.1em; }
  .info { display: grid; padding: var(--s-2) var(--s-3) 0; min-width: 0; }
  .nome { all: unset; cursor: pointer; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nome:focus-visible { outline: 2px solid var(--spot); outline-offset: 2px; }
  .azioni { display: flex; justify-content: flex-end; padding: 0 var(--s-1) var(--s-1); }
  .aggiungi { position: relative; width: max-content; cursor: pointer; }
  .aggiungi input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .aggiungi.lavoro { opacity: 0.6; }
  .avviso { color: var(--spot-testo); font-size: var(--t-sm); }
  .vista { width: min(96vw, 1200px); max-height: 94vh; padding: 0; border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .vista::backdrop { background: oklch(0.2 0.02 265 / 0.6); }
  .vista header { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-2) var(--s-3) var(--s-2) var(--s-4); border-bottom: 1px solid var(--matita); }
  .vista .tela { overflow: auto; max-height: calc(94vh - 60px); background: #fff; }
  .vista .tela img { display: block; max-width: 100%; margin: 0 auto; }
</style>
