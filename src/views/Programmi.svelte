<script>
  // La biblioteca dei programmi e dei protocolli: a colpo d'occhio i moduli
  // (con le loro immagini), per chi sono e dove sono in corso.
  import { dati, programmiVisibili, puoGestire, salva, accessoProgramma } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { T } from '../lib/parole.svelte.js';
  import { nuovoProgramma, daTesto, DESTINATARI } from '../lib/programmi.js';
  import { copiaPrompt } from '../lib/prompt-programma.js';
  import Immagine from '../components/Immagine.svelte';
  import Icona from '../components/Icona.svelte';

  const elenco = $derived(programmiVisibili());
  const inCorso = (pid) => [...dati.gruppi, ...dati.ragazzi].filter((o) => (o.programmi || []).some((a) => a.programmaId === pid && !a.chiusa)).length;
  const riservato = (p) => { const a = accessoProgramma(p.id); return !a.tutti && !a.daPrima; };

  async function nuovo() {
    const p = await salva('programmi', nuovoProgramma({ nome: 'Nuovo programma' }));
    vai('programma/' + p.id);
  }
  let dialogo = $state(), testo = $state(''), nome = $state('');
  // il prompt per far preparare il documento a un modello di IA
  let copiato = $state(false);
  async function copia() { copiato = await copiaPrompt(); setTimeout(() => (copiato = false), 2500); }
  const anteprima = $derived(testo.trim() ? daTesto(testo) : null);
  async function daDocumento() {
    const p = await salva('programmi', daTesto(testo, nome.trim() || 'Programma importato'));
    testo = ''; nome = ''; dialogo?.close();
    vai('programma/' + p.id);
  }
</script>

