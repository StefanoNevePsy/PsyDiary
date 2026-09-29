<script>
  // Il ragazzo: diario completo, scheda anagrafica, idee in sospeso.
  import {
    dati, ragazzo, nomeCompleto, gruppiDi, diarioRagazzo, puoGestire, salva, sedutePeriodo, soggetto, titoloSeduta, TIPI, elimina,
  } from '../lib/dati.svelte.js';
  import { rotta, vai } from '../lib/rotta.svelte.js';
  import { eta, oggi, piu, lunga, relativa, breveAnno } from '../lib/date.js';
  import { apriCrea } from '../lib/ui.svelte.js';
  import DiarioElenco from '../components/DiarioElenco.svelte';
  import ElencoSospesi from '../components/ElencoSospesi.svelte';
  import Editor from '../components/Editor.svelte';
  import Md from '../components/Md.svelte';
  import Icona from '../components/Icona.svelte';

  let { id } = $props();
  const r = $derived(ragazzo(id));
  let scheda = $state(rotta.query.scheda === '1');
  let filtro = $state({ tipi: [], tag: [], da: '', a: '', testo: '' });
  const voci = $derived(r ? diarioRagazzo(id) : []);
  const gruppi = $derived(r ? gruppiDi(id) : []);
  const O = oggi();
  const agenda = $derived.by(() => {
    if (!r) return [];
    const ks = ['individuale:' + id, 'genitori:' + id, ...gruppi.map((g) => 'g:' + g.id)];
    return sedutePeriodo(O, piu(O, 21)).filter((s) => ks.includes(soggetto(s))).slice(0, 4);
  });

  // scheda: si salva al volo
  let timer = null;
  function campo(k, v) {
    r[k] = v;
    clearTimeout(timer);
    timer = setTimeout(() => salva('ragazzi', $state.snapshot(r)), 400);
  }
  function genitore(i, k, v) { const g = [...(r.genitori || [])]; g[i] = { ...g[i], [k]: v }; campo('genitori', g); }
  const GIORNI = [['', 'nessuna'], [1, 'lunedì'], [2, 'martedì'], [3, 'mercoledì'], [4, 'giovedì'], [5, 'venerdì'], [6, 'sabato']];
  function ricorrenza(k, v) {
    const base = r.ricorrenza || { giorni: [], ora: '16:00', durata: 60, dal: O };
    let nuova = { ...base, [k]: v };
    if (k === 'giorni') nuova = v ? { ...base, giorni: [+v], dal: base.giorni.length ? base.dal : O } : null;
    campo('ricorrenza', nuova);
  }
  async function togli() {
    if (!confirm(`Eliminare ${nomeCompleto(r)} e tutte le sue note individuali? Le sedute di gruppo restano.`)) return;
    for (const s of dati.sedute.filter((x) => x.ragazzoId === id)) await elimina('sedute', s.id);
    for (const n of dati.note.filter((x) => x.ragazzoId === id)) await elimina('note', n.id);
    await elimina('ragazzi', id);
    vai('ragazzi');
  }
  const gestisce = $derived(puoGestire());
</script>

