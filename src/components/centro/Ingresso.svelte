<script>
  // Prima di entrare: accesso con Google, chiave dell'aula, attesa del dispositivo.
  import { onMount } from 'svelte';
  import { sync, pulsanteGoogle, accessoDev, creaChiave, inserisciChiave, nuovaFrase, preparaChiave, riprova, esci } from '../../lib/centro/sync.svelte.js';
  import { CONFIG, demo } from '../../lib/centro/config.js';
  import Icona from '../Icona.svelte';

  let box = $state();
  let email = $state('');
  let frase = $state('');
  let conservata = $state(false);
  let lavoro = $state(false);
  let errore = $state('');
  let fraseInserita = $state('');

  $effect(() => {
    if (sync.fase === 'fuori' && box && !CONFIG.dev) pulsanteGoogle(box).catch((e) => (errore = e.message));
  });
  $effect(() => { if (sync.fase === 'chiave' && !sync.cfg && !frase) frase = nuovaFrase(); });

  async function crea() {
    lavoro = true; errore = '';
    try { await creaChiave(frase, await preparaChiave(frase)); } catch (e) { errore = e.message; } finally { lavoro = false; }
  }
  async function inserisci(e) {
    e.preventDefault();
    lavoro = true; errore = '';
    try { await inserisciChiave(fraseInserita); } catch (x) { errore = x.message; } finally { lavoro = false; }
  }
  function copia() { navigator.clipboard?.writeText(frase); }
  function stampa() {
    const w = window.open('', '_blank', 'width=600,height=400');
    if (!w) return;
    w.document.write(`<title>Chiave dell'aula · PsyDiary</title><body style="font-family:Georgia,serif;padding:40px"><h1>Chiave dell'aula · PsyDiary</h1><p style="font:600 28px monospace;letter-spacing:.08em">${frase}</p><p>Conservala in un posto sicuro. Senza questa frase i dati non si possono recuperare.</p><p>Creata il ${new Date().toLocaleDateString('it-IT')}</p></body>`);
    w.document.close(); w.print();
  }
</script>

