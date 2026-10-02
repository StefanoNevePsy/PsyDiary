<script>
  import Scelta from './Scelta.svelte';
  // "Scrivi": il punto unico da cui si comincia una nota o una seduta.
  import { onMount, untrack } from 'svelte';
  import {
    dati, gruppo, ragazzo, nomeCompleto, ragazziCondivisi, ragazziAttivi, condiviso, salva, nuovoId, io, sedutePeriodo, soggetto, titoloSeduta, statoSeduta, TIPI, CATEGORIE_NOTA,
    serieInCorso, creaSerie, puoGestire,
  } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { oggi, lunga, giornoSettimana, relativa, piu } from '../lib/date.js';
  import { occorrenze, descrivi } from '../lib/serie.js';
  import Ripeti from './Ripeti.svelte';
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
  const ragazzi = $derived(ragazziCondivisi());
  const tuttiRagazzi = $derived(ragazziAttivi());
  let categoria = $state('osservazione');
  // su un ragazzo non condiviso si può scrivere solo una nota "nel gruppo"
  const soloGruppo = $derived(su.startsWith('r:') && !condiviso(su.slice(2)));
  $effect(() => { if (soloGruppo) categoria = 'gruppo'; });
  // sedute del giorno (da scrivere per prime)
  const delGiorno = $derived(sedutePeriodo(data, data));
  const recenti = $derived(sedutePeriodo(data === O ? data : O, O).filter((s) => statoSeduta(s) !== 'scritta'));

  // ora proposta: quella degli appuntamenti ricorrenti che ci sono già
  const giaInSerie = $derived(tipo === 'gruppo' && gruppoId ? serieInCorso({ gruppoId }) : ragazzoId && tipo !== 'nota' ? serieInCorso({ ragazzoId }).filter((x) => x.tipo === tipo) : []);
  $effect(() => {
    const se = giaInSerie[0];
    if (se) ora = se.ora;
    else if (!ora) ora = tipo === 'gruppo' ? '15:00' : '16:00';
  });
  // si ripete?
  let ripeti = $state(null);
  let fineR = $state({ tipo: 'mai', al: '', volte: 10 });

  const KIND = [
    { id: 'gruppo', nome: 'Seduta di gruppo', ico: 'gruppo', dett: 'piano, resoconto, una riga per ragazzo' },
    { id: 'individuale', nome: 'Seduta individuale', ico: 'persone', dett: 'con un ragazzo' },
    { id: 'genitori', nome: 'Incontro con i genitori', ico: 'persone', dett: 'finisce nel diario del ragazzo' },
    { id: 'conoscenza', nome: 'Colloquio di conoscenza', ico: 'orologio', dett: 'i primi incontri, prima di iniziare' },
    { id: 'nota', nome: 'Nota libera', ico: 'matita', dett: 'telefonate, osservazioni, idee' },
  ];
  const pronto = $derived(
    tipo === 'gruppo' ? !!gruppoId && !!data : ['individuale', 'genitori', 'conoscenza'].includes(tipo) ? !!ragazzoId && !!data : tipo === 'nota' ? !!data : false,
  );

  async function apri(e) {
    e?.preventDefault();
    if (!pronto) return;
    if (tipo === 'nota') {
      const n = { id: nuovoId('n'), data, titolo: titolo.trim(), categoria, testo: '', autore: io().nome };
      if (su.startsWith('g:')) n.gruppoId = su.slice(2);
      if (su.startsWith('r:')) n.ragazzoId = su.slice(2);
      await salva('note', n);
      fine('nota/' + n.id);
      return;
    }
    if (ripeti) {
      const se = await creaSerie({
        tipo, ora: ora || '15:00', durata: tipo === 'gruppo' ? 90 : 60, ripeti, dal: data,
        ...(tipo === 'gruppo' ? { gruppoId } : { ragazzoId }), ...(tipo === 'genitori' || tipo === 'conoscenza' ? { chi } : {}),
        ...(fineR.tipo === 'data' && fineR.al ? { al: fineR.al } : {}), ...(fineR.tipo === 'volte' ? { volte: fineR.volte } : {}),
      });
      const prima = occorrenze(se, data, piu(data, 400))[0];
      fine(prima ? 'seduta/' + encodeURIComponent(`v:${se.id}:${prima}`) : 'calendario/settimana/' + data);
      return;
    }
    const k = tipo === 'gruppo' ? 'g:' + gruppoId : tipo + ':' + ragazzoId;
    const esiste = sedutePeriodo(data, data).find((s) => soggetto(s) === k);
    if (esiste) { fine('seduta/' + encodeURIComponent(esiste.id)); return; }
    const s = {
      id: nuovoId('s'), tipo, data, ora: ora || '15:00', durata: giaInSerie[0]?.durata || (tipo === 'gruppo' ? 90 : 60),
      argomento: '', resoconto: '', prossima: '', autori: {},
      ...(tipo === 'gruppo' ? { gruppoId, presenze: {}, partecipanti: {} } : { ragazzoId }),
      ...(tipo === 'genitori' || tipo === 'conoscenza' ? { chi } : {}),
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
            <Scelta bind:value={gruppoId} required opzioni={gruppiAttivi.map((g) => ({ valore: g.id, etichetta: g.nome }))} /></label>
        {:else if ['individuale', 'genitori', 'conoscenza'].includes(tipo)}
          <label class="campo"><span>Ragazzo</span>
            <Scelta bind:value={ragazzoId} required opzioni={ragazzi.map((r) => ({ valore: r.id, etichetta: nomeCompleto(r) }))} /></label>
        {:else}
          <label class="campo"><span>Su</span>
            <Scelta bind:value={su} opzioni={[{ valore: 'aula', etichetta: "L'aula in generale" },
              ...gruppiAttivi.map((g) => ({ valore: 'g:' + g.id, etichetta: g.nome, gruppo: 'Gruppi' })),
              ...tuttiRagazzi.map((r) => ({ valore: 'r:' + r.id, etichetta: nomeCompleto(r), gruppo: 'Ragazzi' }))]} /></label>
          <div class="campo"><span>Che nota è</span>
            <div class="categorie">{#each Object.entries(CATEGORIE_NOTA) as [k, n] (k)}<button type="button" class="cat" aria-pressed={categoria === k} disabled={soloGruppo && k !== 'gruppo'} onclick={() => (categoria = k)}>{n}</button>{/each}</div>
            {#if soloGruppo}<p class="sotto piccolo">Non hai accesso completo a questo ragazzo: puoi scrivere solo note su come sta nel gruppo.</p>{/if}
          </div>
          <label class="campo"><span>Titolo (facoltativo)</span><input class="input" bind:value={titolo} placeholder="es. Telefonata con la scuola" /></label>
        {/if}
        <div class="riga">
          <label class="campo"><span>Data</span><input class="input" type="date" bind:value={data} required /></label>
          {#if tipo !== 'nota'}<label class="campo"><span>Ora</span><input class="input" type="time" bind:value={ora} /></label>{/if}
        </div>
        {#if tipo === 'genitori' || tipo === 'conoscenza'}<label class="campo"><span>Chi c'è</span><input class="input" bind:value={chi} placeholder="es. madre e padre" /></label>{/if}
        {#if tipo !== 'nota' && puoGestire()}
          {#if giaInSerie.length}<p class="sotto piccolo gia">↻ Ha già: {giaInSerie.map((x) => descrivi(x)).join(' · ')}. Queste sedute compaiono da sole nel calendario.</p>{/if}
          <Ripeti {data} {ora} bind:ripeti bind:fine={fineR} />
        {/if}
        {#if tipo !== 'nota' && data > O && !ripeti}<p class="sotto piccolo">È nel futuro: si apre il piano, per segnarti cosa vuoi fare.</p>{/if}
      </div>
      <footer>
        {#if !opz.tipo}<button type="button" class="btn nudo" onclick={() => (tipo = '')}><Icona nome="sinistra" /> Indietro</button>{:else}<span></span>{/if}
        <button class="btn pieno" disabled={!pronto}>{tipo === 'nota' ? 'Scrivi la nota' : ripeti ? 'Crea e apri la prima' : 'Apri il foglio'} <Icona nome="freccia" /></button>
      </footer>
    {/if}
  </form>
</dialog>

<style>
  dialog { padding: 0; border: 0; background: transparent; width: min(560px, calc(100vw - 24px)); margin: 5vh auto auto; color: inherit; overflow: visible; }
  dialog::backdrop { background: oklch(0.2 0.03 265 / 0.35); }
  .foglio { position: relative; max-height: 90dvh; overflow-y: auto; border-radius: var(--r-grande); background: var(--carta-2); border: 1px solid var(--inchiostro); box-shadow: var(--ombra), 6px 6px 0 var(--spot-retino); padding: var(--s-5); display: grid; gap: var(--s-4); animation: apre var(--d-media) var(--e-uscita); }
  header { display: flex; justify-content: space-between; align-items: start; gap: var(--s-3); }
  h2 { font-size: var(--t-lg); line-height: 1.05; }
  .subito { display: grid; gap: 4px; }
  .seduta { border-radius: var(--r); display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0 var(--s-3); text-align: left; padding: 8px 12px; border: 1px solid var(--spot); border-left-width: 3px; background: var(--carta); cursor: pointer; }
  .seduta .display { font-size: 18px; }
  .seduta .sotto { grid-row: 2; }
  .seduta :global(.ico) { grid-row: 1 / span 2; grid-column: 2; color: var(--spot-testo); }
  .seduta:hover { background: var(--spot-tenue); }
  .tipi { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
  .tipo { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-3) var(--s-4); min-height: 76px; border: 1px solid var(--matita-forte); background: var(--carta); text-align: left; cursor: pointer; border-radius: var(--r-grande); }
  .tipo:hover { border-color: var(--inchiostro); box-shadow: 3px 3px 0 var(--matita); }
  .tipo :global(.ico) { margin-top: 2px; }
  .tipo > span { display: grid; gap: 2px; }
  .nome { font-weight: 700; }
  .campi { display: grid; gap: var(--s-4); }
  .gia { margin: 0; padding: 6px 10px; border-radius: var(--r); background: var(--carta-3); }
  .categorie { display: flex; flex-wrap: wrap; gap: 6px; }
  .cat { min-height: 32px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; font-weight: 600; font-size: var(--t-sm); cursor: pointer; }
  .cat:disabled { opacity: 0.35; cursor: not-allowed; }
  .cat[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .riga { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
  footer { display: flex; justify-content: space-between; gap: var(--s-3); }
  @keyframes apre { from { opacity: 0; transform: translateY(8px); } }
  @media (max-width: 720px) {
    dialog { margin: auto 0 0; width: 100vw; max-width: 100vw; }
    .foglio { border-width: 1px 0 0; box-shadow: none; border-radius: var(--r-grande) var(--r-grande) 0 0; padding: var(--s-4) var(--s-4) calc(var(--s-5) + env(safe-area-inset-bottom)); }
    .tipi { grid-template-columns: 1fr; }
    .tipo { min-height: 0; }
  }
</style>
