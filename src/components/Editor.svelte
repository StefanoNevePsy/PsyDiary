<script>
  import { onMount, onDestroy } from 'svelte';
  import { creaEditor } from '../lib/editor/crea.js';
  import { dati, nomeBreve, nomeCompleto, tuttiTag, mappaNomi } from '../lib/dati.svelte.js';

  let {
    testo = '',
    alCambio = () => {},
    segnaposto = '',
    etichetta = 'Testo',
    soloLettura = false,
    compatto = false,
    autofocus = false,
  } = $props();

  let contenitore;
  let ed = null;
  let attivo = $state(false);
  let tastiera = $state(0);
  let mobile = $state(false);

  // la barra sta sopra la tastiera del telefono
  function misura() {
    const vv = window.visualViewport;
    mobile = window.matchMedia('(max-width: 720px)').matches;
    tastiera = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  }

  onMount(() => {
    ed = creaEditor(contenitore, {
      testo,
      segnaposto,
      etichetta,
      soloLettura,
      alCambio: (t) => alCambio(t),
      alFocus: (f) => { attivo = f; misura(); },
      tag: () => tuttiTag(),
      ragazzi: () => dati.ragazzi.filter((r) => r.stato !== 'concluso').map((r) => ({ id: r.id, nome: nomeBreve(r), dettaglio: nomeCompleto(r) })),
      nomi: () => mappaNomi(),
    });
    if (autofocus) ed.fuoco();
    misura();
    window.visualViewport?.addEventListener('resize', misura);
    window.visualViewport?.addEventListener('scroll', misura);
  });
  onDestroy(() => {
    ed?.distruggi();
    window.visualViewport?.removeEventListener('resize', misura);
    window.visualViewport?.removeEventListener('scroll', misura);
  });
  // se il testo cambia da fuori (altra seduta, reset), si aggiorna senza perdere il cursore
  $effect(() => { const t = testo; if (ed && !attivo) ed.imposta(t); });

  const STRUMENTI = [
    { c: 'grassetto', l: 'B', t: 'Grassetto (Ctrl B)', cls: 'b' },
    { c: 'corsivo', l: 'I', t: 'Corsivo (Ctrl I)', cls: 'i' },
    { c: 'h2', l: 'T', t: 'Titolo (Ctrl Alt 2)', cls: 't' },
    { c: 'elenco', l: '•', t: 'Elenco (Ctrl Maiusc 8)' },
    { c: 'numeri', l: '1.', t: 'Elenco numerato (Ctrl Maiusc 7)' },
    { c: 'compiti', l: '☐', t: 'Da fare (Ctrl Maiusc 9)' },
    { c: 'citazione', l: '“', t: 'Citazione (Ctrl Maiusc .)' },
    { c: 'tag', l: '#', t: 'Tag' },
    { c: 'menzione', l: '@', t: 'Cita un ragazzo' },
    { c: 'collegamento', l: '↗', t: 'Collegamento (Ctrl K)' },
  ];
</script>

<div class="editor" class:attivo class:compatto class:solo-lettura={soloLettura}>
  <div bind:this={contenitore} class="area"></div>
  {#if attivo && !soloLettura}
    <div class="strumenti" class:fisso={mobile} style:bottom={mobile ? tastiera + 'px' : null} role="toolbar" aria-label="Formattazione">
      {#each STRUMENTI as s (s.c)}
        <button type="button" class="st {s.cls || ''}" title={s.t} aria-label={s.t} onmousedown={(e) => e.preventDefault()} onclick={() => ed.esegui(s.c)}>{s.l}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .editor { position: relative; }
  .area { min-height: 3.2em; cursor: text; }
  .compatto .area { min-height: 1.6em; }
  .editor:not(.solo-lettura):hover .area { background-image: linear-gradient(var(--matita), var(--matita)); background-size: 100% 1px; background-position: 0 100%; background-repeat: no-repeat; }
  .attivo .area { background-image: linear-gradient(var(--spot), var(--spot)) !important; background-size: 100% 1.5px !important; background-position: 0 100% !important; background-repeat: no-repeat !important; }
  .strumenti {
    display: flex; gap: 2px; margin-top: 8px; padding: 3px; width: max-content; max-width: 100%;
    overflow-x: auto; background: var(--carta); border: 1px solid var(--matita-forte); border-radius: var(--r);
    animation: sale var(--d-breve) var(--e-uscita);
  }
  .strumenti.fisso {
    position: fixed; left: 0; right: 0; width: auto; margin: 0; z-index: 800; border-radius: 0;
    border-width: 1px 0 0; padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); justify-content: space-between;
    background: var(--carta-2);
  }
  .st {
    min-width: 34px; height: 32px; padding: 0 8px; border: 0; background: transparent; border-radius: var(--r);
    font-size: 15px; font-weight: 600; color: var(--inchiostro); cursor: pointer;
  }
  .fisso .st { min-width: 40px; height: 40px; font-size: 17px; }
  .st:hover { background: var(--carta-3); }
  .st.b { font-weight: 800; }
  .st.i { font-style: italic; font-family: var(--f-display); }
  .st.t { font-family: var(--f-display); font-size: 17px; }
  @keyframes sale { from { opacity: 0; transform: translateY(4px); } }
</style>
