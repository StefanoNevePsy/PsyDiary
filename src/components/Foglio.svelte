<script>
  import { oraTesto } from '../lib/orario.js';
  import CampoOra from './CampoOra.svelte';
  import CampoData from './CampoData.svelte';
  import { T, M } from '../lib/parole.svelte.js';
  // Il foglio di una seduta: piano, com'è andata, i ragazzi, la prossima volta.
  import {
    dati, gruppo, ragazzo, nomeBreve, nomeCompleto, partecipante, TIPI, titoloSeduta, statoSeduta, partecipantiSeduta, presente,
    aggiornaSeduta, dallaVoltaScorsa, sospesiDi, usaSospeso, aggiungiVoce, successiva, puoModificare, puoGestire, salva, io,
  } from '../lib/dati.svelte.js';
  import { lunga, fineOra, oggi, relativa, breve } from '../lib/date.js';
  import { untrack } from 'svelte';
  import Editor from './Editor.svelte';
  import Md from './Md.svelte';
  import Icona from './Icona.svelte';
  import Immagine from './Immagine.svelte';
  import SerieDialogo from './SerieDialogo.svelte';
  import DalProgramma from './DalProgramma.svelte';
  import { serieDiSeduta, eccezioneSerie, spostaSeduta } from '../lib/dati.svelte.js';
  import { descrivi } from '../lib/serie.js';

  let { s: iniziale, alCambioId = () => {}, pagina = false } = $props();

  // copia locale: si scrive qui subito, si salva poco dopo
  let s = $state(untrack(() => ({ ...iniziale })));
  let stato = $state('');
  let coda = {};
  let timer = null;
  let catena = Promise.resolve();

  function modifica(campi) {
    Object.assign(s, campi);
    Object.assign(coda, campi);
    stato = 'scrivo…';
    clearTimeout(timer);
    timer = setTimeout(scarica, 600);
  }
  function scarica() {
    const campi = coda; coda = {};
    if (!Object.keys(campi).length) return catena;
    catena = catena.then(async () => {
      const prima = s.id;
      const base = dati.sedute.find((x) => x.id === s.id) || s;
      const salvata = await aggiornaSeduta(base, campi);
      s.id = salvata.id; s.virtuale = false; s.autori = salvata.autori;
      if (prima !== salvata.id) alCambioId(salvata.id);
      stato = 'salvato';
    }).catch((e) => { stato = 'non salvato: ' + e.message; });
    return catena;
  }
  $effect(() => () => { clearTimeout(timer); scarica(); });

  // modifiche arrivate da un altro dispositivo mentre il foglio è aperto
  const salvata = $derived(dati.sedute.find((x) => x.id === s.id));
  $effect(() => {
    const x = salvata;
    if (!x) return;
    const campi = $state.snapshot(x);
    untrack(() => {
      if (Object.keys(coda).length) return;   // sto scrivendo io: prima si salva
      for (const k of ['argomento', 'resoconto', 'prossima', 'presenze', 'partecipanti', 'chi', 'autori', 'ora', 'data', 'programma']) {
        if (JSON.stringify(campi[k]) !== JSON.stringify(s[k])) s[k] = campi[k];
      }
    });
  });

  const g = $derived(s.tipo === 'gruppo' ? gruppo(s.gruppoId) : null);
  const r = $derived(s.ragazzoId ? ragazzo(s.ragazzoId) : null);
  const statoS = $derived(statoSeduta(s));
  const membri = $derived(partecipantiSeduta(s));
  const persone = $derived(membri.map((id) => partecipante(s, id)));
  // Su ciascuno: con pochi presenti tutte le note aperte; con tanti (una classe)
  // i nomi in fila, e si apre la nota di chi si tocca. Si può scrivere anche su
  // chi del gruppo quel giorno non risultava (entrato dopo, uscito prima).
  const POCHI = 4;
  const conNota = (id) => !!String((s.partecipanti || {})[id] || '').trim();
  let aperti = $state([]);
  let tutte = $state(false);
  const presenti = $derived(persone.filter((p) => presente(s, p.id)));
  const altri = $derived.by(() => {
    const qui = new Set(membri);
    const ids = new Set([...Object.keys(s.partecipanti || {}).filter(conNota), ...(g?.membri || []).filter((m) => !m.al || m.al >= s.data).map((m) => m.ragazzoId)]);
    return [...ids].filter((id) => !qui.has(id)).map((id) => partecipante(s, id));
  });
  const raccolte = $derived(presenti.length > POCHI && !tutte);
  const aperta = (p) => !raccolte || conNota(p.id) || aperti.includes(p.id);
  const conEditor = $derived([...presenti.filter(aperta), ...altri.filter((p) => conNota(p.id) || aperti.includes(p.id))]);
  const daAprire = $derived(presenti.filter((p) => !aperta(p)));
  const altriDaAprire = $derived(altri.filter((p) => !conNota(p.id) && !aperti.includes(p.id)));
  function apriNota(id) {
    if (!aperti.includes(id)) aperti = [...aperti, id];
    // il fuoco nella nota appena aperta
    requestAnimationFrame(() => document.querySelector(`[data-nota-su="${CSS.escape(id)}"] [contenteditable]`)?.focus());
  }
  // presenze: con tanti nomi (una classe) si raccolgono, si aprono per segnare gli assenti
  let presenzeAperte = $state(false);
  const assentiN = $derived(persone.filter((p) => !presente(s, p.id)).length);
  const scorsa = $derived(dallaVoltaScorsa(s));
  const inSospeso = $derived(s.tipo === 'gruppo' ? sospesiDi('gruppo', s.gruppoId) : s.ragazzoId ? sospesiDi('ragazzo', s.ragazzoId) : []);
  const prossimaSeduta = $derived(successiva(s));
  const futura = $derived(s.data > oggi());
  const mia = (campo) => puoModificare(s.autori?.[campo], s[campo]);

  function alternaPresenza(rid) {
    const p = { ...(s.presenze || {}) };
    if (p[rid] === false) delete p[rid]; else p[rid] = false;
    modifica({ presenze: p });
  }
  function prendiDallaScorsa() {
    let a = s.argomento || '';
    if (scorsa.prossima) a = (a ? a.replace(/\s+$/, '') + '\n' : '') + scorsa.prossima;
    for (const x of scorsa.rimasti) if (!a.includes(x)) a = aggiungiVoce(a, x);
    modifica({ argomento: a });
    editorArgomento++;
  }
  async function usa(sosp) {
    await scarica();
    const vera = await usaSospeso(sosp, dati.sedute.find((x) => x.id === s.id) || s);
    if (s.id !== vera.id) alCambioId(vera.id);
    s = { ...vera };
    editorArgomento++;
  }
  // appuntamento ricorrente: sposta, salta, gestisci la serie
  const laSerie = $derived(serieDiSeduta(s));
  let spostando = $state(false);
  let nuovaData = $state('');
  let nuovaOra = $state('');
  let nuovaDurata = $state(60);
  let gestisci = $state(false);
  function iniziaSposta() { nuovaData = s.data; nuovaOra = s.ora; nuovaDurata = s.durata || 60; spostando = true; }
  async function sposta(e) {
    e.preventDefault();
    await scarica();
    const base = dati.sedute.find((x) => x.id === s.id) || s;
    const vera = await spostaSeduta(base, nuovaData, nuovaOra, nuovaDurata);
    Object.assign(s, { id: vera.id, data: vera.data, ora: vera.ora, durata: vera.durata, virtuale: false });
    spostando = false;
    alCambioId(vera.id);
  }
  async function annulla() {
    const vuota = !s.argomento && !s.resoconto && !s.prossima && !Object.values(s.partecipanti || {}).some(Boolean);
    if (s.virtuale && laSerie && vuota) {
      // una data della serie che non si fa: niente seduta da conservare
      if (!confirm('Saltare questo appuntamento? Gli altri della serie restano.')) return;
      clearTimeout(timer); coda = {};
      await eccezioneSerie(laSerie, s.data, 'saltata');
      alCambioId(null, true);
      return;
    }
    if (!confirm('Segnare la seduta come non svolta? Resta nello storico, ma sparisce dal calendario.')) return;
    await scarica();
    const base = dati.sedute.find((x) => x.id === s.id) || s;
    const vera = await aggiornaSeduta(base, { annullata: true });
    alCambioId(vera.id, true);
  }
  // per ricreare l'editor quando il piano cambia da un pulsante
  let editorArgomento = $state(0);
  // programmi: collegare un'unità porta le sue attività nel piano
  function collegaUnita(prog, testo) {
    let a = s.argomento || '';
    if (testo && !a.includes(testo.split('\n')[0])) a = (a.trim() ? a.replace(/\s+$/, '') + '\n\n' : '') + testo;
    modifica({ programma: prog, argomento: a });
    editorArgomento++;
  }
  const scollegaUnita = () => modifica({ programma: null });
  const esitoUnita = (e) => modifica({ programma: { ...s.programma, esito: e || undefined } });
  const dataTitolo = $derived(lunga(s.data));
