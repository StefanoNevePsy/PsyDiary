<script>
  // Una voce di diario o di storico: data a sinistra, contenuto a destra.
  import { numeroGiorno, nomeGiornoBreve, relativa } from '../lib/date.js';
  import { dati, gruppo, ragazzo, nomeCompleto, salva } from '../lib/dati.svelte.js';
  import Md from './Md.svelte';

  let { v, alTag = null, mostraSoggetto = false } = $props();
  const NOMI = { gruppo: 'Gruppo', individuale: 'Individuale', genitori: 'Genitori', conoscenza: 'Conoscenza', nota: 'Nota' };
  let aperti = $state(false);
  const principali = $derived(v.blocchi.filter((b) => !b.secondario));
  const secondari = $derived(v.blocchi.filter((b) => b.secondario));
  const link = $derived(v.sedutaId ? '#/seduta/' + encodeURIComponent(v.sedutaId) : '#/nota/' + v.notaId);
  const soggetto = $derived(v.tipo === 'gruppo' ? null : v.ragazzoId ? ragazzo(v.ragazzoId) : null);

  async function spunta(blocco, testo) {
    if (v.sedutaId) {
      const s = dati.sedute.find((x) => x.id === v.sedutaId);
      if (!s) return;
      if (blocco.chiave.startsWith('p:')) await salva('sedute', { ...s, partecipanti: { ...s.partecipanti, [blocco.ragazzo]: testo } });
      else if (blocco.chiave === 'partecipante') { const rid = Object.keys(s.partecipanti || {}).find((k) => s.partecipanti[k] === blocco.testo); if (rid) await salva('sedute', { ...s, partecipanti: { ...s.partecipanti, [rid]: testo } }); }
      else if (['argomento', 'resoconto', 'prossima'].includes(blocco.chiave)) await salva('sedute', { ...s, [blocco.chiave]: testo });
    } else if (v.notaId) {
      const n = dati.note.find((x) => x.id === v.notaId);
      if (n) await salva('note', { ...n, testo });
    }
  }
</script>

<article class="voce tipo-{v.tipo}" class:da-scrivere={v.stato === 'da-scrivere'}>
  <div class="quando" aria-hidden="true">
    <span class="num display">{numeroGiorno(v.data)}</span>
    <span class="eti">{nomeGiornoBreve(v.data)}{v.ora ? ' · ' + v.ora : ''}</span>
  </div>
  <div class="corpo">
    <header>
      <span class="eti tipo">{NOMI[v.tipo]}{v.categoria ? ' · ' + v.categoria : ''}</span>
      <h3><a href={link}>{v.titolo}</a></h3>
      {#if mostraSoggetto && soggetto && v.tipo === 'nota'}<span class="sotto piccolo">{nomeCompleto(soggetto)}</span>{/if}
      <span class="vis-nascosto">{relativa(v.data)}</span>
      {#if v.stato === 'da-scrivere'}<span class="mano segno">da scrivere</span>{/if}
    </header>
    {#each principali as b (b.chiave)}
      <section class="blocco" class:principale={b.principale}>
        {#if b.etichetta}<h4 class="eti">{b.etichetta}</h4>{/if}
        {#if b.chiave === 'assente'}<p class="sotto">Assente</p>{:else}<Md testo={b.testo} {alTag} alSpunta={(t) => spunta(b, t)} />{/if}
      </section>
    {/each}
    {#if secondari.length}
      <button class="apri" aria-expanded={aperti} onclick={() => (aperti = !aperti)}>{aperti ? 'Nascondi' : 'Mostra'} la nota del gruppo</button>
      {#if aperti}
        {#each secondari as b (b.chiave)}
          <section class="blocco secondario">
            <h4 class="eti">{b.etichetta}</h4>
            <Md testo={b.testo} {alTag} />
          </section>
        {/each}
      {/if}
    {/if}
    {#if !v.blocchi.length}<p class="sotto piccolo">Nessuna nota.</p>{/if}
  </div>
</article>

<style>
  .voce { display: grid; grid-template-columns: 76px 1fr; gap: var(--s-4); padding: var(--s-5) 0; border-top: 1px dashed var(--matita); break-inside: avoid; }
  .quando { display: grid; align-content: start; justify-items: start; }
  .num { font-size: 40px; line-height: 0.95; }
  .corpo { min-width: 0; display: grid; gap: var(--s-3); }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--s-3); }
  .tipo { color: var(--spot-testo); }
  h3 { font-family: var(--f-display); font-size: var(--t-md); line-height: 1.2; width: 100%; order: 2; }
  h3 a { text-decoration: none; }
  h3 a:hover { text-decoration: underline; text-decoration-color: var(--spot); text-underline-offset: 3px; }
  .segno { font-size: 19px; transform: rotate(-3deg); }
  .blocco { display: grid; gap: 2px; }
  .blocco h4 { margin: 0; }
  .secondario { padding-left: var(--s-3); border-left: 1px solid var(--matita); }
  .secondario :global(.md) { font-size: var(--t-ui); color: var(--inchiostro-2); }
  .apri { justify-self: start; border: 0; background: none; padding: 0; color: var(--inchiostro-2); font-size: var(--t-sm); font-weight: 600; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
  .tipo-genitori .tipo, .tipo-nota .tipo { color: var(--inchiostro-2); }
  @media (max-width: 720px) {
    .voce { grid-template-columns: 1fr; gap: var(--s-2); }
    .quando { display: flex; align-items: baseline; gap: var(--s-2); }
    .num { font-size: 28px; }
  }
</style>
