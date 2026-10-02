<script>
  import { gruppiVisibili, membriAl, ragazzo, nomeBreve, puoGestire, creaGruppo, sedutePeriodo, storicoGruppo, tipoGruppo, accessoGruppo, TIPI_GRUPPO } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { oggi, piu, relativa, lunga, nomeGiorno } from '../lib/date.js';
  import { anteprima } from '../lib/testo.js';
  import Icona from '../components/Icona.svelte';
  import { serieInCorso } from '../lib/dati.svelte.js';
  import { descrivi } from '../lib/serie.js';
  import Immagine from '../components/Immagine.svelte';

  const O = oggi();
  let archiviati = $state(false);
  // tutti, solo i gruppi terapeutici o solo le classi (ricordato su questo dispositivo)
  let quali = $state((() => { try { return localStorage.getItem('psy:gruppi-quali') || 'tutti'; } catch (e) { return 'tutti'; } })());
  $effect(() => { try { localStorage.setItem('psy:gruppi-quali', quali); } catch (e) { /* niente */ } });
  const attivi = $derived(gruppiVisibili().filter((g) => !!g.archiviato === archiviati));
  const conta = $derived({ tutti: attivi.length, terapeutico: attivi.filter((g) => tipoGruppo(g) === 'terapeutico').length, classe: attivi.filter((g) => tipoGruppo(g) === 'classe').length });
  const elenco = $derived(quali === 'tutti' ? attivi : attivi.filter((g) => tipoGruppo(g) === quali));
  const riservato = (g) => { const a = accessoGruppo(g.id); return !a.tutti && !a.daPrima; };
  const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  const prossima = (g) => sedutePeriodo(O, piu(O, 30)).find((s) => s.gruppoId === g.id);
  const daScrivere = (g) => storicoGruppo(g.id).filter((v) => v.tipo === 'gruppo' && v.stato === 'da-scrivere').length;
  async function nuovo(tipo) {
    const g = await creaGruppo({ tipo, nome: tipo === 'classe' ? 'Nuova classe' : 'Nuovo gruppo', tema: '', obiettivi: '', membri: [] });
    vai('gruppo/' + g.id + '?impostazioni=1');
  }
</script>

<section class="gruppi">
  <header class="testa">
    <div><p class="eti">{elenco.length} {archiviati ? 'archiviati' : 'attivi'}</p><h1 class="display">{quali === 'classe' ? 'Classi' : quali === 'terapeutico' ? 'Gruppi terapeutici' : 'Gruppi e classi'}</h1></div>
    <div class="comandi">
      <button class="btn nudo piccolo" aria-pressed={archiviati} onclick={() => (archiviati = !archiviati)}>{archiviati ? 'Attivi' : 'Archiviati'}</button>
      {#if puoGestire()}
        <button class="btn" onclick={() => nuovo('classe')}><Icona nome="piu" /> {TIPI_GRUPPO.classe.nuovo}</button>
        <button class="btn pieno" onclick={() => nuovo('terapeutico')}><Icona nome="piu" /> {TIPI_GRUPPO.terapeutico.nuovo}</button>
      {/if}
    </div>
  </header>
  <div class="tipi" role="tablist" aria-label="Quali mostrare">
    {#each [['tutti', 'Tutti'], ['terapeutico', 'Gruppi terapeutici'], ['classe', 'Classi']] as [k, nome] (k)}
      <button role="tab" aria-selected={quali === k} onclick={() => (quali = k)}>{nome} <small>{conta[k]}</small></button>
    {/each}
  </div>
  <div class="carte">
    {#each elenco as g, i (g.id)}
      {@const p = prossima(g)}
      {@const n = daScrivere(g)}
      <a class="carta" href={'#/gruppo/' + g.id}>
        {#if g.copertina}<span class="copertina"><Immagine id={g.copertina} forma="foglio" tinta={i % 2 ? 'spot' : 'inchiostro'} seme={g.id} /></span>{/if}
        <span class="numero display" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        <span class="eti">{tipoGruppo(g) === 'classe' ? 'classe · ' : ''}{serieInCorso({ gruppoId: g.id }).map((x) => descrivi(x)).join(' · ') || 'senza giorno fisso'}{#if riservato(g)}<span class="ris" title="Riservato: lo vede solo chi hai scelto"><Icona nome="lucchetto" /></span>{/if}</span>
        <span class="nome display">{g.nome}</span>
        {#if g.tema}<span class="tema mano">{g.tema}</span>{/if}
        <span class="membri sotto">{membriAl(g, O).map((r) => nomeBreve(ragazzo(r))).join(', ') || (tipoGruppo(g) === 'classe' ? 'nessun alunno' : 'nessun membro')}</span>
        <span class="piede">
          {#if p}<span><span class="eti">Prossima</span> {relativa(p.data)}{p.argomento ? ': ' + anteprima(p.argomento, 50) : ''}</span>{/if}
          {#if n}<span class="spot">{n} da scrivere</span>{/if}
        </span>
      </a>
    {:else}
      <p class="sotto">{quali === 'classe' ? 'Nessuna classe' : 'Nessun gruppo'} {archiviati ? (quali === 'classe' ? 'archiviata' : 'archiviato') : (quali === 'classe' ? 'attiva' : 'attivo')}.</p>
    {/each}
  </div>
</section>

<style>
  .gruppi { max-width: 1240px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); }
  .testa { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-5); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .comandi { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; }
  .tipi { display: flex; gap: var(--s-5); margin: calc(-1 * var(--s-2)) 0 var(--s-5); border-bottom: 1px solid var(--matita); }
  .tipi button { all: unset; cursor: pointer; padding: 6px 0 8px; font-weight: 600; font-size: var(--t-sm); color: var(--inchiostro-2); border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tipi button[aria-selected='true'] { color: var(--inchiostro); border-bottom-color: var(--spot); }
  .tipi button:focus-visible { outline: 2px solid var(--spot); outline-offset: 2px; }
  .tipi small { font-weight: 400; color: var(--inchiostro-3); font-variant-numeric: tabular-nums; }
  .ris { display: inline-flex; vertical-align: -2px; margin-left: 6px; }
  .ris :global(.ico) { width: 13px; height: 13px; }
  .carte { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--s-5); }
  .carta {
    position: relative; display: grid; gap: var(--s-2); align-content: start; padding: var(--s-5); text-decoration: none; overflow: hidden;
    background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande);
    transition: transform var(--d-breve) var(--e-uscita), box-shadow var(--d-breve) var(--e-uscita);
  }
  .carta:hover { transform: translateY(-2px); box-shadow: var(--ombra); }
  .copertina { display: block; height: 150px; margin: calc(-1 * var(--s-5)) calc(-1 * var(--s-5)) var(--s-2); }
  .copertina + .numero { top: 162px; }
  .numero { position: absolute; right: 14px; top: 2px; font-size: 64px; line-height: 1; color: transparent; -webkit-text-stroke: 1px var(--matita-forte); }
  .nome { font-size: var(--t-lg); line-height: 1.05; padding-right: 60px; }
  .tema { font-size: 22px; transform: rotate(-2deg); transform-origin: left; width: max-content; }
  .membri { font-size: var(--t-sm); }
  .piede { display: grid; gap: 4px; margin-top: var(--s-2); padding-top: var(--s-3); border-top: 1px dashed var(--matita); font-size: var(--t-sm); }
  .spot { color: var(--spot-testo); font-weight: 600; }
  @media (max-width: 720px) { .gruppi { padding: var(--s-4) var(--s-4) var(--s-7); } h1 { font-size: var(--t-lg); } .carte { grid-template-columns: 1fr; } }
</style>