<main class="ingresso">
  <div class="foglio">
    <p class="sotto piccolo"><a href="./privacy.html">Informativa privacy · Aula 3 - Correggio</a></p>
    <p class="marchio"><span class="display">Psy</span><span class="mano">diary</span></p>

    {#if sync.fase === 'fuori'}
      <h1 class="display">Il diario dell'aula</h1>
      <p class="sotto">Entra con l'account Google che gli operatori hanno abilitato. PsyDiary vede solo chi sei: niente accesso alla tua posta o al tuo Drive.</p>
      {#if sync.negato}<p class="avviso">{sync.negato}</p>{/if}
      {#if CONFIG.dev}
        <form class="dev" onsubmit={(e) => { e.preventDefault(); accessoDev(email); }}>
          <label class="campo"><span>Email (accesso di prova)</span><input class="input" type="email" bind:value={email} required /></label>
          <button class="btn pieno">Entra</button>
        </form>
      {:else}
        <div class="google" bind:this={box}></div>
      {/if}
      {#if sync.errore}<p class="sotto piccolo">{sync.errore}</p>{/if}
      <div class="demo">
        <p class="sotto piccolo">Vuoi solo dare un'occhiata? La demo usa dati inventati e non tocca quelli dell'aula.</p>
        <button class="btn" onclick={() => demo(true)}>Guarda la demo</button>
      </div>

    {:else if sync.fase === 'chiave' && !sync.cfg}
      <h1 class="display">La chiave dell'aula</h1>
      <p class="sotto">Tutto quello che scrivete parte cifrato con questa chiave: su Drive restano solo file illeggibili, anche per Google. Si crea una volta sola.</p>
      <p class="frase" aria-label={'Chiave dell\'aula: ' + frase}>{#each frase.split('-') as gruppo, i (i)}<span aria-hidden="true">{gruppo}</span>{/each}</p>
      <div class="azioni">
        <button class="btn" onclick={copia}>Copia</button>
        <button class="btn" onclick={stampa}><Icona nome="stampa" /> Stampa</button>
        <button class="btn nudo" onclick={() => (frase = nuovaFrase())}>Un'altra</button>
      </div>
      <p class="avviso">Conservala fuori da PsyDiary (stampata in un cassetto chiuso, o in un gestore di password). <strong>Senza questa frase, se perdi i dispositivi, i dati non si recuperano</strong>: nessuno la conosce, nemmeno Google.</p>
      <label class="spunta"><input type="checkbox" bind:checked={conservata} /> L'ho conservata in un posto sicuro</label>
      <button class="btn pieno grande" disabled={!conservata || lavoro} onclick={crea}>{lavoro ? 'Creo la chiave…' : 'Crea la chiave e inizia'}</button>

    {:else if sync.fase === 'chiave'}
      <h1 class="display">Questo dispositivo è nuovo</h1>
      <p class="sotto">Basta aprire PsyDiary su un dispositivo dove sei già entrato: consegna la chiave a questo da solo, entro un minuto. Oppure inserisci qui la chiave dell'aula.</p>
      <form class="inserisci" onsubmit={inserisci}>
        <label class="campo"><span>Chiave dell'aula</span><input class="input mono" bind:value={fraseInserita} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" /></label>
        <button class="btn pieno" disabled={lavoro}>{lavoro ? 'Controllo…' : 'Usa la chiave'}</button>
      </form>

    {:else if sync.fase === 'attesa'}
      <h1 class="display">Ci siamo quasi</h1>
      <p class="sotto">Ciao {sync.io?.nome}. Questo dispositivo aspetta la chiave dell'aula: arriva da sola appena uno degli operatori apre PsyDiary. Puoi lasciare questa pagina aperta.</p>
      <p class="mano attesa">in attesa…</p>
      <button class="btn" onclick={riprova}>Controlla adesso</button>
    {/if}

    {#if errore}<p class="avviso">{errore}</p>{/if}
    {#if sync.io && sync.fase !== 'fuori'}
      <p class="chi sotto piccolo">{sync.io.email} · <button class="link" onclick={() => esci(false)}>esci</button></p>
    {/if}
  </div>
</main>

<style>
  .ingresso { min-height: 100dvh; display: grid; place-items: center; padding: var(--s-5); }
  .foglio { width: min(560px, 100%); display: grid; gap: var(--s-4); padding: var(--s-7) var(--s-6); background: var(--carta-2); border: 1px solid var(--matita); border-radius: var(--r-grande); box-shadow: var(--ombra); }
  .marchio { display: flex; align-items: baseline; }
  .marchio .display { font-size: 34px; }
  .marchio .mano { font-size: 30px; transform: translateY(3px); }
  h1 { font-size: var(--t-xl); line-height: 1.05; }
  .google { min-height: 44px; }
  .frase { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; font: 600 clamp(18px, 4.6vw, 26px) ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: 0.06em; padding: var(--s-4); border: 1.5px dashed var(--spot); border-radius: var(--r); background: var(--carta); }
  .azioni { display: flex; flex-wrap: wrap; gap: var(--s-2); }
  .avviso { padding: var(--s-3) var(--s-4); border-radius: var(--r); background: var(--spot-tenue); font-size: var(--t-sm); }
  .spunta { display: flex; gap: var(--s-2); align-items: center; font-weight: 600; }
  .spunta input { accent-color: var(--spot); width: 18px; height: 18px; }
  .grande { min-height: 48px; }
  .inserisci, .dev { display: grid; gap: var(--s-3); }
  .mono { font-family: ui-monospace, Menlo, monospace; letter-spacing: 0.05em; }
  .attesa { font-size: 26px; animation: respiro 2.4s ease-in-out infinite; }
  @keyframes respiro { 50% { opacity: 0.35; } }
  .demo { display: grid; gap: var(--s-2); justify-items: start; border-top: 1px dashed var(--matita); padding-top: var(--s-4); }
  .chi { border-top: 1px dashed var(--matita); padding-top: var(--s-3); }
  .link { border: 0; background: none; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; }
</style>