{#if r}
  <div class="ragazzo">
    <header class="testa">
      <a class="torna no-stampa" href="#/ragazzi"><Icona nome="sinistra" /> Ragazzi</a>
      <h1 class="display">{r.nome || 'Senza nome'} <span class="cognome">{r.cognome}</span></h1>
      <p class="sotto dettagli">
        {#if r.nascita}<span>{eta(r.nascita)} anni</span>{/if}
        {#if r.classe || r.scuola}<span>{r.classe}{r.scuola ? ', ' + r.scuola : ''}</span>{/if}
        {#if r.inizio}<span>in carico dal {breveAnno(r.inizio)}</span>{/if}
        {#if r.stato === 'concluso'}<span class="mano concluso">percorso concluso</span>{/if}
      </p>
      <p class="appartiene">
        {#each gruppi as g (g.id)}<a href={'#/gruppo/' + g.id}>{g.nome}</a>{/each}
        {#if r.ricorrenza?.giorni?.length}<span>Individuale ogni {r.ricorrenza.ogni === 2 ? 'due settimane' : 'settimana'}, {GIORNI.find((x) => x[0] === r.ricorrenza.giorni[0])?.[1]} {r.ricorrenza.ora}</span>{/if}
      </p>
      <div class="schede no-stampa" role="tablist">
        <button role="tab" aria-selected={!scheda} onclick={() => (scheda = false)}>Diario <small>{voci.length}</small></button>
        <button role="tab" aria-selected={scheda} onclick={() => (scheda = true)}>Scheda</button>
      </div>
    </header>

    <div class="corpo">
      <div class="principale">
        {#if !scheda}
          <DiarioElenco {voci} bind:filtro titolo={'Diario di ' + nomeCompleto(r)} nomeFile={'Diario ' + nomeCompleto(r)} />
        {:else}
          <form class="anagrafica" onsubmit={(e) => e.preventDefault()}>
            {#if !gestisce}<p class="avviso sotto"><Icona nome="lucchetto" /> La scheda la modificano gli operatori; tu puoi leggerla.</p>{/if}
            <fieldset disabled={!gestisce}>
              <legend class="eti">Anagrafica</legend>
              <div class="griglia">
                <label class="campo"><span>Nome</span><input class="input" value={r.nome} oninput={(e) => campo('nome', e.currentTarget.value)} /></label>
                <label class="campo"><span>Cognome</span><input class="input" value={r.cognome} oninput={(e) => campo('cognome', e.currentTarget.value)} /></label>
                <label class="campo"><span>Data di nascita</span><input class="input" type="date" value={r.nascita || ''} onchange={(e) => campo('nascita', e.currentTarget.value)} /></label>
                <label class="campo"><span>Scuola</span><input class="input" value={r.scuola || ''} oninput={(e) => campo('scuola', e.currentTarget.value)} /></label>
                <label class="campo"><span>Classe</span><input class="input" value={r.classe || ''} oninput={(e) => campo('classe', e.currentTarget.value)} /></label>
                <label class="campo"><span>Inviato da</span><input class="input" value={r.invio || ''} oninput={(e) => campo('invio', e.currentTarget.value)} /></label>
                <label class="campo"><span>In carico dal</span><input class="input" type="date" value={r.inizio || ''} onchange={(e) => campo('inizio', e.currentTarget.value)} /></label>
                <label class="campo"><span>Percorso</span>
                  <select class="input" value={r.stato} onchange={(e) => campo('stato', e.currentTarget.value)}><option value="attivo">in corso</option><option value="concluso">concluso</option></select></label>
              </div>
            </fieldset>
            <fieldset disabled={!gestisce}>
              <legend class="eti">Famiglia</legend>
              {#each r.genitori || [] as gen, i (i)}
                <div class="griglia tre">
                  <label class="campo"><span>Nome</span><input class="input" value={gen.nome || ''} oninput={(e) => genitore(i, 'nome', e.currentTarget.value)} /></label>
                  <label class="campo"><span>Relazione</span><input class="input" value={gen.relazione || ''} oninput={(e) => genitore(i, 'relazione', e.currentTarget.value)} /></label>
                  <label class="campo"><span>Telefono</span><input class="input" type="tel" value={gen.telefono || ''} oninput={(e) => genitore(i, 'telefono', e.currentTarget.value)} /></label>
                </div>
              {/each}
              {#if gestisce}<button type="button" class="btn nudo piccolo" onclick={() => campo('genitori', [...(r.genitori || []), { nome: '', relazione: '' }])}><Icona nome="piu" /> Aggiungi un familiare</button>{/if}
            </fieldset>
            <fieldset disabled={!gestisce}>
              <legend class="eti">Sedute individuali</legend>
              <div class="griglia tre">
                <label class="campo"><span>Giorno fisso</span>
                  <select class="input" value={r.ricorrenza?.giorni?.[0] ?? ''} onchange={(e) => ricorrenza('giorni', e.currentTarget.value)}>
                    {#each GIORNI as [v, n] (v)}<option value={v}>{n}</option>{/each}
                  </select></label>
                {#if r.ricorrenza}
                  <label class="campo"><span>Ora</span><input class="input" type="time" value={r.ricorrenza.ora} onchange={(e) => ricorrenza('ora', e.currentTarget.value)} /></label>
                  <label class="campo"><span>Frequenza</span>
                    <select class="input" value={r.ricorrenza.ogni || 1} onchange={(e) => ricorrenza('ogni', +e.currentTarget.value)}><option value={1}>ogni settimana</option><option value={2}>ogni due settimane</option></select></label>
                {/if}
              </div>
              <p class="sotto piccolo">Con un giorno fisso le sedute compaiono da sole nel calendario. Le altre si aggiungono da «Scrivi».</p>
            </fieldset>
            <div class="stabili">
              <h3 class="eti">Da tenere a mente</h3>
              <Editor testo={r.noteStabili || ''} etichetta="Da tenere a mente" soloLettura={!gestisce}
                segnaposto="Informazioni che valgono sempre: attenzioni, accordi, cose da non dimenticare"
                alCambio={(t) => campo('noteStabili', t)} />
            </div>
            {#if gestisce}<button type="button" class="btn nudo piccolo elimina" onclick={togli}><Icona nome="cestino" /> Elimina il ragazzo</button>{/if}
          </form>
        {/if}
      </div>

      <aside class="lato no-stampa">
        <div class="azioni">
          <button class="btn pieno" onclick={() => apriCrea({ tipo: 'nota', ragazzoId: id })}><Icona nome="matita" /> Nota su {r.nome}</button>
          <button class="btn piccolo" onclick={() => apriCrea({ tipo: 'individuale', ragazzoId: id })}>Seduta individuale</button>
          <button class="btn piccolo" onclick={() => apriCrea({ tipo: 'genitori', ragazzoId: id })}>Incontro genitori</button>
        </div>
        {#if r.noteStabili && !scheda}
          <div class="box retino">
            <h3 class="eti">Da tenere a mente</h3>
            <Md testo={r.noteStabili} />
          </div>
        {/if}
        <div class="box">
          <h3 class="eti">Prossimi appuntamenti</h3>
          <ul class="agenda">
            {#each agenda as s (s.id)}
              <li><a href={'#/seduta/' + encodeURIComponent(s.id)}><span class="quando">{relativa(s.data)}, {s.ora}</span> <span class="sotto">{s.tipo === 'gruppo' ? titoloSeduta(s) : TIPI[s.tipo].breve}</span></a></li>
            {:else}
              <li class="sotto">Nessuno nelle prossime tre settimane.</li>
            {/each}
          </ul>
        </div>
        <div class="box"><ElencoSospesi tipo="ragazzo" {id} /></div>
      </aside>
    </div>
  </div>
{:else}
  <p class="vuoto">Ragazzo non trovato. <a href="#/ragazzi">Torna all'elenco</a></p>
{/if}

<style>
  .ragazzo { max-width: 1240px; margin: 0 auto; padding: var(--s-5) var(--s-6) var(--s-8); }
  .testa { display: grid; gap: var(--s-2); margin-bottom: var(--s-5); border-bottom: 1.5px solid var(--inchiostro); }
  .torna { display: inline-flex; align-items: center; gap: 4px; font-size: var(--t-sm); font-weight: 600; text-decoration: none; color: var(--inchiostro-2); }
  h1 { font-size: var(--t-xxl); line-height: 0.95; }
  .cognome { color: var(--inchiostro-2); }
  .dettagli { display: flex; flex-wrap: wrap; gap: 4px 18px; }
  .concluso { font-size: 20px; }
  .appartiene { display: flex; flex-wrap: wrap; gap: 4px 18px; font-weight: 600; font-size: var(--t-sm); }
  .appartiene a { text-decoration-color: var(--spot); text-underline-offset: 3px; }
  .appartiene span { font-weight: 500; color: var(--inchiostro-2); }
  .schede { display: flex; gap: var(--s-5); margin-top: var(--s-3); }
  .schede button { border: 0; background: none; padding: 8px 0; font-weight: 600; color: var(--inchiostro-2); cursor: pointer; position: relative; }
  .schede button[aria-selected='true'] { color: var(--inchiostro); }
  .schede button[aria-selected='true']::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1.5px; height: 3px; background: var(--spot); }
  .schede small { font-weight: 500; color: var(--inchiostro-3); }
  .corpo { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s-7); align-items: start; }
  .lato { display: grid; gap: var(--s-5); position: sticky; top: calc(var(--barra) + var(--s-4)); }
  .azioni { display: grid; gap: var(--s-2); }
  .azioni .btn { justify-content: center; }
  .azioni .piccolo { justify-self: stretch; }
  .box { display: grid; gap: var(--s-2); }
  .box.retino { padding: var(--s-3) var(--s-4); }
  .box.retino :global(.md) { font-size: var(--t-ui); }
  .agenda { list-style: none; margin: 0; padding: 0; }
  .agenda li { padding: 6px 0; border-bottom: 1px dashed var(--matita); }
  .agenda a { text-decoration: none; }
  .quando { font-weight: 600; }
  .anagrafica { display: grid; gap: var(--s-6); }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: var(--s-4); }
  legend { margin-bottom: var(--s-3); padding-bottom: 4px; border-bottom: 1px solid var(--matita); width: 100%; }
  .griglia { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4) var(--s-5); }
  .griglia.tre { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  fieldset:disabled .input { border-bottom-style: dotted; }
  .avviso { display: flex; gap: var(--s-2); align-items: center; font-size: var(--t-sm); }
  .stabili { display: grid; gap: var(--s-2); }
  .elimina { justify-self: start; color: var(--spot-testo); }
  .vuoto { padding: var(--s-7); text-align: center; color: var(--inchiostro-2); }
  @media (max-width: 1000px) {
    .corpo { grid-template-columns: 1fr; }
    .lato { position: static; order: -1; }
    .azioni { grid-template-columns: 1fr 1fr; }
    .azioni .pieno { grid-column: 1 / -1; }
  }
  @media (max-width: 720px) {
    .ragazzo { padding: var(--s-3) var(--s-4) var(--s-7); }
    h1 { font-size: 40px; }
    .griglia, .griglia.tre { grid-template-columns: 1fr; }
    .lato .box:not(.retino) { display: none; }
  }
</style>
