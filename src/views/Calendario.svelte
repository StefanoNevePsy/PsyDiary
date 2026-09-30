<script>
  // Il calendario come un taccuino: una riga per giorno, biglietti per le sedute.
  // Su schermi larghi il foglio della seduta si apre accanto.
  import { onMount } from 'svelte';
  import { rotta, vai } from '../lib/rotta.svelte.js';
  import { sedutePeriodo, titoloSeduta, statoSeduta, TIPI, partecipantiSeduta, presente } from '../lib/dati.svelte.js';
  import {
    oggi, piu, lunedi, primoDelMese, meseDopo, numeroSettimana, numeroGiorno, nomeGiornoBreve, nomeGiorno, nomeMese, anno, breve, giornoSettimana, fineOra, daIso,
  } from '../lib/date.js';
  import { anteprima, daFare } from '../lib/testo.js';
  import { apriCrea } from '../lib/ui.svelte.js';
  import Cerchio from '../components/Cerchio.svelte';
  import Foglio from '../components/Foglio.svelte';
  import Icona from '../components/Icona.svelte';
  import Immagine from '../components/Immagine.svelte';
  import { gruppo as gruppoDi, ragazzo as ragazzoDi, serieDiSeduta } from '../lib/dati.svelte.js';

  const vista = $derived(rotta.parti[1] === 'mese' ? 'mese' : 'settimana');
  const base = $derived(/^\d{4}-\d{2}-\d{2}$/.test(rotta.parti[2] || '') ? rotta.parti[2] : oggi());
  const O = oggi();

  // settimana
  const lun = $derived(lunedi(base));
  const giorni = $derived(Array.from({ length: 7 }, (_, i) => piu(lun, i)));
  const sedute = $derived(sedutePeriodo(lun, piu(lun, 6)));
  const perGiorno = $derived(Object.fromEntries(giorni.map((d) => [d, sedute.filter((s) => s.data === d)])));
  const visibili = $derived(giorni.filter((d) => giornoSettimana(d) < 6 || perGiorno[d].length || d === O));

  // mese
  const primo = $derived(primoDelMese(base));
  const celle = $derived.by(() => {
    const inizio = lunedi(primo);
    const fine = piu(meseDopo(primo, 1), -1);
    const out = [];
    for (let d = inizio; d <= fine || giornoSettimana(d) !== 1; d = piu(d, 1)) out.push(d);
    return out;
  });
  const seduteMese = $derived(vista === 'mese' ? sedutePeriodo(celle[0], celle[celle.length - 1]) : []);

  const titolo = $derived.by(() => {
    if (vista === 'mese') return `${nomeMese(primo)} ${anno(primo)}`;
    const fine = piu(lun, 6);
    return daIso(lun).getMonth() === daIso(fine).getMonth() ? `${numeroGiorno(lun)}–${numeroGiorno(fine)} ${nomeMese(fine)}` : `${breve(lun)} – ${breve(fine)}`;
  });
  function sposta(n) { vai(`calendario/${vista}/${vista === 'mese' ? meseDopo(primo, n) : piu(lun, 7 * n)}`); }

  // foglio accanto su schermi larghi
  let largo = $state(false);
  let sel = $state(null);
  let chiave = $state(0);
  let toccato = false;
  onMount(() => {
    const mq = matchMedia('(min-width: 1180px)');
    const f = () => (largo = mq.matches);
    f(); mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  });
  const selezionata = $derived(sel ? sedute.find((s) => s.id === sel) || null : null);
  function apri(e, s) {
    if (!largo) return; // su telefono e tablet si va alla pagina della seduta
    e.preventDefault();
    toccato = true;
    if (sel === s.id) { sel = null; return; }
    sel = s.id; chiave++;
  }
  // all'apertura, su schermo largo, si mostra la seduta di oggi o l'ultima da scrivere
  $effect(() => {
    if (!largo || sel || toccato || vista !== 'settimana') return;
    const cand = sedute.find((s) => s.data === O) || sedute.filter((s) => statoSeduta(s) === 'da-scrivere').at(-1);
    if (cand) { sel = cand.id; chiave++; }
  });

  const miniatura = (s) => (s.tipo === 'gruppo' ? gruppoDi(s.gruppoId)?.copertina : ragazzoDi(s.ragazzoId)?.foto) || null;
  const segno = (s) => ({ 'da-scrivere': 'da scrivere', oggi: 'oggi' })[statoSeduta(s)] || '';
  const piano = (s) => {
    const f = daFare(s.argomento);
    return f.length ? f.slice(0, 2).join(' · ') + (f.length > 2 ? ' …' : '') : anteprima(s.argomento, 90);
  };
  const assenti = (s) => s.tipo === 'gruppo' ? partecipantiSeduta(s).filter((r) => !presente(s, r)).length : 0;
