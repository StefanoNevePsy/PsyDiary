<script>
  // Nella seduta: l'unità del programma da fare (ritmo per sedute). "Usa" la
  // collega alla seduta e ne porta le attività nel piano; "Un'altra" sceglie
  // un'altra unità o un'attività libera; "Salta" la toglie dal percorso.
  // Una seduta collegata è "fatta" quando ha il resoconto, ma si può segnare
  // come non fatta (resta da fare per la prossima).
  import { dati, gruppo, ragazzo, salva, puoGestire } from '../lib/dati.svelte.js';
  import { prossima, statoUnita, trova, pianoDi, unitaInOrdine, sedutaFatta } from '../lib/programmi.js';
  import Immagine from './Immagine.svelte';
  import Icona from './Icona.svelte';

  // s: la seduta (copia del foglio) · collega(prog, testoPiano): la modifica nel foglio
  let { s, collega, scollega, esito } = $props();

  const soggetto = $derived(s.tipo === 'gruppo' ? gruppo(s.gruppoId) : s.tipo === 'individuale' ? ragazzo(s.ragazzoId) : null);
  const attive = $derived((soggetto?.programmi || []).filter((a) => !a.chiusa));
  const sedute = $derived(dati.sedute.filter((x) => (s.tipo === 'gruppo' ? x.tipo === 'gruppo' && x.gruppoId === s.gruppoId : x.tipo === 'individuale' && x.ragazzoId === s.ragazzoId)));
  const legata = $derived(s.programma ? attive.find((a) => a.id === s.programma.assegnazione) || (soggetto?.programmi || []).find((a) => a.id === s.programma.assegnazione) : null);
  const trovata = $derived(legata ? trova(legata, s.programma.unita) : null);
  const fatta = $derived(sedutaFatta(s));
  const passata = $derived(!!(s.resoconto && s.resoconto.trim()));

  function usa(a, uid) {
    collega({ assegnazione: a.id, unita: uid, ...(trova(a, uid)?.libera ? { libera: true } : {}) }, pianoDi(a, uid));
    scelta = null;
  }
  async function salta(a, uid) {
    const g = soggetto;
    const programmi = (g.programmi || []).map((x) => (x.id === a.id ? { ...x, saltate: [...(x.saltate || []), uid] } : x));
    await salva(s.tipo === 'gruppo' ? 'gruppi' : 'ragazzi', { ...$state.snapshot(g), programmi });
  }
  let scelta = $state(null);       // assegnazione di cui si sta scegliendo un'altra unità
</script>

