<script>
  // Un programma (o protocollo) della biblioteca: moduli con la loro immagine,
  // unità in ordine, menù di attività libere. Le modifiche non toccano i
  // gruppi a cui è già assegnato: lì compare "c'è una versione nuova".
  import { dati, programma, puoGestire, salva, elimina, nomeCompleto } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { DESTINATARI, nuovoModulo, nuovaUnita, nuovaLibera, sposta, daTesto, aTesto } from '../lib/programmi.js';
  import { scegliImmagine, togliImmagine } from '../lib/immagini.js';
  import Immagine from '../components/Immagine.svelte';
  import Editor from '../components/Editor.svelte';
  import Icona from '../components/Icona.svelte';
  import Condivisione from '../components/Condivisione.svelte';

  let { id } = $props();
  const p = $derived(programma(id));
  const gestisce = $derived(puoGestire());

  let timer = null;
  function campo(k, v) {
    p[k] = v;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; salva('programmi', $state.snapshot(p)); }, 500);
  }
  // uscendo si salva solo una modifica ancora in sospeso (guardare non è modificare)
  $effect(() => () => { if (timer) { clearTimeout(timer); timer = null; if (p) salva('programmi', $state.snapshot(p)); } });
  const moduli = (fn) => campo('moduli', fn((p.moduli || []).map((m) => ({ ...m, unita: [...(m.unita || [])] }))));
  const modulo = (i, k, v) => moduli((l) => { l[i] = { ...l[i], [k]: v }; return l; });
  const unita = (i, j, k, v) => moduli((l) => { l[i].unita[j] = { ...l[i].unita[j], [k]: v }; return l; });
  const libera = (j, k, v) => campo('libere', (p.libere || []).map((x, n) => (n === j ? { ...x, [k]: v } : x)));

  // unità aperte (le altre mostrano solo il titolo)
  let aperte = $state(new Set());
  const alterna = (uid) => { const s = new Set(aperte); if (s.has(uid)) s.delete(uid); else s.add(uid); aperte = s; };

  async function immagine(i) {
    try {
      const nuova = await scegliImmagine({ lato: 480 });
      if (!nuova) return;
      const vecchia = p.moduli[i].immagine;
      modulo(i, 'immagine', nuova);
      if (vecchia) togliImmagine(vecchia);
    } catch (e) { alert(e.message); }
  }
  function aggiungiModulo() { const m = nuovoModulo('Nuovo modulo'); moduli((l) => [...l, m]); }
  function aggiungiUnita(i) { const u = nuovaUnita('Nuova unità'); moduli((l) => { l[i].unita.push(u); return l; }); alterna(u.id); }
  function togliModulo(i) {
    const m = p.moduli[i];
    if ((m.unita || []).length && !confirm(`Togliere il modulo «${m.nome || 'senza nome'}» e le sue ${m.unita.length} unità?`)) return;
    moduli((l) => l.filter((_, n) => n !== i));
  }
  function togliUnita(i, j) { if (confirm(`Togliere «${p.moduli[i].unita[j].titolo}»?`)) moduli((l) => { l[i].unita.splice(j, 1); return l; }); }

  // documento incollato → moduli
  let dialogo = $state(), testo = $state(''), modo = $state('aggiungi');
  const anteprima = $derived(testo.trim() ? daTesto(testo) : null);
  function importa() {
    const n = daTesto(testo);
    if (modo === 'sostituisci') { campo('moduli', n.moduli); campo('libere', n.libere); if (n.descrizione && !p.descrizione) campo('descrizione', n.descrizione); }
    else { campo('moduli', [...(p.moduli || []).filter((m) => m.nome || m.unita?.length), ...n.moduli]); campo('libere', [...(p.libere || []), ...n.libere]); }
    testo = ''; dialogo?.close();
  }
  function scaricaTesto() {
    const url = URL.createObjectURL(new Blob([aTesto(p)], { type: 'text/markdown' }));
    const a = document.createElement('a'); a.href = url; a.download = (p.nome || 'programma') + '.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function togli() {
    if (!confirm(`Eliminare «${p.nome}» dalla biblioteca? Nei gruppi a cui è assegnato resta la loro copia.`)) return;
    clearTimeout(timer);
    await elimina('programmi', p.id);
    vai('programmi');
  }
  const assegnato = $derived([
    ...dati.gruppi.filter((g) => (g.programmi || []).some((a) => a.programmaId === id && !a.chiusa)).map((g) => ({ href: '#/gruppo/' + g.id, nome: g.nome })),
    ...dati.ragazzi.filter((r) => (r.programmi || []).some((a) => a.programmaId === id && !a.chiusa)).map((r) => ({ href: '#/ragazzo/' + r.id + '?scheda=1', nome: nomeCompleto(r) })),
  ]);
  const totale = $derived((p?.moduli || []).reduce((n, m) => n + (m.unita || []).length, 0));
