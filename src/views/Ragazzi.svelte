<script>
  import { T, M } from '../lib/parole.svelte.js';
  // Elenco dei ragazzi: chi sono, in che gruppo, quando li si rivede.
  import { dati, nomeCompleto, gruppiDi, puoGestire, salva, nuovoId, sedutePeriodo, soggetto, condiviso, visibileNota } from '../lib/dati.svelte.js';
  import Immagine from '../components/Immagine.svelte';
  import { serieInCorso } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { eta, oggi, piu, relativa } from '../lib/date.js';
  import Icona from '../components/Icona.svelte';
  import Etichette from '../components/Etichette.svelte';
  import { tinta } from '../lib/etichette.js';

  let q = $state('');
  let conclusi = $state(false);
  // filtro per etichette: tutte quelle scelte devono esserci
  let scelte = $state([]);
  const alterna = (t) => (scelte = scelte.includes(t) ? scelte.filter((x) => x !== t) : [...scelte, t]);
  const O = oggi();
  const prossime = $derived(sedutePeriodo(O, piu(O, 30)));

  const elenco = $derived(
    dati.ragazzi
      .filter((r) => (conclusi ? r.stato === 'concluso' : r.stato !== 'concluso'))
      .filter((r) => !q.trim() || (nomeCompleto(r) + ' ' + (r.scuola || '') + ' ' + (r.classe || '') + ' ' + (r.etichette || []).join(' ')).toLowerCase().includes(q.trim().toLowerCase()))
      .filter((r) => scelte.every((t) => (r.etichette || []).includes(t)))
      .sort((a, b) => (a.cognome || a.nome).localeCompare(b.cognome || b.nome, 'it')),
  );
  function ultima(rid) {
    const s = dati.sedute.filter((x) => !x.annullata && x.data <= O && ((x.ragazzoId === rid && condiviso(rid)) || (x.partecipanti || {})[rid])).sort((a, b) => b.data.localeCompare(a.data))[0];
    const n = dati.note.filter((x) => x.ragazzoId === rid && visibileNota(x)).sort((a, b) => b.data.localeCompare(a.data))[0];
    const d = [s?.data, n?.data].filter(Boolean).sort().at(-1);
    return d ? relativa(d) : '—';
  }
  function prossima(r) {
    const gs = gruppiDi(r.id).map((g) => 'g:' + g.id);
    const s = prossime.find((x) => x.ragazzoId === r.id || gs.includes(soggetto(x)));
    return s ? relativa(s.data) : '—';
  }
  async function nuovo() {
    const r = await salva('ragazzi', { id: nuovoId('r'), nome: '', cognome: '', stato: 'attivo', inizio: O, genitori: [], noteStabili: '' });
    vai('ragazzo/' + r.id + '?scheda=1');
  }
  const etichetteInUso = $derived.by(() => {
    const n = new Map();
    for (const r of dati.ragazzi) if (conclusi ? r.stato === 'concluso' : r.stato !== 'concluso') for (const t of r.etichette || []) n.set(t, (n.get(t) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
  });
  const lettera = (r) => (r.cognome || r.nome || '?')[0].toUpperCase();
</script>

<section class="ragazzi">
  <header class="testa">
    <div>
      <p class="eti">{elenco.length} {conclusi ? 'percorsi conclusi' : T('tanti') + ' in carico'}</p>
      <h1 class="display">{M('tanti')}</h1>
    </div>
    <div class="comandi">
      <label class="filtro"><Icona nome="cerca" /><span class="vis-nascosto">Filtra</span><input class="input" type="search" placeholder="Nome, scuola, etichetta" bind:value={q} /></label>
      <button class="btn nudo piccolo" aria-pressed={conclusi} onclick={() => (conclusi = !conclusi)}>{conclusi ? 'In carico' : 'Conclusi'}</button>
      {#if puoGestire()}<button class="btn pieno" onclick={nuovo}><Icona nome="piu" /> Nuovo {T('uno')}</button>{/if}
    </div>
  </header>

  {#if etichetteInUso.length}
    <div class="filtro-et" role="group" aria-label="Filtra per etichetta">
      {#each etichetteInUso as [t, n] (t)}
        <button type="button" class="fe" style:--h={tinta(t)} aria-pressed={scelte.includes(t)} onclick={() => alterna(t)}>{t} <span class="n">{n}</span></button>
      {/each}
      {#if scelte.length}<button type="button" class="btn nudo piccolo" onclick={() => (scelte = [])}>Tutte</button>{/if}
    </div>
  {/if}

  <ol class="elenco">
    <li class="intesta eti" aria-hidden="true"><span>Nome</span><span>Scuola</span><span>Gruppi</span><span>Ultima nota</span><span>Prossima volta</span></li>
    {#each elenco as r, i (r.id)}
      <li class="riga" class:nuova-lettera={i > 0 && lettera(elenco[i - 1]) !== lettera(r)}>
        {#if i === 0 || lettera(elenco[i - 1]) !== lettera(r)}<span class="lettera display" aria-hidden="true">{lettera(r)}</span>{/if}
        <span class="cella-nome">
        <a class="nome" href={'#/ragazzo/' + r.id}>
          <span class="av"><Immagine id={r.foto} forma="tondo" seme={r.id} iniziale={(r.nome || '?')[0]} piccola /></span>
          <span class="display">{r.cognome || ''} {r.nome || 'Senza nome'}</span>
          {#if r.nascita}<span class="sotto piccolo">{eta(r.nascita)} anni</span>{/if}
          {#if !condiviso(r.id)}<span class="blocca" title="Non condiviso con te: vedi solo i gruppi"><Icona nome="lucchetto" /></span>{/if}
        </a>
        {#if r.etichette?.length}<span class="et-riga"><Etichette valori={r.etichette} piccole filtro={(t) => { if (!scelte.includes(t)) alterna(t); }} /></span>{/if}
        </span>
        <span class="sotto">{r.classe || ''}{r.scuola ? ', ' + r.scuola : ''}</span>
        <span class="gruppi">
          {#each gruppiDi(r.id) as g (g.id)}<a href={'#/gruppo/' + g.id}>{g.nome.replace(/^(Gruppo|Laboratorio) del /, '')}</a>{/each}
          {#if serieInCorso({ ragazzoId: r.id }).some((x) => x.tipo === 'individuale')}<span class="ind">individuale</span>{/if}
        </span>
        <span class="sotto num">{ultima(r.id)}</span>
        <span class="num">{prossima(r)}</span>
      </li>
    {:else}
      <li class="vuoto sotto">{q ? M('nessuno') + ' con questo nome.' : scelte.length ? 'Nessuno con queste etichette.' : 'Nessuno qui.'}</li>
    {/each}
  </ol>
</section>

<style>
  .ragazzi { max-width: 1240px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); }
  .testa { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-5); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .comandi { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); }
  .filtro { display: flex; align-items: center; gap: var(--s-2); color: var(--inchiostro-2); }
  .filtro .input { width: 220px; }
  .elenco { list-style: none; margin: 0; padding: 0; }
  .filtro-et { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: calc(-1 * var(--s-2)) 0 var(--s-4); }
  .fe {
    display: inline-flex; align-items: baseline; gap: 5px; padding: 3px 11px; border-radius: 999px; cursor: pointer; font: inherit; font-size: var(--t-sm); font-weight: 600;
    background: transparent; color: color-mix(in oklch, oklch(0.5 0.13 var(--h)) 75%, var(--inchiostro));
    border: 1px solid color-mix(in oklch, oklch(0.6 0.12 var(--h)) 45%, transparent);
  }
  .fe[aria-pressed='true'] { background: color-mix(in oklch, oklch(0.72 0.11 var(--h)) 30%, var(--carta)); border-color: color-mix(in oklch, oklch(0.55 0.13 var(--h)) 70%, transparent); }
  .fe .n { font-weight: 400; font-size: 11px; opacity: 0.7; font-variant-numeric: tabular-nums; }
  .cella-nome { display: grid; gap: 2px; min-width: 0; }
  .et-riga { padding-left: 50px; }
  .intesta, .riga { display: grid; grid-template-columns: minmax(200px, 1.4fr) 1.3fr 1.2fr 0.8fr 0.8fr; gap: var(--s-4); align-items: baseline; }
  .intesta { padding: 0 0 var(--s-2); border-bottom: 1.5px solid var(--inchiostro); }
  .riga { position: relative; padding: 10px 0; border-bottom: 1px dashed var(--matita); }
  .riga.nuova-lettera { border-top: 1px solid var(--matita-forte); margin-top: -1px; }
  .lettera { position: absolute; left: -44px; top: 6px; width: 30px; text-align: right; font-size: var(--t-lg); color: var(--spot-testo); line-height: 1; }
  .nome { display: flex; gap: var(--s-3); align-items: center; text-decoration: none; }
  .av { width: 38px; height: 38px; flex: none; }
  .av :global(.iniziale) { font-size: 17px; }
  .blocca { color: var(--inchiostro-3); display: inline-flex; }
  .blocca :global(.ico) { width: 14px; height: 14px; }
  .nome .display { font-size: 19px; }
  .nome:hover .display { text-decoration: underline; text-decoration-color: var(--spot); text-underline-offset: 4px; }
  .gruppi { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: var(--t-sm); font-weight: 600; }
  .gruppi a { text-decoration: none; }
  .gruppi a:hover { text-decoration: underline; }
  .ind { color: var(--inchiostro-2); font-weight: 500; font-style: italic; }
  .num { font-variant-numeric: tabular-nums; font-size: var(--t-sm); }
  .vuoto { padding: var(--s-6) 0; }
  @media (max-width: 1320px) { .lettera { position: static; display: none; } }
  @media (max-width: 900px) {
    .intesta { display: none; }
    .riga { grid-template-columns: 1fr auto; gap: 2px var(--s-3); }
    .riga > :nth-child(2) { grid-column: 1; font-size: var(--t-sm); }
    .riga > :nth-child(3) { grid-column: 1; }
    .riga > :nth-child(4) { display: none; }
    .riga > :nth-child(5) { grid-row: 1; grid-column: 2; }
  }
  @media (max-width: 720px) {
    .ragazzi { padding: var(--s-4) var(--s-4) var(--s-7); }
    h1 { font-size: var(--t-lg); }
    .comandi { width: 100%; }
    .filtro { flex: 1; } .filtro .input { width: 100%; }
  }
</style>
