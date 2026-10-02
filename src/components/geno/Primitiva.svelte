<svelte:options namespace="svg" />
<script>
  // Una primitiva del disegno di un genogramma (vedi lib/genogramma.js)
  import Primitiva from './Primitiva.svelte';
  let { p } = $props();
</script>

{#if Array.isArray(p.testo)}
  <svelte:element this={p.el} {...p.a}>{#each p.testo as c, i (i)}<Primitiva p={c} />{/each}</svelte:element>
{:else if p.el === 'text'}
  <text {...p.a}>{p.testo}</text>
{:else if p.el === 'foreignObject'}
  <foreignObject {...p.a}><div xmlns="http://www.w3.org/1999/xhtml" class="g-nota-testo">{p.testo.html}</div></foreignObject>
{:else}
  <svelte:element this={p.el} {...p.a} />
{/if}
