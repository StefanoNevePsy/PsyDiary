<script>
  // Menu a tendina nel tema dell'app, al posto del <select> del sistema.
  // opzioni: [{ valore, etichetta, gruppo?, disattiva? }]  (gruppo: titoletto, come <optgroup>)
  // Tastiera: frecce, Home/End, Invio/Spazio, Esc, e lettere per saltare.
  let {
    value = $bindable(), opzioni = [], vuota = 'Scegli…', etichetta = '', required = false,
    disabled = false, breve = false, onchange = null,
  } = $props();

  const uid = 'sc' + Math.random().toString(36).slice(2, 8);
  let aperta = $state(false);
  let attiva = $state(-1);
  let tasto = $state(), lista = $state();
  let pos = $state({ top: 0, left: 0, width: 0, max: 300, su: false });
  let cerca = '', tCerca = null;

  const scelta = $derived(opzioni.find((o) => o.valore === value));
  const abilitate = $derived(opzioni.map((o, i) => (o.disattiva ? -1 : i)).filter((i) => i >= 0));

  function posiziona() {
    if (!tasto) return;
    const r = tasto.getBoundingClientRect();
    const sotto = innerHeight - r.bottom - 12, sopra = r.top - 12;
    const su = sotto < 220 && sopra > sotto;
    pos = { left: Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 220) - 8)), width: Math.max(r.width, 220),
      top: su ? r.top - 4 : r.bottom + 4, max: Math.min(340, su ? sopra : sotto), su };
  }
  function apri() {
    if (disabled || aperta) return;
    posiziona();
    aperta = true;
    const i = opzioni.findIndex((o) => o.valore === value);
    attiva = i >= 0 && !opzioni[i].disattiva ? i : abilitate[0] ?? -1;
    queueMicrotask(() => lista?.querySelector('[data-attiva]')?.scrollIntoView({ block: 'nearest' }));
  }
  function chiudi(rifuoco = true) { aperta = false; if (rifuoco) tasto?.focus(); }
  function scegli(i) {
    const o = opzioni[i];
    if (!o || o.disattiva) return;
    const cambia = o.valore !== value;
    value = o.valore;
    chiudi();
    if (cambia && onchange) onchange(o.valore);
  }
  function muovi(passo) {
    const k = abilitate.indexOf(attiva);
    const n = k < 0 ? (passo > 0 ? 0 : abilitate.length - 1) : Math.max(0, Math.min(abilitate.length - 1, k + passo));
    attiva = abilitate[n] ?? -1;
    queueMicrotask(() => lista?.querySelector('[data-attiva]')?.scrollIntoView({ block: 'nearest' }));
  }
  function tastiera(e) {
    if (disabled) return;
    if (!aperta) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); apri(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); muovi(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); muovi(-1); }
    else if (e.key === 'Home') { e.preventDefault(); attiva = abilitate[0]; }
    else if (e.key === 'End') { e.preventDefault(); attiva = abilitate[abilitate.length - 1]; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegli(attiva); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(); }
    else if (e.key === 'Tab') chiudi(false);
    else if (e.key.length === 1) {
      cerca += e.key.toLowerCase();
      clearTimeout(tCerca); tCerca = setTimeout(() => (cerca = ''), 700);
      const i = abilitate.find((k) => String(opzioni[k].etichetta).toLowerCase().startsWith(cerca));
      if (i !== undefined) { attiva = i; queueMicrotask(() => lista?.querySelector('[data-attiva]')?.scrollIntoView({ block: 'nearest' })); }
    }
  }
  function fuori(e) { if (aperta && !tasto?.contains(e.target) && !lista?.contains(e.target)) chiudi(false); }
  $effect(() => {
    if (!aperta) return;
    const via = () => chiudi(false);
    // la pagina scorre: il menu segue il campo (si chiude solo se il campo esce dallo schermo)
    const scorre = (e) => {
      if (lista?.contains(e.target)) return;
      const r = tasto?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > innerHeight) via(); else posiziona();
    };
    document.addEventListener('pointerdown', fuori, true);
    addEventListener('resize', via);
    addEventListener('scroll', scorre, true);
    return () => { document.removeEventListener('pointerdown', fuori, true); removeEventListener('resize', via); removeEventListener('scroll', scorre, true); };
  });
</script>

