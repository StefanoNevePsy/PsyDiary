<script>
  // Il diario dell'aula: tutto, filtrabile per tipo, tag, date, testo.
  import { diarioAula, statoSeduta, sedutePeriodo, titoloSeduta } from '../lib/dati.svelte.js';
  import { rotta } from '../lib/rotta.svelte.js';
  import { oggi, piu, lunga } from '../lib/date.js';
  import DiarioElenco from '../components/DiarioElenco.svelte';

  let filtro = $state({
    tipi: [], tag: rotta.query.tag ? [rotta.query.tag] : [], da: rotta.query.da || '', a: rotta.query.a || '', testo: rotta.query.q || '',
  });
  const voci = $derived(diarioAula().filter((v) => v.data <= oggi() || v.tipo === 'nota'));
  const daScrivere = $derived(sedutePeriodo(piu(oggi(), -30), piu(oggi(), -1)).filter((s) => statoSeduta(s) === 'da-scrivere'));
</script>

<section class="diario">
  <header class="testa">
    <p class="eti">Tutta l'aula</p>
    <h1 class="display">Diario</h1>
  </header>
  {#if daScrivere.length}
    <aside class="promemoria no-stampa">
      <span class="mano">da scrivere</span>
      <ul>
        {#each daScrivere as s (s.id)}<li><a href={'#/seduta/' + encodeURIComponent(s.id)}>{titoloSeduta(s)}, {lunga(s.data)}</a></li>{/each}
      </ul>
    </aside>
  {/if}
  <DiarioElenco {voci} bind:filtro mostraSoggetto titolo="Diario dell'aula" nomeFile="Diario aula" />
</section>

<style>
  .diario { max-width: 920px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); display: grid; gap: var(--s-4); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .promemoria { border-radius: var(--r-grande); display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-3); padding: var(--s-3) var(--s-4); border: 1px dashed var(--spot); background: var(--spot-tenue); }
  .promemoria .mano { font-size: 22px; }
  .promemoria ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; font-weight: 600; font-size: var(--t-sm); }
  @media (max-width: 720px) { .diario { padding: var(--s-4) var(--s-4) var(--s-7); } h1 { font-size: var(--t-lg); } }
</style>
