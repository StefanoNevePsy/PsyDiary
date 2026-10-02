<script>
  import { T, M } from '../lib/parole.svelte.js';
  // Il gruppo: storico delle sedute, prossimi piani, membri e impostazioni.
  import {
    dati, gruppo, ragazzo, nomeBreve, nomeCompleto, membriAl, storicoGruppo, puoGestire, salva, elimina, sedutePeriodo, statoSeduta, ragazziAttivi,
  } from '../lib/dati.svelte.js';
  import { rotta, vai } from '../lib/rotta.svelte.js';
  import { oggi, piu, lunga, relativa, breveAnno, nomeGiorno } from '../lib/date.js';
  import { daFare, anteprima } from '../lib/testo.js';
  import { apriCrea, ui } from '../lib/ui.svelte.js';
  import DiarioElenco from '../components/DiarioElenco.svelte';
  import ElencoSospesi from '../components/ElencoSospesi.svelte';
  import Editor from '../components/Editor.svelte';
  import Md from '../components/Md.svelte';
  import Icona from '../components/Icona.svelte';
  import ElencoSerie from '../components/ElencoSerie.svelte';
  import { serieInCorso } from '../lib/dati.svelte.js';
  import { descrivi } from '../lib/serie.js';
  import Immagine from '../components/Immagine.svelte';
  import { scegliImmagine, togliImmagine } from '../lib/immagini.js';
  import Scelta from '../components/Scelta.svelte';

  let { id } = $props();
  const g = $derived(gruppo(id));
  const O = oggi();
  let impostazioni = $state(rotta.query.impostazioni === '1');
  let filtro = $state({ tipi: [], tag: [], da: '', a: '', testo: '' });
  const voci = $derived(g ? storicoGruppo(id).filter((v) => v.data <= O || v.tipo === 'nota') : []);
  const prossime = $derived(g ? sedutePeriodo(O, piu(O, 35)).filter((s) => s.gruppoId === id).slice(0, 3) : []);
  const membri = $derived(g ? membriAl(g, O) : []);
  const usciti = $derived(g ? (g.membri || []).filter((m) => m.al && m.al < O) : []);
  const GIORNI = [[1, 'lun'], [2, 'mar'], [3, 'mer'], [4, 'gio'], [5, 'ven'], [6, 'sab']];
  const gestisce = $derived(puoGestire());

  let timer = null;
  function campo(k, v) {
    g[k] = v;
    clearTimeout(timer);
    timer = setTimeout(() => salva('gruppi', $state.snapshot(g)), 400);
  }
  // Da quando un ragazzo è nel gruppo: dall'inizio (nessuna data: conta per
  // tutte le sedute del gruppo), da oggi, o da un giorno preciso.
  const inizio = $derived.by(() => {
    if (!g) return null;
    const date = [...dati.serie.filter((x) => x.gruppoId === g.id).map((x) => x.dal), ...dati.sedute.filter((x) => x.gruppoId === g.id).map((x) => x.data)].filter(Boolean).sort();
    return date[0] || null;
  });
  const QUANDO = [{ valore: 'inizio', etichetta: "dall'inizio del gruppo" }, { valore: 'oggi', etichetta: 'da oggi' }, { valore: 'data', etichetta: 'dal giorno…' }];
  let daAggiungere = $state('');
  let quando = $state(null);
  let quandoData = $state(O);
  const quandoScelto = $derived(quando ?? (inizio && inizio < O ? 'inizio' : 'oggi'));
  const dalScelto = (q, d) => (q === 'inizio' ? null : q === 'data' ? d || O : O);
  function entra() {
    if (!daAggiungere) return;
    campo('membri', [...(g.membri || []), { ragazzoId: daAggiungere, dal: dalScelto(quandoScelto, quandoData) }]);
    daAggiungere = '';
  }
  // cambiare la data di ingresso di chi è già nel gruppo
  let inModifica = $state(null);
  function modificaIngresso(m) { inModifica = { rid: m.ragazzoId, quando: m.dal ? 'data' : 'inizio', data: m.dal || inizio || O }; }
  function salvaIngresso() {
    const x = inModifica;
    campo('membri', (g.membri || []).map((m) => (m.ragazzoId === x.rid && !(m.al && m.al < O) ? { ...m, dal: dalScelto(x.quando, x.data) } : m)));
    inModifica = null;
  }
  const testoDal = (dal) => (!dal ? "dall'inizio" : dal > O ? 'entra il ' + breveAnno(dal) : 'dal ' + breveAnno(dal));
  function esce(rid) {
    const futuro = (g.membri || []).find((m) => m.ragazzoId === rid && !m.al && m.dal && m.dal > O);
    if (futuro) {
      // non è ancora entrato: si toglie e basta
      if (!confirm(`Togliere ${nomeCompleto(ragazzo(rid))}, che doveva entrare il ${breveAnno(futuro.dal)}?`)) return;
      campo('membri', (g.membri || []).filter((m) => m !== futuro));
      return;
    }
    if (!confirm(`${nomeCompleto(ragazzo(rid))} esce dal gruppo da oggi? Le sedute passate restano nel suo diario.`)) return;
    campo('membri', (g.membri || []).map((m) => (m.ragazzoId === rid && !m.al ? { ...m, al: piu(O, -1) } : m)));
  }

  async function copertina() {
    try { const n = await scegliImmagine(); if (!n) return; const v = g.copertina; campo('copertina', n); if (v) togliImmagine(v); } catch (e) { alert(e.message); }
  }
  function togliCopertina() { const v = g.copertina; campo('copertina', null); if (v) togliImmagine(v); }
  // chi è nel gruppo o ci entrerà (anche più avanti) non si aggiunge una seconda volta
  const candidati = $derived(ragazziAttivi().filter((r) => !(g?.membri || []).some((m) => m.ragazzoId === r.id && !(m.al && m.al < O))));
  async function archivia() {
    if (!confirm(g.archiviato ? 'Riattivare il gruppo?' : 'Archiviare il gruppo? Lo storico resta; le sedute future spariscono dal calendario.')) return;
    campo('archiviato', !g.archiviato);
  }
