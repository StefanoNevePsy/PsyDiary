<script>
  // Una seduta a tutta pagina (telefono, tablet, link diretti).
  import { seduta, precedente, successiva } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { breve } from '../lib/date.js';
  import Foglio from '../components/Foglio.svelte';
  import Icona from '../components/Icona.svelte';

  let { id } = $props();
  // si fissa all'apertura: il foglio tiene la sua copia, anche quando la seduta prevista diventa vera
  const s = $derived(seduta(id));
  const prima = $derived(s ? precedente(s) : null);
  const dopo = $derived(s ? successiva(s) : null);

  function cambio(nuovo, annullata) {
    if (annullata) { vai(`calendario/settimana/${s.data}`); return; }
    history.replaceState(null, '', '#/seduta/' + encodeURIComponent(nuovo));
  }
</script>

{#if s}
  <div class="pagina">
    <nav class="scorri" aria-label="Sedute vicine">
      <a class="torna" href={`#/calendario/settimana/${s.data}`}><Icona nome="sinistra" /> Calendario</a>
      <span class="spazio"></span>
      {#if prima}<a href={'#/seduta/' + encodeURIComponent(prima.id)} title="Seduta precedente"><Icona nome="sinistra" /> {breve(prima.data)}</a>{/if}
      {#if dopo}<a href={'#/seduta/' + encodeURIComponent(dopo.id)} title="Seduta successiva">{breve(dopo.data)} <Icona nome="destra" /></a>{/if}
    </nav>
    {#key id}<Foglio {s} pagina alCambioId={cambio} />{/key}
  </div>
{:else}
  <p class="vuoto">Questa seduta non c'è più. <a href="#/calendario">Torna al calendario</a></p>
{/if}

<style>
  .pagina { max-width: 860px; margin: 0 auto; padding: var(--s-5) var(--s-5) var(--s-8); display: grid; gap: var(--s-4); }
  .scorri { display: flex; align-items: center; gap: var(--s-4); font-size: var(--t-sm); font-weight: 600; }
  .scorri a { display: inline-flex; align-items: center; gap: 4px; text-decoration: none; color: var(--inchiostro-2); }
  .scorri a:hover { color: var(--inchiostro); }
  .spazio { flex: 1; }
  .vuoto { padding: var(--s-7); text-align: center; color: var(--inchiostro-2); }
  @media (max-width: 720px) { .pagina { padding: var(--s-3) 0 var(--s-7); } .scorri { padding: 0 var(--s-4); } }
</style>
