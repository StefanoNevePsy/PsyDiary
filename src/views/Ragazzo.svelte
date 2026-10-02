<script>
  import { T, M } from '../lib/parole.svelte.js';
  import Scelta from '../components/Scelta.svelte';
  import Allegati from '../components/Allegati.svelte';
  import InBreve from '../components/InBreve.svelte';
  import Suggerimenti from '../components/Suggerimenti.svelte';
  import Etichette from '../components/Etichette.svelte';
  import { RAPIDI, suggerimentiRuoli } from '../lib/famiglia.js';
  // Il ragazzo: diario, anagrafica a campi, colloqui di conoscenza, idee in sospeso.
  // Chi non ha il ragazzo condiviso vede solo quello che accade nei gruppi.
  import {
    dati, ragazzo, nomeCompleto, gruppiDi, diarioRagazzo, puoGestire, salva, sedutePeriodo, soggetto, titoloSeduta, TIPI, elimina,
    condiviso, statoSeduta,
  } from '../lib/dati.svelte.js';
  import { rotta, vai } from '../lib/rotta.svelte.js';
  import { eta, oggi, piu, lunga, relativa, breveAnno } from '../lib/date.js';
  import { anteprima } from '../lib/testo.js';
  import { apriCrea } from '../lib/ui.svelte.js';
  import { scegliImmagine, togliImmagine } from '../lib/immagini.js';
  import DiarioElenco from '../components/DiarioElenco.svelte';
  import ElencoSospesi from '../components/ElencoSospesi.svelte';
  import Editor from '../components/Editor.svelte';
  import Md from '../components/Md.svelte';
  import Immagine from '../components/Immagine.svelte';
  import Icona from '../components/Icona.svelte';
  import ElencoSerie from '../components/ElencoSerie.svelte';
  import { serieInCorso } from '../lib/dati.svelte.js';
  import { descrivi } from '../lib/serie.js';

  let { id } = $props();
  const r = $derived(ragazzo(id));
  const tutto = $derived(condiviso(id));
  let scheda = $state(rotta.query.scheda === '1' ? 'anagrafica' : 'diario');
  let filtro = $state({ tipi: [], tag: [], da: '', a: '', testo: '' });
  const voci = $derived(r ? diarioRagazzo(id) : []);
  const gruppi = $derived(r ? gruppiDi(id) : []);
  const O = oggi();
  const agenda = $derived.by(() => {
    if (!r) return [];
    const ks = ['individuale:' + id, 'genitori:' + id, 'conoscenza:' + id, ...gruppi.map((g) => 'g:' + g.id)];
    return sedutePeriodo(O, piu(O, 21)).filter((s) => ks.includes(soggetto(s))).slice(0, 4);
  });
  const colloqui = $derived(tutto ? dati.sedute.filter((s) => s.tipo === 'conoscenza' && s.ragazzoId === id && !s.annullata).sort((a, b) => a.data.localeCompare(b.data)) : []);

  // scheda: si salva al volo
  let timer = null;
  function campo(k, v) {
    r[k] = v;
    clearTimeout(timer);
    timer = setTimeout(() => salva('ragazzi', $state.snapshot(r)), 400);
  }
  function familiare(i, k, v) { const g = [...(r.genitori || [])]; g[i] = { ...g[i], [k]: v }; campo('genitori', g); }
  const RUOLI_SUGG = suggerimentiRuoli();
  function nuovoFamiliare(relazione = '') {
    campo('genitori', [...(r.genitori || []), { nome: '', relazione }]);
    // il cursore va sul nome del nuovo familiare
    queueMicrotask(() => [...document.querySelectorAll('.familiare input[data-nome]')].at(-1)?.focus());
  }
  function togliFamiliare(i) { campo('genitori', (r.genitori || []).filter((_, j) => j !== i)); }
  const GIORNI = [['', 'nessuna'], [1, 'lunedì'], [2, 'martedì'], [3, 'mercoledì'], [4, 'giovedì'], [5, 'venerdì'], [6, 'sabato']];
  const SI_NO = [['', '—'], ['sì', 'sì'], ['no', 'no']];
  // [chiave, etichetta, tipo, opzioni, larga]
  const SEZIONI = [
    { titolo: 'Dati personali', campi: [
      ['nome', 'Nome'], ['cognome', 'Cognome'], ['nascita', 'Data di nascita', 'date'], ['luogoNascita', 'Luogo di nascita'],
      ['genere', 'Genere', 'select', [['', '—'], ['F', 'femmina'], ['M', 'maschio'], ['altro', 'altro']]], ['cf', 'Codice fiscale'],
      ['cittadinanza', 'Cittadinanza'], ['lingue', 'Lingue parlate a casa'],
      ['indirizzo', 'Indirizzo'], ['comune', 'Comune'], ['telefono', 'Telefono', 'tel'], ['email', 'Email', 'email'],
    ] },
    { titolo: 'Scuola', campi: [
      ['scuola', 'Scuola'], ['classe', 'Classe'], ['insegnante', 'Insegnante di riferimento'],
      ['certificazioni', 'Certificazioni', 'select', [['', '—'], ['nessuna', 'nessuna'], ['104', 'L. 104 · PEI'], ['dsa', 'DSA · PDP'], ['bes', 'BES']]],
    ] },
    { titolo: 'Invio e servizi', campi: [
      ['invio', 'Inviato da'], ['diagnosi', 'Diagnosi o ipotesi'], ['servizi', 'Altri servizi coinvolti'], ['pediatra', 'Pediatra o medico'],
      ['motivoInvio', "Motivo dell'invio", 'area', null, true],
      ['inizio', 'In carico dal', 'date'], ['stato', 'Percorso', 'select', [['attivo', 'in corso'], ['concluso', 'concluso']]],
    ] },
    { titolo: 'Consensi', campi: [
      ['consensoPrivacy', 'Informativa firmata il', 'date'], ['consensoFoto', 'Consenso alle immagini', 'select', SI_NO],
      ['consensoScuola', 'Consenso a sentire la scuola', 'select', SI_NO],
    ] },
  ];
  const fotoNo = $derived(r?.consensoFoto === 'no');
  async function cambiaFoto() {
    try {
      const nuovo = await scegliImmagine();
      if (!nuovo) return;
      const vecchio = r.foto;
      campo('foto', nuovo);
      if (vecchio) togliImmagine(vecchio);
    } catch (e) { alert(e.message); }
  }
  function togliFoto() { const v = r.foto; campo('foto', null); if (v) togliImmagine(v); }
  async function togli() {
    if (!confirm(`Eliminare ${nomeCompleto(r)} e tutte le sue note individuali? Le sedute di gruppo restano.`)) return;
    for (const s of dati.sedute.filter((x) => x.ragazzoId === id)) await elimina('sedute', s.id);
    for (const n of dati.note.filter((x) => x.ragazzoId === id)) await elimina('note', n.id);
    for (const a of r.allegati || []) togliImmagine(a.id);
    await elimina('ragazzi', id);
    vai('ragazzi');
  }
  const gestisce = $derived(puoGestire());
