<script>
  // Markdown in lettura. Le caselle si spuntano, i tag filtrano, le immagini
  // compaiono in bicromia e si aprono a colori.
  import { html, spunta } from '../lib/testo.js';
  import { mappaNomi } from '../lib/dati.svelte.js';
  import { urlImmagine } from '../lib/immagini.js';
  import { maschera } from '../lib/maschere.js';
  import { ui } from '../lib/ui.svelte.js';

  let { testo = '', alSpunta = null, alTag = null, classe = '' } = $props();
  const resa = $derived(html(testo, mappaNomi()));
  let box;

  $effect(() => {
    resa;
    if (!box) return;
    for (const el of box.querySelectorAll('span.immagine[data-img]')) {
      const id = el.dataset.img;
      el.innerHTML = '';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'duo-g'; b.dataset.apri = id;
      b.setAttribute('aria-label', 'Apri immagine' + (el.dataset.alt ? ': ' + el.dataset.alt : ''));
      b.style.setProperty('--maschera', maschera('foglio', id));
      const img = document.createElement('img');
      img.alt = el.dataset.alt || '';
      b.appendChild(img);
      el.appendChild(b);
      urlImmagine(id).then((u) => { if (u) img.src = u; else el.classList.add('mancante'); });
    }
  });

  function click(e) {
    const c = e.target.closest('input[type=checkbox][data-riga]');
    if (c) {
      if (!alSpunta) { e.preventDefault(); return; }
      alSpunta(spunta(testo, +c.dataset.riga));
      return;
    }
    const t = e.target.closest('button.tag[data-tag]');
    if (t && alTag) { e.preventDefault(); alTag(t.dataset.tag); return; }
    const i = e.target.closest('[data-apri]');
    if (i) ui.visore = i.dataset.apri;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="md {classe}" bind:this={box} onclick={click}>{@html resa}</div>
