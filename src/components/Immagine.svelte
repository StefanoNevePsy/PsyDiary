<script>
  // Un'immagine in bicromia (inchiostro su carta, o vermiglio), dentro una
  // maschera disegnata a mano. Al passaggio del mouse torna a colori.
  // Senza immagine mostra l'iniziale nella stessa forma.
  import { urlImmagine } from '../lib/immagini.js';
  import { maschera } from '../lib/maschere.js';

  let {
    id = null, forma = 'tondo', tinta = 'inchiostro', seme = 'x', alt = '', iniziale = '',
    piccola = false, colori = true, nastro = false, onclick = null,
  } = $props();
  let url = $state(null);
  $effect(() => {
    const cur = id;
    url = null;
    if (cur) urlImmagine(cur, piccola).then((u) => { if (id === cur) url = u; });
  });
  const stile = $derived(`--maschera: ${maschera(forma, seme)}`);
</script>

{#snippet dentro()}
  {#if url}
    <img src={url} {alt} draggable="false" />
  {:else if !id}
    <span class="iniziale display" aria-hidden="true">{iniziale}</span>
  {/if}
{/snippet}

<span class="cornice" class:nastro>
  {#if onclick}
    <button type="button" class="duo forma-{forma} tinta-{tinta}" class:vuota={!id} class:colori style={stile} {onclick} aria-label={alt || 'Apri immagine'}>{@render dentro()}</button>
  {:else}
    <span class="duo forma-{forma} tinta-{tinta}" class:vuota={!id} class:colori style={stile} role={id ? 'img' : undefined} aria-label={id ? alt : undefined}>{@render dentro()}</span>
  {/if}
</span>

<style>
  .cornice { position: relative; display: block; width: 100%; height: 100%; }
  .duo {
    position: relative; display: grid; place-items: center; width: 100%; height: 100%; padding: 0; border: 0;
    overflow: hidden; isolation: isolate; background: var(--duo-scuro); color: inherit; cursor: inherit;
    -webkit-mask: var(--maschera) center / 100% 100% no-repeat; mask: var(--maschera) center / 100% 100% no-repeat;
  }
  button.duo { cursor: zoom-in; }
  .tinta-spot { --duo-scuro: var(--spot); }
  img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
    filter: grayscale(1) contrast(1.12) brightness(1.04); mix-blend-mode: screen;
    transition: filter var(--d-media) var(--e-uscita);
  }
  /* la carta sopra: i bianchi diventano carta, i neri inchiostro */
  .duo::after {
    content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background: var(--duo-chiaro); mix-blend-mode: multiply; transition: opacity var(--d-media) var(--e-uscita);
  }
  /* retino da stampa, appena accennato */
  .duo::before {
    content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0.16;
    background: radial-gradient(circle, var(--duo-scuro) 0.9px, transparent 1.2px) 0 0 / 4px 4px;
    mix-blend-mode: multiply;
  }
  .colori:hover img, .colori:focus-visible img { filter: none; mix-blend-mode: normal; }
  .colori:hover::after, .colori:focus-visible::after { opacity: 0; }
  .vuota { background: var(--carta-3); }
  .vuota::after, .vuota::before { display: none; }
  .iniziale { font-size: 42cqi; line-height: 1; color: var(--inchiostro-2); container-type: normal; }
  .cornice { container-type: inline-size; }
  /* nastro adesivo sopra le immagini incollate nelle note */
  .nastro::after {
    content: ''; position: absolute; top: -8px; left: 50%; width: 72px; height: 20px; z-index: 3;
    transform: translateX(-50%) rotate(-2.5deg); background: var(--spot-retino); opacity: 0.55; border-radius: 2px;
    mask: radial-gradient(circle, #000 1.1px, transparent 1.3px) 0 0 / 4px 4px;
  }
</style>
