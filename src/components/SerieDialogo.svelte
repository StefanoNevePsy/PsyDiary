<script>
  import CampoOra from './CampoOra.svelte';
  import CampoData from './CampoData.svelte';
  import { T, M } from '../lib/parole.svelte.js';
  import Scelta from './Scelta.svelte';
  // Un appuntamento ricorrente: si crea, si modifica "da una data in poi",
  // si termina o si elimina. Le sedute già scritte non si toccano mai.
  import { onMount, untrack } from 'svelte';
  import { gruppiVisibili, dati, gruppo, ragazzo, nomeCompleto, ragazziCondivisi, creaSerie, modificaSerieDa, terminaSerie, eliminaSerie, togliEccezione, TIPI } from '../lib/dati.svelte.js';
  import { oggi, lunga, piu } from '../lib/date.js';
  import { occorrenze, descrivi, predefinita } from '../lib/serie.js';
  import Ripeti from './Ripeti.svelte';
  import Icona from './Icona.svelte';

  let { se = null, nuova = {}, chiudi } = $props();
  const S0 = untrack(() => (se ? $state.snapshot(se) : null));
  const N0 = untrack(() => ({ ...nuova }));
  const O = oggi();
  let dialogo;
  onMount(() => dialogo.showModal());

  let su = $state(S0 ? (S0.tipo === 'gruppo' ? 'g:' + S0.gruppoId : 'r:' + S0.ragazzoId) : N0.gruppoId ? 'g:' + N0.gruppoId : N0.ragazzoId ? 'r:' + N0.ragazzoId : '');
  let tipo = $state(S0?.tipo || N0.tipo || (N0.gruppoId ? 'gruppo' : 'individuale'));
  let dal = $state(S0?.dal || N0.data || O);
  let ora = $state(S0?.ora || N0.ora || (tipo === 'gruppo' ? '15:00' : '16:00'));
  let durata = $state(S0?.durata || (tipo === 'gruppo' ? 90 : 60));
  let chi = $state(S0?.chi || '');
  let ripeti = $state(S0?.ripeti || predefinita(N0.data || O));
  let fine = $state({ tipo: S0?.al ? 'data' : S0?.volte ? 'volte' : 'mai', al: S0?.al || '', volte: S0?.volte || 10 });
  let daQuando = $state(S0 ? (S0.dal > O ? S0.dal : O) : O);
  // la fine proposta non può stare prima dell'inizio della serie
  let terminaIl = $state(S0 && S0.dal > O ? S0.dal : O);
  let errore = $state('');

  $effect(() => { if (su.startsWith('g:')) tipo = 'gruppo'; else if (tipo === 'gruppo') tipo = 'individuale'; });
  const gruppi = $derived(gruppiVisibili().filter((g) => !g.archiviato));
  const ragazzi = $derived(ragazziCondivisi());
  const prossime = $derived(ripeti ? occorrenze({ dal: S0 ? daQuando : dal, ripeti, ora, ...(fine.tipo === 'data' && fine.al ? { al: fine.al } : {}), ...(fine.tipo === 'volte' ? { volte: fine.volte } : {}) }, S0 ? daQuando : dal, piu(S0 ? daQuando : dal, 120)).slice(0, 4) : []);
  const eccezioni = $derived(S0 ? Object.entries(se?.eccezioni || {}).filter(([d]) => d >= piu(O, -60)).sort() : []);

  function campi() {
    const x = { tipo, ora, durata: +durata || 60, ripeti, al: fine.tipo === 'data' && fine.al ? fine.al : undefined, volte: fine.tipo === 'volte' ? +fine.volte : undefined };
    if (su.startsWith('g:')) { x.gruppoId = su.slice(2); x.ragazzoId = undefined; } else { x.ragazzoId = su.slice(2); x.gruppoId = undefined; }
    if (tipo === 'genitori' || tipo === 'conoscenza') x.chi = chi.trim();
    return x;
  }
  async function salvaSerie(e) {
    e.preventDefault();
    if (!su) { errore = 'Scegli un gruppo o ' + T('un') + '.'; return; }
    if (!ripeti) return;
    if (S0) await modificaSerieDa(se, daQuando, campi());
    else await creaSerie({ ...campi(), dal });
    dialogo.close();
  }
  async function termina() {
    await terminaSerie(se, terminaIl);
    dialogo.close();
  }
  async function elimina() {
    if (!confirm('Eliminare la serie? Spariscono gli appuntamenti futuri non ancora scritti; le sedute già scritte restano nel diario.')) return;
    await eliminaSerie(se);
    dialogo.close();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogo} aria-labelledby="titolo-serie" onclose={chiudi} onclick={(e) => { if (e.target === dialogo) dialogo.close(); }}>
  <form class="foglio" onsubmit={salvaSerie}>
    <header>
      <h2 id="titolo-serie" class="display">{S0 ? 'Appuntamento ricorrente' : 'Nuovo appuntamento ricorrente'}</h2>
      <button type="button" class="btn nudo" onclick={() => dialogo.close()} aria-label="Chiudi"><Icona nome="chiudi" /></button>
    </header>
    {#if S0}<p class="sotto">{S0.tipo === 'gruppo' ? gruppo(S0.gruppoId)?.nome : TIPI[S0.tipo].nome + ' · ' + nomeCompleto(ragazzo(S0.ragazzoId))} · {descrivi(S0)} · dal {lunga(S0.dal)}</p>{/if}

    {#if !S0 && !N0.gruppoId && !N0.ragazzoId}
      <label class="campo"><span>Con</span>
        <Scelta bind:value={su} required opzioni={[...gruppi.map((g) => ({ valore: 'g:' + g.id, etichetta: g.nome, gruppo: 'Gruppi' })),
          ...ragazzi.map((r) => ({ valore: 'r:' + r.id, etichetta: nomeCompleto(r), gruppo: 'Ragazzi' }))]} /></label>
    {/if}
    {#if su.startsWith('r:')}
      <div class="campo"><span>Tipo</span>
        <div class="scelte">{#each ['individuale', 'genitori', 'conoscenza'] as t (t)}<button type="button" class="scelta" aria-pressed={tipo === t} onclick={() => (tipo = t)}>{TIPI[t].breve}</button>{/each}</div>
      </div>
    {/if}
    <div class="riga3">
      {#if !S0}<label class="campo"><span>A partire dal</span><CampoData bind:value={dal} required /></label>{/if}
      <label class="campo"><span>Ora</span><CampoOra bind:value={ora} required /></label>
      <label class="campo"><span>Durata (min)</span><input class="input" type="number" min="5" max="600" step="1" inputmode="numeric" bind:value={durata} /></label>
    </div>
    {#if tipo === 'genitori' || tipo === 'conoscenza'}<label class="campo"><span>Chi c'è di solito</span><input class="input" bind:value={chi} placeholder="es. madre e padre" /></label>{/if}
    <Ripeti data={S0 ? daQuando : dal} bind:ripeti bind:fine {ora} permettiMai={false} />
    {#if prossime.length}<p class="sotto piccolo">Prossime: {prossime.map((d) => lunga(d)).join(' · ')}</p>{/if}

    {#if S0}
      <label class="campo quando"><span>Le modifiche valgono dal</span><CampoData bind:value={daQuando} min={S0.dal} />
        <small class="sotto">Prima di questa data resta tutto com'era.</small></label>
    {/if}
    {#if errore}<p class="err">{errore}</p>{/if}
    <footer><button type="button" class="btn nudo" onclick={() => dialogo.close()}>Annulla</button><button class="btn pieno">{S0 ? 'Salva le modifiche' : 'Crea'}</button></footer>
  </form>

    {#if S0}
      <section class="gestione foglio-sotto">
        <div class="riga3">
          <label class="campo"><span>Ultimo appuntamento il</span><CampoData bind:value={terminaIl} min={S0.dal} /></label>
          <button type="button" class="btn piccolo" onclick={termina} disabled={!terminaIl || terminaIl < S0.dal}>Termina la serie</button>
        </div>
        {#if eccezioni.length}
          <div class="campo"><span>Date saltate o spostate</span>
            <ul class="ecc">{#each eccezioni as [d, t] (d)}<li>{lunga(d)} · {t} <button type="button" class="btn nudo piccolo" onclick={() => togliEccezione(se, d)}>Ripristina</button></li>{/each}</ul>
          </div>
        {/if}
        <button type="button" class="btn nudo piccolo pericolo" onclick={elimina}><Icona nome="cestino" /> Elimina la serie</button>
      </section>
    {/if}
</dialog>

<style>
  dialog { padding: 0; border: 0; background: transparent; width: min(600px, calc(100vw - 24px)); margin: 6vh auto auto; color: inherit; overflow: visible; }
  dialog::backdrop { background: oklch(0.2 0.03 265 / 0.35); }
  .foglio { position: relative; border-radius: var(--r-grande); background: var(--carta-2); border: 1px solid var(--inchiostro); box-shadow: var(--ombra); padding: var(--s-5); display: grid; gap: var(--s-4); max-height: 88dvh; overflow-y: auto; }
  header { display: flex; justify-content: space-between; align-items: start; gap: var(--s-3); }
  h2 { font-size: var(--t-lg); line-height: 1.05; }
  .riga3 { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: end; }
  .riga3 .campo { flex: 1 1 130px; }
  .scelte { display: flex; flex-wrap: wrap; gap: 6px; }
  .scelta { min-height: 32px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; font-weight: 600; font-size: var(--t-sm); cursor: pointer; }
  .scelta[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .quando small { font-size: var(--t-xs); }
  footer { display: flex; justify-content: flex-end; gap: var(--s-2); }
  .gestione { display: grid; gap: var(--s-3); padding-top: var(--s-4); border-top: 1px dashed var(--matita-forte); justify-items: start; }
  /* sotto al modulo, nello stesso foglio */
  dialog:has(.foglio-sotto) .foglio { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 0; max-height: none; }
  .foglio-sotto { background: var(--carta-2); border: 1px solid var(--inchiostro); border-top: 1px dashed var(--matita-forte); border-radius: 0 0 var(--r-grande) var(--r-grande); padding: var(--s-4) var(--s-5) var(--s-5); box-shadow: var(--ombra); }
  dialog:has(.foglio-sotto) { max-height: 88dvh; overflow-y: auto; }
  .ecc { list-style: none; margin: 0; padding: 0; font-size: var(--t-sm); }
  .pericolo { color: var(--spot-testo); }
  .err { color: var(--spot-testo); font-weight: 600; margin: 0; }
  @media (max-width: 720px) { dialog { margin: auto 0 0; width: 100vw; max-width: 100vw; } .foglio { border-radius: var(--r-grande) var(--r-grande) 0 0; } }
</style>