</script>

{#if g}
  <div class="gruppo">
    <header class="testa">
      <a class="torna no-stampa" href="#/gruppi"><Icona nome="sinistra" /> Gruppi</a>
      <p class="eti">{serieInCorso({ gruppoId: id }).map((x) => descrivi(x)).join(' · ') || 'senza giorno fisso'}{g.archiviato ? ' · archiviato' : ''}</p>
      {#if g.copertina || gestisce}
        <div class="copertina" class:vuota={!g.copertina}>
          {#if g.copertina}<Immagine id={g.copertina} forma="foglio" seme={g.id} alt={'Immagine del ' + g.nome} onclick={() => (ui.visore = g.copertina)} />{/if}
          {#if gestisce}
            <div class="cop-azioni no-stampa">
              <button class="btn piccolo" onclick={copertina}><Icona nome="matita" /> {g.copertina ? 'Cambia immagine' : "Aggiungi un'immagine al gruppo"}</button>
              {#if g.copertina}<button class="btn piccolo" onclick={togliCopertina} aria-label="Togli l'immagine"><Icona nome="chiudi" /></button>{/if}
            </div>
          {/if}
        </div>
      {/if}
      <h1 class="display">{g.nome}</h1>
      {#if g.tema}<p class="tema mano">{g.tema}</p>{/if}
      <p class="membri">
        {#each membri as rid (rid)}<a href={'#/ragazzo/' + rid}>{nomeBreve(ragazzo(rid))}</a>{/each}
      </p>
      <div class="schede no-stampa" role="tablist">
        <button role="tab" aria-selected={!impostazioni} onclick={() => (impostazioni = false)}>Storico <small>{voci.length}</small></button>
        <button role="tab" aria-selected={impostazioni} onclick={() => (impostazioni = true)}>Membri e impostazioni</button>
      </div>
    </header>

    <div class="corpo">
      <div class="principale">
        {#if !impostazioni}
          {#if prossime.length}
            <section class="prossime no-stampa" aria-label="Prossime sedute">
              {#each prossime as s (s.id)}
                <a class="prossima" href={'#/seduta/' + encodeURIComponent(s.id)}>
                  <span class="eti">{relativa(s.data)} · {s.ora}</span>
                  <span class="display quando">{lunga(s.data)}</span>
                  {#if s.argomento}
                    <span class="piano">{daFare(s.argomento).length ? daFare(s.argomento).slice(0, 3).join(' · ') : anteprima(s.argomento, 80)}</span>
                  {:else}
                    <span class="mano vuoto">cosa facciamo?</span>
                  {/if}
                </a>
              {/each}
            </section>
          {/if}
          <DiarioElenco {voci} bind:filtro tipi={['gruppo', 'nota']} titolo={'Storico · ' + g.nome} nomeFile={'Storico ' + g.nome} />
        {:else}
          <div class="impostazioni">
            {#if !gestisce}<p class="avviso sotto"><Icona nome="lucchetto" /> Membri e impostazioni li modificano gli operatori.</p>{/if}
            <fieldset disabled={!gestisce}>
              <legend class="eti">Il gruppo</legend>
              <div class="griglia">
                <label class="campo"><span>Nome</span><input class="input" value={g.nome} oninput={(e) => campo('nome', e.currentTarget.value)} /></label>
                <label class="campo"><span>Tema</span><input class="input" value={g.tema || ''} oninput={(e) => campo('tema', e.currentTarget.value)} /></label>
              </div>
            </fieldset>
            <section class="appuntamenti">
              <h3 class="eti titolo-sez">Quando si incontra</h3>
              <ElencoSerie gruppoId={id} />
            </section>
            <fieldset disabled={!gestisce}>
              <legend class="eti">Membri</legend>
              <ul class="elenco-membri">
                {#each (g.membri || []).filter((m) => !m.al || m.al >= O) as m (m.ragazzoId)}
                  <li><a class="display" href={'#/ragazzo/' + m.ragazzoId}>{nomeCompleto(ragazzo(m.ragazzoId))}</a>
                    {#if inModifica?.rid === m.ragazzoId}
                      <span class="modifica-dal">
                        <Scelta breve bind:value={inModifica.quando} etichetta="Da quando" opzioni={QUANDO.filter((q) => q.valore !== 'oggi')} />
                        {#if inModifica.quando === 'data'}<input class="input data" type="date" bind:value={inModifica.data} aria-label="Data di ingresso" />{/if}
                        <button type="button" class="btn piccolo" onclick={salvaIngresso}>Salva</button>
                        <button type="button" class="btn nudo piccolo" onclick={() => (inModifica = null)}>Annulla</button>
                      </span>
                    {:else}
                      {#if gestisce}<button type="button" class="link sotto piccolo" title="Cambia da quando è nel gruppo" onclick={() => modificaIngresso(m)}>{testoDal(m.dal)}</button>
                      {:else}<span class="sotto piccolo">{testoDal(m.dal)}</span>{/if}
                      {#if gestisce}<button type="button" class="btn nudo piccolo" onclick={() => esce(m.ragazzoId)}>{m.dal && m.dal > O ? 'Togli' : 'Esce dal gruppo'}</button>{/if}
                    {/if}</li>
                {/each}
              </ul>
              {#if gestisce && candidati.length}
                <div class="entra">
                  <span class="chi"><Scelta bind:value={daAggiungere} vuota={'Aggiungi ' + T('un') + '…'} etichetta={M('uno') + ' da aggiungere'} opzioni={candidati.map((r) => ({ valore: r.id, etichetta: nomeCompleto(r) }))} /></span>
                  <Scelta breve value={quandoScelto} onchange={(v) => (quando = v)} etichetta="Da quando è nel gruppo" opzioni={QUANDO} />
                  {#if quandoScelto === 'data'}<input class="input data" type="date" bind:value={quandoData} aria-label="Nel gruppo dal" />{/if}
                  <button type="button" class="btn piccolo" onclick={entra} disabled={!daAggiungere}>Aggiungi</button>
                </div>
              {/if}
              {#if usciti.length}<p class="sotto piccolo">Usciti: {usciti.map((m) => `${nomeBreve(ragazzo(m.ragazzoId))} (${breveAnno(m.al)})`).join(', ')}</p>{/if}
            </fieldset>
            {#if gestisce}<button type="button" class="btn nudo piccolo" onclick={archivia}>{g.archiviato ? 'Riattiva il gruppo' : 'Archivia il gruppo'}</button>{/if}
          </div>
        {/if}
      </div>

      <aside class="lato no-stampa">
        <div class="azioni">
          <button class="btn pieno" onclick={() => apriCrea({ tipo: 'nota', gruppoId: id })}><Icona nome="matita" /> Nota sul gruppo</button>
        </div>
        <div class="box retino">
          <h3 class="eti">Obiettivi</h3>
          <Editor testo={g.obiettivi || ''} compatto etichetta="Obiettivi del gruppo" soloLettura={!gestisce}
            segnaposto="Su cosa lavora il gruppo" alCambio={(t) => campo('obiettivi', t)} />
        </div>
        <div class="box"><ElencoSospesi tipo="gruppo" {id} /></div>
      </aside>
    </div>
  </div>
{:else}
  <p class="vuoto">Gruppo non trovato. <a href="#/gruppi">Torna ai gruppi</a></p>
{/if}

<style>
  .gruppo { max-width: 1240px; margin: 0 auto; padding: var(--s-5) var(--s-6) var(--s-8); }
  .testa { display: grid; gap: var(--s-2); margin-bottom: var(--s-5); border-bottom: 1.5px solid var(--inchiostro); }
  .torna { display: inline-flex; align-items: center; gap: 4px; font-size: var(--t-sm); font-weight: 600; text-decoration: none; color: var(--inchiostro-2); }
  h1 { font-size: var(--t-xxl); line-height: 0.95; }
  .copertina { position: relative; height: 220px; margin-bottom: var(--s-2); }
  .copertina.vuota { height: auto; }
  .cop-azioni { position: absolute; right: 10px; bottom: 10px; display: flex; gap: 4px; z-index: 4; }
  .copertina:not(.vuota) .cop-azioni .btn { background: var(--carta); }
  .copertina.vuota .cop-azioni { position: static; }
  .tema { font-size: 28px; transform: rotate(-2deg); transform-origin: left; margin-top: -6px; }
  .membri { display: flex; flex-wrap: wrap; gap: 4px 16px; font-weight: 600; font-size: var(--t-sm); }
  .membri a { text-decoration-color: var(--spot); text-underline-offset: 3px; }
  .schede { display: flex; gap: var(--s-5); margin-top: var(--s-3); }
  .schede button { border: 0; background: none; padding: 8px 0; font-weight: 600; color: var(--inchiostro-2); cursor: pointer; position: relative; }
  .schede button[aria-selected='true'] { color: var(--inchiostro); }
  .schede button[aria-selected='true']::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1.5px; height: 3px; background: var(--spot); }
  .schede small { font-weight: 500; color: var(--inchiostro-3); }
  .corpo { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s-7); align-items: start; }
  .principale { display: grid; gap: var(--s-5); min-width: 0; }
  .prossime { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); }
  .prossima { border-radius: var(--r-grande); display: grid; gap: 2px; align-content: start; padding: var(--s-3) var(--s-4); border: 1px dashed var(--matita-forte); text-decoration: none; }
  .prossima:first-child { border: 1px solid var(--inchiostro); background: var(--carta-2); }
  .prossima:hover { border-color: var(--spot); }
  .quando { font-size: 18px; }
  .piano { font-size: var(--t-sm); color: var(--inchiostro-2); }
  .vuoto { font-size: 19px; }
  .lato { display: grid; gap: var(--s-5); position: sticky; top: calc(var(--barra) + var(--s-4)); }
  .azioni { display: grid; } .azioni .btn { justify-content: center; }
  .box { display: grid; gap: var(--s-2); }
  .box.retino { padding: var(--s-3) var(--s-4); border-radius: var(--r-grande); }
  .impostazioni { display: grid; gap: var(--s-6); }
  .appuntamenti { display: grid; gap: var(--s-3); }
  .titolo-sez { padding-bottom: 4px; border-bottom: 1px solid var(--matita); }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: var(--s-4); }
  legend { margin-bottom: var(--s-3); padding-bottom: 4px; border-bottom: 1px solid var(--matita); width: 100%; }
  .griglia { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4) var(--s-5); }
  .griglia.tre { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .giorni { display: flex; flex-wrap: wrap; gap: 6px; }
  .scelta { min-height: 32px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; font-weight: 600; cursor: pointer; }
  .scelta[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .elenco-membri { list-style: none; margin: 0; padding: 0; }
  .elenco-membri li { display: flex; align-items: baseline; gap: var(--s-3); padding: 8px 0; border-bottom: 1px dashed var(--matita); }
  .elenco-membri a { font-size: 18px; text-decoration: none; flex: 1; }
  .entra { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; margin-top: var(--s-2); }
  .entra .chi { flex: 1 1 200px; max-width: 300px; }
  .input.data { width: auto; }
  .modifica-dal { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
  .link { background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; font: inherit; }
  .avviso { display: flex; gap: var(--s-2); align-items: center; font-size: var(--t-sm); }
  p.vuoto { padding: var(--s-7); text-align: center; color: var(--inchiostro-2); }
  @media (max-width: 1000px) {
    .corpo { grid-template-columns: 1fr; }
    .lato { position: static; }
  }
  @media (max-width: 720px) {
    .gruppo { padding: var(--s-3) var(--s-4) var(--s-7); }
    h1 { font-size: 40px; }
    .prossime { grid-template-columns: 1fr; }
    .prossima:not(:first-child) { display: none; }
    .griglia, .griglia.tre { grid-template-columns: 1fr; }
  }
</style>
