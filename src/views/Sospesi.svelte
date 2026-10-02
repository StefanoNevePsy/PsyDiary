<script>
  import { T, M } from '../lib/parole.svelte.js';
  // Tutte le idee in sospeso, gruppo per gruppo e ragazzo per ragazzo.
  import { gruppiVisibili, dati, nomeCompleto } from '../lib/dati.svelte.js';
  import ElencoSospesi from '../components/ElencoSospesi.svelte';

  const gruppi = $derived(gruppiVisibili().filter((g) => !g.archiviato));
  const ragazzi = $derived(dati.ragazzi.filter((r) => r.stato !== 'concluso' && dati.sospesi.some((x) => x.ragazzoId === r.id && !x.usatoIn)));
  const totale = $derived(dati.sospesi.filter((x) => !x.usatoIn).length);
</script>

<section class="sospesi">
  <header>
    <p class="eti">{totale} idee da portare</p>
    <h1 class="display">In sospeso</h1>
    <p class="sotto intro">Quello che vuoi fare prima o poi, senza una data. Quando è il momento, finisce nel piano della prossima seduta con un tocco.</p>
  </header>
  <div class="colonne">
    {#each gruppi as g (g.id)}
      <section class="blocco">
        <h2 class="display"><a href={'#/gruppo/' + g.id}>{g.nome}</a></h2>
        <ElencoSospesi tipo="gruppo" id={g.id} titolo={false} />
      </section>
    {/each}
    {#each ragazzi as r (r.id)}
      <section class="blocco">
        <h2 class="display"><a href={'#/ragazzo/' + r.id}>{nomeCompleto(r)}</a></h2>
        <ElencoSospesi tipo="ragazzo" id={r.id} titolo={false} />
      </section>
    {/each}
  </div>
  <p class="sotto piccolo">Per appuntare un'idea su {T('un')}, aprilo dall'elenco {M('tanti')}.</p>
</section>

<style>
  .sospesi { max-width: 1240px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); display: grid; gap: var(--s-5); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .intro { max-width: 60ch; margin-top: var(--s-2); }
  .colonne { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: var(--s-6) var(--s-6); align-items: start; }
  .blocco { display: grid; gap: var(--s-2); padding-top: var(--s-3); border-top: 1.5px solid var(--inchiostro); }
  h2 { font-size: var(--t-md); }
  h2 a { text-decoration: none; }
  h2 a:hover { text-decoration: underline; text-decoration-color: var(--spot); }
  @media (max-width: 720px) { .sospesi { padding: var(--s-4) var(--s-4) var(--s-7); } h1 { font-size: var(--t-lg); } .colonne { grid-template-columns: 1fr; } }
</style>
