<script>
  // Argomenti in sospeso di un gruppo o di un ragazzo: idee da portare in una
  // seduta futura, senza doverle legare a una data.
  import { dati, salva, elimina, nuovoId, sessione, sedutePeriodo, soggetto, usaSospeso, eAdmin, io } from '../lib/dati.svelte.js';
  import { oggi, piu, relativa, lunga } from '../lib/date.js';
  import Icona from './Icona.svelte';

  let { tipo, id, titolo = true } = $props();
  let testo = $state('');
  const k = $derived(tipo === 'gruppo' ? 'g:' + id : 'individuale:' + id);
  const aperti = $derived(dati.sospesi.filter((x) => !x.usatoIn && (tipo === 'gruppo' ? x.gruppoId === id : x.ragazzoId === id)));
  const usati = $derived(dati.sospesi.filter((x) => x.usatoIn && (tipo === 'gruppo' ? x.gruppoId === id : x.ragazzoId === id)));
  const prossima = $derived(sedutePeriodo(oggi(), piu(oggi(), 60)).find((s) => soggetto(s) === k) || null);
  let mostraUsati = $state(false);

  async function aggiungi(e) {
    e.preventDefault();
    const t = testo.trim(); if (!t) return;
    await salva('sospesi', { id: nuovoId('q'), testo: t, autore: io().nome, ...(tipo === 'gruppo' ? { gruppoId: id } : { ragazzoId: id }) });
    testo = '';
  }
  const puoTogliere = (x) => eAdmin() || x.autore === io().nome;
  const doveUsato = (x) => dati.sedute.find((s) => s.id === x.usatoIn);
</script>

<div class="sospesi">
  {#if titolo}<h3 class="eti">In sospeso</h3>{/if}
  <ul>
    {#each aperti as x (x.id)}
      <li>
        <span class="testo">{x.testo}</span>
        <span class="chi sotto">{x.autore}</span>
        {#if prossima}<button class="usa" onclick={() => usaSospeso(x, prossima)} title={'Aggiungi al piano di ' + lunga(prossima.data)}>→ piano di {relativa(prossima.data)}</button>{/if}
        {#if puoTogliere(x)}<button class="btn nudo piccolo" onclick={() => elimina('sospesi', x.id)} aria-label={'Togli ' + x.testo}><Icona nome="chiudi" /></button>{/if}
      </li>
    {:else}
      <li class="vuoto sotto">Niente in sospeso. Le idee per le prossime sedute si appuntano qui.</li>
    {/each}
  </ul>
  <form onsubmit={aggiungi}>
    <label class="vis-nascosto" for={'sosp-' + id}>Nuova idea in sospeso</label>
    <input id={'sosp-' + id} class="input" placeholder="Un'idea da portare, prima o poi" bind:value={testo} />
    <button class="btn piccolo" disabled={!testo.trim()}><Icona nome="piu" /> Appunta</button>
  </form>
  {#if usati.length}
    <button class="storia" aria-expanded={mostraUsati} onclick={() => (mostraUsati = !mostraUsati)}>{mostraUsati ? 'Nascondi' : 'Già usati'} ({usati.length})</button>
    {#if mostraUsati}
      <ul class="usati">
        {#each usati as x (x.id)}{@const s = doveUsato(x)}<li><s>{x.testo}</s>{#if s}<a class="sotto piccolo" href={'#/seduta/' + s.id}>{lunga(s.data)}</a>{/if}</li>{/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .sospesi { display: grid; gap: var(--s-3); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--s-3); padding: 8px 0; border-bottom: 1px dashed var(--matita); }
  .testo { flex: 1 1 200px; }
  .testo::before { content: '— '; color: var(--inchiostro-3); }
  .usa { border: 0; background: none; padding: 2px 0; font-size: var(--t-sm); font-weight: 600; color: var(--spot-testo); cursor: pointer; }
  .usa:hover { text-decoration: underline; text-underline-offset: 3px; }
  li :global(.btn.nudo) { min-height: 28px; padding: 2px 6px; }
  .chi { font-size: var(--t-xs); font-style: italic; }
  .vuoto { font-style: italic; border: 0; }
  form { display: flex; gap: var(--s-2); align-items: center; }
  form .input { flex: 1; }
  .storia { justify-self: start; border: 0; background: none; padding: 0; color: var(--inchiostro-2); font-size: var(--t-sm); font-weight: 600; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
  .usati li { color: var(--inchiostro-2); }
</style>
