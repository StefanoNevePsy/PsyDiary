<script>
  import { oraTesto } from '../../lib/orario.js';
  // Il pallino in alto: lo stato rispetto al Drive dell'aula.
  //   verde: tutto salvato · giallo: da inviare, o fermo da un po' · rosso: errore · grigio: senza rete
  import { onMount } from 'svelte';
  import { sync, sincronizza } from '../../lib/centro/sync.svelte.js';

  let adesso = $state(Date.now());
  onMount(() => { const t = setInterval(() => (adesso = Date.now()), 30000); return () => clearInterval(t); });
  const ora = (iso) => { const d = new Date(iso); return oraTesto(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); };
  const minuti = $derived(sync.ultima ? Math.floor((adesso - Date.parse(sync.ultima)) / 60000) : null);
  const stato = $derived(
    !sync.online ? ['spento', 'senza rete: lavori sul dispositivo, i dati partono appena torna la connessione']
      : sync.errore ? ['errore', 'sincronizzazione non riuscita: ' + sync.errore]
      : sync.lavoro ? ['lavoro', 'sincronizzo con il Drive…']
      : sync.inCoda ? ['coda', `${sync.inCoda} ${sync.inCoda === 1 ? 'modifica' : 'modifiche'} da inviare`]
      : minuti !== null && minuti >= 10 ? ['coda', `non sincronizzato da ${minuti} minuti: tocca per riprovare`]
      : ['ok', 'tutto salvato su Drive' + (sync.ultima ? ' · alle ' + ora(sync.ultima) : '')],
  );
</script>

<button class="stato s-{stato[0]}" onclick={() => sincronizza()} title={stato[1]} aria-label={'Sincronizzazione: ' + stato[1]}>
  <span class="pallino" aria-hidden="true"></span><span class="testo">{stato[1]}</span>
</button>

<style>
  .stato { display: inline-flex; align-items: center; gap: 6px; max-width: 240px; min-height: 36px; border: 0; background: none; padding: 6px 8px; border-radius: 999px; cursor: pointer; font-size: var(--t-xs); color: var(--inchiostro-2); }
  .stato:hover { background: var(--carta-3); }
  .testo { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pallino { width: 10px; height: 10px; border-radius: 50%; background: oklch(0.62 0.12 150); flex: none; box-shadow: 0 0 0 3px var(--carta-3); }
  .s-coda .pallino, .s-lavoro .pallino { background: oklch(0.74 0.14 80); }
  .s-lavoro .pallino { animation: batte 1s ease-in-out infinite; }
  .s-errore .pallino { background: var(--spot); }
  .s-errore { color: var(--spot-testo); max-width: min(600px, 100%); }
  .s-errore .testo { white-space: normal; text-align: left; }
  .s-spento .pallino { background: var(--inchiostro-3); }
  @keyframes batte { 50% { opacity: 0.3; } }
  @media (max-width: 1100px) { .testo { display: none; } .s-errore .testo { display: inline; } }
</style>
