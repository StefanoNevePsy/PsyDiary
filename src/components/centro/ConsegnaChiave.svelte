<script>
  // Per gli operatori: quanti dispositivi aspettano la chiave dell'aula e il tasto per consegnarla
  // subito, senza aspettare il prossimo giro di sincronizzazione.
  //   compatto: solo se c'è qualcuno in attesa (barra in alto) · altrimenti il tasto c'è sempre
  import { sync, eOperatore, consegnaOra } from '../../lib/centro/sync.svelte.js';

  let { compatto = false, dopo = () => {} } = $props();
  let esito = $state('');
  let errore = $state(false);
  let pulita;
  const n = $derived(sync.inAttesa || 0);
  const visibile = $derived(sync.fase === 'pronto' && eOperatore() && (!compatto || n > 0 || esito));

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

{#if visibile}
  <span class="consegna" class:compatto>
    <button class="btn piccolo" class:pieno={n > 0} disabled={sync.consegna} onclick={consegna}
      title="Chi entra da un dispositivo nuovo la riceve subito, senza aspettare il prossimo giro">
      {sync.consegna ? 'Consegno…' : compatto ? 'Consegna la chiave' : 'Consegna la chiave a chi la aspetta'}{#if n > 0}<span class="conta" aria-label={n + ' in attesa'}>{n}</span>{/if}
    </button>
    {#if n > 0 && compatto}<span class="sotto piccolo chi">{n === 1 ? '1 dispositivo aspetta' : n + ' dispositivi aspettano'} la chiave</span>{/if}
    {#if esito}<span class="sotto piccolo esito" class:err={errore} role="status" title={esito}>{esito}</span>{/if}
  </span>
{/if}

<style>
  .consegna { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px var(--s-3); }
  .conta { margin-left: 8px; min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--carta); color: var(--inchiostro); font-size: var(--t-xs); font-weight: 700; line-height: 20px; display: inline-block; text-align: center; }
  .esito { max-width: 320px; }
  .err { color: var(--spot-testo); font-weight: 600; }
  .compatto { flex-wrap: nowrap; }
  .compatto .esito { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
  .compatto .chi { display: none; }
  @media (min-width: 1300px) { .compatto .chi { display: inline; } }
</style>
