<script>
  import { onMount } from 'svelte';
  import { dati, carica, sessione, impostaTema } from './lib/dati.svelte.js';
  import { rotta } from './lib/rotta.svelte.js';
  import { ui, apriCrea, chiudiCrea } from './lib/ui.svelte.js';
  import Icona from './components/Icona.svelte';
  import Cerca from './components/Cerca.svelte';
  import Crea from './components/Crea.svelte';
  import Visore from './components/Visore.svelte';
  import Aggiorna from './components/Aggiorna.svelte';
  import Ingresso from './components/centro/Ingresso.svelte';
  import StatoSync from './components/centro/StatoSync.svelte';
  import { REALE, DEMO } from './lib/centro/config.js';
  import StrisciaDemo from './components/centro/StrisciaDemo.svelte';
  import { sync, avvia } from './lib/centro/sync.svelte.js';
  import Calendario from './views/Calendario.svelte';
  import SedutaPagina from './views/SedutaPagina.svelte';
  import Ragazzi from './views/Ragazzi.svelte';
  import Ragazzo from './views/Ragazzo.svelte';
  import Gruppi from './views/Gruppi.svelte';
  import Gruppo from './views/Gruppo.svelte';
  import Diario from './views/Diario.svelte';
  import Sospesi from './views/Sospesi.svelte';
  import Nota from './views/Nota.svelte';
  import Impostazioni from './views/Impostazioni.svelte';
  import Ricorrenze from './views/Ricorrenze.svelte';

  let errore = $state('');

  onMount(() => {
    carica().then(() => (REALE ? avvia() : null)).catch((e) => { errore = e.message || String(e); });
    const tasti = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.target.closest?.('.cm-editor')) { e.preventDefault(); ui.cerca = true; }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName) && !e.target.closest?.('.cm-editor')) { e.preventDefault(); ui.cerca = true; }
    };
    window.addEventListener('keydown', tasti);
    return () => window.removeEventListener('keydown', tasti);
  });

  const sezione = $derived(rotta.parti[0] || 'calendario');
  const VOCI = [
    { id: 'calendario', nome: 'Calendario', ico: 'calendario' },
    { id: 'ragazzi', nome: 'Ragazzi', ico: 'persone' },
    { id: 'gruppi', nome: 'Gruppi', ico: 'gruppo' },
    { id: 'diario', nome: 'Diario', ico: 'diario' },
    { id: 'sospesi', nome: 'In sospeso', ico: 'sospesi' },
  ];
  const attiva = (id) => sezione === id || (id === 'ragazzi' && sezione === 'ragazzo') || (id === 'gruppi' && sezione === 'gruppo') || (id === 'calendario' && (sezione === 'seduta' || sezione === 'ricorrenze'));
  function tema() {
    const scuroOra = document.documentElement.dataset.tema === 'scuro' || (!document.documentElement.dataset.tema && matchMedia('(prefers-color-scheme: dark)').matches);
    impostaTema(scuroOra ? 'chiaro' : 'scuro');
  }
</script>

