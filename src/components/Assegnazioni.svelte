<script>
  // I programmi assegnati a un gruppo, una classe o un paziente: avanzamento,
  // ordine dei moduli (solo per lui: "Anticipa" porta un modulo per primo),
  // unità saltate, versione nuova dalla biblioteca. La copia vive dentro il
  // soggetto, quindi ne segue la riservatezza.
  import { dati, programma, programmiVisibili } from '../lib/dati.svelte.js';
  import { oggi, breve } from '../lib/date.js';
  import { assegna, unitaInOrdine, statoUnita, avanzamento, prossima, anticipa, sposta, aggiornaDa, daAggiornare, adatto } from '../lib/programmi.js';
  import Immagine from './Immagine.svelte';
  import Icona from './Icona.svelte';
  import Scelta from './Scelta.svelte';

  // o: gruppo o paziente · tipo: 'gruppo' | 'classe' | 'individuale'
  let { o, tipo, gestisce = false, alCambio } = $props();
  const sedute = $derived(dati.sedute.filter((s) => (tipo === 'individuale' ? s.ragazzoId === o.id && s.tipo === 'individuale' : s.tipo === 'gruppo' && s.gruppoId === o.id)));
  const attive = $derived((o.programmi || []).filter((a) => !a.chiusa));
  const chiuse = $derived((o.programmi || []).filter((a) => a.chiusa));
  const disponibili = $derived(programmiVisibili().filter((p) => adatto(p, tipo) && !attive.some((a) => a.programmaId === p.id)));
  let scelto = $state('');
  let aperta = $state(null);           // id dell'assegnazione aperta nel dettaglio

  const cambia = (aid, fn) => alCambio((o.programmi || []).map((a) => (a.id === aid ? fn(a) : a)));
  function nuova() {
    const p = programma(scelto);
    if (!p) return;
    alCambio([...(o.programmi || []), assegna($state.snapshot(p), oggi())]);
    scelto = '';
  }
  const ETI = { fatta: 'fatta', prevista: 'prevista', saltata: 'saltata', 'da-fare': '' };
</script>