</script>

<section class="cal" class:con-foglio={largo && selezionata && vista === 'settimana'}>
  <header class="testa">
    <div>
      <p class="eti">{vista === 'mese' ? 'Mese' : `Settimana ${numeroSettimana(lun)} · ${anno(lun)}`}</p>
      <h1 class="display">{titolo}</h1>
    </div>
    <div class="comandi">
      <div class="gruppo-btn azioni-cal">
        <button class="btn pieno piccolo" onclick={() => apriCrea({ data: vista === 'mese' ? O : (giorni.includes(O) ? O : lun) })}><Icona nome="piu" /> Seduta</button>
        <a class="btn nudo piccolo" href="#/ricorrenze" title="Appuntamenti che si ripetono"><span class="giro">↻</span> Ricorrenze</a>
      </div>
      <div class="gruppo-btn">
        <button class="btn nudo" onclick={() => sposta(-1)} aria-label={vista === 'mese' ? 'Mese precedente' : 'Settimana precedente'}><Icona nome="sinistra" /></button>
        <a class="btn" href={`#/calendario/${vista}/${O}`}>Oggi</a>
        <button class="btn nudo" onclick={() => sposta(1)} aria-label={vista === 'mese' ? 'Mese successivo' : 'Settimana successiva'}><Icona nome="destra" /></button>
      </div>
      <div class="vista" role="group" aria-label="Vista">
        <a href={`#/calendario/settimana/${base}`} aria-current={vista === 'settimana' ? 'true' : undefined}>Settimana</a>
        <a href={`#/calendario/mese/${base}`} aria-current={vista === 'mese' ? 'true' : undefined}>Mese</a>
      </div>
    </div>
  </header>

  {#if vista === 'settimana'}
    <div class="corpo">
      <ol class="giorni">
        {#each visibili as d (d)}
          <li class="giorno" class:oggi={d === O} class:passato={d < O}>
            <div class="data">
              <span class="num display">{numeroGiorno(d)}{#if d === O}<Cerchio seme={numeroGiorno(d)} />{/if}</span>
              <span class="eti">{nomeGiorno(d)}</span>
            </div>
            <div class="biglietti">
              {#each perGiorno[d] as s (s.id)}
                {@const st = statoSeduta(s)}
                <a class="biglietto tipo-{s.tipo} stato-{st}" class:scelto={largo && sel === s.id}
                  href={'#/seduta/' + encodeURIComponent(s.id)} onclick={(e) => apri(e, s)} aria-current={largo && sel === s.id ? 'true' : undefined}>
                  <span class="ora">{s.ora}<span class="fine">–{fineOra(s.ora, s.durata)}</span></span>
                  <span class="tit">
                    <span class="nome display">{titoloSeduta(s)}</span>
                    <span class="eti tipo">{#if s.serieId || serieDiSeduta(s)}<span class="giro-mini" title="Si ripete">↻ </span>{/if}{TIPI[s.tipo].breve}{assenti(s) ? ` · ${assenti(s)} assent${assenti(s) > 1 ? 'i' : 'e'}` : ''}</span>
                  </span>
                  {#if s.argomento}<span class="piano">{piano(s)}</span>{:else if st === 'futura'}<span class="piano vuoto">nessun piano ancora</span>{/if}
                  {#if segno(s)}<span class="mano segno">{segno(s)}</span>{/if}
                  {#if miniatura(s)}<span class="mini"><Immagine id={miniatura(s)} forma={s.tipo === 'gruppo' ? 'foglio' : 'tondo'} seme={s.gruppoId || s.ragazzoId} piccola colori={false} /></span>{/if}
                </a>
              {:else}
                <span class="niente">—</span>
              {/each}
            </div>
            <button class="aggiungi" onclick={() => apriCrea({ data: d })} aria-label={'Aggiungi il ' + nomeGiorno(d) + ' ' + numeroGiorno(d)} title="Aggiungi una seduta o una nota"><Icona nome="piu" /></button>
          </li>
        {/each}
      </ol>
      {#if largo && selezionata}
        <aside class="lato" aria-label="Seduta selezionata">
          {#key chiave}
            <Foglio s={selezionata} alCambioId={(id, via) => { if (via) sel = null; else sel = id; }} />
          {/key}
        </aside>
      {/if}
    </div>
  {:else}
    <div class="mese" role="grid" aria-label={titolo}>
      {#each ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] as g (g)}<div class="eti intesta" role="columnheader">{g}</div>{/each}
      {#each celle as d (d)}
        {@const qui = seduteMese.filter((s) => s.data === d)}
        <div class="cella" class:fuori={d.slice(0, 7) !== primo.slice(0, 7)} class:oggi={d === O} role="gridcell">
          <a class="n display" href={`#/calendario/settimana/${d}`} aria-label={'Settimana del ' + numeroGiorno(d) + ' ' + nomeMese(d)}>{numeroGiorno(d)}{#if d === O}<Cerchio seme={3} />{/if}</a>
          {#each qui.slice(0, 3) as s (s.id)}
            <a class="riga stato-{statoSeduta(s)} tipo-{s.tipo}" href={'#/seduta/' + encodeURIComponent(s.id)}><span class="o">{s.ora}</span> {titoloSeduta(s)}</a>
          {/each}
          {#if qui.length > 3}<a class="altre" href={`#/calendario/settimana/${d}`}>+{qui.length - 3}</a>{/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .cal { padding: var(--s-6) var(--s-6) var(--s-8); max-width: 1480px; margin: 0 auto; }
  .testa { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-5); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .comandi { display: flex; gap: var(--s-4); align-items: center; flex-wrap: wrap; }
  .gruppo-btn { display: flex; align-items: center; gap: 2px; }
  .vista { display: flex; padding: 3px; gap: 2px; border: 1px solid var(--matita-forte); border-radius: 999px; }
  .vista a { border-radius: 999px; padding: 5px 14px; text-decoration: none; font-weight: 600; font-size: var(--t-sm); color: var(--inchiostro-2); }
  .vista a[aria-current] { background: var(--inchiostro); color: var(--su-inchiostro); }

  .corpo { display: grid; grid-template-columns: 1fr; gap: var(--s-6); align-items: start; }
  .con-foglio .corpo { grid-template-columns: minmax(0, 1fr) minmax(460px, 600px); }
  .lato { position: sticky; top: calc(var(--barra) + var(--s-4)); max-height: calc(100dvh - var(--barra) - var(--s-6)); overflow: auto; overscroll-behavior: contain; }

  .giorni { list-style: none; margin: 0; padding: 0; }
  .giorno { display: grid; grid-template-columns: 110px 1fr auto; gap: var(--s-4); padding: var(--s-4) 0; border-top: 1px solid var(--matita); }
  .giorno:last-child { border-bottom: 1px solid var(--matita); }
  .data { display: grid; align-content: start; gap: 2px; }
  .num { position: relative; font-size: 44px; line-height: 0.9; width: max-content; }
  .num :global(.cerchio) { left: -16px; top: -12px; width: 78px; height: 64px; }
  .passato .num { color: var(--inchiostro-2); }
  .oggi .eti { color: var(--spot-testo); }

  .biglietti { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: stretch; min-height: 44px; }
  .biglietto {
    position: relative; display: grid; grid-template-columns: auto 1fr; gap: 2px var(--s-3); align-content: start;
    width: min(100%, 330px); padding: 10px 14px 12px; text-decoration: none;
    background: var(--carta-2); border: 1px solid var(--matita); border-left: 3px solid var(--inchiostro); border-radius: var(--r-piccolo) var(--r-grande) var(--r-grande) var(--r-piccolo);
    transition: transform var(--d-breve) var(--e-uscita), box-shadow var(--d-breve) var(--e-uscita);
  }
  .biglietto:hover { transform: translateY(-1px); box-shadow: var(--ombra); }
  .tipo-individuale { border-left-style: dashed; }
  .tipo-genitori { border-left: 3px double var(--inchiostro); }
  .stato-da-scrivere, .stato-oggi { border-left-color: var(--spot); }
  .biglietto.scelto { background: var(--carta); box-shadow: var(--ombra); }
  /* nastro adesivo sul biglietto aperto */
  .biglietto.scelto::before {
    content: ''; position: absolute; top: -9px; left: 50%; width: 64px; height: 18px; transform: translateX(-50%) rotate(-3deg);
    background: var(--spot-retino); opacity: 0.7;
    mask: radial-gradient(circle, #000 1.1px, transparent 1.3px) 0 0 / 4px 4px;
  }
  .ora { font-weight: 700; font-variant-numeric: tabular-nums; font-size: var(--t-sm); padding-top: 3px; }
  .fine { font-weight: 400; color: var(--inchiostro-2); }
  .tit { display: grid; }
  .biglietto:has(.mini) .tit { padding-right: 44px; }
  .mini { position: absolute; right: 10px; top: 10px; width: 40px; height: 40px; }
  .biglietto:has(.segno) { padding-bottom: 22px; }
  .tipo-conoscenza { border-left-style: dotted; }
  .nome { font-size: 19px; line-height: 1.15; }
  .tipo { font-size: 10.5px; }
  .piano { grid-column: 2; font-size: var(--t-sm); color: var(--inchiostro-2); line-height: 1.4; margin-top: 4px; }
  .piano.vuoto { font-style: italic; color: var(--inchiostro-3); }
  .segno { position: absolute; left: 14px; bottom: 4px; font-size: 18px; transform: rotate(-4deg); }
  .niente { color: var(--inchiostro-3); padding-top: 10px; }
  .aggiungi {
    align-self: start; margin-top: 4px; width: 36px; height: 36px; display: grid; place-items: center; border: 1px dashed var(--matita-forte);
    background: transparent; border-radius: 50%; color: var(--inchiostro-2); cursor: pointer; opacity: 0.35; transition: opacity var(--d-breve);
  }
  .giorno { position: relative; }
  .giro { font-family: var(--f-mano); font-size: 18px; color: var(--spot-testo); line-height: 1; }
  .giro-mini { letter-spacing: 0; }
  .azioni-cal { gap: var(--s-2); }
  .giorno:hover .aggiungi, .aggiungi:focus-visible { opacity: 1; }
  .con-foglio .biglietto { width: min(100%, 300px); }

  .mese { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-left: 1px solid var(--matita); border-top: 1px solid var(--matita); border-radius: var(--r-grande); overflow: hidden; }
  .intesta { padding: 6px 8px; border-right: 1px solid var(--matita); border-bottom: 1px solid var(--matita); }
  .cella { min-height: 118px; padding: 6px 8px; border-right: 1px solid var(--matita); border-bottom: 1px solid var(--matita); display: grid; align-content: start; gap: 3px; min-width: 0; }
  .cella.fuori { background: var(--carta-2); }
  .cella.fuori .n { color: var(--inchiostro-3); }
  .n { position: relative; font-size: 22px; text-decoration: none; width: max-content; }
  .n :global(.cerchio) { left: -12px; top: -8px; width: 50px; height: 40px; }
  .riga { border-radius: 0 var(--r-piccolo) var(--r-piccolo) 0; font-size: 12.5px; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 6px; border-left: 2px solid var(--inchiostro); line-height: 1.5; }
  .riga.tipo-individuale { border-left-style: dotted; }
  .riga.stato-da-scrivere, .riga.stato-oggi { border-left-color: var(--spot); }
  .riga:hover { background: var(--carta-3); }
  .o { font-weight: 700; font-variant-numeric: tabular-nums; }
  .altre { font-size: 12px; font-weight: 600; color: var(--spot-testo); text-decoration: none; }

  @media (max-width: 720px) {
    .cal { padding: var(--s-4) var(--s-4) var(--s-7); }
    h1 { font-size: var(--t-lg); }
    .comandi { width: 100%; justify-content: space-between; }
    .giorno { grid-template-columns: 1fr; gap: var(--s-2); padding: var(--s-3) 0 var(--s-4); }
    .data { display: flex; align-items: baseline; gap: var(--s-2); }
    .num { font-size: 30px; }
    .num :global(.cerchio) { left: -12px; top: -10px; width: 58px; height: 50px; }
    .biglietto { width: 100%; }
    .aggiungi { position: absolute; right: 0; top: var(--s-2); width: 34px; height: 34px; opacity: 0.8; }
    .azioni-cal { width: 100%; justify-content: space-between; }
    .cella { min-height: 64px; padding: 4px; }
    .riga { font-size: 0; padding: 0; height: 5px; border-left: 0; background: var(--inchiostro); }
    .riga.stato-da-scrivere, .riga.stato-oggi { background: var(--spot); }
    .n { font-size: 17px; }
    .altre { font-size: 11px; }
  }
</style>
