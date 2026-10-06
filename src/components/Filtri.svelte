<script>
  // Filtri del diario: tipo, tag (si combinano), intervallo di date, testo.
  import CampoData from './CampoData.svelte';
  import { conteggioTag } from '../lib/dati.svelte.js';
  import { oggi, piu } from '../lib/date.js';
  import Icona from './Icona.svelte';

  let { voci = [], filtro = $bindable(), tipi = ['gruppo', 'individuale', 'genitori', 'conoscenza', 'nota'] } = $props();
  const NOMI = { gruppo: 'Gruppo', individuale: 'Individuale', genitori: 'Genitori', conoscenza: 'Conoscenza', nota: 'Note' };
  const tags = $derived(conteggioTag(voci));
  let tuttiTag = $state(false);
  const visibili = $derived(tuttiTag ? tags : tags.slice(0, 10));
  const PERIODI = [['mese', 'Ultimo mese', 31], ['tre', 'Tre mesi', 92], ['anno', 'Un anno', 365]];

  const alterna = (lista, x) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);
  function periodo(giorni) { filtro.da = piu(oggi(), -giorni); filtro.a = ''; }
  let espanso = $state(false);
  const quanti = $derived(filtro.tipi.length + filtro.tag.length + (filtro.da || filtro.a ? 1 : 0));
  const attivo = $derived(filtro.tipi.length || filtro.tag.length || filtro.da || filtro.a || filtro.testo);
</script>

<div class="filtri" class:espanso role="search">
  <div class="cima">
    <label class="testo">
      <Icona nome="cerca" />
      <span class="vis-nascosto">Cerca nel testo</span>
      <input class="input" type="search" placeholder="Cerca nelle note" bind:value={filtro.testo} />
    </label>
    <button type="button" class="apri-filtri" aria-expanded={espanso} onclick={() => (espanso = !espanso)}><Icona nome="filtro" /> Filtri{quanti ? ` · ${quanti}` : ''}</button>
  </div>

  <div class="riga" role="group" aria-label="Tipo">
    {#each tipi as t (t)}
      <button type="button" class="scelta" aria-pressed={filtro.tipi.includes(t)} onclick={() => (filtro.tipi = alterna(filtro.tipi, t))}>{NOMI[t]}</button>
    {/each}
  </div>

  <div class="riga date" role="group" aria-label="Periodo">
    {#each PERIODI as [id, nome, g] (id)}
      <button type="button" class="scelta" aria-pressed={filtro.da === piu(oggi(), -g) && !filtro.a} onclick={() => periodo(g)}>{nome}</button>
    {/each}
    <label class="data"><span class="eti">dal</span><CampoData bind:value={filtro.da} etichetta="Dal giorno" /></label>
    <label class="data"><span class="eti">al</span><CampoData bind:value={filtro.a} etichetta="Al giorno" /></label>
  </div>

  {#if tags.length}
    <div class="riga tags" role="group" aria-label="Tag">
      {#each visibili as [t, n] (t)}
        <button type="button" class="tag" aria-pressed={filtro.tag.includes(t)} onclick={() => (filtro.tag = alterna(filtro.tag, t))}>{t}<small>{n}</small></button>
      {/each}
      {#if tags.length > 10}<button type="button" class="altri" onclick={() => (tuttiTag = !tuttiTag)}>{tuttiTag ? 'meno' : `altri ${tags.length - 10}`}</button>{/if}
    </div>
  {/if}

  {#if attivo}
    <button type="button" class="azzera" onclick={() => (filtro = { tipi: [], tag: [], da: '', a: '', testo: '' })}><Icona nome="chiudi" /> Togli i filtri</button>
  {/if}
</div>

<style>
  .filtri { display: grid; gap: var(--s-3); }
  .cima { display: flex; gap: var(--s-3); align-items: center; }
  .cima .testo { flex: 1; }
  .apri-filtri { display: none; align-items: center; gap: 6px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; min-height: 36px; padding: 4px 10px; font-weight: 600; font-size: var(--t-sm); cursor: pointer; }
  .apri-filtri[aria-expanded='true'] { background: var(--inchiostro); color: var(--su-inchiostro); }
  @media (max-width: 720px) {
    .apri-filtri { display: inline-flex; }
    .filtri:not(.espanso) .riga { display: none; }
  }
  .testo { display: flex; align-items: center; gap: var(--s-2); color: var(--inchiostro-2); }
  .testo .input { font-size: var(--t-ui); }
  .riga { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .scelta {
    min-height: 30px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px;
    background: transparent; font-size: var(--t-sm); font-weight: 600; cursor: pointer;
  }
  .scelta:hover { background: var(--carta-3); }
  .scelta[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .data { display: flex; align-items: baseline; gap: 6px; }
  .data .input { width: auto; min-height: 30px; padding: 2px; font-size: var(--t-sm); }
  .tags small { margin-left: 4px; font-weight: 500; opacity: 0.7; }
  .altri, .azzera { border: 0; background: none; color: var(--spot-testo); font-weight: 600; font-size: var(--t-sm); cursor: pointer; padding: 2px 4px; display: inline-flex; gap: 4px; align-items: center; justify-self: start; }
  .azzera :global(.ico) { width: 14px; height: 14px; }
</style>
