<script>
  // Gli appuntamenti ricorrenti di un gruppo, di un ragazzo o di tutta l'aula.
  import { dati, serieDi, gruppo, ragazzo, nomeCompleto, puoGestire, sedutePeriodo, condiviso, TIPI } from '../lib/dati.svelte.js';
  import { oggi, piu, lunga, relativa } from '../lib/date.js';
  import { descrivi, fine as testoFine } from '../lib/serie.js';
  import SerieDialogo from './SerieDialogo.svelte';
  import Icona from './Icona.svelte';

  let { gruppoId = null, ragazzoId = null, mostraFinite = false, conTitolo = false } = $props();
  const O = oggi();
  let aperta = $state(null);      // { se } oppure { nuova }
  let finite = $state(false);
  const tutte = $derived(serieDi({ gruppoId, ragazzoId }).filter((se) => se.tipo === 'gruppo' || condiviso(se.ragazzoId)));
  const inCorso = $derived(tutte.filter((se) => !se.al || se.al >= O));
  const passate = $derived(tutte.filter((se) => se.al && se.al < O));
  const prossima = (se) => sedutePeriodo(O, piu(O, 120)).find((s) => s.serieId === se.id || (s.virtuale && s.id.startsWith('v:' + se.id + ':')));
  const chi = (se) => (se.tipo === 'gruppo' ? gruppo(se.gruppoId)?.nome : `${TIPI[se.tipo].breve} · ${nomeCompleto(ragazzo(se.ragazzoId))}`);
</script>

<div class="serie">
  {#if conTitolo}<h3 class="eti">Appuntamenti ricorrenti</h3>{/if}
  <ul>
    {#each inCorso as se (se.id)}
      {@const p = prossima(se)}
      <li>
        <button type="button" class="riga" disabled={!puoGestire()} onclick={() => (aperta = { se })}>
          <span class="mano giro" aria-hidden="true">↻</span>
          <span class="corpo">
            {#if !gruppoId && !ragazzoId}<b>{chi(se)}</b>{:else if !gruppoId}<b>{TIPI[se.tipo].breve}</b>{/if}
            <span>{descrivi(se)}</span>
            <small class="sotto">dal {lunga(se.dal)}{testoFine(se, lunga) ? ' · ' + testoFine(se, lunga) : ''}{p ? ' · prossima ' + relativa(p.data) : ''}</small>
          </span>
          {#if puoGestire()}<Icona nome="matita" />{/if}
        </button>
      </li>
    {:else}
      <li class="vuoto sotto">Nessun appuntamento ricorrente.</li>
    {/each}
  </ul>
  {#if passate.length}
    <button type="button" class="storia" aria-expanded={finite} onclick={() => (finite = !finite)}>{finite ? 'Nascondi' : 'Mostra'} quelli finiti ({passate.length})</button>
    {#if finite}<ul class="finite">{#each passate as se (se.id)}<li><button type="button" class="riga" disabled={!puoGestire()} onclick={() => (aperta = { se })}><span class="corpo"><span>{descrivi(se)}</span><small class="sotto">dal {lunga(se.dal)} al {lunga(se.al)}</small></span></button></li>{/each}</ul>{/if}
  {/if}
  {#if puoGestire()}
    <button type="button" class="btn piccolo" onclick={() => (aperta = { nuova: { gruppoId, ragazzoId, tipo: gruppoId ? 'gruppo' : 'individuale' } })}><Icona nome="piu" /> Nuovo appuntamento ricorrente</button>
  {/if}
</div>
{#if aperta}<SerieDialogo se={aperta.se || null} nuova={aperta.nuova || {}} chiudi={() => (aperta = null)} />{/if}

<style>
  .serie { display: grid; gap: var(--s-2); justify-items: start; width: 100%; }
  ul { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; gap: 6px; }
  .riga { display: flex; align-items: center; gap: var(--s-3); width: 100%; text-align: left; padding: 10px 14px; border: 1px solid var(--matita); border-radius: var(--r-grande); background: var(--carta-2); cursor: pointer; font: inherit; color: inherit; }
  .riga:disabled { cursor: default; }
  .riga:not(:disabled):hover { border-color: var(--inchiostro-2); }
  .giro { font-size: 22px; line-height: 1; }
  .corpo { flex: 1; display: grid; gap: 1px; min-width: 0; }
  .corpo small { font-size: var(--t-xs); }
  .vuoto { font-style: italic; }
  .finite .riga { opacity: 0.7; }
  .storia { border: 0; background: none; padding: 0; color: var(--inchiostro-2); font-size: var(--t-sm); font-weight: 600; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
</style>
