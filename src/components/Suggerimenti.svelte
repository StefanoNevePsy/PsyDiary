<script>
  // Campo di testo libero con suggerimenti nel tema dell'app (una lista di
  // voci predefinite che si filtra mentre si scrive). Si può sempre scrivere
  // altro: i suggerimenti aiutano, non obbligano.
  // suggerimenti: [{ valore, gruppo? }]  · onscegli(v): voce scelta (o Invio)
  let {
    value = '', suggerimenti = [], oninput = null, onscegli = null, placeholder = '', etichetta = '',
    disabled = false, svuota = false, tutti = false,
  } = $props();

  const uid = 'su' + Math.random().toString(36).slice(2, 8);
  let testo = $state(value);
  $effect(() => { testo = value; });
  let aperta = $state(false), attiva = $state(-1);
  let campo = $state(), lista = $state();
  let pos = $state({ top: 0, left: 0, width: 0, max: 300, su: false });

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const filtrate = $derived.by(() => {
    const q = norm(testo);
    return suggerimenti.filter((s) => tutti || !q || norm(s.valore).includes(q)).slice(0, 60);
  });

  function posiziona() {
    if (!campo) return;
    const r = campo.getBoundingClientRect();
    const sotto = innerHeight - r.bottom - 12, sopra = r.top - 12;
    const su = sotto < 200 && sopra > sotto;
    pos = { left: Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 220) - 8)), width: Math.max(r.width, 220),
      top: su ? r.top - 4 : r.bottom + 4, max: Math.min(320, su ? sopra : sotto), su };
  }
  function apri() { if (disabled) return; posiziona(); aperta = true; attiva = -1; }
  function chiudi() { aperta = false; attiva = -1; }
  function scegli(v) {
    testo = svuota ? '' : v;
    oninput?.(v);
    onscegli?.(v);
    if (svuota) testo = '';
    chiudi();
  }
  function tasti(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aperta) apri();
      const n = filtrate.length; if (!n) return;
      attiva = e.key === 'ArrowDown' ? (attiva + 1) % n : (attiva - 1 + n) % n;
      queueMicrotask(() => lista?.querySelector('[data-attiva]')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      if (aperta && attiva >= 0 && filtrate[attiva]) { e.preventDefault(); scegli(filtrate[attiva].valore); }
      else if (svuota && testo.trim()) { e.preventDefault(); scegli(testo.trim()); }
    } else if (e.key === 'Escape' && aperta) { e.stopPropagation(); chiudi(); }
  }
  $effect(() => {
    if (!aperta) return;
    const via = () => posiziona();
    addEventListener('scroll', via, true); addEventListener('resize', via);
    return () => { removeEventListener('scroll', via, true); removeEventListener('resize', via); };
  });
</script>

<span class="sugg-campo">
  <input
    bind:this={campo} class="input" value={testo} {placeholder} {disabled} autocomplete="off"
    role="combobox" aria-expanded={aperta && filtrate.length > 0} aria-controls={uid} aria-autocomplete="list" aria-label={etichetta || undefined}
    aria-activedescendant={aperta && attiva >= 0 ? uid + '-' + attiva : undefined}
    oninput={(e) => { testo = e.currentTarget.value; if (!svuota) oninput?.(testo); if (!aperta) apri(); else posiziona(); attiva = -1; }}
    onfocus={apri} onclick={() => { if (!aperta) apri(); }} onblur={() => setTimeout(chiudi, 120)} onkeydown={tasti}
  />
  {#if aperta && filtrate.length}
    <ul bind:this={lista} id={uid} role="listbox" class="menu" class:su={pos.su} aria-label={etichetta || undefined}
      style:left={pos.left + 'px'} style:width={pos.width + 'px'} style:max-height={pos.max + 'px'}
      style:top={pos.su ? null : pos.top + 'px'} style:bottom={pos.su ? innerHeight - pos.top + 'px' : null}>
      {#each filtrate as s, i (s.valore)}
        {#if s.gruppo && s.gruppo !== filtrate[i - 1]?.gruppo}<li class="gruppo eti" role="presentation">{s.gruppo}</li>{/if}
        <li id={uid + '-' + i} role="option" aria-selected={i === attiva} class:attiva={i === attiva} data-attiva={i === attiva || undefined}
          onpointerenter={() => (attiva = i)} onpointerdown={(e) => e.preventDefault()} onclick={() => scegli(s.valore)}>{s.valore}</li>
      {/each}
    </ul>
  {/if}
</span>

<style>
  .sugg-campo { position: relative; display: block; min-width: 0; text-transform: none; letter-spacing: normal; font-weight: 400; font-size: var(--t-nota); color: var(--inchiostro); }
  .sugg-campo .input { width: 100%; }
  .menu {
    position: fixed; z-index: 1000; margin: 0; padding: var(--s-1); list-style: none; overflow-y: auto; overscroll-behavior: contain;
    background: var(--carta-2); color: var(--inchiostro); border: 1px solid var(--matita-forte); border-radius: var(--r);
    box-shadow: var(--ombra); font-size: var(--t-ui); animation: entra var(--d-breve) var(--e-uscita);
  }
  .menu.su { animation-name: entra-su; }
  @keyframes entra { from { opacity: 0; transform: translateY(-4px); } }
  @keyframes entra-su { from { opacity: 0; transform: translateY(4px); } }
  li[role='option'] { display: flex; align-items: center; min-height: 38px; padding: 6px 10px; border-radius: var(--r-piccolo); cursor: pointer; }
  li.attiva { background: var(--carta-3); }
  .gruppo { padding: 10px 10px 4px; color: var(--inchiostro-2); text-transform: uppercase; letter-spacing: 0.12em; font-size: 10.5px; }
  @media (prefers-reduced-motion: reduce) { .menu { animation: none; } }
</style>
