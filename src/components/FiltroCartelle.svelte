<script>
  // Le cartelle sopra un elenco, come in un file manager: tutte, una cartella o chi non è in nessuna.
  // Si creano da qui, ci si trascinano dentro pazienti o gruppi, si rinominano e (per i gruppi) si archiviano in blocco.
  // Una cartella appena creata e ancora vuota resta su questo dispositivo finché non ci metti dentro qualcosa.
  import Icona from './Icona.svelte';
  let {
    tipo, cartelle = [], scelta = $bindable(''), conta = () => 0, gestisce = false,
    sposta, rinomina, azione = null,
  } = $props();

  const K = 'psy:cartelle-vuote:' + tipo;
  let vuote = $state((() => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch (e) { return []; } })());
  $effect(() => { try { localStorage.setItem(K, JSON.stringify(vuote)); } catch (e) { /* niente */ } });
  // quelle vuote spariscono da sole appena qualcuno ci entra
  $effect(() => { const via = vuote.filter((c) => cartelle.includes(c)); if (via.length) vuote = vuote.filter((c) => !cartelle.includes(c)); });
  const tutte = $derived([...new Set([...cartelle, ...vuote])].sort((a, b) => a.localeCompare(b, 'it')));
  // se la cartella scelta non c'è più (rinominata o svuotata altrove) si torna a «Tutte»
  $effect(() => { if (scelta && scelta !== '~' && !tutte.includes(scelta)) scelta = ''; });

  let creando = $state(false), nome = $state(''), sopra = $state(null), menu = $state(false);
  function crea() {
    const v = nome.trim().slice(0, 40);
    creando = false; nome = '';
    if (!v) return;
    if (!tutte.includes(v)) vuote = [...vuote, v];
    scelta = v;
  }
  async function rinominaScelta() {
    const v = (prompt('Nuovo nome della cartella', scelta) || '').trim().slice(0, 40);
    menu = false;
    if (!v || v === scelta) return;
    if (vuote.includes(scelta)) vuote = vuote.map((c) => (c === scelta ? v : c));
    else await rinomina?.(scelta, v);
    scelta = v;
  }
  async function togli() {
    menu = false;
    const n = conta(scelta);
    if (n && !confirm(`Togliere la cartella «${scelta}»? ${n === 1 ? 'L\'elemento resta' : `I ${n} elementi restano`}, solo senza cartella.`)) return;
    vuote = vuote.filter((c) => c !== scelta);
    if (n) await rinomina?.(scelta, '');
    scelta = '';
  }

  // trascinamento: gli elenchi mettono nel dataTransfer gli id come 'application/x-psy'
  const valido = (e) => gestisce && e.dataTransfer?.types?.includes('application/x-psy');
  function dentro(e, c) { if (!valido(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; sopra = c; }
  async function lascia(e, c) {
    if (!valido(e)) return;
    e.preventDefault(); sopra = null;
    const ids = e.dataTransfer.getData('application/x-psy').split(',').filter(Boolean);
    await sposta?.(ids, c === '~' ? '' : c);
  }
</script>

{#if tutte.length || gestisce}
  <div class="cartelle" role="group" aria-label="Cartelle">
    <button type="button" class="c" aria-pressed={scelta === ''} onclick={() => (scelta = '')}><Icona nome="griglia" />Tutte</button>
    {#each tutte as c (c)}
      <button type="button" class="c" class:sopra={sopra === c} aria-pressed={scelta === c} onclick={() => (scelta = c)}
        ondragover={(e) => dentro(e, c)} ondragleave={() => (sopra = null)} ondrop={(e) => lascia(e, c)}>
        <Icona nome="cartella" />{c} <span class="n">{conta(c)}</span>
      </button>
    {/each}
    {#if tutte.length}
      <button type="button" class="c" class:sopra={sopra === '~'} aria-pressed={scelta === '~'} onclick={() => (scelta = '~')}
        ondragover={(e) => dentro(e, '~')} ondragleave={() => (sopra = null)} ondrop={(e) => lascia(e, '~')}>Senza cartella <span class="n">{conta('~')}</span></button>
    {/if}
    {#if gestisce}
      {#if creando}
        <span class="nuova"><Icona nome="cartella" /><input class="input" bind:value={nome} placeholder="Nome della cartella" maxlength="40" aria-label="Nome della nuova cartella"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crea(); } if (e.key === 'Escape') { creando = false; nome = ''; } }} onblur={crea} /></span>
      {:else}
        <button type="button" class="c aggiungi" onclick={() => { creando = true; queueMicrotask(() => document.querySelector('.cartelle .nuova input')?.focus()); }}><Icona nome="piu" />Nuova cartella</button>
      {/if}
    {/if}
    {#if gestisce && scelta && scelta !== '~'}
      <span class="azioni">
        <button type="button" class="btn nudo piccolo" aria-expanded={menu} aria-label={'Azioni sulla cartella ' + scelta} onclick={() => (menu = !menu)}><Icona nome="altro" /></button>
        {#if menu}
          <span class="menu" role="menu">
            <button type="button" role="menuitem" onclick={rinominaScelta}>Rinomina la cartella</button>
            {#if azione && conta(scelta)}<button type="button" role="menuitem" onclick={async () => { menu = false; await azione.fai(scelta); }}>{azione.nome}</button>{/if}
            <button type="button" role="menuitem" onclick={togli}>Togli la cartella</button>
          </span>
        {/if}
      </span>
    {/if}
  </div>
  {#if gestisce && tutte.length}<p class="aiuto sotto">Trascina {tipo === 'gruppi' ? 'un gruppo o una classe' : 'un paziente'} su una cartella per spostarcelo.</p>{/if}
{/if}

<style>
  .cartelle { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 var(--s-2); }
  .c {
    display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 6px 12px; cursor: pointer;
    border: 1px solid var(--matita); border-radius: var(--r); background: transparent; color: var(--inchiostro-2);
    font: inherit; font-weight: 600; font-size: var(--t-sm);
    transition: background var(--d-breve), border-color var(--d-breve);
  }
  .c :global(.ico) { width: 16px; height: 16px; }
  .c:hover { border-color: var(--matita-forte); color: var(--inchiostro); }
  .c[aria-pressed='true'] { color: var(--inchiostro); background: var(--carta-2); border-color: var(--inchiostro); }
  .c.sopra { border-color: var(--spot); background: var(--spot-tenue); color: var(--spot-testo); border-style: dashed; }
  .aggiungi { border-style: dashed; }
  .n { font-weight: 400; font-size: 11px; opacity: 0.7; font-variant-numeric: tabular-nums; }
  .nuova { display: inline-flex; align-items: center; gap: 6px; color: var(--inchiostro-2); }
  .nuova :global(.ico) { width: 16px; height: 16px; }
  .nuova .input { min-height: 36px; padding: 4px 2px; width: 190px; font-size: var(--t-sm); }
  .azioni { position: relative; }
  .menu { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; display: grid; min-width: 220px; padding: 6px; background: var(--carta); border: 1px solid var(--matita-forte); border-radius: var(--r); box-shadow: var(--ombra); }
  .menu button { text-align: left; border: 0; background: none; font: inherit; font-size: var(--t-sm); padding: 8px 10px; border-radius: var(--r-piccolo); cursor: pointer; color: var(--inchiostro); }
  .menu button:hover { background: var(--carta-2); }
  .aiuto { margin: 0 0 var(--s-4); font-size: var(--t-xs); }
  @media (hover: none) { .aiuto { display: none; } }
</style>