</script>

<article class="foglio" class:pagina aria-labelledby="titolo-seduta">
  <header>
    {#if laSerie}
      <div class="serie-riga no-stampa">
        <span class="mano">↻</span><span class="sotto piccolo">{descrivi(laSerie)}</span>
        {#if puoGestire()}
          <button type="button" class="link" onclick={iniziaSposta}>sposta</button>
          <button type="button" class="link" onclick={annulla}>salta</button>
          <button type="button" class="link" onclick={() => (gestisci = true)}>tutta la serie…</button>
        {/if}
      </div>
    {/if}
    {#if spostando}
      <form class="sposta no-stampa" onsubmit={sposta}>
        {#if laSerie}<span class="eti">Solo questa volta</span>{/if}
        <CampoData bind:value={nuovaData} required etichetta="Data" />
        <CampoOra bind:value={nuovaOra} required etichetta="Ora di inizio" />
        <label class="durata"><input class="input" type="number" min="5" max="600" step="1" inputmode="numeric" bind:value={nuovaDurata} required aria-label="Durata in minuti" /><span class="sotto piccolo">min</span></label>
        <button class="btn pieno piccolo">Salva</button>
        <button type="button" class="btn nudo piccolo" onclick={() => (spostando = false)}>Annulla</button>
      </form>
    {/if}
    <p class="eti">
      {dataTitolo} ·
      {#if puoGestire() || !laSerie}<button type="button" class="orario link" title="Cambia data, ora e durata" onclick={iniziaSposta}>{oraTesto(s.ora)}–{oraTesto(fineOra(s.ora, s.durata))}</button>{:else}{oraTesto(s.ora)}–{oraTesto(fineOra(s.ora, s.durata))}{/if}
      · {TIPI[s.tipo].breve}
      {#if statoS === 'da-scrivere'}<span class="mano segno">da scrivere</span>{/if}
      {#if statoS === 'oggi'}<span class="mano segno">oggi</span>{/if}
    </p>
    <h2 id="titolo-seduta" class="display">
      {#if g}<a href={'#/gruppo/' + g.id}>{g.nome}</a>{:else if r}<a href={'#/ragazzo/' + r.id}>{titoloSeduta(s)}</a>{/if}
    </h2>
    {#if g && g.tema}<p class="tema sotto">{g.tema}</p>{/if}
    {#if s.tipo === 'genitori' || s.tipo === 'conoscenza'}
      <label class="chi"><span class="eti">Chi c'era</span>
        <input class="input" value={s.chi || ''} placeholder="es. madre e padre" oninput={(e) => modifica({ chi: e.currentTarget.value })} /></label>
    {/if}
    {#if s.tipo === 'gruppo' && persone.length}
      {#if persone.length > 8 && !presenzeAperte}
        <button type="button" class="link presenze-sommario" onclick={() => (presenzeAperte = true)}>{persone.length - assentiN} presenti{assentiN ? ` · ${assentiN} assent${assentiN > 1 ? 'i' : 'e'}` : ''} · segna le assenze</button>
      {:else}
        <ul class="presenze" aria-label="Presenze: tocca per segnare un'assenza">
          {#each persone as p (p.id)}
            <li><button type="button" class:assente={!presente(s, p.id)} aria-pressed={presente(s, p.id)} onclick={() => alternaPresenza(p.id)} title={presente(s, p.id) ? 'Presente: tocca per segnarlo assente' : 'Assente'}><span class="av"><Immagine id={p.foto} forma="tondo" seme={p.id} iniziale={(p.breve || '?')[0]} piccola colori={false} /></span>{p.breve}</button></li>
          {/each}
          {#if persone.length > 8}<li><button type="button" class="link" onclick={() => (presenzeAperte = false)}>fatto</button></li>{/if}
        </ul>
      {/if}
    {/if}
  </header>

  {#if scorsa && !futura || scorsa && !s.argomento}
    <aside class="scorsa">
      <p class="eti">Dalla volta scorsa · <a href={'#/seduta/' + scorsa.seduta.id}>{breve(scorsa.seduta.data)}</a></p>
      {#if scorsa.prossima}<Md testo={scorsa.prossima} />{/if}
      {#if scorsa.rimasti.length}
        <p class="sotto piccolo">Rimasto da fare: {scorsa.rimasti.join(' · ')}</p>
      {/if}
      <button class="btn piccolo" onclick={prendiDallaScorsa}><Icona nome="freccia" /> Portalo nel piano</button>
    </aside>
  {/if}

  {#if s.tipo === 'gruppo' || s.tipo === 'individuale'}
    <DalProgramma {s} collega={collegaUnita} scollega={scollegaUnita} esito={esitoUnita} />
  {/if}

  <section class="sez">
    <h3><span class="margine mano">piano</span><span class="eti">{futura ? 'Cosa voglio fare' : 'Argomento'}</span></h3>
    <div class="retino piano">
      {#key editorArgomento}
        <Editor testo={s.argomento} compatto etichetta="Argomento della seduta" soloLettura={!mia('argomento')}
          segnaposto={futura ? 'Scrivi l\'argomento o una lista di cose da fare (- [ ] …)' : 'Di cosa si è parlato'}
          alCambio={(t) => modifica({ argomento: t })} />
      {/key}
    </div>
    {#if s.autori?.argomento && s.autori.argomento !== io().nome}<p class="autore">di {s.autori.argomento}</p>{/if}
    {#if inSospeso.length}
      <div class="sospesi">
        <span class="eti">In sospeso</span>
        {#each inSospeso as q (q.id)}
          <button class="sosp" onclick={() => usa(q)} title="Aggiungi al piano di questa seduta">+ {q.testo}</button>
        {/each}
      </div>
    {/if}
  </section>

  {#if !futura}
    <section class="sez">
      <h3><span class="margine mano">com'è andata</span><span class="eti">Resoconto</span></h3>
      <Editor testo={s.resoconto} etichetta="Resoconto" soloLettura={!mia('resoconto')}
        segnaposto="Clima, cosa è emerso, cosa ha funzionato. #tag e @nomi per ritrovarlo dopo"
        alCambio={(t) => modifica({ resoconto: t })} />
      {#if s.autori?.resoconto && s.autori.resoconto !== io().nome}<p class="autore">di {s.autori.resoconto}</p>{/if}
    </section>

    {#if s.tipo === 'gruppo'}
      <section class="sez">
        <h3><span class="margine mano">{T('i')}</span><span class="eti">Su ciascuno</span></h3>
        {#each conEditor as p (p.id)}
          <div class="part" data-nota-su={p.id}>
            {#if p.paziente}<a class="chi display" href={'#/ragazzo/' + p.id}>{p.breve}</a>{:else}<span class="chi display">{p.breve}</span>{/if}
            <Editor testo={(s.partecipanti || {})[p.id] || ''} compatto etichetta={'Nota su ' + p.completo}
              segnaposto="—" alCambio={(t) => modifica({ partecipanti: { ...(s.partecipanti || {}), [p.id]: t } })} />
          </div>
        {/each}
        {#if daAprire.length}
          <div class="nomi" role="group" aria-label="Scrivi una nota su…">
            <span class="sotto piccolo">{conEditor.length ? 'Anche su:' : 'Tocca un nome per scrivere:'}</span>
            {#each daAprire as p (p.id)}<button type="button" class="chip" onclick={() => apriNota(p.id)}><Icona nome="piu" />{p.breve}</button>{/each}
            <button type="button" class="link" onclick={() => (tutte = true)}>apri tutte</button>
          </div>
        {/if}
        {#if altriDaAprire.length}
          <div class="nomi" role="group" aria-label="Altri del gruppo">
            <span class="sotto piccolo" title="Nel gruppo, ma non in questa data">Altri del gruppo:</span>
            {#each altriDaAprire as p (p.id)}<button type="button" class="chip tenue" onclick={() => apriNota(p.id)}><Icona nome="piu" />{p.breve}</button>{/each}
          </div>
        {/if}
        {#if !persone.length && !altri.length}
          <p class="sotto piccolo">Nessuno nel gruppo: aggiungi i partecipanti dalla <a href={'#/gruppo/' + s.gruppoId}>pagina del gruppo</a>.</p>
        {/if}
        {#if persone.some((p) => !presente(s, p.id))}
          <p class="sotto piccolo assenti">Assenti: {persone.filter((p) => !presente(s, p.id)).map((p) => p.breve).join(', ')}</p>
        {/if}
      </section>
    {/if}
  {:else}
    <p class="futura sotto">Il resoconto si scrive dopo la seduta. Intanto il piano resta qui, e il {relativa(s.data)} te lo ritrovi pronto.</p>
  {/if}

  <section class="sez">
    <h3><span class="margine mano">la prossima volta</span><span class="eti">Per la prossima volta</span></h3>
    <Editor testo={s.prossima || ''} compatto etichetta="Per la prossima volta"
      segnaposto="Diventa il piano della prossima seduta" alCambio={(t) => modifica({ prossima: t })} />
    {#if prossimaSeduta}<p class="sotto piccolo">Prossima: <a href={'#/seduta/' + encodeURIComponent(prossimaSeduta.id)}>{lunga(prossimaSeduta.data)}, {oraTesto(prossimaSeduta.ora)}</a></p>{/if}
  </section>

  <footer>
    <span class="sotto piccolo" aria-live="polite">{stato}</span>
    {#if puoGestire() && !s.annullata}<button class="btn nudo piccolo" onclick={annulla}>Non svolta</button>{/if}
  </footer>
</article>
{#if gestisci && laSerie}<SerieDialogo se={laSerie} chiudi={() => (gestisci = false)} />{/if}

<style>
  .foglio {
    position: relative; background: var(--carta-2); box-shadow: var(--ombra); border-radius: var(--r-grande);
    padding: var(--s-5) var(--s-6) var(--s-5) 88px; display: grid; gap: var(--s-5); align-content: start;
  }
  .foglio::before { content: ''; position: absolute; left: 68px; top: 0; bottom: 0; width: 1.5px; background: var(--spot); opacity: 0.55; }
  header { display: grid; gap: var(--s-2); }
  .serie-riga { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .serie-riga .mano { font-size: 18px; }
  .link { border: 0; background: none; padding: 0; font: inherit; font-size: var(--t-sm); font-weight: 600; color: var(--spot-testo); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .sposta { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; padding: var(--s-2) var(--s-3); border: 1px dashed var(--matita-forte); border-radius: var(--r); }
  .sposta .input { width: auto; min-height: 34px; }
  header .eti { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .segno { font-size: 19px; letter-spacing: 0; text-transform: none; }
  h2 { font-size: var(--t-xl); line-height: 1.02; }
  h2 a { text-decoration: none; }
  h2 a:hover { text-decoration: underline; text-decoration-color: var(--spot); text-decoration-thickness: 1.5px; text-underline-offset: 6px; }
  .tema { margin-top: -4px; font-size: var(--t-nota); }
  .chi { display: grid; max-width: 320px; }
  .presenze { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .presenze .av { width: 26px; height: 26px; flex: none; }
  .presenze .av :global(.iniziale) { font-size: 12px; }
  .presenze .assente .av { opacity: 0.4; }
  .presenze button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 4px 0; font-weight: 600; font-size: var(--t-ui); cursor: pointer; color: var(--inchiostro); }
  .presenze button:hover { color: var(--spot-testo); }
  .presenze button.assente { color: var(--inchiostro-3); text-decoration: line-through; text-decoration-color: var(--spot); font-weight: 400; }
  .scorsa { border-radius: var(--r-grande); display: grid; gap: 6px; padding: var(--s-3) var(--s-4); border: 1px dashed var(--spot); background: var(--spot-tenue); justify-items: start; }
  .scorsa :global(.md) { font-size: var(--t-ui); }
  .sez { position: relative; display: grid; gap: var(--s-2); }
  .sez h3 { display: flex; align-items: baseline; }
  .margine {
    position: absolute; left: -84px; width: 64px; text-align: right; font-size: 17px;
    transform: rotate(-5deg); transform-origin: right; line-height: 1;
  }
  .piano { padding: var(--s-2) var(--s-3); border-radius: var(--r); }
  .autore { font-size: var(--t-xs); color: var(--inchiostro-3); font-style: italic; }
  .sospesi { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: baseline; }
  .sospesi .eti { width: 100%; }
  .sosp { border: 1px dashed var(--matita-forte); background: transparent; border-radius: 999px; padding: 3px 12px; font-size: var(--t-sm); cursor: pointer; }
  .sosp:hover { border-style: solid; border-color: var(--spot); }
  .part { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: var(--s-3); align-items: baseline; padding: 6px 0; border-top: 1px dashed var(--matita); }
  .part .chi { font-size: 17px; text-decoration: none; line-height: 1.3; }
  .assenti { margin-top: 4px; }
  .nomi { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-top: 6px; border-top: 1px dashed var(--matita); }
  .nomi .chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--matita-forte); background: transparent; color: var(--inchiostro); border-radius: 999px; padding: 3px 10px 3px 6px; font: inherit; font-size: var(--t-sm); font-weight: 600; cursor: pointer; }
  .nomi .chip:hover { border-color: var(--spot); color: var(--spot-testo); }
  .nomi .chip.tenue { border-style: dashed; font-weight: 400; color: var(--inchiostro-2); }
  .nomi :global(.ico) { width: 14px; height: 14px; }
  .presenze-sommario { justify-self: start; margin-top: 4px; }
  .futura { font-style: italic; max-width: 52ch; }
  footer { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); border-top: 1px solid var(--matita); padding-top: var(--s-3); }
  @media (max-width: 720px) {
    .foglio { padding: var(--s-4) var(--s-4) var(--s-5) 40px; box-shadow: none; }
    .foglio::before { left: 26px; }
    .margine { display: none; }
    h2 { font-size: var(--t-lg); }
    .part { grid-template-columns: 1fr; gap: 0; }
  }
  .orario { font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
  .durata { display: inline-flex; align-items: center; gap: 4px; }
  .durata .input { width: 5.5em; }
</style>