</script>

{#if p}
  <div class="programma">
    <header class="testa">
      <a class="torna no-stampa" href="#/programmi"><Icona nome="sinistra" /> Programmi</a>
      <p class="eti">programma · {p.moduli?.length || 0} moduli · {totale} unità{p.libere?.length ? ' · ' + p.libere.length + ' attività libere' : ''}</p>
      {#if gestisce}<input class="input titolo display" value={p.nome} aria-label="Nome del programma" oninput={(e) => campo('nome', e.currentTarget.value)} />
      {:else}<h1 class="display">{p.nome}</h1>{/if}
      <Condivisione {p} />
      <div class="destinatari" role="group" aria-label="Per chi è">
        <span class="sotto piccolo">Per:</span>
        {#each Object.entries(DESTINATARI) as [k, nome] (k)}
          <button type="button" class="chip" aria-pressed={(p.destinatari || []).includes(k)} disabled={!gestisce}
            onclick={() => campo('destinatari', (p.destinatari || []).includes(k) ? p.destinatari.filter((x) => x !== k) : [...(p.destinatari || []), k])}>{nome}</button>
        {/each}
      </div>
      {#if gestisce}<textarea class="input descr" rows="2" placeholder="A cosa serve, per chi, da dove viene (manuale, autori, licenza)" value={p.descrizione || ''} oninput={(e) => campo('descrizione', e.currentTarget.value)}></textarea>
      {:else if p.descrizione}<p class="descr-l">{p.descrizione}</p>{/if}
      {#if assegnato.length}<p class="sotto piccolo">In corso con: {#each assegnato as x, k (x.href)}{k ? ', ' : ''}<a href={x.href}>{x.nome}</a>{/each}</p>{/if}
    </header>

    <ol class="moduli">
      {#each p.moduli || [] as m, i (m.id)}
        <li class="modulo">
          <div class="testa-mod">
            <button type="button" class="img" onclick={() => gestisce && immagine(i)} disabled={!gestisce} title={gestisce ? (m.immagine ? 'Cambia immagine' : 'Aggiungi un\'immagine') : ''} aria-label={'Immagine del modulo ' + (m.nome || '')}>
              <Immagine id={m.immagine} forma="tondo" seme={m.id} iniziale={(m.nome || '?')[0]} piccola tinta={i % 2 ? 'spot' : 'inchiostro'} />
            </button>
            <span class="num display" aria-hidden="true">{i + 1}</span>
            {#if gestisce}<input class="input nome-mod display" value={m.nome} placeholder="Nome del modulo" aria-label="Nome del modulo" oninput={(e) => modulo(i, 'nome', e.currentTarget.value)} />
            {:else}<h2 class="display nome-mod">{m.nome}</h2>{/if}
            {#if gestisce}
              <span class="azioni">
                <button type="button" class="btn nudo piccolo" onclick={() => moduli((l) => sposta(l, i, -1))} disabled={i === 0} aria-label="Sposta su"><Icona nome="su" /></button>
                <button type="button" class="btn nudo piccolo" onclick={() => moduli((l) => sposta(l, i, 1))} disabled={i === p.moduli.length - 1} aria-label="Sposta giù"><Icona nome="giu" /></button>
                {#if m.immagine}<button type="button" class="btn nudo piccolo" onclick={() => { const v = m.immagine; modulo(i, 'immagine', null); togliImmagine(v); }} aria-label="Togli l'immagine" title="Togli l'immagine"><Icona nome="chiudi" /></button>{/if}
                <button type="button" class="btn nudo piccolo" onclick={() => togliModulo(i)} aria-label="Togli il modulo"><Icona nome="cestino" /></button>
              </span>
            {/if}
          </div>
          <ol class="unita">
            {#each m.unita || [] as u, j (u.id)}
              <li class:aperta={aperte.has(u.id)}>
                <div class="riga-u">
                  <button type="button" class="apri-u" onclick={() => alterna(u.id)} aria-expanded={aperte.has(u.id)}>
                    <span class="n">{j + 1}.</span> <span class="tit">{u.titolo || 'Senza titolo'}</span>
                    {#if u.facoltativa}<span class="eti fac">facoltativa</span>{/if}
                    {#if u.durata}<span class="sotto piccolo">{u.durata} min</span>{/if}
                  </button>
                  {#if gestisce}
                    <span class="azioni">
                      <button type="button" class="btn nudo piccolo" onclick={() => moduli((l) => { l[i].unita = sposta(l[i].unita, j, -1); return l; })} disabled={j === 0} aria-label="Sposta su"><Icona nome="su" /></button>
                      <button type="button" class="btn nudo piccolo" onclick={() => moduli((l) => { l[i].unita = sposta(l[i].unita, j, 1); return l; })} disabled={j === m.unita.length - 1} aria-label="Sposta giù"><Icona nome="giu" /></button>
                      <button type="button" class="btn nudo piccolo" onclick={() => togliUnita(i, j)} aria-label="Togli l'unità"><Icona nome="cestino" /></button>
                    </span>
                  {/if}
                </div>
                {#if aperte.has(u.id)}
                  <div class="corpo-u">
                    {#if gestisce}
                      <div class="griglia-u">
                        <label class="campo"><span>Titolo</span><input class="input" value={u.titolo} oninput={(e) => unita(i, j, 'titolo', e.currentTarget.value)} /></label>
                        <label class="campo"><span>Durata (min)</span><input class="input" type="number" min="5" max="600" value={u.durata || ''} oninput={(e) => unita(i, j, 'durata', Number(e.currentTarget.value) || null)} /></label>
                        <label class="campo larga"><span>Obiettivi</span><input class="input" value={u.obiettivi || ''} oninput={(e) => unita(i, j, 'obiettivi', e.currentTarget.value)} /></label>
                      </div>
                      <label class="opz"><input type="checkbox" checked={!!u.facoltativa} onchange={(e) => unita(i, j, 'facoltativa', e.currentTarget.checked)} /> Facoltativa (non si propone da sola, si sceglie)</label>
                    {:else if u.obiettivi}<p><b>Obiettivi:</b> {u.obiettivi}</p>{/if}
                    <Editor testo={u.attivita || ''} compatto etichetta={'Attività di ' + (u.titolo || 'questa unità')} soloLettura={!gestisce}
                      segnaposto="Le attività, anche come lista da spuntare (- [ ] …)" alCambio={(t) => unita(i, j, 'attivita', t)} />
                  </div>
                {/if}
              </li>
            {/each}
          </ol>
          {#if gestisce}<button type="button" class="btn nudo piccolo agg" onclick={() => aggiungiUnita(i)}><Icona nome="piu" /> Unità</button>{/if}
        </li>
      {/each}
    </ol>
    {#if gestisce}<button type="button" class="btn agg-mod" onclick={aggiungiModulo}><Icona nome="piu" /> Modulo</button>{/if}

    <section class="libere">
      <h2 class="eti">Attività libere</h2>
      <p class="sotto piccolo">Un menù da cui pescare quando serve altro (per sciogliere il clima, per un imprevisto): non hanno un ordine e non contano nell'avanzamento.</p>
      <ul>
        {#each p.libere || [] as l, j (l.id)}
          <li class:aperta={aperte.has(l.id)}>
            <div class="riga-u">
              <button type="button" class="apri-u" onclick={() => alterna(l.id)} aria-expanded={aperte.has(l.id)}><span class="tit">{l.titolo || 'Senza titolo'}</span>{#if l.durata}<span class="sotto piccolo">{l.durata} min</span>{/if}</button>
              {#if gestisce}<span class="azioni"><button type="button" class="btn nudo piccolo" onclick={() => { if (confirm(`Togliere «${l.titolo}»?`)) campo('libere', p.libere.filter((_, n) => n !== j)); }} aria-label="Togli l'attività"><Icona nome="cestino" /></button></span>{/if}
            </div>
            {#if aperte.has(l.id)}
              <div class="corpo-u">
                {#if gestisce}
                  <div class="griglia-u">
                    <label class="campo"><span>Titolo</span><input class="input" value={l.titolo} oninput={(e) => libera(j, 'titolo', e.currentTarget.value)} /></label>
                    <label class="campo"><span>Durata (min)</span><input class="input" type="number" min="5" max="600" value={l.durata || ''} oninput={(e) => libera(j, 'durata', Number(e.currentTarget.value) || null)} /></label>
                  </div>
                {/if}
                <Editor testo={l.attivita || ''} compatto etichetta={'Attività ' + (l.titolo || '')} soloLettura={!gestisce} segnaposto="Come si fa" alCambio={(t) => libera(j, 'attivita', t)} />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if gestisce}<button type="button" class="btn nudo piccolo agg" onclick={() => { const l = nuovaLibera('Nuova attività'); campo('libere', [...(p.libere || []), l]); alterna(l.id); }}><Icona nome="piu" /> Attività libera</button>{/if}
    </section>

    <footer class="piede no-stampa">
      {#if gestisce}<button type="button" class="btn nudo piccolo" onclick={() => dialogo?.showModal()}><Icona nome="documento" /> Incolla da un documento…</button>{/if}
      <button type="button" class="btn nudo piccolo" onclick={scaricaTesto}><Icona nome="esporta" /> Scarica come testo</button>
      {#if gestisce}<button type="button" class="btn nudo piccolo" onclick={togli}><Icona nome="cestino" /> Elimina dalla biblioteca</button>{/if}
    </footer>
  </div>

  <dialog bind:this={dialogo} class="dlg-doc" aria-labelledby="doc-titolo">
    <h2 id="doc-titolo" class="display">Incolla da un documento</h2>
    <p class="sotto piccolo">«# Nome» diventa un modulo, «## Titolo» un'unità con il testo che segue come attività. «Obiettivi: …» e «Durata: 50» sotto un'unità si riconoscono. Una sezione «# Attività libere» va nel menù.</p>
    <textarea class="input" rows="12" bind:value={testo} placeholder={'# Problem solving\n## Il problema in tre parole\nObiettivi: riconoscere un problema\n- [ ] cerchio iniziale\n\n# Attività libere\n## Gioco del gomitolo'}></textarea>
    {#if anteprima}<p class="sotto piccolo">Trovati: {anteprima.moduli.filter((m) => m.nome || m.unita.length).length} moduli, {anteprima.moduli.reduce((n, m) => n + m.unita.length, 0)} unità, {anteprima.libere.length} attività libere.</p>{/if}
    <div class="modo">
      <label class="opz"><input type="radio" bind:group={modo} value="aggiungi" /> Aggiungi in fondo</label>
      <label class="opz"><input type="radio" bind:group={modo} value="sostituisci" /> Sostituisci moduli e attività</label>
    </div>
    <div class="bottoni">
      <button type="button" class="btn nudo" onclick={() => dialogo?.close()}>Annulla</button>
      <button type="button" class="btn pieno" onclick={importa} disabled={!anteprima}>Importa</button>
    </div>
  </dialog>
{:else}
  <p class="vuoto">Programma non trovato. <a href="#/programmi">Torna ai programmi</a></p>
{/if}

<style>
  .programma { max-width: 980px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); display: grid; gap: var(--s-5); }
  .testa { display: grid; gap: var(--s-2); }
  .torna { display: inline-flex; align-items: center; gap: 4px; font-size: var(--t-sm); font-weight: 600; text-decoration: none; }
  .titolo, h1 { font-size: var(--t-xl); line-height: 1.05; min-height: 0; padding: 0; border-bottom-color: transparent; }
  .titolo:hover, .titolo:focus { border-bottom-color: var(--matita-forte); }
  .destinatari { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .chip { border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; padding: 3px 12px; font: inherit; font-size: var(--t-sm); font-weight: 600; color: var(--inchiostro-2); cursor: pointer; }
  .chip[aria-pressed='true'] { background: var(--inchiostro); border-color: var(--inchiostro); color: var(--carta); }
  .chip:disabled { cursor: default; }
  .descr { min-height: 0; }
  .descr-l { margin: 0; max-width: 70ch; }
  .moduli { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-4); }
  .modulo { background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande); padding: var(--s-4); display: grid; gap: var(--s-2); }
  .testa-mod { display: grid; grid-template-columns: 64px auto 1fr auto; gap: var(--s-3); align-items: center; }
  .img { width: 64px; height: 64px; padding: 0; border: 0; background: none; cursor: pointer; }
  .img:disabled { cursor: default; }
  .num { font-size: 28px; color: var(--inchiostro-3); }
  .nome-mod { font-size: var(--t-lg); margin: 0; min-height: 0; padding: 2px 0; border-bottom-color: transparent; }
  .nome-mod:hover, .nome-mod:focus { border-bottom-color: var(--matita-forte); }
  .azioni { display: inline-flex; gap: 0; }
  .azioni :global(.ico) { width: 16px; height: 16px; }
  .unita { list-style: none; margin: 0; padding: 0 0 0 calc(64px + var(--s-3)); display: grid; }
  .unita li, .libere li { border-top: 1px dashed var(--matita); }
  .riga-u { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
  .apri-u { all: unset; cursor: pointer; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; padding: 8px 0; flex: 1; min-width: 0; }
  .apri-u:focus-visible { outline: 2px solid var(--spot); outline-offset: 2px; }
  .apri-u .n { color: var(--inchiostro-3); font-variant-numeric: tabular-nums; }
  .apri-u .tit { font-weight: 600; }
  .aperta .apri-u .tit { color: var(--spot-testo); }
  .fac { font-size: 10px; }
  .corpo-u { display: grid; gap: var(--s-2); padding: 0 0 var(--s-3); }
  .griglia-u { display: grid; grid-template-columns: 1fr 120px; gap: var(--s-3); }
  .griglia-u .larga { grid-column: 1 / -1; }
  .opz { display: flex; align-items: center; gap: 6px; font-size: var(--t-sm); cursor: pointer; }
  .opz input { accent-color: var(--spot); }
  .agg { justify-self: start; margin-left: calc(64px + var(--s-3)); }
  .agg-mod { justify-self: start; }
  .libere { display: grid; gap: var(--s-2); }
  .libere ul { list-style: none; margin: 0; padding: 0; }
  .libere .agg { margin-left: 0; }
  .piede { display: flex; flex-wrap: wrap; gap: var(--s-2); border-top: 1px solid var(--matita); padding-top: var(--s-3); }
  .dlg-doc { width: min(94vw, 640px); padding: var(--s-5); border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .dlg-doc::backdrop { background: oklch(0.2 0.02 265 / 0.5); }
  .dlg-doc[open] { display: grid; gap: var(--s-3); }
  .dlg-doc h2 { margin: 0; font-size: var(--t-lg); }
  .dlg-doc p { margin: 0; }
  .dlg-doc textarea { font-family: ui-monospace, monospace; font-size: 13px; }
  .modo { display: flex; flex-wrap: wrap; gap: var(--s-4); }
  .bottoni { display: flex; justify-content: flex-end; gap: var(--s-2); }
  .vuoto { padding: var(--s-6); }
  @media (max-width: 720px) {
    .programma { padding: var(--s-4) var(--s-4) var(--s-7); }
    .testa-mod { grid-template-columns: 52px 1fr auto; }
    .testa-mod .num { display: none; }
    .img { width: 52px; height: 52px; }
    .unita { padding-left: 0; }
    .agg { margin-left: 0; }
  }
</style>
