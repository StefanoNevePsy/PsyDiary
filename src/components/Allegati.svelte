<script>
  import { T, M } from '../lib/parole.svelte.js';
  // Allegati dell'anagrafica: genogrammi, relazioni, documenti. Cifrati e
  // sincronizzati come le foto; li vede solo chi vede l'anagrafica.
  import { salvaAllegato, urlAllegato, urlImmagine, togliImmagine, testoAllegato } from '../lib/immagini.js';
  import { leggiGenogrammi } from '../lib/genogramma.js';
  import Genogramma from './geno/Genogramma.svelte';
  import { breveAnno } from '../lib/date.js';
  import Icona from './Icona.svelte';

  let { elenco = [], gestisce = false, alCambio } = $props();
  let scelta = $state(), lavoro = $state(false), errore = $state('');
  let vista = $state(null);          // { url, nome } dell'immagine aperta, o { geno, nome }
  let dialogo = $state();

  const eImmagine = (a) => /^image\//.test(a.tipo || '');
  const eGeno = (a) => !!a.genogramma;
  // I dati di un genogramma allegato (letti una volta, poi dalla memoria)
  const dati = new Map();
  function datiGeno(a) {
    if (!dati.has(a.id)) dati.set(a.id, testoAllegato(a.id).then((t) => (t ? leggiGenogrammi(t)[0] || null : null)).catch(() => null));
    return dati.get(a.id);
  }
  // Un file di GenoGram Creator (anche il backup con tanti genogrammi): si sceglie quali allegare
  let scegliGeno = $state(null);     // { elenco: [...], scelti: Set }
  let dialogoScelta = $state();
  async function genogrammiDa(f) {
    if (!/\.json$/i.test(f.name) && f.type !== 'application/json') return null;
    const l = leggiGenogrammi(await f.text());
    return l.length ? l : null;
  }
  async function allegaGenogrammi(lista) {
    let nuovo = [...(elenco || [])];
    for (const g of lista) {
      const file = new File([JSON.stringify({ id: g.id, title: g.titolo, lastModified: g.modificato, data: g.data })], g.titolo + '.genogramma.json', { type: 'application/json' });
      const a = { ...(await salvaAllegato(file)), nome: g.titolo, genogramma: { id: g.id, titolo: g.titolo, modificato: g.modificato } };
      // lo stesso genogramma già allegato: si aggiorna al posto suo
      const k = nuovo.findIndex((x) => x.genogramma?.id === g.id);
      if (k >= 0) { togliImmagine(nuovo[k].id); dati.delete(nuovo[k].id); nuovo[k] = { ...a, nome: nuovo[k].nome }; } else nuovo.push(a);
    }
    alCambio(nuovo);
  }
  const peso = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const estensione = (a) => (String(a.nome).split('.').pop() || '').slice(0, 4).toUpperCase();

  async function aggiungi(e) {
    const file = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!file.length) return;
    lavoro = true; errore = '';
    const nuovi = [];
    for (const f of file) {
      try {
        const geno = await genogrammiDa(f);
        if (geno && geno.length === 1) { await allegaGenogrammi(geno); continue; }
        if (geno) { scegliGeno = { elenco: geno, scelti: new Set() }; queueMicrotask(() => dialogoScelta?.showModal()); continue; }
        nuovi.push(await salvaAllegato(f));
      } catch (x) { errore = x.message; }
    }
    lavoro = false;
    if (nuovi.length) alCambio([...(elenco || []), ...nuovi]);
  }
  async function apri(a) {
    const url = await urlAllegato(a.id, a.tipo);
    if (!url) { errore = `«${a.nome}» non è ancora su questo dispositivo: riprova quando c'è rete.`; return; }
    if (eGeno(a)) {
      URL.revokeObjectURL(url);
      const g = await datiGeno(a);
      if (!g) { errore = `«${a.nome}» non si riesce a leggere.`; return; }
      vista = { geno: g, nome: a.nome }; queueMicrotask(() => dialogo?.showModal()); return;
    }
    if (eImmagine(a)) { vista = { url, nome: a.nome }; queueMicrotask(() => dialogo?.showModal()); return; }
    // PDF e documenti: nel visualizzatore del sistema, o scaricati se non si possono mostrare
    const w = /pdf|text\//.test(a.tipo) ? window.open(url, '_blank') : null;
    if (!w) scarica(a, url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function scarica(a, url0) {
    const url = url0 || (await urlAllegato(a.id, a.tipo));
    if (!url) return;
    const l = document.createElement('a');
    l.href = url; l.download = a.nome || 'allegato'; document.body.appendChild(l); l.click(); l.remove();
  }
  function rinomina(a) {
    const n = prompt('Nome dell\'allegato', a.nome);
    if (!n || !n.trim() || n.trim() === a.nome) return;
    alCambio(elenco.map((x) => (x.id === a.id ? { ...x, nome: n.trim() } : x)));
  }
  function togli(a) {
    if (!confirm(`Togliere «${a.nome}» dall'anagrafica?`)) return;
    alCambio(elenco.filter((x) => x.id !== a.id));
    togliImmagine(a.id);
  }
  function chiudiVista() { dialogo?.close(); if (vista?.url) URL.revokeObjectURL(vista.url); vista = null; }
  async function confermaGeno() {
    const l = scegliGeno.elenco.filter((g) => scegliGeno.scelti.has(g.id));
    dialogoScelta?.close(); scegliGeno = null;
    if (l.length) { lavoro = true; try { await allegaGenogrammi(l); } catch (x) { errore = x.message; } lavoro = false; }
  }
</script>

<section class="allegati">
  <h3 class="eti titolo-sez"><Icona nome="graffetta" /> Allegati e genogrammi</h3>
  {#if elenco?.length}
    <ul class="carte">
      {#each elenco as a (a.id)}
        <li class="carta">
          <button type="button" class="anteprima" onclick={() => apri(a)} aria-label={'Apri ' + a.nome}>
            {#if eGeno(a)}
              {#await datiGeno(a) then g}
                {#if g}<span class="mini-geno"><Genogramma data={g.data} titolo={a.nome} anteprima /></span>{:else}<span class="segno"><Icona nome="documento" /></span>{/if}
              {/await}
            {:else if eImmagine(a)}
              {#await urlImmagine(a.id, true) then u}
                {#if u}<img src={u} alt="" loading="lazy" />{:else}<span class="segno"><Icona nome="graffetta" /></span>{/if}
              {/await}
            {:else}
              <span class="segno"><Icona nome="documento" /><b>{estensione(a)}</b></span>
            {/if}
          </button>
          <div class="info">
            <button type="button" class="nome" onclick={() => apri(a)} title={a.nome}>{a.nome}</button>
            <span class="sotto piccolo">{eGeno(a) ? 'genogramma' : a.peso ? peso(a.peso) : ''}{a.aggiunto ? ' · ' + breveAnno(a.aggiunto) : ''}</span>
          </div>
          <div class="azioni no-stampa">
            <button type="button" class="btn nudo piccolo" onclick={() => scarica(a)} aria-label={'Scarica ' + a.nome} title="Scarica"><Icona nome="esporta" /></button>
            {#if gestisce}
              <button type="button" class="btn nudo piccolo" onclick={() => rinomina(a)} aria-label={'Rinomina ' + a.nome} title="Rinomina"><Icona nome="matita" /></button>
              <button type="button" class="btn nudo piccolo" onclick={() => togli(a)} aria-label={'Togli ' + a.nome} title="Togli"><Icona nome="cestino" /></button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="sotto piccolo">Genogrammi, relazioni, certificazioni: immagini (anche SVG), PDF e documenti fino a 5 MB. Un genogramma esportato da GenoGram Creator (file .json, anche il backup) viene ridisegnato qui, nel tema.</p>
  {/if}
  {#if errore}<p class="avviso">{errore}</p>{/if}
  {#if gestisce}
    <label class="btn nudo piccolo aggiungi no-stampa" class:lavoro>
      <Icona nome="piu" /> {lavoro ? 'Preparo…' : 'Allega un file'}
      <input bind:this={scelta} type="file" multiple accept="image/*,.svg,application/pdf,.pdf,.doc,.docx,.odt,.txt,.json,application/json" onchange={aggiungi} disabled={lavoro} />
    </label>
  {/if}
</section>

{#if vista}
  <dialog bind:this={dialogo} class="vista" class:geno={!!vista.geno} onclose={chiudiVista} aria-label={vista.nome}>
    <header><span class="display">{vista.nome}</span><button type="button" class="btn nudo" onclick={chiudiVista} aria-label="Chiudi"><Icona nome="chiudi" /></button></header>
    {#if vista.geno}<div class="tela-geno"><Genogramma data={vista.geno.data} titolo={vista.nome} /></div>
    {:else}<div class="tela"><img src={vista.url} alt={vista.nome} /></div>{/if}
  </dialog>
{/if}

{#if scegliGeno}
  <dialog bind:this={dialogoScelta} class="scelta-geno" onclose={() => (scegliGeno = null)} aria-label="Quali genogrammi allegare">
    <h2 class="display">Quali genogrammi?</h2>
    <p class="sotto piccolo">Il file contiene {scegliGeno.elenco.length} genogrammi: alleghi a questa anagrafica solo quelli di {T('questo')}. Gli altri non vengono salvati.</p>
    <ul>
      {#each scegliGeno.elenco as g (g.id)}
        <li><label><input type="checkbox" checked={scegliGeno.scelti.has(g.id)} onchange={(e) => { const s = new Set(scegliGeno.scelti); if (e.currentTarget.checked) s.add(g.id); else s.delete(g.id); scegliGeno = { ...scegliGeno, scelti: s }; }} />
          <span>{g.titolo}</span><small class="sotto">{g.data.nodes.length} persone{g.modificato ? ' · ' + new Date(g.modificato).toLocaleDateString('it-IT') : ''}</small></label></li>
      {/each}
    </ul>
    <div class="bottoni"><button type="button" class="btn nudo" onclick={() => dialogoScelta?.close()}>Annulla</button><button type="button" class="btn pieno" disabled={!scegliGeno.scelti.size} onclick={confermaGeno}>Allega {scegliGeno.scelti.size || ''}</button></div>
  </dialog>
{/if}

<style>
  .allegati { display: grid; gap: var(--s-3); }
  .titolo-sez { display: flex; align-items: center; gap: 6px; }
  .carte { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s-3); }
  .carta { display: grid; grid-template-rows: auto auto auto; background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r); overflow: hidden; }
  .anteprima { display: grid; place-items: center; height: 120px; padding: 0; border: 0; border-bottom: 1px dashed var(--matita); background: var(--carta-3); cursor: zoom-in; }
  .anteprima img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .segno { display: grid; justify-items: center; gap: 2px; color: var(--inchiostro-2); }
  .segno :global(.ico) { width: 34px; height: 34px; }
  .segno b { font-size: var(--t-xs); letter-spacing: 0.1em; }
  .info { display: grid; padding: var(--s-2) var(--s-3) 0; min-width: 0; }
  .nome { all: unset; cursor: pointer; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nome:focus-visible { outline: 2px solid var(--spot); outline-offset: 2px; }
  .azioni { display: flex; justify-content: flex-end; padding: 0 var(--s-1) var(--s-1); }
  .aggiungi { position: relative; width: max-content; cursor: pointer; }
  .aggiungi input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .aggiungi.lavoro { opacity: 0.6; }
  .avviso { color: var(--spot-testo); font-size: var(--t-sm); }
  .vista { width: min(96vw, 1200px); max-height: 94vh; padding: 0; border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .vista::backdrop { background: oklch(0.2 0.02 265 / 0.6); }
  .vista header { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-2) var(--s-3) var(--s-2) var(--s-4); border-bottom: 1px solid var(--matita); }
  .vista .tela { overflow: auto; max-height: calc(94vh - 60px); background: #fff; }
  .vista .tela img { display: block; max-width: 100%; margin: 0 auto; }
  .mini-geno { display: block; width: 100%; height: 100%; }
  .vista.geno { width: min(98vw, 1400px); height: 92vh; }
  .vista.geno[open] { display: flex; flex-direction: column; }
  .tela-geno { flex: 1; min-height: 0; }
  .scelta-geno { width: min(92vw, 460px); padding: var(--s-5); border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .scelta-geno::backdrop { background: oklch(0.2 0.02 265 / 0.5); }
  .scelta-geno h2 { font-size: var(--t-lg); margin: 0 0 var(--s-2); }
  .scelta-geno ul { list-style: none; margin: var(--s-3) 0; padding: 0; max-height: 50vh; overflow: auto; }
  .scelta-geno label { display: grid; grid-template-columns: auto 1fr; gap: 0 var(--s-2); padding: 8px 0; border-bottom: 1px dashed var(--matita); cursor: pointer; }
  .scelta-geno label small { grid-column: 2; }
  .scelta-geno input { accent-color: var(--spot); }
  .scelta-geno .bottoni { display: flex; justify-content: flex-end; gap: var(--s-2); }
</style>
