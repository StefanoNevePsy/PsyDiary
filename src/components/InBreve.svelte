<script>
  // In breve, nell'intestazione del paziente: diagnosi, familiari e genogramma
  // a colpo d'occhio, senza aprire l'anagrafica. Solo per chi la vede.
  import { testoAllegato } from '../lib/immagini.js';
  import { leggiGenogrammi } from '../lib/genogramma.js';
  import Genogramma from './geno/Genogramma.svelte';
  import Icona from './Icona.svelte';
  import { PROFILO } from '../lib/anagrafica.js';
  import { onMount } from 'svelte';

  let { r, apriAnagrafica } = $props();

  const CERT = { nessuna: 'nessuna certificazione', '104': 'L. 104 · PEI', dsa: 'DSA · PDP', bes: 'BES' };
  const familiari = $derived((r.genitori || []).filter((g) => g && (g.nome || g.relazione)));
  const geno = $derived((r.allegati || []).find((a) => a.genogramma) || null);
  // il genogramma si legge una volta per allegato
  let dati = $state(null);
  let caricato = null;
  $effect(() => {
    const id = geno?.id || null;
    if (id === caricato) return;
    caricato = id; dati = null;
    if (id) testoAllegato(id).then((t) => { if (caricato === id) dati = t ? leggiGenogrammi(t)[0] || null : null; }).catch(() => {});
  });
  const profilo = $derived(PROFILO.filter(([k]) => String(r[k] || '').trim()));
  const vuoto = $derived(!profilo.length && !r.diagnosi && !r.certificazioni && !r.servizi && !familiari.length && !r.noteFamiglia && !geno);
  let dialogo = $state(), grande = $state(false);
  function apri() { grande = true; queueMicrotask(() => dialogo?.showModal()); }
  const primaRiga = (t) => String(t || '').split('\n')[0];
  // aperto su PC, chiuso (si apre toccandolo) sul telefono
  let aperto = $state(true);
  onMount(() => { aperto = matchMedia('(min-width: 900px)').matches; });
</script>

<details class="in-breve" bind:open={aperto}>
  <summary class="eti">In breve</summary>
  {#if vuoto}
    <p class="sotto piccolo">Interessi, bisogni, diagnosi, familiari e genogramma compaiono qui quando li inserisci <button type="button" class="link" onclick={apriAnagrafica}>nell'anagrafica</button>.</p>
  {:else}
    {#if profilo.length}
      <dl class="profilo">
        {#each profilo as [k, nome] (k)}<div><dt class="eti">{nome}</dt><dd title={r[k]}>{r[k]}</dd></div>{/each}
      </dl>
    {/if}
    {#if r.diagnosi || (r.certificazioni && r.certificazioni !== 'nessuna') || r.servizi || familiari.length || r.noteFamiglia || geno}
    <div class="colonne">
      <dl class="clinica">
        {#if r.diagnosi}<div><dt class="eti">Diagnosi o ipotesi</dt><dd>{r.diagnosi}</dd></div>{/if}
        {#if r.certificazioni && r.certificazioni !== 'nessuna'}<div><dt class="eti">Certificazione</dt><dd>{CERT[r.certificazioni] || r.certificazioni}</dd></div>{/if}
        {#if r.servizi}<div><dt class="eti">Servizi</dt><dd>{r.servizi}</dd></div>{/if}
      </dl>
      {#if familiari.length || r.noteFamiglia}
        <div class="famiglia">
          <p class="eti">Famiglia</p>
          <ul>
            {#each familiari as g, i (i)}
              <li><span class="nome">{g.nome || '—'}</span>{#if g.relazione}<span class="sotto"> · {g.relazione}</span>{/if}
                {#if g.telefono}<a class="tel" href={'tel:' + g.telefono.replace(/[^\d+]/g, '')}>{g.telefono}</a>{/if}</li>
            {/each}
          </ul>
          {#if r.noteFamiglia}<p class="sotto piccolo note" title={r.noteFamiglia}>{primaRiga(r.noteFamiglia)}</p>{/if}
        </div>
      {/if}
      {#if geno}
        <button type="button" class="geno" onclick={apri} aria-label={'Apri il genogramma ' + geno.nome} title="Apri il genogramma">
          {#if dati}<Genogramma data={dati.data} titolo={geno.nome} anteprima />{:else}<span class="sotto piccolo">genogramma…</span>{/if}
        </button>
      {/if}
    </div>
    {/if}
  {/if}
</details>

{#if grande && dati}
  <dialog bind:this={dialogo} class="vista-geno" onclose={() => (grande = false)} aria-label={geno.nome}>
    <header><span class="display">{geno.nome}</span><button type="button" class="btn nudo" onclick={() => dialogo.close()} aria-label="Chiudi"><Icona nome="chiudi" /></button></header>
    <div class="tela"><Genogramma data={dati.data} titolo={geno.nome} /></div>
  </dialog>
{/if}

<style>
  .in-breve { border-left: 1px dashed var(--matita-forte); padding-left: var(--s-4); min-width: 0; }
  summary { cursor: pointer; list-style: none; margin-bottom: var(--s-2); }
  summary::-webkit-details-marker { display: none; }
  .colonne { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 150px; gap: var(--s-4); align-items: start; }
  .colonne:not(:has(.geno)) { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
  dl { margin: 0; display: grid; gap: var(--s-2); }
  .profilo { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--s-3) var(--s-4); margin-bottom: var(--s-3); padding-bottom: var(--s-3); border-bottom: 1px dashed var(--matita); }
  .profilo dd { white-space: pre-line; }
  .profilo:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
  dt { font-size: 10.5px; }
  dd { margin: 0; font-size: var(--t-sm); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .famiglia .eti { margin: 0 0 4px; font-size: 10.5px; }
  .famiglia ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: var(--t-sm); }
  .famiglia li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 4px; }
  .nome { font-weight: 600; }
  .tel { margin-left: auto; font-variant-numeric: tabular-nums; font-size: 12.5px; }
  .note { margin: 6px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .geno { display: block; width: 150px; height: 112px; padding: 0; border: 1px solid var(--matita); border-radius: var(--r); background: var(--carta); cursor: zoom-in; overflow: hidden; }
  .geno:hover { box-shadow: var(--ombra); }
  .link { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; }
  .vista-geno { width: min(98vw, 1400px); height: 92vh; padding: 0; border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .vista-geno[open] { display: flex; flex-direction: column; }
  .vista-geno::backdrop { background: oklch(0.2 0.02 265 / 0.6); }
  .vista-geno header { display: flex; align-items: center; justify-content: space-between; padding: var(--s-2) var(--s-3) var(--s-2) var(--s-4); border-bottom: 1px solid var(--matita); }
  .vista-geno .tela { flex: 1; min-height: 0; }
  @media (max-width: 899px) {
    .in-breve { border-left: 0; padding-left: 0; border-top: 1px dashed var(--matita-forte); padding-top: var(--s-2); }
    .colonne, .colonne:not(:has(.geno)) { grid-template-columns: 1fr; }
    .geno { width: 100%; height: 160px; }
  }
  @media print { .in-breve { border: 0; } .geno { cursor: default; } }
</style>
