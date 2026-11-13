<script>
  // Per gli operatori: quanti dispositivi aspettano la chiave dell'aula e il tasto per consegnarla
  // subito, senza aspettare il prossimo giro di sincronizzazione.
  //   compatto: solo se c'è qualcuno in attesa (barra in alto) · altrimenti il tasto c'è sempre
  import { sync, eOperatore, consegnaOra } from '../../lib/centro/sync.svelte.js';
  import { veloce, formatoCodice, consegnaVeloce, impostaManuale } from '../../lib/centro/veloce.svelte.js';
  import { vai } from '../../lib/rotta.svelte.js';

  let { compatto = false, dopo = () => {} } = $props();
  let esito = $state('');
  let errore = $state(false);
  let pulita;
  const n = $derived(sync.inAttesa || 0);
  // richieste arrivate dalla corsia veloce che aspettano il tocco dell'operatore (consegna «con codice»)
  const m = $derived(veloce.manuale ? veloce.richieste.length : 0);
  const visibile = $derived(sync.fase === 'pronto' && eOperatore() && (!compatto || n > 0 || m > 0 || esito));

  function avvisa(testo, err = false) {
    esito = testo; errore = err;
    clearTimeout(pulita);
    pulita = setTimeout(() => (esito = ''), 8000);
  }
  // consegna fatta da sola dal giro di sincronizzazione: l'operatore vede che qualcuno aspettava
  let vista = 0;
  $effect(() => {
    const c = sync.consegnata;
    if (!c || c.id === vista || Date.now() - c.id > 8000) return;
    vista = c.id;
    const chi = c.persone.length ? ' (' + c.persone.join(', ') + ')' : '';
    avvisa(`Chiave consegnata a ${c.n} ${c.n === 1 ? 'dispositivo' : 'dispositivi'}${chi}: ${c.n === 1 ? 'si collega' : 'si collegano'} da solo.`);
  });
  async function consegnaUna(id) {
    try { avvisa(await consegnaVeloce(id) ? 'Chiave consegnata: il dispositivo si collega da solo.' : 'Persona non riconosciuta come abilitata: controlla gli accessi.', false); }
    catch (e) { avvisa(e.message, true); }
  }
  async function consegna() {
    try {
      const r = await consegnaOra();
      avvisa(r.consegnate
        ? `Chiave consegnata a ${r.consegnate} ${r.consegnate === 1 ? 'dispositivo' : 'dispositivi'}: si ${r.consegnate === 1 ? 'collega' : 'collegano'} entro pochi secondi.`
        : 'Nessun dispositivo aspetta la chiave. Se la persona ha appena fatto l\'accesso, riprova fra qualche secondo.');
      dopo();
    } catch (e) { avvisa(e.message, true); }
  }
</script>

{#if visibile && compatto && m > 0 && n === 0}
  <button class="btn piccolo pieno richiesta-barra" onclick={() => vai('impostazioni')} title="Controlla il codice di verifica e consegna la chiave">
    {m === 1 ? 'Richiesta di chiave' : 'Richieste di chiave'}<span class="conta" aria-label={m + ' in attesa'}>{m}</span>
  </button>
{:else if visibile}
  <span class="consegna" class:compatto>
    <button class="btn piccolo" class:pieno={n > 0} disabled={sync.consegna} onclick={consegna}
      title="Chi entra da un dispositivo nuovo la riceve subito, senza aspettare il prossimo giro">
      {sync.consegna ? 'Consegno…' : compatto ? 'Consegna la chiave' : 'Consegna la chiave a chi la aspetta'}{#if n > 0}<span class="conta" aria-label={n + ' in attesa'}>{n}</span>{/if}
    </button>
    {#if n > 0 && compatto}<span class="sotto piccolo chi">{n === 1 ? '1 dispositivo aspetta' : n + ' dispositivi aspettano'} la chiave</span>{/if}
    {#if esito}<span class="sotto piccolo esito" class:err={errore} role="status" title={esito}>{esito}</span>{/if}
  </span>
{/if}
{#if !compatto && veloce.presente && sync.fase === 'pronto' && eOperatore()}
  <div class="codici">
    <label class="spunta"><input type="checkbox" checked={veloce.manuale} onchange={(e) => impostaManuale(e.currentTarget.checked)} /> Consegna la chiave solo quando tocco «Consegna», dopo aver controllato il codice di verifica</label>
    {#each veloce.richieste as r (r.id)}
      <div class="richiesta">
        <span>{r.email} · {r.nome}</span>
        <span class="sotto piccolo">Codice di verifica: <b>{formatoCodice(r.codice)}</b> (deve essere uguale a quello mostrato sul dispositivo nuovo)</span>
        <button class="btn piccolo pieno" onclick={() => consegnaUna(r.id)}>Consegna</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .consegna { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px var(--s-3); }
  .conta { margin-left: 8px; min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--carta); color: var(--inchiostro); font-size: var(--t-xs); font-weight: 700; line-height: 20px; display: inline-block; text-align: center; }
  .esito { max-width: 320px; }
  .err { color: var(--spot-testo); font-weight: 600; }
  .richiesta-barra { white-space: nowrap; }
  .codici { display: grid; gap: var(--s-2); margin-top: var(--s-3); }
  .spunta { display: flex; gap: var(--s-2); align-items: center; font-size: var(--t-sm); }
  .spunta input { accent-color: var(--spot); width: 18px; height: 18px; flex: none; }
  .richiesta { display: grid; gap: var(--s-1); justify-items: start; padding: var(--s-3); border: 1px dashed var(--matita); border-radius: var(--r); }
  .compatto { flex-wrap: nowrap; }
  .compatto .esito { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
  .compatto .chi { display: none; }
  @media (min-width: 1300px) { .compatto .chi { display: inline; } }
</style>