<section class="programmi">
  <header class="testa">
    <div><p class="eti">{elenco.length} nella biblioteca</p><h1 class="display">Programmi</h1></div>
    {#if puoGestire()}
      <div class="comandi">
        <button class="btn nudo piccolo" onclick={copia} title="Copia il prompt da dare a ChatGPT, Claude o un altro modello per preparare il documento nel formato giusto">{copiato ? '✓ Prompt copiato' : 'Copia il prompt per l\'IA'}</button>
        <button class="btn" onclick={() => dialogo?.showModal()}><Icona nome="documento" /> Da un documento…</button>
        <button class="btn pieno" onclick={nuovo}><Icona nome="piu" /> Nuovo programma</button>
      </div>
    {/if}
  </header>
  <p class="sotto intro">Programmi e protocolli di intervento, divisi in moduli e unità. Si assegnano a un gruppo, a una classe o a {T('un')}: nelle sedute PsyDiary propone l'unità giusta, e l'ordine si cambia per ciascuno.</p>
  <div class="carte">
    {#each elenco as p (p.id)}
      {@const n = inCorso(p.id)}
      <a class="carta" href={'#/programma/' + p.id}>
        <span class="eti">{(p.destinatari || []).map((d) => DESTINATARI[d]).join(' · ') || 'per tutti'}{#if riservato(p)}<span class="ris" title="Riservato"><Icona nome="lucchetto" /></span>{/if}</span>
        <span class="nome display">{p.nome}</span>
        <span class="mod">
          {#each (p.moduli || []).filter((m) => m.nome || m.unita?.length) as m, i (m.id)}
            <span class="m" title={m.nome}>
              <span class="img"><Immagine id={m.immagine} forma="tondo" seme={m.id} iniziale={(m.nome || '?')[0]} piccola tinta={i % 2 ? 'spot' : 'inchiostro'} /></span>
              <span class="mn">{m.nome || 'Modulo'}</span>
            </span>
          {/each}
        </span>
        <span class="piede sotto piccolo">{(p.moduli || []).reduce((k, m) => k + (m.unita || []).length, 0)} unità{p.libere?.length ? ' · ' + p.libere.length + ' libere' : ''}{n ? ' · in corso con ' + n : ''}</span>
      </a>
    {:else}
      <p class="sotto">La biblioteca è vuota. {puoGestire() ? 'Crea un programma, o incollane uno da un documento.' : ''}</p>
    {/each}
  </div>
</section>

<dialog bind:this={dialogo} class="dlg-doc" aria-labelledby="pdoc-titolo">
  <h2 id="pdoc-titolo" class="display">Un programma da un documento</h2>
  <p class="sotto piccolo">Incolla il testo: «# Nome» diventa un modulo, «## Titolo» un'unità con il testo che segue come attività; «Obiettivi: …» e «Durata: 50» si riconoscono; «# Attività libere» va nel menù. Il testo prima del primo titolo è la descrizione. Per un manuale o un PDF: <button type="button" class="link" onclick={copia}>{copiato ? 'prompt copiato ✓' : 'copia il prompt'}</button> e dallo a un modello di IA insieme al documento.</p>
  <label class="campo"><span>Nome del programma</span><input class="input" bind:value={nome} placeholder="es. Life skills a scuola" /></label>
  <textarea class="input" rows="12" bind:value={testo} placeholder={'# Problem solving\n## Il problema in tre parole\nObiettivi: riconoscere un problema\n- [ ] cerchio iniziale\n\n# Emozioni\n## Il termometro'}></textarea>
  {#if anteprima}<p class="sotto piccolo">Trovati: {anteprima.moduli.filter((m) => m.nome || m.unita.length).length} moduli, {anteprima.moduli.reduce((k, m) => k + m.unita.length, 0)} unità, {anteprima.libere.length} attività libere.</p>{/if}
  <div class="bottoni">
    <button type="button" class="btn nudo" onclick={() => dialogo?.close()}>Annulla</button>
    <button type="button" class="btn pieno" onclick={daDocumento} disabled={!anteprima}>Crea il programma</button>
  </div>
</dialog>

<style>
  .programmi { max-width: 1240px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); }
  .testa { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-3); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .comandi { display: flex; flex-wrap: wrap; gap: var(--s-3); }
  .intro { max-width: 70ch; margin: 0 0 var(--s-5); }
  .carte { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--s-5); }
  .carta { display: grid; gap: var(--s-2); align-content: start; padding: var(--s-5); text-decoration: none; background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande); transition: box-shadow var(--d-breve) var(--e-uscita); }
  .carta:hover { box-shadow: var(--ombra); }
  .nome { font-size: var(--t-lg); line-height: 1.1; }
  .ris { display: inline-flex; vertical-align: -2px; margin-left: 6px; }
  .ris :global(.ico) { width: 13px; height: 13px; }
  .mod { display: flex; flex-wrap: wrap; gap: var(--s-3); margin: var(--s-2) 0; }
  .m { display: grid; justify-items: center; gap: 4px; width: 74px; }
  .m .img { width: 56px; height: 56px; }
  .mn { font-size: 11.5px; font-weight: 600; text-align: center; line-height: 1.2; color: var(--inchiostro-2); }
  .piede { border-top: 1px dashed var(--matita); padding-top: var(--s-2); }
  .dlg-doc { width: min(94vw, 640px); padding: var(--s-5); border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .dlg-doc::backdrop { background: oklch(0.2 0.02 265 / 0.5); }
  .dlg-doc[open] { display: grid; gap: var(--s-3); }
  .dlg-doc h2 { margin: 0; font-size: var(--t-lg); }
  .dlg-doc p { margin: 0; }
  .dlg-doc textarea { font-family: ui-monospace, monospace; font-size: 13px; }
  .bottoni { display: flex; justify-content: flex-end; gap: var(--s-2); }
  .link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--spot-testo); text-decoration: underline; cursor: pointer; }
  @media (max-width: 720px) { .programmi { padding: var(--s-4) var(--s-4) var(--s-7); } .carte { grid-template-columns: 1fr; } }
</style>
