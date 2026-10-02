<script>
  // La settimana come agenda: una colonna per giorno, le ore in verticale, ogni
  // seduta alta quanto dura. Si vedono l'ordine, le sovrapposizioni (affiancate)
  // e gli spazi liberi; toccando uno spazio vuoto si crea una seduta a quell'ora.
  import { onMount } from 'svelte';
  import { titoloSeduta, statoSeduta, TIPI, serieDiSeduta } from '../lib/dati.svelte.js';
  import { numeroGiorno, nomeGiornoBreve, fineOra } from '../lib/date.js';
  import { intervallo, disponi, ora as oraDi } from '../lib/agenda.js';
  import { apriCrea } from '../lib/ui.svelte.js';
  import Cerchio from './Cerchio.svelte';

  let { giorni, perGiorno, oggi, scelta = null, apri, segno, piano } = $props();

  const K = 1.15;   // pixel per minuto: un'ora = 69px
  const tutte = $derived(giorni.flatMap((d) => perGiorno[d] || []));
  const ore = $derived(intervallo(tutte));
  const altezza = $derived((ore.a - ore.da) * K);
  const tacche = $derived(Array.from({ length: (ore.a - ore.da) / 60 + 1 }, (_, i) => ore.da + i * 60));
  const disposte = $derived(Object.fromEntries(giorni.map((d) => [d, disponi(perGiorno[d] || [])])));

  // linea dell'ora attuale
  let adesso = $state(new Date());
  onMount(() => { const t = setInterval(() => (adesso = new Date()), 60000); return () => clearInterval(t); });
  const minAdesso = $derived(adesso.getHours() * 60 + adesso.getMinutes());

  function nuova(e, d) {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const m = ore.da + Math.floor((e.clientY - r.top) / K / 15) * 15;
    apriCrea({ data: d, ora: oraDi(Math.max(ore.da, Math.min(ore.a - 15, m))) });
  }
</script>

