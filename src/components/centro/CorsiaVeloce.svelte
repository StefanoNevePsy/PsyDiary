<script>
  // «Corsia veloce: attiva / spenta (motivo)»: le modifiche degli altri arrivano in tempo reale. Il custode resta
  // l'archivio e la riserva: con la corsia spenta l'app funziona esattamente come prima.
  import { veloce, attivaVeloce, riprovaVeloce } from '../../lib/centro/veloce.svelte.js';

  // «Corsia veloce: attiva» · «Corsia veloce: spenta (il custode va aggiornato)»
  const titolo = $derived('Corsia veloce: ' + (veloce.attiva ? 'attiva' : 'spenta' + (veloce.motivo ? ' (' + veloce.motivo + ')' : '')));
  let lavoro = $state(false);
  let errore = $state('');
  // un tasto serve solo se si può fare qualcosa: accesso con Google da rinnovare, rete, un guasto passeggero (non per «il custode va aggiornato»)
  const tasto = $derived(!veloce.attiva && !veloce.fisso ? (veloce.serveAccesso ? 'Attiva la corsia veloce' : 'Riprova') : '');
  async function premi() {
    lavoro = true; errore = '';
    try { await (veloce.serveAccesso ? attivaVeloce() : riprovaVeloce()); }
    catch (e) { errore = e?.message || 'Non riesco ad attivare la corsia veloce.'; }
    finally { lavoro = false; }
  }
</script>

{#if veloce.presente}
  <div class="veloce" data-corsia-veloce={veloce.attiva ? 'attiva' : 'spenta'}>
    <p class="riga"><b>{titolo}</b></p>
    <p class="sotto piccolo">{veloce.attiva
      ? 'Le modifiche dei colleghi arrivano in tempo reale. Il custode resta la copia sicura e controlla tutto.'
      : 'L\'app funziona come sempre, attraverso il custode: niente va perso.'}</p>
    {#if tasto}<button class="btn piccolo" disabled={lavoro} onclick={premi}>{lavoro ? 'Attendo…' : tasto}</button>{/if}
    {#if errore}<p class="sotto piccolo err" role="alert">{errore}</p>{/if}
  </div>
{/if}

<style>
  .veloce { display: grid; gap: var(--s-2); justify-items: start; }
  .riga { margin: 0; }
  .err { color: var(--spot-testo); font-weight: 600; }
</style>
