<script>
  // L'immagine a tutto schermo, a colori.
  import { onMount } from 'svelte';
  import { urlImmagine } from '../lib/immagini.js';
  import Icona from './Icona.svelte';

  let { id, chiudi } = $props();
  let dialogo;
  let url = $state(null);
  onMount(() => { dialogo.showModal(); urlImmagine(id).then((u) => (url = u)); });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogo} class="visore" aria-label="Immagine" onclose={chiudi} onclick={() => dialogo.close()}>
  {#if url}<img src={url} alt="" />{/if}
  <button class="btn chiudi" onclick={() => dialogo.close()} aria-label="Chiudi"><Icona nome="chiudi" /></button>
</dialog>

<style>
  dialog { border: 0; padding: 0; background: transparent; max-width: 94vw; max-height: 92dvh; overflow: visible; }
  dialog::backdrop { background: oklch(0.15 0.02 265 / 0.82); }
  img { display: block; max-width: 94vw; max-height: 92dvh; border-radius: var(--r-grande); box-shadow: 0 30px 80px -30px #000; }
  .chiudi { position: absolute; top: -14px; right: -14px; background: var(--carta); padding: 8px; min-height: 40px; }
</style>