{#if legata && trovata}
  <aside class="dal-programma legata" aria-label="Unità del programma">
    {#if trovata.modulo}<span class="img"><Immagine id={trovata.modulo.immagine} forma="tondo" seme={trovata.modulo.id} iniziale={(trovata.modulo.nome || '?')[0]} piccola /></span>{/if}
    <div class="testo">
      <p class="eti">{legata.nome}{trovata.modulo?.nome ? ' · ' + trovata.modulo.nome : ''}{trovata.libera ? ' · attività libera' : ''}</p>
      <p class="tit display">{trovata.unita.titolo}</p>
      {#if trovata.unita.obiettivi}<p class="sotto piccolo">{trovata.unita.obiettivi}</p>{/if}
      {#if !trovata.libera}
        <p class="esito sotto piccolo">
          {#if fatta}<span class="ok">✓ fatta</span>{s.programma.esito === 'fatta' ? '' : ' (con il resoconto)'} · <button type="button" class="link" onclick={() => esito('non-fatta')}>segna come non fatta</button>
          {:else if s.programma.esito === 'non-fatta'}non fatta: resta da fare per la prossima · <button type="button" class="link" onclick={() => esito(null)}>annulla</button>
          {:else if passata}<button type="button" class="link" onclick={() => esito('fatta')}>segna come fatta</button>
          {:else}diventa fatta quando scrivi il resoconto{/if}
        </p>
      {/if}
    </div>
    <div class="bottoni">
      <button type="button" class="btn nudo piccolo" onclick={() => (scelta = scelta ? null : legata.id)}>Cambia</button>
      <button type="button" class="btn nudo piccolo" onclick={scollega} title="Questa seduta non fa parte del programma">Togli</button>
    </div>
  </aside>
{:else if !s.programma}
  {#each attive as a (a.id)}
    {@const pr = prossima(a, sedute, s.id)}
    <aside class="dal-programma" aria-label={'Dal programma ' + a.nome}>
      {#if pr?.modulo}<span class="img"><Immagine id={pr.modulo.immagine} forma="tondo" seme={pr.modulo.id} iniziale={(pr.modulo.nome || '?')[0]} piccola /></span>{/if}
      <div class="testo">
        <p class="eti">Dal programma · {a.nome}{pr?.modulo?.nome ? ' · ' + pr.modulo.nome : ''}</p>
        {#if pr}<p class="tit display">{pr.unita.titolo}</p>{#if pr.unita.obiettivi}<p class="sotto piccolo">{pr.unita.obiettivi}</p>{/if}
        {:else}<p class="sotto">Tutte le unità sono fatte. Puoi scegliere un'attività libera.</p>{/if}
      </div>
      <div class="bottoni">
        {#if pr}<button type="button" class="btn piccolo pieno" onclick={() => usa(a, pr.unita.id)}><Icona nome="freccia" /> Usa</button>{/if}
        <button type="button" class="btn nudo piccolo" onclick={() => (scelta = scelta === a.id ? null : a.id)}>Un'altra…</button>
        {#if pr && puoGestire()}<button type="button" class="btn nudo piccolo" onclick={() => salta(a, pr.unita.id)} title="Non la faremo: si passa alla successiva">Salta</button>{/if}
      </div>
    </aside>
  {/each}
{/if}

{#if scelta}
  {@const a = (soggetto?.programmi || []).find((x) => x.id === scelta)}
  {#if a}
    {@const st = statoUnita(a, sedute.filter((x) => x.id !== s.id))}
    <div class="scelta-unita" role="listbox" aria-label="Scegli l'unità">
      {#each a.moduli as m (m.id)}
        <p class="eti">{m.nome || 'Modulo'}</p>
        {#each m.unita || [] as u (u.id)}
          {@const x = st.get(u.id)}
          <button type="button" role="option" aria-selected={s.programma?.unita === u.id} class={'stato-' + x.stato} onclick={() => usa(a, u.id)}>
            <span class="segno">{x.stato === 'fatta' ? '✓' : x.stato === 'prevista' ? '◷' : x.stato === 'saltata' ? '–' : '○'}</span> {u.titolo}{u.facoltativa ? ' (facoltativa)' : ''}
          </button>
        {/each}
      {/each}
      {#if a.libere?.length}
        <p class="eti">Attività libere</p>
        {#each a.libere as l (l.id)}<button type="button" role="option" aria-selected={s.programma?.unita === l.id} onclick={() => usa(a, l.id)}><span class="segno">✦</span> {l.titolo}</button>{/each}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .dal-programma { display: grid; grid-template-columns: auto 1fr auto; gap: var(--s-3); align-items: center; padding: var(--s-3) var(--s-4); border: 1px dashed var(--inchiostro-2); border-radius: var(--r-grande); background: var(--carta); }
  .dal-programma.legata { border-style: solid; border-color: var(--matita-forte); }
  .img { width: 52px; height: 52px; }
  .testo { display: grid; gap: 2px; min-width: 0; grid-column: 2; }
  .testo p { margin: 0; }
  .dal-programma:not(:has(.img)) .testo { grid-column: 1 / 3; }
  .tit { font-size: 19px; line-height: 1.15; }
  .esito .ok { color: var(--spot-testo); font-weight: 700; }
  .link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--spot-testo); text-decoration: underline; cursor: pointer; }
  .bottoni { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
  .scelta-unita { display: grid; gap: 2px; padding: var(--s-2) var(--s-4); border: 1px solid var(--matita); border-radius: var(--r); background: var(--carta); max-height: 340px; overflow: auto; }
  .scelta-unita .eti { margin: var(--s-2) 0 2px; }
  .scelta-unita button { all: unset; cursor: pointer; padding: 5px 6px; border-radius: var(--r-piccolo); font-size: var(--t-sm); }
  .scelta-unita button:hover, .scelta-unita button:focus-visible { background: var(--carta-3); }
  .scelta-unita button[aria-selected='true'] { font-weight: 700; }
  .scelta-unita .segno { display: inline-block; width: 16px; color: var(--inchiostro-3); }
  .scelta-unita .stato-fatta { color: var(--inchiostro-3); }
  .scelta-unita .stato-saltata { text-decoration: line-through; color: var(--inchiostro-3); }
  @media (max-width: 640px) { .dal-programma { grid-template-columns: auto 1fr; } .bottoni { grid-column: 1 / -1; justify-content: flex-start; } }
</style>
