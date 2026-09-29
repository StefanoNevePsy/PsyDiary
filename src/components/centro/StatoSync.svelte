<script>
  // Il pallino in alto: salvato, in coda, senza rete, errore.
  import { sync, sincronizza } from '../../lib/centro/sync.svelte.js';
  const stato = $derived(
    !sync.online ? ['spento', 'senza rete · lavori sul dispositivo']
      : sync.errore ? ['errore', sync.errore]
      : sync.lavoro ? ['lavoro', 'sincronizzo…']
      : sync.inCoda ? ['coda', `${sync.inCoda} da inviare`]
      : ['ok', 'tutto salvato su Drive'],
  );
</script>

<button class="stato s-{stato[0]}" onclick={() => sincronizza()} title={stato[1]} aria-label={'Sincronizzazione: ' + stato[1]}>
  <span class="pallino" aria-hidden="true"></span><span class="testo">{stato[1]}</span>
</button>

<style>
  .stato { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; border: 0; background: none; padding: 6px 8px; border-radius: 999px; cursor: pointer; font-size: var(--t-xs); color: var(--inchiostro-2); }
  .stato:hover { background: var(--carta-3); }
  .testo { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pallino { width: 8px; height: 8px; border-radius: 50%; background: oklch(0.62 0.12 150); flex: none; }
  .s-coda .pallino, .s-lavoro .pallino { background: oklch(0.72 0.14 80); }
  .s-lavoro .pallino { animation: batte 1s ease-in-out infinite; }
  .s-errore .pallino { background: var(--spot); }
  .s-errore { color: var(--spot-testo); }
  .s-spento .pallino { background: var(--inchiostro-3); }
  @keyframes batte { 50% { opacity: 0.3; } }
  @media (max-width: 1100px) { .testo { display: none; } }
</style>
