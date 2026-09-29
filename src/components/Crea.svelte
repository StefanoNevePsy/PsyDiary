<script>
  // "Scrivi": il punto unico da cui si comincia una nota o una seduta.
  import { onMount, untrack } from 'svelte';
  import {
    dati, gruppo, ragazzo, nomeCompleto, ragazziAttivi, salva, nuovoId, sessione, sedutePeriodo, soggetto, titoloSeduta, statoSeduta, TIPI,
  } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { oggi, lunga, giornoSettimana, relativa } from '../lib/date.js';
  import Icona from './Icona.svelte';

  let { opz = {}, chiudi } = $props();
  const inizio = untrack(() => ({ ...opz }));
  let dialogo;
  const O = oggi();
  let tipo = $state(inizio.tipo || '');
  let data = $state(inizio.data || O);
  let gruppoId = $state(inizio.gruppoId || '');
  let ragazzoId = $state(inizio.ragazzoId || '');
  let ora = $state('');
  let chi = $state('');
  let titolo = $state('');
  let su = $state(inizio.gruppoId ? 'g:' + inizio.gruppoId : inizio.ragazzoId ? 'r:' + inizio.ragazzoId : 'aula');

  onMount(() => dialogo.showModal());

  const gruppiAttivi = $derived(dati.gruppi.filter((g) => !g.archiviato));
  const ragazzi = $derived(ragazziAttivi());
  // sedute del giorno (da scrivere per prime)
  const delGiorno = $derived(sedutePeriodo(data, data));
  const recenti = $derived(sedutePeriodo(data === O ? data : O, O).filter((s) => statoSeduta(s) !== 'scritta'));

  // ora proposta: quella del gruppo o della ricorrenza individuale
  $effect(() => {
    if (tipo === 'gruppo' && gruppoId) { const g = gruppo(gruppoId); ora = g?.ricorrenza?.ora || ora || '15:00'; }
    else if ((tipo === 'individuale' || tipo === 'genitori') && ragazzoId) { const r = ragazzo(ragazzoId); ora = (tipo === 'individuale' && r?.ricorrenza?.ora) || ora || '16:00'; }
  });

  const KIND = [
    { id: 'gruppo', nome: 'Seduta di gruppo', ico: 'gruppo', dett: 'piano, resoconto, una riga per ragazzo' },
    { id: 'individuale', nome: 'Seduta individuale', ico: 'persone', dett: 'con un ragazzo' },
    { id: 'genitori', nome: 'Incontro con i genitori', ico: 'persone', dett: 'finisce nel diario del ragazzo' },
    { id: 'nota', nome: 'Nota libera', ico: 'matita', dett: 'telefonate, osservazioni, idee' },
  ];
  const pronto = $derived(
    tipo === 'gruppo' ? !!gruppoId && !!data : tipo === 'individuale' || tipo === 'genitori' ? !!ragazzoId && !!data : tipo === 'nota' ? !!data : false,
  );

  async function apri(e) {
    e?.preventDefault();
    if (!pronto) return;
    if (tipo === 'nota') {
      const n = { id: nuovoId('n'), data, titolo: titolo.trim(), testo: '', autore: sessione.utente.nome };
      if (su.startsWith('g:')) n.gruppoId = su.slice(2);
      if (su.startsWith('r:')) n.ragazzoId = su.slice(2);
      await salva('note', n);
      fine('nota/' + n.id);
      return;
    }
    const k = tipo === 'gruppo' ? 'g:' + gruppoId : tipo + ':' + ragazzoId;
    const esiste = sedutePeriodo(data, data).find((s) => soggetto(s) === k);
    if (esiste) { fine('seduta/' + encodeURIComponent(esiste.id)); return; }
    const s = {
      id: nuovoId('s'), tipo, data, ora: ora || '15:00', durata: tipo === 'gruppo' ? gruppo(gruppoId)?.ricorrenza?.durata || 90 : 60,
      argomento: '', resoconto: '', prossima: '', autori: {},
      ...(tipo === 'gruppo' ? { gruppoId, presenze: {}, partecipanti: {} } : { ragazzoId }),
      ...(tipo === 'genitori' ? { chi } : {}),
    };
    await salva('sedute', s);
    fine('seduta/' + s.id);
  }
  function fine(dove) { dialogo.close(); vai(dove); }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogo} class="crea" aria-labelledby="titolo-crea" onclose={chiudi} onclick={(e) => { if (e.target === dialogo) dialogo.close(); }}>
  <form class="foglio" onsubmit={apri}>
    <header>
      <h2 id="titolo-crea" class="display">{tipo ? KIND.find((k) => k.id === tipo).nome : 'Cosa scrivi?'}</h2>
      <button type="button" class="btn nudo" onclick={() => dialogo.close()} aria-label="Chiudi"><Icona nome="chiudi" /></button>
    </header>

    {#if !tipo}
      {#if recenti.length && !opz.data}
        <div class="subito">
          <p class="eti">Da scrivere adesso</p>
          {#each recenti.slice(0, 3) as s (s.id)}
            <button type="button" class="seduta" onclick={() => fine('seduta/' + encodeURIComponent(s.id))}>
              <span class="display">{titoloSeduta(s)}</span><span class="sotto piccolo">{relativa(s.data)}, {s.ora} · {TIPI[s.tipo].breve}</span>
              <Icona nome="freccia" />
            </button>
          {/each}
        </div>
      {/if}
      {#if opz.data && delGiorno.length}
        <div class="subito">
          <p class="eti">Già in calendario {lunga(data)}</p>
          {#each delGiorno as s (s.id)}
            <button type="button" class="seduta" onclick={() => fine('seduta/' + encodeURIComponent(s.id))}>
              <span class="display">{titoloSeduta(s)}</span><span class="sotto piccolo">{s.ora} · {TIPI[s.tipo].breve}</span><Icona nome="freccia" />
            </button>
          {/each}
        </div>
      {/if}
      <div class="tipi">
        {#each KIND as k (k.id)}
          <button type="button" class="tipo" onclick={() => (tipo = k.id)}>
            <Icona nome={k.ico} /><span><span class="nome">{k.nome}</span><span class="sotto piccolo">{k.dett}</span></span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="campi">
        {#if tipo === 'gruppo'}
          <label class="campo"><span>Gruppo</span>
            <select class="input" bind:value={gruppoId} required>
              <option value="" disabled>Scegli…</option>
              {#each gruppiAttivi as g (g.id)}<option value={g.id}>{g.nome}</option>{/each}
            </select></label>
        {:else if tipo === 'individuale' || tipo === 'genitori'}
          <label class="campo"><span>Ragazzo</span>
            <select class="input" bind:value={ragazzoId} required>
              <option value="" disabled>Scegli…</option>
              {#each ragazzi as r (r.id)}<option value={r.id}>{nomeCompleto(r)}</option>{/each}
            </select></label>
        {:else}
          <label class="campo"><span>Su</span>
            <select class="input" bind:value={su}>
              <option value="aula">L'aula in generale</option>
              <optgroup label="Gruppi">{#each gruppiAttivi as g (g.id)}<option value={'g:' + g.id}>{g.nome}</option>{/each}</optgroup>
              <optgroup label="Ragazzi">{#each ragazzi as r (r.id)}<option value={'r:' + r.id}>{nomeCompleto(r)}</option>{/each}</optgroup>
            </select></label>
          <label class="campo"><span>Titolo (facoltativo)</span><input class="input" bind:value={titolo} placeholder="es. Telefonata con la scuola" /></label>
        {/if}
        <div class="riga">
          <label class="campo"><span>Data</span><input class="input" type="date" bind:value={data} required /></label>
          {#if tipo !== 'nota'}<label class="campo"><span>Ora</span><input class="input" type="time" bind:value={ora} /></label>{/if}
        </div>
        {#if tipo === 'genitori'}<label class="campo"><span>Chi c'è</span><input class="input" bind:value={chi} placeholder="es. madre e padre" /></label>{/if}
        {#if tipo !== 'nota' && data > O}<p class="sotto piccolo">È nel futuro: si apre il piano, per segnarti cosa vuoi fare.</p>{/if}
      </div>
      <footer>
        {#if !opz.tipo}<button type="button" class="btn nudo" onclick={() => (tipo = '')}><Icona nome="sinistra" /> Indietro</button>{:else}<span></span>{/if}
        <button class="btn pieno" disabled={!pronto}>{tipo === 'nota' ? 'Scrivi la nota' : 'Apri il foglio'} <Icona nome="freccia" /></button>
      </footer>
    {/if}
  </form>
</dialog>

<style>
  dialog { padding: 0; border: 0; background: transparent; width: min(560px, calc(100vw - 24px)); margin: 10vh auto auto; color: inherit; overflow: visible; }
  dialog::backdrop { background: oklch(0.2 0.03 265 / 0.35); }
  .foglio { position: relative; background: var(--carta-2); border: 1px solid var(--inchiostro); box-shadow: var(--ombra), 6px 6px 0 var(--spot-retino); padding: var(--s-5); display: grid; gap: var(--s-4); animation: apre var(--d-media) var(--e-uscita); }
  header { display: flex; justify-content: space-between; align-items: start; gap: var(--s-3); }
  h2 { font-size: var(--t-lg); line-height: 1.05; }
  .subito { display: grid; gap: 4px; }
  .seduta { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0 var(--s-3); text-align: left; padding: 8px 12px; border: 1px solid var(--spot); border-left-width: 3px; background: var(--carta); cursor: pointer; }
  .seduta .display { font-size: 18px; }
  .seduta .sotto { grid-row: 2; }
  .seduta :global(.ico) { grid-row: 1 / span 2; grid-column: 2; color: var(--spot-testo); }
  .seduta:hover { background: var(--spot-tenue); }
  .tipi { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
  .tipo { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-3) var(--s-4); min-height: 76px; border: 1px solid var(--matita-forte); background: var(--carta); text-align: left; cursor: pointer; border-radius: var(--r); }
  .tipo:hover { border-color: var(--inchiostro); box-shadow: 3px 3px 0 var(--matita); }
  .tipo :global(.ico) { margin-top: 2px; }
  .tipo > span { display: grid; gap: 2px; }
  .nome { font-weight: 700; }
  .campi { display: grid; gap: var(--s-4); }
  .riga { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
  footer { display: flex; justify-content: space-between; gap: var(--s-3); }
  @keyframes apre { from { opacity: 0; transform: translateY(8px); } }
  @media (max-width: 720px) {
    dialog { margin: auto 0 0; width: 100vw; max-width: 100vw; }
    .foglio { border-width: 1px 0 0; box-shadow: none; padding: var(--s-4) var(--s-4) calc(var(--s-5) + env(safe-area-inset-bottom)); }
    .tipi { grid-template-columns: 1fr; }
    .tipo { min-height: 0; }
  }
</style>