<span class="scelta-campo" class:breve>
  <button
    bind:this={tasto} type="button" class="input tasto" class:vuota={!scelta} {disabled}
    role="combobox" aria-haspopup="listbox" aria-expanded={aperta} aria-controls={uid}
    aria-activedescendant={aperta && attiva >= 0 ? uid + '-' + attiva : undefined}
    aria-label={etichetta || undefined}
    onclick={() => (aperta ? chiudi() : apri())} onkeydown={tastiera}
  >
    <span class="testo">{scelta ? scelta.etichetta : vuota}</span>
    <svg class="freccia" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>
  {#if required}
    <!-- per la validazione del modulo: vuoto finché non si sceglie -->
    <input class="validazione" tabindex="-1" aria-hidden="true" required value={scelta ? 'x' : ''} oninvalid={() => tasto?.focus()} />
  {/if}
  {#if aperta}
    <ul
      bind:this={lista} id={uid} role="listbox" class="menu" class:su={pos.su} aria-label={etichetta || undefined}
      style:left={pos.left + 'px'} style:width={pos.width + 'px'} style:max-height={pos.max + 'px'}
      style:top={pos.su ? null : pos.top + 'px'} style:bottom={pos.su ? innerHeight - pos.top + 'px' : null}
    >
      {#each opzioni as o, i (i)}
        {#if o.gruppo && o.gruppo !== opzioni[i - 1]?.gruppo}<li class="gruppo eti" role="presentation">{o.gruppo}</li>{/if}
        <li
          id={uid + '-' + i} role="option" aria-selected={o.valore === value} aria-disabled={o.disattiva || undefined}
          class:attiva={i === attiva} data-attiva={i === attiva || undefined}
          onpointerenter={() => { if (!o.disattiva) attiva = i; }}
          onpointerdown={(e) => e.preventDefault()}
          onclick={() => scegli(i)}
        >{o.etichetta}{#if o.valore === value}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}</li>
      {/each}
    </ul>
  {/if}
</span>

<style>
  /* dentro <label class="campo"> non prende lo stile dell'etichetta */
  .scelta-campo { position: relative; display: block; min-width: 0; text-transform: none; letter-spacing: normal; font-weight: 400; font-size: var(--t-nota); color: var(--inchiostro); }
  .gruppo { text-transform: uppercase; letter-spacing: 0.12em; }
  .scelta-campo.breve { display: inline-block; width: auto; }
  .tasto { display: flex; align-items: center; gap: var(--s-2); text-align: left; cursor: pointer; font: inherit; font-size: var(--t-nota); }
  .breve .tasto { width: auto; min-width: 9em; }
  .tasto .testo { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tasto.vuota .testo { color: var(--inchiostro-3); }
  .freccia { width: 12px; height: 12px; flex: none; color: var(--inchiostro-2); transition: transform var(--d-breve) var(--e-uscita); }
  .tasto[aria-expanded='true'] { border-bottom-color: var(--spot); }
  .tasto[aria-expanded='true'] .freccia { transform: rotate(180deg); }
  .tasto:disabled { cursor: default; opacity: 0.75; }
  .tasto:disabled .freccia { display: none; }
  .validazione { position: absolute; left: 50%; bottom: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; padding: 0; }
  .menu {
    position: fixed; z-index: 1000; margin: 0; padding: var(--s-1); list-style: none; overflow-y: auto; overscroll-behavior: contain;
    background: var(--carta-2); color: var(--inchiostro); border: 1px solid var(--matita-forte); border-radius: var(--r);
    box-shadow: var(--ombra); font-size: var(--t-ui);
    animation: entra var(--d-breve) var(--e-uscita);
  }
  .menu.su { transform-origin: bottom; }
  @keyframes entra { from { opacity: 0; transform: translateY(-4px); } }
  .menu.su { animation-name: entra-su; }
  @keyframes entra-su { from { opacity: 0; transform: translateY(4px); } }
  li[role='option'] {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s-2);
    min-height: 40px; padding: 6px 10px; border-radius: var(--r-piccolo); cursor: pointer;
  }
  li[role='option'] svg { width: 13px; height: 13px; flex: none; color: var(--spot); }
  li.attiva { background: var(--carta-3); }
  li[aria-selected='true'] { font-weight: 600; }
  li[aria-disabled='true'] { color: var(--inchiostro-3); cursor: default; }
  .gruppo { padding: 10px 10px 4px; color: var(--inchiostro-2); }
  @media (prefers-reduced-motion: reduce) { .menu { animation: none; } }
</style>
