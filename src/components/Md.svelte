<script>
  // Markdown in lettura. Le caselle si spuntano, i tag si possono usare come filtro.
  import { html, spunta } from '../lib/testo.js';
  import { mappaNomi } from '../lib/dati.svelte.js';

  let { testo = '', alSpunta = null, alTag = null, classe = '' } = $props();
  const resa = $derived(html(testo, mappaNomi()));

  function click(e) {
    const c = e.target.closest('input[type=checkbox][data-riga]');
    if (c) {
      if (!alSpunta) { e.preventDefault(); return; }
      alSpunta(spunta(testo, +c.dataset.riga));
      return;
    }
    const t = e.target.closest('button.tag[data-tag]');
    if (t && alTag) { e.preventDefault(); alTag(t.dataset.tag); }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="md {classe}" onclick={click}>{@html resa}</div>
