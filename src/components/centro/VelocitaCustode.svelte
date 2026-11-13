<script>
  // «Velocità del custode»: quanto aspetta l'app quando chiede «c'è qualcosa di nuovo?» e quando salva,
  // e quanta parte di quell'attesa è il lavoro del custode (il resto è il viaggio dei dati e l'avvio di
  // Apps Script). Le misure sono quelle delle ultime chiamate vere di questo dispositivo.
  import { velocita, misuraOra, cancellaMisure, sync } from '../../lib/centro/sync.svelte.js';
  import { riepilogo, durata, giudizio, righeFasi, operazioniDrive, FASI_TENUTE } from '../../lib/centro/misure.js';

  const VOCI = [
    { tipo: 'controllo', nome: 'Controllo novità', desc: 'Ogni volta che l\'app guarda se c\'è qualcosa di nuovo.' },
    { tipo: 'salvataggio', nome: 'Salvataggio', desc: 'Quando le tue modifiche partono verso il custode.' },
  ];
  const schede = $derived(VOCI.map((v) => {
    const r = riepilogo(velocita.misure, v.tipo);
    return { ...v, r, g: giudizio(r.mediana), tot: r.custode === null ? 0 : r.custode + r.resto };
  }));
  const pronto = $derived(sync.fase === 'pronto' && sync.online);
  const FASI = FASI_TENUTE;
  const nessuna = $derived(!velocita.misure.some((m) => m.tipo === 'controllo' || m.tipo === 'salvataggio'));
  // gli ultimi salvataggi col dettaglio del custode, dal più recente
  const dettagli = $derived([...velocita.fasi].reverse().map((m) => ({ ...m, righe: righeFasi(m.fasi), drive: operazioniDrive(m.fasi) })));
  const ora = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const percento = (c) => (c.tot > 0 ? Math.max(3, Math.min(97, (c.r.custode / c.tot) * 100)) : 0);

  function spiega(c) {
    const r = c.r;
    if (!r.n) return c.tipo === 'controllo' ? 'Ancora nessuna misura: usa l\'app oppure tocca «Misura ora».' : 'Ancora nessun salvataggio misurato: compare dopo la prossima modifica che salvi.';
    let t = `Di solito dura ${durata(r.mediana)}.`;
    if (r.custode !== null) t += ` Il custode ne impiega ${durata(r.custode)}; il resto, ${durata(r.resto)}, è il viaggio dei dati e il risveglio di Apps Script.`;
    else t += ' Questo custode non dice quanto impiega: aggiornalo per vederlo.';
    if (r.n >= 5 && r.massimo > 2500 && r.massimo > r.mediana * 3) t += ` Ogni tanto una risposta è molto più lenta (fino a ${durata(r.massimo)}): succede quando Apps Script si «addormenta» dopo un po' che nessuno lo usa.`;
    return t;
  }
</script>

