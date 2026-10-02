<script>
  // PsyDiary aperto da GenoGram Creator con "Invia a PsyDiary": si annuncia
  // alla finestra di GenoGram quando è pronto (dopo l'accesso), riceve il
  // genogramma e chiede a quale anagrafica allegarlo. Se è già allegato da
  // qualche parte, propone di aggiornare quello.
  import { onMount } from 'svelte';
  import { T, M } from '../lib/parole.svelte.js';
  import { dati, nomeCompleto, puoGestire, condiviso, ragazziAttivi, gruppiVisibili, tipoGruppo } from '../lib/dati.svelte.js';
  import { rotta, vai } from '../lib/rotta.svelte.js';
  import { REALE } from '../lib/centro/config.js';
  import { sync } from '../lib/centro/sync.svelte.js';
  import { richiestaInArrivo, ricevi, conferma } from '../lib/ponte-geno.js';
  import { allegaA, doveAllegato } from '../lib/allega-geno.svelte.js';
  import Genogramma from './geno/Genogramma.svelte';
  import Scelta from './Scelta.svelte';

  let richiesta = null;
  let stato = $state('');          // '' | 'attesa' | 'scelta' | 'lavoro'
  let g = $state(null), dove = $state(''), errore = $state('');
  let dialogo = $state();

  onMount(() => {
    if (rotta.parti[0] !== 'ricevi-genogramma') return;
    richiesta = richiestaInArrivo(rotta.query);
    history.replaceState(null, '', location.pathname + location.search + '#/ragazzi');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    if (richiesta) stato = 'attesa';
  });

  const pronta = $derived(dati.pronto && (!REALE || sync.fase === 'pronto'));
  let avviata = false;
  $effect(() => {
    if (stato !== 'attesa' || !pronta || avviata) return;
    avviata = true;
    ricevi(richiesta).then((x) => {
      if (!x) { stato = ''; return; }
      g = x;
      const valide = new Set(candidati.map((c) => c.valore));
      dove = doveAllegato(x.id).find((k) => valide.has(k)) || '';
      stato = 'scelta';
      queueMicrotask(() => dialogo?.showModal());
    });
  });

  // dove si può allegare: anagrafiche dei pazienti, classi e gruppi
  const candidati = $derived([
    ...ragazziAttivi().filter((r) => condiviso(r.id)).map((r) => ({ valore: 'r:' + r.id, etichetta: nomeCompleto(r), gruppo: M('tanti') })),
    ...gruppiVisibili().filter((x) => !x.archiviato && tipoGruppo(x) === 'classe').map((x) => ({ valore: 'g:' + x.id, etichetta: x.nome, gruppo: 'Classi' })),
    ...gruppiVisibili().filter((x) => !x.archiviato && tipoGruppo(x) !== 'classe').map((x) => ({ valore: 'g:' + x.id, etichetta: x.nome, gruppo: 'Gruppi' })),
  ]);
  const giaIn = $derived(g ? doveAllegato(g.id) : []);

  async function allega() {
    if (!dove) return;
    stato = 'lavoro'; errore = '';
    try {
      await allegaA(dove, g);
      conferma(richiesta, true);
      dialogo?.close();
      vai(dove.startsWith('g:') ? 'gruppo/' + dove.slice(2) + '?impostazioni=1' : 'ragazzo/' + dove.slice(2) + '?scheda=1');
    } catch (x) { errore = x.message; stato = 'scelta'; }
  }
  function rinuncia() {
    if (stato === 'scelta') conferma(richiesta, false);
    dialogo?.close();
  }
</script>

{#if stato === 'scelta' || stato === 'lavoro'}
  <dialog bind:this={dialogo} class="ricevi" onclose={() => { if (stato === 'scelta') conferma(richiesta, false); stato = ''; g = null; }} aria-labelledby="ricevi-titolo">
    <h2 id="ricevi-titolo" class="display">Genogramma da GenoGram Creator</h2>
    <div class="anteprima"><Genogramma data={g.data} titolo={g.titolo} anteprima /></div>
    <p><b>{g.titolo}</b> <span class="sotto piccolo">· {g.data.nodes.length} persone{g.modificato ? ' · modificato il ' + new Date(g.modificato).toLocaleDateString('it-IT') : ''}</span></p>
    {#if !puoGestire()}
      <p class="avviso">Gli allegati dell'anagrafica li gestiscono gli operatori: chiedi a loro di allegarlo.</p>
      <div class="bottoni"><button type="button" class="btn pieno" onclick={rinuncia}>Chiudi</button></div>
    {:else}
      <Scelta bind:value={dove} etichetta="Allega a" vuota={'Scegli ' + T('un') + ', una classe o un gruppo…'}
        opzioni={candidati.map((c) => ({ ...c, etichetta: c.etichetta + (giaIn.includes(c.valore) ? ' · già allegato: si aggiorna' : '') }))} />
      {#if giaIn.length && dove && giaIn.includes(dove)}<p class="sotto piccolo">Lo stesso genogramma è già lì: viene sostituito con questa versione.</p>{/if}
      <p class="sotto piccolo">Viene cifrato e sincronizzato come gli altri allegati.</p>
      {#if errore}<p class="avviso">{errore}</p>{/if}
      <div class="bottoni">
        <button type="button" class="btn nudo" onclick={rinuncia} disabled={stato === 'lavoro'}>Annulla</button>
        <button type="button" class="btn pieno" onclick={allega} disabled={!dove || stato === 'lavoro'}>{stato === 'lavoro' ? 'Allego…' : giaIn.includes(dove) ? 'Aggiorna' : 'Allega'}</button>
      </div>
    {/if}
  </dialog>
{/if}

<style>
  .ricevi { width: min(94vw, 520px); padding: var(--s-5); border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .ricevi::backdrop { background: oklch(0.2 0.02 265 / 0.5); }
  .ricevi[open] { display: grid; gap: var(--s-3); }
  h2 { margin: 0; font-size: var(--t-lg); }
  p { margin: 0; }
  .anteprima { height: 180px; border: 1px solid var(--matita); border-radius: var(--r); overflow: hidden; }
  .avviso { color: var(--spot-testo); font-size: var(--t-sm); }
  .bottoni { display: flex; justify-content: flex-end; gap: var(--s-2); }
</style>
