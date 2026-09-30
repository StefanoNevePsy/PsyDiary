<script>
  // Tutti gli appuntamenti che si ripetono, in un posto solo.
  import ElencoSerie from '../components/ElencoSerie.svelte';
  import { puoGestire } from '../lib/dati.svelte.js';
</script>

<section class="ricorrenze">
  <header>
    <a class="torna" href="#/calendario">← Calendario</a>
    <p class="eti">Calendario</p>
    <h1 class="display">Appuntamenti ricorrenti</h1>
    <p class="sotto intro">Gruppi, individuali, genitori: le sedute di una serie compaiono da sole nel calendario e diventano vere quando ci scrivi. Una volta si possono spostare o saltare dal foglio della seduta; qui si cambia tutta la serie, da una data in poi.</p>
    {#if !puoGestire()}<p class="sotto piccolo">Le serie le gestiscono gli operatori.</p>{/if}
  </header>
  <ElencoSerie />
</section>

<style>
  .ricorrenze { max-width: 820px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); display: grid; gap: var(--s-5); }
  header { display: grid; gap: var(--s-2); }
  .torna { font-size: var(--t-sm); font-weight: 600; text-decoration: none; color: var(--inchiostro-2); }
  h1 { font-size: var(--t-xl); line-height: 1; }
  .intro { max-width: 62ch; }
  @media (max-width: 720px) { .ricorrenze { padding: var(--s-4) var(--s-4) var(--s-7); } h1 { font-size: var(--t-lg); } }
</style>
