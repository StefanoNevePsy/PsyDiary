<script>
  // Le etichette di un paziente: pastiglie colorate; chi gestisce le aggiunge
  // (scrivendo o scegliendo tra quelle già in uso) e le toglie.
  import { aggiungi, inUso, tinta, MAX } from '../lib/etichette.js';
  import { dati } from '../lib/dati.svelte.js';
  import Suggerimenti from './Suggerimenti.svelte';

  let { valori = [], modificabile = false, alCambio = null, piccole = false, filtro = null } = $props();
  let aggiunta = $state(false);
  const proposte = $derived(inUso(dati.ragazzi).filter((t) => !(valori || []).includes(t)).map((valore) => ({ valore })));
  function metti(t) { alCambio?.(aggiungi(valori, t)); }
  function togli(t) { alCambio?.((valori || []).filter((x) => x !== t)); }
</script>

<span class="etichette" class:piccole>
  {#each valori || [] as t (t)}
    <span class="et" style:--h={tinta(t)}>
      {#if filtro}<button type="button" class="nudo" onclick={() => filtro(t)} title={'Mostra solo «' + t + '»'}>{t}</button>{:else}{t}{/if}
      {#if modificabile}<button type="button" class="via" onclick={() => togli(t)} aria-label={'Togli l\'etichetta ' + t}>×</button>{/if}
    </span>
  {/each}
  {#if modificabile && (valori || []).length < MAX}
    {#if aggiunta}
      <span class="nuova"><Suggerimenti suggerimenti={proposte} svuota etichetta="Nuova etichetta" placeholder="etichetta…" onscegli={metti} /></span>
      <button type="button" class="fatto" onclick={() => (aggiunta = false)}>fatto</button>
    {:else}
      <button type="button" class="aggiungi" onclick={() => { aggiunta = true; queueMicrotask(() => document.querySelector('.etichette .nuova input')?.focus()); }}>+ etichetta</button>
    {/if}
  {/if}
</span>

<style>
  .etichette { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 5px; vertical-align: middle; }
  .et {
    display: inline-flex; align-items: center; gap: 2px; padding: 1px 9px; border-radius: 999px;
    font-size: 12.5px; font-weight: 600; line-height: 1.6; white-space: nowrap;
    background: color-mix(in oklch, oklch(0.72 0.11 var(--h)) 24%, var(--carta));
    color: color-mix(in oklch, oklch(0.5 0.13 var(--h)) 75%, var(--inchiostro));
    border: 1px solid color-mix(in oklch, oklch(0.6 0.12 var(--h)) 35%, transparent);
  }
  .piccole .et { font-size: 11px; padding: 0 7px; }
  .et .nudo { all: unset; cursor: pointer; }
  .et .nudo:hover { text-decoration: underline; }
  .via { all: unset; cursor: pointer; padding: 0 0 0 3px; font-size: 14px; line-height: 1; opacity: 0.7; }
  .via:hover { opacity: 1; }
  .aggiungi, .fatto { all: unset; cursor: pointer; font-size: 12.5px; color: var(--inchiostro-2); padding: 1px 8px; border: 1px dashed var(--matita-forte); border-radius: 999px; }
  .fatto { border-style: solid; }
  .aggiungi:hover, .fatto:hover { color: var(--inchiostro); border-color: var(--inchiostro-2); }
  .aggiungi:focus-visible, .fatto:focus-visible, .via:focus-visible, .et .nudo:focus-visible { outline: 2px solid var(--spot); outline-offset: 2px; }
  .nuova { display: inline-block; width: 150px; }
  .nuova :global(.input) { min-height: 28px; padding: 2px; font-size: 13px; }
</style>