<section class="assegnazioni">
  <h3 class="eti titolo-sez"><Icona nome="programma" /> Programmi</h3>
  {#each attive as a (a.id)}
    {@const st = statoUnita(a, sedute)}
    {@const av = avanzamento(a, sedute)}
    {@const pr = prossima(a, sedute)}
    {@const lib = programma(a.programmaId)}
    <article class="as">
      <header>
        <a class="nome display" href={'#/programma/' + a.programmaId}>{a.nome}</a>
        <span class="sotto piccolo">{av.fatte} di {av.totale}{a.dal ? ' · dal ' + breve(a.dal) : ''}</span>
      </header>
      <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax={av.totale} aria-valuenow={av.fatte} aria-label={'Avanzamento ' + a.nome}><span style:width={(av.totale ? (100 * av.fatte) / av.totale : 0) + '%'}></span></div>
      <!-- i moduli a colpo d'occhio, nell'ordine di questo gruppo -->
      <ol class="moduli-mini">
        {#each a.moduli as m, i (m.id)}
          {@const fatte = (m.unita || []).filter((u) => st.get(u.id)?.stato === 'fatta').length}
          {@const tot = (m.unita || []).length}
          <li class:concluso={tot && fatte === tot} class:corrente={pr && pr.modulo.id === m.id} title={m.nome}>
            <span class="img"><Immagine id={m.immagine} forma="tondo" seme={m.id} iniziale={(m.nome || '?')[0]} piccola tinta={i % 2 ? 'spot' : 'inchiostro'} /></span>
            <span class="mn">{m.nome || 'Modulo'}</span>
            <span class="sotto conta">{fatte}/{tot}</span>
          </li>
        {/each}
      </ol>
      {#if pr}<p class="prossima"><span class="eti">Prossima</span> {pr.modulo.nome ? pr.modulo.nome + ' · ' : ''}<b>{pr.unita.titolo}</b></p>
      {:else}<p class="prossima sotto">Programma completato.</p>{/if}
      {#if lib && daAggiornare(a, lib) && gestisce}
        <p class="nuova"><Icona nome="aggiorna" /> C'è una versione nuova nella biblioteca.
          <button type="button" class="link" onclick={() => cambia(a.id, (x) => aggiornaDa(x, $state.snapshot(lib)))}>Aggiorna</button> <span class="sotto piccolo">(resta l'ordine scelto qui, e quello che è già fatto)</span></p>
      {/if}
      <button type="button" class="btn nudo piccolo" aria-expanded={aperta === a.id} onclick={() => (aperta = aperta === a.id ? null : a.id)}>{aperta === a.id ? 'Chiudi il dettaglio' : 'Ordine e unità…'}</button>

      {#if aperta === a.id}
        <ol class="dettaglio">
          {#each a.moduli as m, i (m.id)}
            <li class="mod">
              <div class="mod-testa">
                <span class="img-p"><Immagine id={m.immagine} forma="tondo" seme={m.id} iniziale={(m.nome || '?')[0]} piccola tinta={i % 2 ? 'spot' : 'inchiostro'} /></span>
                <b>{m.nome || 'Modulo'}</b>
                {#if gestisce}
                  <span class="azioni">
                    <button type="button" class="btn nudo piccolo" onclick={() => cambia(a.id, (x) => ({ ...x, moduli: anticipa(x, m.id, sedute) }))} title="Diventa il prossimo modulo da fare">Anticipa</button>
                    <button type="button" class="btn nudo piccolo" onclick={() => cambia(a.id, (x) => ({ ...x, moduli: sposta(x.moduli, i, -1) }))} disabled={i === 0} aria-label="Sposta su"><Icona nome="su" /></button>
                    <button type="button" class="btn nudo piccolo" onclick={() => cambia(a.id, (x) => ({ ...x, moduli: sposta(x.moduli, i, 1) }))} disabled={i === a.moduli.length - 1} aria-label="Sposta giù"><Icona nome="giu" /></button>
                  </span>
                {/if}
              </div>
              <ul class="unita">
                {#each m.unita || [] as u, j (u.id)}
                  {@const x = st.get(u.id)}
                  <li class={'stato-' + x.stato}>
                    <span class="segno" aria-hidden="true">{x.stato === 'fatta' ? '✓' : x.stato === 'prevista' ? '◷' : x.stato === 'saltata' ? '–' : '○'}</span>
                    <span class="cosa">
                      <span class="tit">{u.titolo}{u.facoltativa ? ' (facoltativa)' : ''}</span>
                      {#if ETI[x.stato]}<span class="sotto piccolo">{ETI[x.stato]}{#each [...x.fatte, ...x.previste].slice(0, 2) as s (s.id)} <a href={'#/seduta/' + encodeURIComponent(s.id)}>{breve(s.data)}</a>{/each}</span>{/if}
                    </span>
                    {#if gestisce}
                      <span class="azioni">
                        <button type="button" class="btn nudo piccolo" onclick={() => cambia(a.id, (y) => ({ ...y, moduli: y.moduli.map((mm) => (mm.id === m.id ? { ...mm, unita: sposta(mm.unita, j, -1) } : mm)) }))} disabled={j === 0} aria-label="Sposta su"><Icona nome="su" /></button>
                        <button type="button" class="btn nudo piccolo" onclick={() => cambia(a.id, (y) => ({ ...y, moduli: y.moduli.map((mm) => (mm.id === m.id ? { ...mm, unita: sposta(mm.unita, j, 1) } : mm)) }))} disabled={j === m.unita.length - 1} aria-label="Sposta giù"><Icona nome="giu" /></button>
                        {#if x.stato === 'da-fare'}<button type="button" class="btn nudo piccolo" onclick={() => cambia(a.id, (y) => ({ ...y, saltate: [...(y.saltate || []), u.id] }))}>Salta</button>
                        {:else if x.stato === 'saltata'}<button type="button" class="btn nudo piccolo" onclick={() => cambia(a.id, (y) => ({ ...y, saltate: (y.saltate || []).filter((k) => k !== u.id) }))}>Riprendi</button>{/if}
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        </ol>
        {#if gestisce}<button type="button" class="btn nudo piccolo" onclick={() => { if (confirm(`Concludere «${a.nome}» per ${o.nome}? Resta nello storico.`)) cambia(a.id, (x) => ({ ...x, chiusa: true })); }}>Concludi il programma</button>{/if}
      {/if}
    </article>
  {/each}
  {#if gestisce}
    {#if disponibili.length}
      <div class="nuova-as">
        <span class="chi"><Scelta bind:value={scelto} vuota="Assegna un programma…" etichetta="Programma da assegnare" opzioni={disponibili.map((p) => ({ valore: p.id, etichetta: p.nome }))} /></span>
        <button type="button" class="btn piccolo" onclick={nuova} disabled={!scelto}><Icona nome="piu" /> Assegna</button>
      </div>
    {:else if !attive.length}
      <p class="sotto piccolo">Nessun programma da assegnare: creane uno in <a href="#/programmi">Programmi</a>.</p>
    {/if}
  {/if}
  {#if chiuse.length}<p class="sotto piccolo">Conclusi: {#each chiuse as a, k (a.id)}{k ? ', ' : ''}{a.nome}{#if gestisce} <button type="button" class="link" onclick={() => cambia(a.id, (x) => ({ ...x, chiusa: false }))}>riapri</button>{/if}{/each}</p>{/if}
</section>

<style>
  .assegnazioni { display: grid; gap: var(--s-3); }
  .titolo-sez { display: flex; align-items: center; gap: 6px; margin: 0; }
  .as { display: grid; gap: var(--s-2); padding: var(--s-3) var(--s-4); background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande); justify-items: start; }
  .as header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--s-3); }
  .nome { font-size: 19px; text-decoration: none; }
  .nome:hover { text-decoration: underline; text-decoration-color: var(--spot); }
  .barra { width: 100%; height: 5px; border-radius: 3px; background: var(--carta-3); overflow: hidden; }
  .barra span { display: block; height: 100%; background: var(--spot); border-radius: 3px; }
  .moduli-mini { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-3); }
  .moduli-mini li { display: grid; justify-items: center; gap: 2px; width: 70px; opacity: 0.75; }
  .moduli-mini li.corrente { opacity: 1; }
  .moduli-mini li.corrente .mn { color: var(--spot-testo); }
  .moduli-mini li.concluso { opacity: 0.5; }
  .moduli-mini .img { width: 46px; height: 46px; }
  .mn { font-size: 11px; font-weight: 600; text-align: center; line-height: 1.15; }
  .conta { font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .prossima { margin: 0; font-size: var(--t-sm); }
  .nuova { margin: 0; font-size: var(--t-sm); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .nuova :global(.ico) { width: 15px; height: 15px; }
  .link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--spot-testo); text-decoration: underline; cursor: pointer; }
  .dettaglio { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); width: 100%; }
  .mod-testa { display: flex; align-items: center; gap: var(--s-2); }
  .img-p { width: 30px; height: 30px; flex: none; }
  .azioni { display: inline-flex; margin-left: auto; }
  .azioni :global(.ico) { width: 15px; height: 15px; }
  .unita { list-style: none; margin: 4px 0 0 38px; padding: 0; }
  .unita li { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 2px 6px; padding: 3px 0; border-top: 1px dashed var(--matita); font-size: var(--t-sm); }
  .cosa { display: grid; min-width: 0; line-height: 1.25; }
  .unita .azioni { margin-left: 0; }
  .unita .azioni .btn { min-height: 26px; padding: 2px 4px; }
  .segno { width: 14px; text-align: center; color: var(--inchiostro-3); }
  .stato-fatta .segno { color: var(--spot-testo); font-weight: 700; }
  .stato-fatta .tit { color: var(--inchiostro-2); }
  .stato-saltata .tit { text-decoration: line-through; color: var(--inchiostro-3); }
  .tit { font-weight: 600; }
  .nuova-as { display: flex; flex-wrap: wrap; align-items: end; gap: var(--s-2); }
  .nuova-as .chi { min-width: 220px; flex: 1; }
</style>
