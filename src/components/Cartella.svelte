<script>
  // La cartella in cui sta un paziente o un gruppo: si sceglie fra quelle in uso o se ne crea una.
  import Icona from './Icona.svelte';
  let { valore = '', proposte = [], modificabile = false, alCambio } = $props();
  let scrivendo = $state(false), nuova = $state('');
  function scegli(e) {
    const v = e.currentTarget.value;
    if (v === '+') { scrivendo = true; queueMicrotask(() => document.querySelector('.cartella-nuova input')?.focus()); return; }
    alCambio?.(v);
  }
  function conferma() { const v = nuova.trim().slice(0, 40); if (v) alCambio?.(v); scrivendo = false; nuova = ''; }
</script>

{#if modificabile}
  <span class="cartella">
    <Icona nome="cartella" />
    {#if scrivendo}
      <span class="cartella-nuova"><input class="input" bind:value={nuova} placeholder="Nome della cartella" maxlength="40"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); conferma(); } if (e.key === 'Escape') scrivendo = false; }} onblur={conferma} /></span>
    {:else}
      <select aria-label="Cartella" value={valore || ''} onchange={scegli}>
        <option value="">Nessuna cartella</option>
        {#each proposte as c (c)}<option value={c}>{c}</option>{/each}
        {#if valore && !proposte.includes(valore)}<option value={valore}>{valore}</option>{/if}
        <option value="+">+ Nuova cartella…</option>
      </select>
    {/if}
  </span>
{:else if valore}
  <span class="cartella"><Icona nome="cartella" /> {valore}</span>
{/if}

<style>
  .cartella { display: inline-flex; align-items: center; gap: 4px; font-size: var(--t-sm); color: var(--inchiostro-2); }
  .cartella :global(.ico) { width: 14px; height: 14px; }
  select { border: 0; border-bottom: 1px dashed var(--matita-forte); background: transparent; font: inherit; color: inherit; padding: 2px 0; cursor: pointer; min-height: 32px; }
  .cartella-nuova .input { min-height: 30px; padding: 2px; font-size: var(--t-sm); width: 170px; }
</style>