<div class="velocita">
  <p class="sotto">Quanto aspetta l'app le risposte del custode, misurato sulle ultime chiamate fatte da questo dispositivo.</p>

  <div class="schede">
    {#each schede as c (c.tipo)}
      <article class="scheda" aria-labelledby={'vel-' + c.tipo}>
        <header>
          <h3 id={'vel-' + c.tipo}>{c.nome}</h3>
          {#if c.g}<span class="giudizio g-{c.g.livello}">{c.g.testo}</span>{/if}
        </header>
        <p class="sotto piccolo">{c.desc}</p>
        {#if c.r.n}
          <dl class="numeri">
            <div><dt>Tempo tipico</dt><dd>{durata(c.r.mediana)}</dd></div>
            <div><dt>Tempo medio</dt><dd>{durata(c.r.media)}</dd></div>
            <div><dt>Misure</dt><dd>{c.r.n}</dd></div>
          </dl>
          {#if c.r.custode !== null}
            <div class="barra" role="img" aria-label={`Su ${durata(c.tot)} di attesa, ${durata(c.r.custode)} sono il lavoro del custode e ${durata(c.r.resto)} il viaggio dei dati e l'avvio di Apps Script`}>
              <span class="custode" style:width={percento(c) + '%'}></span><span class="rete"></span>
            </div>
            <ul class="legenda">
              <li><i class="pallino custode" aria-hidden="true"></i>Il custode lavora <b>{durata(c.r.custode)}</b></li>
              <li><i class="pallino rete" aria-hidden="true"></i>Viaggio e avvio di Apps Script <b>{durata(c.r.resto)}</b></li>
            </ul>
          {/if}
        {/if}
        <p class="spiega">{spiega(c)}</p>
      </article>
    {/each}
  </div>

  <details class="dettagli">
    <summary>Dettagli</summary>
    <p class="sotto piccolo">Dove va il tempo del custode negli ultimi {FASI} salvataggi (più recente in alto). «Quante · quanto» è il numero di operazioni e il tempo che hanno richiesto. Utile da mostrare a chi mantiene PsyDiary.</p>
    {#if dettagli.length}
      <div class="salvataggi">
        {#each dettagli as m (m.t)}
          <section class="salvataggio" aria-label={'Salvataggio delle ' + ora(m.t)}>
            <h4>{ora(m.t)} <span class="sotto">· totale {durata(m.totale)}{m.ms !== null ? ` · custode ${durata(m.ms)}` : ''}{m.drive ? ` · ${m.drive} operazioni su Drive` : ''}</span></h4>
            <dl class="righe">
              {#each m.righe as [nome, valore] (nome)}
                <div><dt>{nome}</dt><dd>{valore}</dd></div>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
    {:else}
      <p class="sotto piccolo">Nessun salvataggio con dettagli: compare dopo la prossima modifica che salvi (serve il custode aggiornato).</p>
    {/if}
  </details>

  <div class="azioni">
    <button class="btn" onclick={() => misuraOra()} disabled={velocita.misurando || !pronto}>
      {velocita.misurando ? `Misuro… ${velocita.passo} di 3` : 'Misura ora'}
    </button>
    {#if !nessuna}<button class="btn nudo" onclick={cancellaMisure} disabled={velocita.misurando}>Cancella le misure</button>{/if}
  </div>
  <p class="sotto piccolo" aria-live="polite">
    {#if velocita.errore}Misura non riuscita: {velocita.errore}
    {:else if velocita.ultima.length}Tre controlli appena fatti: {velocita.ultima.map((m) => durata(m.totale)).join(' · ')}. Il primo può essere più lento se Apps Script dormiva.
    {:else if !pronto}La misura è possibile quando l'app è collegata al custode.
    {:else}«Misura ora» fa tre controlli di seguito, senza toccare i tuoi dati.{/if}
  </p>
</div>

<style>
  .velocita { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-3); width: 100%; justify-items: start; }
  .schede { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: var(--s-3); width: 100%; }
  .scheda { display: grid; gap: var(--s-2); align-content: start; padding: var(--s-4); background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande); min-width: 0; }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; }
  h3 { margin: 0; font: 600 var(--t-ui) var(--f-testo); }
  .giudizio { font-size: var(--t-xs); font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--matita-forte); color: var(--inchiostro); }
  .g-bene { background: oklch(0.62 0.12 150 / 0.2); border-color: oklch(0.55 0.12 150 / 0.7); }
  .g-medio { background: oklch(0.74 0.14 80 / 0.22); border-color: oklch(0.6 0.13 80 / 0.7); }
  .g-lento { background: var(--spot-tenue); border-color: var(--spot-retino); }
  .numeri { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-5); margin: var(--s-1) 0 0; }
  .numeri div { display: grid; gap: 2px; }
  dt { font-size: var(--t-xs); color: var(--inchiostro-2); }
  dd { margin: 0; font: 400 var(--t-md) var(--f-display); line-height: 1.1; }
  .barra { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: var(--carta-3); box-shadow: inset 0 0 0 1px var(--matita); margin-top: var(--s-1); }
  .barra .custode { background: var(--spot); }
  .barra .rete { flex: 1; background: var(--inchiostro-3); opacity: 0.55; }
  .legenda { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: var(--t-sm); color: var(--inchiostro-2); }
  .legenda b { color: var(--inchiostro); font-weight: 600; white-space: nowrap; }
  .pallino { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  .pallino.custode { background: var(--spot); }
  .pallino.rete { background: var(--inchiostro-3); }
  .spiega { margin: var(--s-1) 0 0; font-size: var(--t-sm); color: var(--inchiostro-2); max-width: 62ch; }
  .azioni { display: flex; flex-wrap: wrap; gap: var(--s-2); }
  .dettagli { width: 100%; }
  .dettagli summary { cursor: pointer; font: 600 var(--t-sm) var(--f-testo); color: var(--inchiostro-2); padding: var(--s-1) 0; }
  .salvataggi { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: var(--s-2); margin-top: var(--s-2); }
  .salvataggio { padding: var(--s-3); background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande); min-width: 0; }
  h4 { margin: 0 0 var(--s-1); font: 600 var(--t-sm) var(--f-testo); }
  h4 .sotto { font-weight: 400; }
  .righe { display: grid; gap: 2px; margin: 0; }
  .righe div { display: grid; grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr); gap: var(--s-2); font-size: var(--t-xs); }
  .righe dd { font: 400 var(--t-xs) var(--f-testo); overflow-wrap: anywhere; }
  @media (max-width: 720px) { .scheda { padding: var(--s-3); } }
</style>