{#if REALE && dati.pronto && sync.fase !== 'pronto'}
  <Ingresso />
{:else}
<a class="salta" href="#principale">Vai al contenuto</a>
<Aggiorna />
{#if DEMO}<StrisciaDemo />{/if}
<header class="barra">
  <a class="marchio" href="#/calendario" aria-label="PsyDiary, calendario">
    <span class="display">Psy</span><span class="mano">diary</span>
  </a>
  <nav class="navigazione" aria-label="Sezioni">
    {#each VOCI as v (v.id)}
      <a href={'#/' + v.id} class:su={attiva(v.id)} aria-current={attiva(v.id) ? 'page' : undefined}>{v.nome}</a>
    {/each}
  </nav>
  <div class="azioni">
    {#if REALE}<StatoSync />{/if}
    <button class="cerca" onclick={() => (ui.cerca = true)}>
      <Icona nome="cerca" /><span>Cerca ragazzi, note, date</span><kbd>Ctrl K</kbd>
    </button>
    <button class="btn nudo" onclick={tema} aria-label="Cambia tema chiaro o scuro" title="Carta o inchiostro"><Icona nome="tema" /></button>
    <a class="btn nudo" href="#/impostazioni" aria-label="Impostazioni" title="Impostazioni"><Icona nome="ingranaggio" /></a>
    <button class="btn pieno nuova" onclick={() => apriCrea()}><Icona nome="piu" /><span>Scrivi</span></button>
  </div>
</header>

<main id="principale" tabindex="-1">
  {#if errore}
    <p class="vuoto">Non riesco ad aprire l'archivio del dispositivo: {errore}</p>
  {:else if !dati.pronto}
    <div class="carico" aria-busy="true"><span class="mano">apro il diario…</span></div>
  {:else if sezione === 'calendario'}
    <Calendario />
  {:else if sezione === 'seduta'}
    <SedutaPagina id={rotta.parti[1]} />
  {:else if sezione === 'ragazzi'}
    <Ragazzi />
  {:else if sezione === 'ragazzo'}
    {#key rotta.parti[1]}<Ragazzo id={rotta.parti[1]} />{/key}
  {:else if sezione === 'gruppi'}
    <Gruppi />
  {:else if sezione === 'gruppo'}
    {#key rotta.parti[1]}<Gruppo id={rotta.parti[1]} />{/key}
  {:else if sezione === 'diario'}
    {#key JSON.stringify(rotta.query)}<Diario />{/key}
  {:else if sezione === 'sospesi'}
    <Sospesi />
  {:else if sezione === 'nota'}
    {#key rotta.parti[1]}<Nota id={rotta.parti[1]} />{/key}
  {:else if sezione === 'ricorrenze'}
    <Ricorrenze />
  {:else if sezione === 'impostazioni'}
    <Impostazioni />
  {:else}
    <p class="vuoto">Pagina non trovata. <a href="#/calendario">Torna al calendario</a></p>
  {/if}
</main>

<nav class="sotto-nav" aria-label="Sezioni">
  {#each VOCI.slice(0, 4) as v (v.id)}
    <a href={'#/' + v.id} class:su={attiva(v.id)} aria-current={attiva(v.id) ? 'page' : undefined}><Icona nome={v.ico} /><span>{v.nome}</span></a>
  {/each}
  <button onclick={() => (ui.cerca = true)}><Icona nome="cerca" /><span>Cerca</span></button>
</nav>
<button class="scrivi-tel btn spot" onclick={() => apriCrea()} aria-label="Scrivi una nota"><Icona nome="piu" /> Scrivi</button>

{#if ui.cerca}<Cerca chiudi={() => (ui.cerca = false)} />{/if}
{#if ui.crea}<Crea opz={ui.crea} chiudi={chiudiCrea} />{/if}
{#if ui.visore}{#key ui.visore}<Visore id={ui.visore} chiudi={() => (ui.visore = null)} />{/key}{/if}
{/if}

<style>
  .salta { position: absolute; left: -999px; top: 8px; z-index: 1000; background: var(--inchiostro); color: var(--su-inchiostro); padding: 8px 12px; }
  .salta:focus { left: 8px; }
  .barra {
    position: sticky; top: 0; z-index: 600; height: var(--barra);
    display: flex; align-items: center; gap: var(--s-6); padding: 0 var(--s-6);
    background: color-mix(in oklch, var(--carta) 94%, transparent); backdrop-filter: saturate(1.1);
    border-bottom: 1px solid var(--matita);
  }
  .marchio { display: flex; align-items: baseline; text-decoration: none; }
  .marchio .display { font-size: 27px; line-height: 1; }
  .marchio .mano { font-size: 24px; margin-left: 1px; transform: translateY(2px); }
  .navigazione { display: flex; gap: var(--s-5); font-weight: 500; }
  .navigazione a { position: relative; text-decoration: none; color: var(--inchiostro-2); padding: 6px 0; transition: color var(--d-breve) var(--e-uscita); }
  .navigazione a:hover { color: var(--inchiostro); }
  .navigazione a.su { color: var(--inchiostro); }
  .navigazione a.su::after {
    content: ''; position: absolute; left: -3px; right: -3px; bottom: -1px; height: 7px;
    background: var(--spot);
    mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 8' preserveAspectRatio='none'><path d='M1 5 C 28 1, 62 7, 99 3' stroke='black' stroke-width='2.2' fill='none' stroke-linecap='round'/></svg>") center / 100% 100% no-repeat;
  }
  .azioni { margin-left: auto; display: flex; align-items: center; gap: var(--s-2); }
  .cerca {
    display: flex; align-items: center; gap: var(--s-2); min-width: 280px; min-height: 38px; padding: 6px 4px;
    border: 0; border-bottom: 1.5px solid var(--matita-forte); background: transparent; color: var(--inchiostro-2); cursor: pointer; text-align: left;
  }
  .cerca span { flex: 1; }
  .cerca:hover { border-bottom-color: var(--inchiostro-2); color: var(--inchiostro); }
  kbd { font: 600 11px var(--f-testo); letter-spacing: 0.04em; border: 1px solid var(--matita-forte); border-radius: var(--r); padding: 1px 5px; }
  main { outline: none; min-height: calc(100dvh - var(--barra)); }
  .carico { display: grid; place-items: center; min-height: 60vh; font-size: 28px; }
  .vuoto { padding: var(--s-7); text-align: center; color: var(--inchiostro-2); }
  .sotto-nav, .scrivi-tel { display: none; }

  @media (max-width: 1100px) {
    .cerca { min-width: 0; } .cerca span, .cerca kbd { display: none; }
    .navigazione { gap: var(--s-4); }
  }
  @media (max-width: 720px) {
    .barra { height: 52px; padding: 0 var(--s-4); gap: var(--s-3); }
    .navigazione, .cerca, .nuova { display: none; }
    main { padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
    .sotto-nav {
      display: grid; grid-template-columns: repeat(5, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 600;
      background: var(--carta-2); border-top: 1px solid var(--matita-forte); padding-bottom: env(safe-area-inset-bottom);
    }
    .sotto-nav a, .sotto-nav button {
      display: grid; justify-items: center; gap: 2px; padding: 8px 0 10px; font-size: 11px; font-weight: 600;
      text-decoration: none; color: var(--inchiostro-2); background: none; border: 0; cursor: pointer;
    }
    .sotto-nav .su { color: var(--spot-testo); }
    .scrivi-tel { display: inline-flex; position: fixed; right: var(--s-4); bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 590; min-height: 48px; padding: 10px 18px; box-shadow: var(--ombra); }
  }
  @media print { .barra, .sotto-nav, .scrivi-tel { display: none !important; } }
</style>
