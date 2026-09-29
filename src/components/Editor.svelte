<script>
  // Editor di testo: si scrive come in un normale programma di videoscrittura.
  import { onMount, onDestroy } from 'svelte';
  import { creaEditor } from '../lib/editor/tiptap.js';
  import { nomeBreve, nomeCompleto, tuttiTag, ragazziVisibili } from '../lib/dati.svelte.js';

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
  let giro = $state(0); // si incrementa a ogni transazione: accende i pulsanti attivi

  function misura() {
    const vv = window.visualViewport;
    mobile = window.matchMedia('(max-width: 720px)').matches;
    tastiera = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  }
  let uscita = null;

  onMount(() => {
    ed = creaEditor(contenitore, {
      testo, segnaposto, etichetta, soloLettura,
      alCambio: (t) => alCambio(t),
      // la barra resta visibile un attimo dopo aver perso il fuoco, per poterla toccare
      alFocus: (f) => queueMicrotask(() => { clearTimeout(uscita); if (f) attivo = true; else uscita = setTimeout(() => (attivo = false), 150); misura(); }),
      alStato: () => queueMicrotask(() => giro++),
      tag: () => tuttiTag(),
      ragazzi: () => ragazziVisibili().map((r) => ({ id: r.id, nome: nomeBreve(r), dettaglio: nomeCompleto(r) })),
    });
    if (autofocus) ed.fuoco();
    misura();
    window.visualViewport?.addEventListener('resize', misura);
    window.visualViewport?.addEventListener('scroll', misura);
  });
  onDestroy(() => {
    clearTimeout(uscita);
    ed?.distruggi();
    window.visualViewport?.removeEventListener('resize', misura);
    window.visualViewport?.removeEventListener('scroll', misura);
  });
  // testo cambiato da fuori (altra seduta, pulsante "portalo nel piano")
  $effect(() => { const t = testo; if (ed && !attivo) ed.imposta(t); });
  $effect(() => { const s = soloLettura; ed?.modificabile(!s); });

  const STRUMENTI = [
    { c: 'grassetto', l: 'B', t: 'Grassetto (Ctrl B)', cls: 'b' },
    { c: 'corsivo', l: 'I', t: 'Corsivo (Ctrl I)', cls: 'i' },
    { c: 'barrato', l: 'S', t: 'Barrato (Ctrl Maiusc S)', cls: 's' },
    { c: 'h2', l: 'T', t: 'Titoletto (Ctrl Alt 2)', cls: 't' },
    { sep: 1 },
    { c: 'elenco', ico: 'M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01', t: 'Elenco puntato (Ctrl Maiusc 8)' },
    { c: 'numeri', ico: 'M10 7h10M10 12h10M10 17h10M4 5.5h1.5V9M4 9h3M4 14.5c0-1 2.5-1 2.5 0 0 1-2.5 2-2.5 3h3', t: 'Elenco numerato (Ctrl Maiusc 7)' },
    { c: 'compiti', ico: 'M4 5h5v5H4zM5.5 7.5l1 1 2-2M12 7.5h8M4 14h5v5H4zM12 16.5h8', t: 'Cose da fare (Ctrl Maiusc 9)' },
    { c: 'citazione', ico: 'M5 17c2.5-1 3.5-3 3.5-6H5V7h4.5v4M13 17c2.5-1 3.5-3 3.5-6H13V7h4.5v4', t: 'Citazione (Ctrl Maiusc .)' },
    { sep: 1 },
    { c: 'tag', l: '#', t: 'Tag' },
    { c: 'menzione', l: '@', t: 'Cita un ragazzo' },
    { c: 'collegamento', ico: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', t: 'Collegamento' },
    { c: 'immagine', ico: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15 9.5h.01', t: 'Immagine' },
  ];
  const acceso = (c) => { giro; return ed?.attivo(c) || false; };
</script>

<div class="editor" class:attivo class:compatto class:solo-lettura={soloLettura}>
  <div bind:this={contenitore} class="area"></div>
  {#if attivo && !soloLettura}
    <div class="strumenti" class:fisso={mobile} style:bottom={mobile ? tastiera + 'px' : null} role="toolbar" aria-label="Formattazione">
      {#each STRUMENTI as s, i (i)}
        {#if s.sep}<span class="sep" aria-hidden="true"></span>{:else}
          <button type="button" class="st {s.cls || ''}" title={s.t} aria-label={s.t} aria-pressed={acceso(s.c)}
            onmousedown={(e) => e.preventDefault()} onclick={() => ed.esegui(s.c)}>
            {#if s.ico}<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d={s.ico} /></svg>{:else}{s.l}{/if}
          </button>
        {/if}
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
  .solo-lettura .area { cursor: default; }

  /* il testo che si scrive */
  .area :global(.ProseMirror) { outline: none; padding: 2px 0 6px; min-height: inherit; white-space: pre-wrap; word-wrap: break-word; }
  .area :global(.ProseMirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: var(--inchiostro-3); font-style: italic;
  }
  .area :global(.ProseMirror ul[data-type='taskList']) { list-style: none; padding-left: 0.1em; }
  .area :global(.ProseMirror ul[data-type='taskList'] > li) { display: flex; gap: 8px; align-items: baseline; }
  .area :global(.ProseMirror ul[data-type='taskList'] > li > label) { flex: none; user-select: none; }
  .area :global(.ProseMirror ul[data-type='taskList'] > li > div) { flex: 1; min-width: 0; }
  .area :global(.ProseMirror li[data-checked='true'] > div) { color: var(--inchiostro-2); text-decoration: line-through; text-decoration-color: var(--spot); }
  .area :global(.ProseMirror input[type='checkbox']) { accent-color: var(--spot); width: 16px; height: 16px; transform: translateY(2px); cursor: pointer; }
  .area :global(.ProseMirror li > p) { margin: 0; }
  .area :global(.ed-tag) { background: var(--spot-tenue); border-radius: 999px; padding: 0 4px; font-weight: 600; font-size: 0.94em; }
  .area :global(.ed-menzione) {
    font-family: var(--f-display); font-size: 1.02em; background-image: linear-gradient(var(--spot), var(--spot));
    background-size: 100% 1.5px; background-position: 0 100%; background-repeat: no-repeat;
  }
  .area :global(.ProseMirror-selectednode .duo-ed) { outline: 2px solid var(--spot); outline-offset: 3px; }

  .strumenti {
    display: flex; align-items: center; gap: 1px; margin-top: 8px; padding: 3px 6px; width: max-content; max-width: 100%;
    overflow-x: auto; background: var(--carta); border: 1px solid var(--matita-forte); border-radius: 999px;
    animation: sale var(--d-breve) var(--e-uscita); scrollbar-width: none;
  }
  .strumenti.fisso {
    position: fixed; left: 0; right: 0; width: auto; margin: 0; z-index: 800; border-radius: var(--r-grande) var(--r-grande) 0 0;
    border-width: 1px 0 0; padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); justify-content: space-between; background: var(--carta-2);
  }
  .st {
    display: grid; place-items: center; min-width: 32px; height: 32px; padding: 0 6px; border: 0; background: transparent; border-radius: 999px;
    font-size: 15px; font-weight: 600; color: var(--inchiostro); cursor: pointer; flex: none;
  }
  .st .ico { width: 18px; height: 18px; }
  .fisso .st { min-width: 40px; height: 40px; font-size: 17px; }
  .st:hover { background: var(--carta-3); }
  .st[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); }
  .st.b { font-weight: 800; }
  .st.i { font-style: italic; font-family: var(--f-display); }
  .st.s { text-decoration: line-through; }
  .st.t { font-family: var(--f-display); font-size: 17px; }
  .sep { width: 1px; height: 18px; background: var(--matita); margin: 0 4px; flex: none; }
  @keyframes sale { from { opacity: 0; transform: translateY(4px); } }
</style>
