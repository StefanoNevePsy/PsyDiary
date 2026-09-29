<script>
  import { sessione, utenti, cambiaUtente, impostaTema, ricominciaDemo } from '../lib/dati.svelte.js';
  import Icona from '../components/Icona.svelte';

  const TEMI = [['auto', 'Come il dispositivo'], ['chiaro', 'Carta'], ['scuro', 'Inchiostro']];
  async function reset() {
    if (!confirm('Cancellare tutto quello che hai scritto nel prototipo e ripartire dai dati di prova?')) return;
    await ricominciaDemo();
    location.hash = '#/calendario';
  }
</script>

<section class="impostazioni">
  <header><p class="eti">Prototipo</p><h1 class="display">Impostazioni</h1></header>

  <section class="blocco">
    <h2 class="eti">Aspetto</h2>
    <div class="scelte" role="radiogroup" aria-label="Tema">
      {#each TEMI as [id, nome] (id)}
        <button role="radio" aria-checked={sessione.tema === id} class="tema t-{id}" onclick={() => impostaTema(id)}>
          <span class="campione" aria-hidden="true"></span>{nome}
        </button>
      {/each}
    </div>
  </section>

  <section class="blocco">
    <h2 class="eti">Chi sta scrivendo</h2>
    <p class="sotto">Nel prototipo puoi cambiare persona per provare i permessi. I tirocinanti leggono tutto e scrivono note, ma modificano solo le proprie e non gestiscono ragazzi, gruppi e schede.</p>
    <div class="scelte" role="radiogroup" aria-label="Persona">
      {#each utenti as u (u.id)}
        <button role="radio" aria-checked={sessione.utente.id === u.id} onclick={() => cambiaUtente(u.id)}>
          <span class="display">{u.nome}</span><span class="eti">{u.ruolo === 'admin' ? 'operatore' : 'tirocinante'}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="blocco">
    <h2 class="eti">Dati</h2>
    <p class="sotto"><Icona nome="lucchetto" /> Per ora tutto resta in questo browser. Nella versione vera: accesso con Google, dati cifrati sul Drive dell'aula, separati da Centro TICE.</p>
    <button class="btn" onclick={reset}><Icona nome="torna" /> Ricomincia dai dati di prova</button>
  </section>

  <section class="blocco">
    <h2 class="eti">Scorciatoie dell'editor</h2>
    <dl class="tasti">
      <dt><kbd>Ctrl</kbd> <kbd>B</kbd> / <kbd>I</kbd></dt><dd>grassetto, corsivo</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Maiusc</kbd> <kbd>8</kbd> / <kbd>7</kbd> / <kbd>9</kbd></dt><dd>elenco, numerato, da fare</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Invio</kbd></dt><dd>spunta la riga da fare</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>1</kbd>–<kbd>3</kbd></dt><dd>titoli</dd>
      <dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>collegamento (fuori dall'editor: cerca)</dd>
      <dt><kbd>#</kbd> · <kbd>@</kbd></dt><dd>tag · cita un ragazzo</dd>
      <dt><kbd>Tab</kbd></dt><dd>rientra l'elenco</dd>
    </dl>
  </section>
</section>

<style>
  .impostazioni { max-width: 760px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); display: grid; gap: var(--s-6); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .blocco { display: grid; gap: var(--s-3); padding-top: var(--s-3); border-top: 1px solid var(--matita); justify-items: start; }
  .blocco p { max-width: 62ch; }
  .blocco p :global(.ico) { vertical-align: -3px; }
  .scelte { display: flex; flex-wrap: wrap; gap: var(--s-2); }
  .scelte button { display: flex; align-items: center; gap: var(--s-2); min-height: 44px; padding: 8px 14px; border: 1px solid var(--matita-forte); border-radius: var(--r); background: transparent; cursor: pointer; font-weight: 600; }
  .scelte button[aria-checked='true'] { border-color: var(--inchiostro); box-shadow: inset 0 0 0 1px var(--inchiostro); background: var(--carta-2); }
  .scelte .display { font-size: 18px; font-weight: 400; }
  .campione { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--matita-forte); }
  .t-auto .campione { background: linear-gradient(135deg, oklch(0.958 0.015 82) 50%, oklch(0.19 0.016 265) 50%); }
  .t-chiaro .campione { background: oklch(0.958 0.015 82); }
  .t-scuro .campione { background: oklch(0.19 0.016 265); }
  .tasti { display: grid; grid-template-columns: max-content 1fr; gap: 8px var(--s-5); margin: 0; }
  dd { margin: 0; color: var(--inchiostro-2); }
  kbd { font: 600 12px var(--f-testo); border: 1px solid var(--matita-forte); border-bottom-width: 2px; border-radius: var(--r); padding: 1px 6px; }
  @media (max-width: 720px) { .impostazioni { padding: var(--s-4) var(--s-4) var(--s-7); } h1 { font-size: var(--t-lg); } .tasti { grid-template-columns: 1fr; gap: 2px; } dd { margin-bottom: 8px; } }
</style>