</script>

{#if r}
  <div class="ragazzo">
    <header class="testa">
      <a class="torna no-stampa" href="#/ragazzi"><Icona nome="sinistra" /> {M('tanti')}</a>
      <div class="intesta">
        <div class="foto">
          <Immagine id={r.foto} forma="tondo" seme={r.id} iniziale={(r.nome || '?')[0]} alt={'Foto di ' + nomeCompleto(r)} />
          {#if gestisce && !fotoNo}
            <div class="foto-azioni no-stampa">
              <button class="btn nudo piccolo" onclick={cambiaFoto}><Icona nome="matita" /> {r.foto ? 'Cambia' : 'Foto'}</button>
              {#if r.foto}<button class="btn nudo piccolo" onclick={togliFoto} aria-label="Togli la foto"><Icona nome="chiudi" /></button>{/if}
            </div>
          {/if}
        </div>
        <div class="nomi">
          <h1 class="display">{r.nome || 'Senza nome'} <span class="cognome">{r.cognome}</span></h1>
          <p class="sotto dettagli">
            {#if r.nascita}<span>{eta(r.nascita)} anni</span>{/if}
            {#if r.classe || r.scuola}<span>{r.classe}{r.scuola ? ', ' + r.scuola : ''}</span>{/if}
            {#if tutto && r.inizio}<span>in carico dal {breveAnno(r.inizio)}</span>{/if}
            {#if r.stato === 'concluso'}<span class="mano concluso">percorso concluso</span>{/if}
          </p>
          {#if tutto && (gestisce || r.etichette?.length)}<p class="etich"><Etichette valori={r.etichette || []} modificabile={gestisce} alCambio={(x) => campo('etichette', x)} /></p>{/if}
          <p class="appartiene">
            {#each gruppi as g (g.id)}<a href={'#/gruppo/' + g.id}>{g.nome}</a>{/each}
            {#if tutto}{#each serieInCorso({ ragazzoId: id }) as se (se.id)}<span>{TIPI[se.tipo].breve} {descrivi(se)}</span>{/each}{/if}
          </p>
        </div>
        {#if tutto}<InBreve {r} apriAnagrafica={() => (scheda = 'anagrafica')} />{/if}
      </div>
      {#if tutto}
        <div class="schede no-stampa" role="tablist">
          <button role="tab" aria-selected={scheda === 'diario'} onclick={() => (scheda = 'diario')}>Diario <small>{voci.length}</small></button>
          <button role="tab" aria-selected={scheda === 'anagrafica'} onclick={() => (scheda = 'anagrafica')}>Anagrafica</button>
          <button role="tab" aria-selected={scheda === 'conoscenza'} onclick={() => (scheda = 'conoscenza')}>Conoscenza <small>{colloqui.length}</small></button>
        </div>
      {/if}
    </header>

    {#if !tutto}
      <div class="limitato">
        <p><Icona nome="lucchetto" /> Di {r.nome} vedi le sedute di gruppo e le note su come sta nel gruppo: individuali, genitori, conoscenza, altre note e anagrafica non sono condivisi con te.</p>
        <button class="btn pieno piccolo" onclick={() => apriCrea({ tipo: 'nota', ragazzoId: id })}><Icona nome="matita" /> Nota nel gruppo su {r.nome}</button>
      </div>
    {/if}

    <div class="corpo" class:pieno={!tutto}>
      <div class="principale">
        {#if scheda === 'diario' || !tutto}
          <DiarioElenco {voci} bind:filtro tipi={tutto ? undefined : ['gruppo', 'nota']} titolo={'Diario di ' + nomeCompleto(r)} nomeFile={'Diario ' + nomeCompleto(r)} />
        {:else if scheda === 'anagrafica'}
          <form class="anagrafica" onsubmit={(e) => e.preventDefault()}>
            {#if !gestisce}<p class="avviso sotto"><Icona nome="lucchetto" /> L'anagrafica la modificano gli operatori; tu puoi leggerla.</p>{/if}
            {#each SEZIONI as sez (sez.titolo)}
              <fieldset disabled={!gestisce}>
                <legend class="eti">{sez.titolo}</legend>
                <div class="griglia">
                  {#each sez.campi as [k, nome, tipo, opzioni, larga] (k)}
                    <label class="campo" class:larga>
                      <span>{nome}</span>
                      {#if tipo === 'select'}
                        <Scelta value={r[k] ?? ''} onchange={(v) => campo(k, v)} etichetta={nome} opzioni={opzioni.map(([v, n]) => ({ valore: v, etichetta: n }))} />
                      {:else if tipo === 'area'}
                        <textarea class="input" rows="2" value={r[k] || ''} oninput={(e) => campo(k, e.currentTarget.value)}></textarea>
                      {:else}
                        <input class="input" type={tipo || 'text'} value={r[k] || ''} oninput={(e) => campo(k, e.currentTarget.value)} />
                      {/if}
                    </label>
                  {/each}
                </div>
              </fieldset>
            {/each}
            <fieldset disabled={!gestisce}>
              <legend class="eti">Famiglia</legend>
              {#each r.genitori || [] as gen, i (i)}
                <div class="familiare">
                  <div class="griglia quattro">
                    <label class="campo"><span>Nome</span><input class="input" data-nome value={gen.nome || ''} oninput={(e) => familiare(i, 'nome', e.currentTarget.value)} /></label>
                    <label class="campo"><span>Relazione</span><Suggerimenti value={gen.relazione || ''} suggerimenti={RUOLI_SUGG} etichetta="Relazione" placeholder="madre, nonno paterno…" disabled={!gestisce} oninput={(v) => familiare(i, 'relazione', v)} /></label>
                    <label class="campo"><span>Telefono</span><input class="input" type="tel" value={gen.telefono || ''} oninput={(e) => familiare(i, 'telefono', e.currentTarget.value)} /></label>
                    <label class="campo"><span>Email</span><input class="input" type="email" value={gen.email || ''} oninput={(e) => familiare(i, 'email', e.currentTarget.value)} /></label>
                  </div>
                  {#if gestisce}<button type="button" class="btn nudo piccolo" onclick={() => togliFamiliare(i)} aria-label={'Togli ' + (gen.nome || 'familiare')}><Icona nome="chiudi" /></button>{/if}
                </div>
              {/each}
              {#if gestisce}
                <div class="rapidi" role="group" aria-label="Aggiungi un familiare">
                  <span class="sotto piccolo">Aggiungi:</span>
                  {#each RAPIDI as ruolo (ruolo)}<button type="button" class="chip" onclick={() => nuovoFamiliare(ruolo)}><Icona nome="piu" />{ruolo}</button>{/each}
                  <button type="button" class="chip" onclick={() => nuovoFamiliare()}><Icona nome="piu" />altro…</button>
                </div>
              {/if}
              <label class="campo"><span>Situazione familiare</span>
                <textarea class="input" rows="2" value={r.noteFamiglia || ''} placeholder="Con chi vive, fratelli, separazioni, affidi" oninput={(e) => campo('noteFamiglia', e.currentTarget.value)}></textarea></label>
            </fieldset>
            <Allegati elenco={r.allegati || []} {gestisce} alCambio={(x) => campo('allegati', x)} />
            <section class="appuntamenti">
              <h3 class="eti titolo-sez">Appuntamenti ricorrenti</h3>
              <p class="sotto piccolo">Individuali, genitori, conoscenza: compaiono da soli nel calendario, pronti per gli appunti.</p>
              <ElencoSerie ragazzoId={id} />
            </section>
            <div class="stabili">
              <h3 class="eti">Da tenere a mente</h3>
              <Editor testo={r.noteStabili || ''} etichetta="Da tenere a mente" soloLettura={!gestisce}
                segnaposto="Informazioni che valgono sempre: attenzioni, accordi, cose da non dimenticare"
                alCambio={(t) => campo('noteStabili', t)} />
            </div>
            {#if gestisce}<button type="button" class="btn nudo piccolo elimina" onclick={togli}><Icona nome="cestino" /> Elimina {T('il')}</button>{/if}
          </form>
        {:else}
          <section class="conoscenza">
            <p class="sotto intro">I primi colloqui, prima di iniziare il percorso: con {T('il')}, con i genitori, insieme.</p>
            {#each colloqui as s, i (s.id)}
              <a class="colloquio" href={'#/seduta/' + encodeURIComponent(s.id)}>
                <span class="n display">{i + 1}</span>
                <span class="c-corpo">
                  <span class="eti">{lunga(s.data, true)}{s.chi ? ' · con ' + s.chi : ''}</span>
                  {#if s.argomento}<span class="display c-tit">{anteprima(s.argomento, 70)}</span>{/if}
                  {#if s.resoconto}<span class="sotto">{anteprima(s.resoconto, 220)}</span>{:else}<span class="mano">{statoSeduta(s) === 'futura' ? 'in programma' : 'da scrivere'}</span>{/if}
                </span>
              </a>
            {:else}
              <p class="sotto vuoto">Nessun colloquio di conoscenza segnato.</p>
            {/each}
            <button class="btn" onclick={() => apriCrea({ tipo: 'conoscenza', ragazzoId: id })}><Icona nome="piu" /> Nuovo colloquio di conoscenza</button>
          </section>
        {/if}
      </div>

      {#if tutto}
        <aside class="lato no-stampa">
          <div class="azioni">
            <button class="btn pieno" onclick={() => apriCrea({ tipo: 'nota', ragazzoId: id })}><Icona nome="matita" /> Nota su {r.nome}</button>
            <button class="btn piccolo" onclick={() => apriCrea({ tipo: 'individuale', ragazzoId: id })}>Seduta individuale</button>
            <button class="btn piccolo" onclick={() => apriCrea({ tipo: 'genitori', ragazzoId: id })}>Incontro genitori</button>
          </div>
          {#if r.noteStabili && scheda !== 'anagrafica'}
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
      {/if}
    </div>
  </div>
{:else}
  <p class="vuoto">{M('uno')} non trovato. <a href="#/ragazzi">Torna all'elenco</a></p>
{/if}

<style>
  .ragazzo { max-width: 1240px; margin: 0 auto; padding: var(--s-5) var(--s-6) var(--s-8); }
  .testa { display: grid; gap: var(--s-3); margin-bottom: var(--s-5); border-bottom: 1.5px solid var(--inchiostro); }
  .torna { display: inline-flex; align-items: center; gap: 4px; font-size: var(--t-sm); font-weight: 600; text-decoration: none; color: var(--inchiostro-2); }
  .intesta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-5); }
  .etich { margin: 6px 0 0; }
  .nomi { flex: 0 1 auto; }
  .intesta > :global(.in-breve) { flex: 1 1 520px; align-self: stretch; padding-top: var(--s-2); }
  @media (max-width: 899px) { .intesta > :global(.in-breve) { flex-basis: 100%; } }
  .foto { position: relative; width: 132px; flex: none; display: grid; gap: 4px; justify-items: center; }
  .foto > :global(.cornice) { width: 132px; height: 132px; }
  .foto-azioni { display: flex; }
  .nomi { display: grid; gap: var(--s-2); min-width: 0; }
  h1 { font-size: var(--t-xxl); line-height: 0.95; }
  .cognome { color: var(--inchiostro-2); }
  .dettagli { display: flex; flex-wrap: wrap; gap: 4px 18px; }
  .concluso { font-size: 20px; }
  .appartiene { display: flex; flex-wrap: wrap; gap: 4px 18px; font-weight: 600; font-size: var(--t-sm); }
  .appartiene a { text-decoration-color: var(--spot); text-underline-offset: 3px; }
  .appartiene span { font-weight: 500; color: var(--inchiostro-2); }
  .schede { display: flex; gap: var(--s-5); }
  .schede button { border: 0; background: none; padding: 8px 0; font-weight: 600; color: var(--inchiostro-2); cursor: pointer; position: relative; }
  .schede button[aria-selected='true'] { color: var(--inchiostro); }
  .schede button[aria-selected='true']::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1.5px; height: 3px; border-radius: 3px; background: var(--spot); }
  .schede small { font-weight: 500; color: var(--inchiostro-3); }
  .limitato p { display: flex; gap: var(--s-2); align-items: center; }
  .limitato { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s-3); align-items: center; padding: var(--s-3) var(--s-4); margin-bottom: var(--s-5); border: 1px dashed var(--matita-forte); border-radius: var(--r-grande); color: var(--inchiostro-2); }
  .corpo { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s-7); align-items: start; }
  .corpo.pieno { grid-template-columns: minmax(0, 860px); }
  .lato { display: grid; gap: var(--s-5); position: sticky; top: calc(var(--barra) + var(--s-4)); }
  .azioni { display: grid; gap: var(--s-2); }
  .box { display: grid; gap: var(--s-2); }
  .box.retino { padding: var(--s-3) var(--s-4); border-radius: var(--r-grande); }
  .box.retino :global(.md) { font-size: var(--t-ui); }
  .agenda { list-style: none; margin: 0; padding: 0; }
  .agenda li { padding: 6px 0; border-bottom: 1px dashed var(--matita); }
  .agenda a { text-decoration: none; }
  .quando { font-weight: 600; }
  .anagrafica { display: grid; gap: var(--s-6); }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: var(--s-4); min-width: 0; }
  legend { margin-bottom: var(--s-3); padding-bottom: 4px; border-bottom: 1px solid var(--matita); width: 100%; }
  .griglia { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: var(--s-4) var(--s-5); }
  .griglia.quattro { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .larga { grid-column: 1 / -1; }
  fieldset:disabled .input { border-bottom-style: dotted; }
  .familiare { display: flex; gap: var(--s-3); align-items: end; padding-bottom: var(--s-3); border-bottom: 1px dashed var(--matita); }
  .familiare .griglia { flex: 1; }
  .rapidi { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: var(--s-2) 0 var(--s-3); }
  .chip { display: inline-flex; align-items: center; gap: 3px; padding: 4px 10px 4px 7px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; color: var(--inchiostro); font: inherit; font-size: var(--t-sm); cursor: pointer; }
  .chip :global(.ico) { width: 13px; height: 13px; }
  .chip:hover { background: var(--carta-3); border-color: var(--inchiostro-2); }
  .aggiungi { justify-self: start; }
  .avviso { display: flex; gap: var(--s-2); align-items: center; font-size: var(--t-sm); }
  .stabili { display: grid; gap: var(--s-2); }
  .appuntamenti { display: grid; gap: var(--s-2); }
  .titolo-sez { padding-bottom: 4px; border-bottom: 1px solid var(--matita); }
  .elimina { justify-self: start; color: var(--spot-testo); }
  .conoscenza { display: grid; gap: var(--s-3); justify-items: start; }
  .intro { max-width: 60ch; }
  .colloquio { display: grid; grid-template-columns: 52px 1fr; gap: var(--s-3); width: 100%; padding: var(--s-4); text-decoration: none; background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande); }
  .colloquio:hover { box-shadow: var(--ombra); }
  .n { font-size: 44px; line-height: 0.9; color: var(--spot-testo); }
  .c-corpo { display: grid; gap: 4px; }
  .c-tit { font-size: 19px; }
  .vuoto { font-style: italic; }
  p.vuoto { padding: var(--s-7); text-align: center; color: var(--inchiostro-2); }
  @media (max-width: 1000px) {
    .corpo { grid-template-columns: 1fr; }
    .lato { position: static; order: -1; }
    .azioni { grid-template-columns: 1fr 1fr; }
    .azioni .pieno { grid-column: 1 / -1; }
  }
  @media (max-width: 720px) {
    .ragazzo { padding: var(--s-3) var(--s-4) var(--s-7); }
    .intesta { gap: var(--s-4); align-items: start; }
    .foto, .foto > :global(.cornice) { width: 84px; }
    .foto > :global(.cornice) { height: 84px; }
    h1 { font-size: 36px; }
    .griglia, .griglia.quattro { grid-template-columns: 1fr; }
    .lato .box:not(.retino) { display: none; }
    .schede { gap: var(--s-4); overflow-x: auto; }
  }
</style>