<div class="agenda" style:--colonne={giorni.length} style:--altezza={altezza + 'px'} style:--ora={60 * K + 'px'}>
  <div class="angolo" aria-hidden="true"></div>
  {#each giorni as d (d)}
    <div class="intesta" class:oggi={d === oggi} class:passato={d < oggi}>
      <span class="eti">{nomeGiornoBreve(d)}</span>
      <span class="num display">{numeroGiorno(d)}{#if d === oggi}<Cerchio seme={numeroGiorno(d)} />{/if}</span>
    </div>
  {/each}

  <div class="ore" aria-hidden="true">
    {#each tacche as t (t)}<span style:top={(t - ore.da) * K + 'px'}>{oraDi(t)}</span>{/each}
  </div>
  {#each giorni as d (d)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="colonna" class:oggi={d === oggi} class:passato={d < oggi} onclick={(e) => nuova(e, d)} title="Tocca uno spazio libero per aggiungere una seduta">
      {#each disposte[d] as v (v.s.id)}
        {@const s = v.s}
        {@const st = statoSeduta(s)}
        {@const alta = (v.fine - v.inizio) * K}
        <a class="evento tipo-{s.tipo} stato-{st}" class:scelto={scelta === s.id} class:bassa={alta < 46}
          style:top={(v.inizio - ore.da) * K + 'px'} style:height={Math.max(alta, 24) + 'px'}
          style:left={`calc(${(100 * v.colonna) / v.colonne}% + 2px)`} style:width={`calc(${100 / v.colonne}% - 4px)`}
          href={'#/seduta/' + encodeURIComponent(s.id)} onclick={(e) => apri(e, s)}
          aria-current={scelta === s.id ? 'true' : undefined}
          title={`${s.ora}–${fineOra(s.ora, s.durata)} · ${titoloSeduta(s)} · ${TIPI[s.tipo].breve}`}>
          <span class="quando">{s.ora}<span class="fine">–{fineOra(s.ora, s.durata)}</span></span>
          <span class="chi display">{titoloSeduta(s)}</span>
          {#if alta >= 64}<span class="eti tipo">{#if s.serieId || serieDiSeduta(s)}↻ {/if}{TIPI[s.tipo].breve}</span>{/if}
          {#if alta >= 100 && s.argomento}<span class="piano">{piano(s)}</span>{/if}
          {#if segno(s)}<span class="mano segno">{segno(s)}</span>{/if}
        </a>
      {/each}
      {#if d === oggi && minAdesso >= ore.da && minAdesso <= ore.a}
        <span class="adesso" style:top={(minAdesso - ore.da) * K + 'px'} aria-label={'Adesso, ' + oraDi(minAdesso)}></span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .agenda {
    display: grid; grid-template-columns: 48px repeat(var(--colonne), minmax(0, 1fr)); grid-template-rows: auto var(--altezza);
    column-gap: 0; border-top: 1px solid var(--matita);
  }
  .angolo { border-bottom: 1px solid var(--matita); }
  .intesta { display: flex; align-items: baseline; gap: 6px; padding: var(--s-3) var(--s-2) var(--s-2); border-bottom: 1px solid var(--matita); border-left: 1px solid var(--matita); }
  .intesta .num { position: relative; font-size: 28px; line-height: 1; }
  .intesta .num :global(.cerchio) { left: -12px; top: -9px; width: 54px; height: 46px; }
  .intesta.oggi .eti { color: var(--spot-testo); }
  .intesta.passato .num { color: var(--inchiostro-2); }
  .ore { position: relative; }
  .ore span { position: absolute; right: 8px; transform: translateY(-50%); font-size: 11px; font-variant-numeric: tabular-nums; color: var(--inchiostro-3); }
  .ore span:first-child { transform: none; }
  .colonna {
    position: relative; border-left: 1px solid var(--matita); cursor: copy;
    background-image: repeating-linear-gradient(to bottom, var(--matita) 0 1px, transparent 1px var(--ora));
    background-size: 100% var(--ora);
  }
  .colonna.passato { background-color: color-mix(in srgb, var(--carta-2) 50%, transparent); }
  .evento {
    position: absolute; z-index: 1; display: flex; flex-direction: column; gap: 1px; overflow: hidden; min-width: 0;
    padding: 4px 7px; text-decoration: none; cursor: pointer;
    background: var(--carta-2); border: 1px solid var(--matita); border-left: 3px solid var(--inchiostro);
    border-radius: var(--r-piccolo) var(--r) var(--r) var(--r-piccolo);
    transition: box-shadow var(--d-breve) var(--e-uscita);
  }
  .evento:hover, .evento:focus-visible { z-index: 2; box-shadow: var(--ombra); }
  .evento.scelto { background: var(--carta); box-shadow: var(--ombra); z-index: 2; }
  .tipo-individuale { border-left-style: dashed; }
  .tipo-genitori { border-left: 3px double var(--inchiostro); }
  .tipo-conoscenza { border-left-style: dotted; }
  .stato-da-scrivere, .stato-oggi { border-left-color: var(--spot); }
  .quando { font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fine { font-weight: 400; color: var(--inchiostro-2); }
  .chi { font-size: 15px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .bassa { flex-direction: row; align-items: baseline; gap: 6px; padding-top: 2px; padding-bottom: 2px; }
  .bassa .chi { font-size: 13px; -webkit-line-clamp: 1; white-space: nowrap; display: block; }
  .tipo { font-size: 10px; }
  .piano { font-size: 12px; color: var(--inchiostro-2); line-height: 1.35; overflow: hidden; }
  .segno { position: absolute; right: 6px; bottom: 0; font-size: 15px; transform: rotate(-4deg); color: var(--spot-testo); }
  .adesso { position: absolute; left: -4px; right: 0; height: 0; border-top: 2px solid var(--spot); z-index: 3; pointer-events: none; }
  .adesso::before { content: ''; position: absolute; left: 0; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--spot); }
</style>
