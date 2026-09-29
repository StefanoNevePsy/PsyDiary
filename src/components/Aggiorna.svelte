<script>
  // Nuova versione dell'app pronta: si installa quando lo decidi tu.
  import { onMount } from 'svelte';
  let pronta = $state(false);
  let aggiorna = null;
  onMount(async () => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    const { registerSW } = await import('virtual:pwa-register');
    aggiorna = registerSW({
      onNeedRefresh: () => (pronta = true),
      onRegisteredSW: (url, reg) => reg && setInterval(() => reg.update(), 60 * 60 * 1000),
    });
  });
</script>

{#if pronta}
  <div class="aggiorna" role="status">
    <span>C'è una nuova versione di PsyDiary.</span>
    <button class="btn pieno piccolo" onclick={() => aggiorna?.(true)}>Aggiorna</button>
    <button class="btn nudo piccolo" onclick={() => (pronta = false)}>Dopo</button>
  </div>
{/if}

<style>
  .aggiorna {
    position: fixed; left: 50%; bottom: calc(84px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 950;
    display: flex; align-items: center; gap: var(--s-2); padding: 8px 8px 8px 16px; border-radius: 999px;
    background: var(--carta); border: 1px solid var(--inchiostro); box-shadow: var(--ombra); font-size: var(--t-sm); white-space: nowrap;
  }
  @media (min-width: 721px) { .aggiorna { bottom: var(--s-5); } }
</style>
