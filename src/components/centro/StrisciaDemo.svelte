<script>
  // Nella demo: si sa sempre che i dati sono inventati.
  import { CONFIG, demo } from '../../lib/centro/config.js';
  import { ricominciaDemo } from '../../lib/dati.svelte.js';
  async function ricomincia() {
    if (!confirm('Ripartire dai dati di prova? Quello che hai scritto nella demo si cancella.')) return;
    await ricominciaDemo();
    location.hash = '#/calendario';
  }
</script>

<div class="striscia" role="note">
  <span class="mano">demo</span>
  <span class="testo">Dati inventati: prova pure tutto, resta solo in questo browser.</span>
  <button class="link" onclick={ricomincia}>Ricomincia</button>
  {#if CONFIG.custodeUrl}<button class="link forte" onclick={() => demo(false)}>Esci dalla demo</button>{/if}
</div>

<style>
  .striscia {
    display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 2px var(--s-3);
    padding: 4px var(--s-4); font-size: var(--t-sm); background: var(--spot-tenue); border-bottom: 1px dashed var(--spot);
  }
  .mano { font-size: 20px; line-height: 1; }
  .link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--inchiostro-2); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .forte { color: var(--spot-testo); }
  @media (max-width: 720px) { .testo { display: none; } }
  @media print { .striscia { display: none; } }
</style>
