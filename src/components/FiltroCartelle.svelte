<script>
  // Le cartelle sopra un elenco: tutte, una cartella, o chi non è in nessuna.
  let { cartelle = [], scelta = $bindable(''), conta = () => 0 } = $props();
</script>

{#if cartelle.length}
  <div class="cartelle" role="group" aria-label="Cartelle">
    <button type="button" aria-pressed={scelta === ''} onclick={() => (scelta = '')}>Tutte</button>
    {#each cartelle as c (c)}<button type="button" aria-pressed={scelta === c} onclick={() => (scelta = c)}>{c} <span class="n">{conta(c)}</span></button>{/each}
    <button type="button" aria-pressed={scelta === '~'} onclick={() => (scelta = '~')}>Senza cartella <span class="n">{conta('~')}</span></button>
  </div>
{/if}

<style>
  .cartelle { display: flex; flex-wrap: wrap; gap: 0; margin: 0 0 var(--s-4); border-bottom: 1px solid var(--matita); }
  button { border: 0; background: none; font: inherit; font-weight: 600; font-size: var(--t-ui); color: var(--inchiostro-2); padding: 10px 14px 8px; min-height: 44px; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -1px; }
  button[aria-pressed='true'] { color: var(--inchiostro); border-bottom-color: var(--spot); }
  .n { font-weight: 400; font-size: 11px; opacity: 0.7; }
</style>
