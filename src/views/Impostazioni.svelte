<script>
  import { T, M, parole, scegliParole, SCELTE } from '../lib/parole.svelte.js';
  import { dati, sessione, io, eAdmin, cambiaUtente, impostaTema, impostaStile, STILI, ricominciaDemo } from '../lib/dati.svelte.js';
  import Icona from '../components/Icona.svelte';
  import Accessi from '../components/Accessi.svelte';
  import EsportaTutto from '../components/EsportaTutto.svelte';
  import AccessiCentro from '../components/centro/AccessiCentro.svelte';
  import { REALE } from '../lib/centro/config.js';
  import { sync, esci, mostraFrase } from '../lib/centro/sync.svelte.js';
  import { usaOre12, impostaOre12, oraTesto } from '../lib/orario.js';

  // 12 o 24 ore: vale per tutta l'app, si ricarica per ridisegnare ogni orario
  let ore12 = $state(usaOre12());
  function scegliOre(v) { if (v === ore12) return; impostaOre12(v); ore12 = v; location.reload(); }

  let frase = $state('');
  async function vediFrase() { frase = frase ? '' : (await mostraFrase()) || 'Su questo dispositivo la frase non c\'è: è arrivata come chiave consegnata.'; }
  async function esciDa(cancella) {
    if (cancella && !confirm('Cancellare da questo dispositivo tutti i dati dell\'aula? Restano al sicuro su Drive; alla prossima entrata tornano.')) return;
    await esci(cancella);
  }

  const TEMI = [['auto', 'Come il dispositivo'], ['chiaro', 'Carta'], ['scuro', 'Inchiostro']];
  async function reset() {
    if (!confirm('Cancellare tutto quello che hai scritto nella demo e ripartire dai dati di prova?')) return;
    await ricominciaDemo();
    location.hash = '#/calendario';
  }
</script>

<section class="impostazioni">
  <header><p class="eti">{REALE ? io().email : 'Demo'}</p><h1 class="display">Impostazioni</h1></header>

  <section class="blocco">
    <h2 class="eti">Aspetto</h2>
    <div class="scelte" role="radiogroup" aria-label="Tema">
      {#each TEMI as [id, nome] (id)}
        <button role="radio" aria-checked={sessione.tema === id} class="tema t-{id}" onclick={() => impostaTema(id)}>
          <span class="campione" aria-hidden="true"></span>{nome}
        </button>
      {/each}
    </div>
    <h2 class="eti sotto-tit">Stile</h2>
    <div class="stili" role="radiogroup" aria-label="Stile dell'app">
      {#each STILI as [id, nome, desc] (id)}
        <button role="radio" aria-checked={(sessione.stile || 'taccuino') === id} class="stile" data-anteprima={id} onclick={() => impostaStile(id)}>
          <span class="st-nome">{nome}</span><span class="sotto piccolo">{desc}</span>
        </button>
      {/each}
    </div>
    <h2 class="eti sotto-tit">Orari</h2>
    <div class="scelte" role="radiogroup" aria-label="Formato degli orari">
      <button role="radio" aria-checked={!ore12} class="orario" onclick={() => scegliOre(false)}>24 ore <span class="sotto piccolo">{oraTesto('16:30', { ore12: false })}</span></button>
      <button role="radio" aria-checked={ore12} class="orario" onclick={() => scegliOre(true)}>12 ore <span class="sotto piccolo">{oraTesto('16:30', { ore12: true })}</span></button>
    </div>
    <p class="sotto piccolo">Le date si scrivono sempre giorno/mese/anno, qualunque sia la lingua del dispositivo.</p>
  </section>

  <section class="blocco">
    <h2 class="eti">Le persone seguite</h2>
    <p class="sotto">Come le chiama l'app in elenchi, pulsanti e messaggi, su questo dispositivo.</p>
    <div class="scelte" role="radiogroup" aria-label="Come chiamare le persone seguite">
      {#each SCELTE as o (o.valore)}
        <button role="radio" aria-checked={parole.tipo === o.valore} onclick={() => scegliParole(o.valore)}>{o.etichetta}</button>
      {/each}
    </div>
  </section>

  {#if REALE}
    <section class="blocco">
      <h2 class="eti">Il tuo accesso</h2>
      <p class="sotto">{io().nome} · {io().ruolo === 'admin' ? 'operatore' : 'tirocinante'} · {io().email}{sync.ultima ? ' · ultima sincronizzazione ' + new Date(sync.ultima).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: ore12 }) : ''}</p>
      <div class="scelte">
        <button class="btn" onclick={() => esciDa(false)}>Esci</button>
        <button class="btn nudo" onclick={() => esciDa(true)}>Esci e togli i dati da questo dispositivo</button>
      </div>
    </section>
    {#if eAdmin()}
      <section class="blocco">
        <h2 class="eti">Chiave dell'aula</h2>
        <p class="sotto"><Icona nome="lucchetto" /> I dati partono cifrati con questa chiave. Gli altri dispositivi la ricevono da soli, senza vederla. Tienila stampata in un posto sicuro: serve per recuperare i dati se si perdono tutti i dispositivi.</p>
        <button class="btn" onclick={vediFrase}>{frase ? 'Nascondi' : 'Mostra la chiave'}</button>
        {#if frase}<p class="frase">{frase}</p>{/if}
      </section>
      <section class="blocco">
        <h2 class="eti">Persone e accessi</h2>
        <AccessiCentro />
      </section>
    {/if}
  {:else}
  <section class="blocco">
    <h2 class="eti">Chi sta scrivendo</h2>
    <p class="sotto">Nella demo puoi cambiare persona per provare i permessi. I tirocinanti scrivono ma non gestiscono: modificano solo le proprie note, e vedono per intero solo {T('i')} condivisi con loro.</p>
    <div class="scelte" role="radiogroup" aria-label="Persona">
      {#each dati.persone as u (u.id)}
        <button role="radio" aria-checked={io().id === u.id} onclick={() => cambiaUtente(u.id)}>
          <span class="display">{u.nome}</span><span class="eti">{u.ruolo === 'admin' ? 'operatore' : 'tirocinante'}</span>
        </button>
      {/each}
    </div>
  </section>

  {#if eAdmin()}
    <section class="blocco">
      <h2 class="eti">Persone e accessi</h2>
      <Accessi />
    </section>
  {/if}

  <section class="blocco">
    <h2 class="eti">Dati</h2>
    <p class="sotto"><Icona nome="lucchetto" /> Demo: dati inventati, tutto resta in questo browser.</p>
    <button class="btn" onclick={reset}><Icona nome="torna" /> Ricomincia dai dati di prova</button>
  </section>
  {/if}

  {#if eAdmin()}<section class="blocco"><EsportaTutto /></section>{/if}

  <section class="blocco">
    <h2 class="eti">Scorciatoie dell'editor</h2>
    <dl class="tasti">
      <dt><kbd>Ctrl</kbd> <kbd>B</kbd> / <kbd>I</kbd></dt><dd>grassetto, corsivo</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Maiusc</kbd> <kbd>8</kbd> / <kbd>7</kbd> / <kbd>9</kbd></dt><dd>elenco, numerato, da fare</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Invio</kbd></dt><dd>spunta la riga da fare</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>1</kbd>–<kbd>3</kbd></dt><dd>titoli</dd>
      <dt><kbd>Ctrl</kbd> <kbd>K</kbd> · <kbd>/</kbd></dt><dd>cerca</dd>
      <dt><kbd>Ctrl</kbd> <kbd>Maiusc</kbd> <kbd>S</kbd></dt><dd>barrato</dd>
      <dt><kbd>#</kbd> · <kbd>@</kbd></dt><dd>tag · cita {T('un')}</dd>
      <dt><kbd>Tab</kbd></dt><dd>rientra l'elenco</dd>
    </dl>
  </section>
</section>

<style>
  .impostazioni { max-width: 860px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); display: grid; gap: var(--s-6); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .blocco { display: grid; gap: var(--s-3); padding-top: var(--s-3); border-top: 1px solid var(--matita); justify-items: start; }
  .blocco p { max-width: 62ch; }
  .blocco p :global(.ico) { vertical-align: -3px; }
  .scelte { display: flex; flex-wrap: wrap; gap: var(--s-2); }
  .scelte button { display: flex; align-items: center; gap: var(--s-2); min-height: 44px; padding: 8px 16px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; cursor: pointer; font-weight: 600; }
  .scelte button[aria-checked='true'] { border-color: var(--inchiostro); box-shadow: inset 0 0 0 1px var(--inchiostro); background: var(--carta-2); }
  .scelte .display { font-size: 18px; font-weight: 400; }
  .sotto-tit { margin-top: var(--s-2); }
  .campione { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--matita-forte); }
  .t-auto .campione { background: linear-gradient(135deg, oklch(0.958 0.015 82) 50%, oklch(0.19 0.016 265) 50%); }
  .t-chiaro .campione { background: oklch(0.958 0.015 82); }
  .t-scuro .campione { background: oklch(0.19 0.016 265); }
  .frase { font: 600 20px ui-monospace, Menlo, monospace; letter-spacing: 0.06em; padding: var(--s-3) var(--s-4); border: 1.5px dashed var(--spot); border-radius: var(--r); }
  .tasti { display: grid; grid-template-columns: max-content 1fr; gap: 8px var(--s-5); margin: 0; }
  dd { margin: 0; color: var(--inchiostro-2); }
  kbd { font: 600 12px var(--f-testo); border: 1px solid var(--matita-forte); border-bottom-width: 2px; border-radius: var(--r); padding: 1px 6px; }
  @media (max-width: 720px) { .impostazioni { padding: var(--s-4) var(--s-4) var(--s-7); } h1 { font-size: var(--t-lg); } .tasti { grid-template-columns: 1fr; gap: 2px; } dd { margin-bottom: 8px; } }
  .stili { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: var(--s-2); }
  .stile { display: grid; gap: 2px; text-align: left; padding: var(--s-3) var(--s-4); min-height: 64px; border: 1px solid var(--matita-forte); border-radius: var(--r); background: transparent; cursor: pointer; }
  .stile[aria-checked='true'] { border-color: var(--spot); box-shadow: inset 0 0 0 1px var(--spot); }
  .st-nome { font-weight: 700; }
  .stile[data-anteprima='archivio'] .st-nome { font-family: 'Big Shoulders Display'; font-weight: 800; text-transform: uppercase; font-size: 18px; }
  .stile[data-anteprima='erbario'] .st-nome { font-family: 'Cormorant Garamond'; font-style: italic; font-size: 20px; font-weight: 600; }
  .stile[data-anteprima='cianotipia'] .st-nome { font-family: 'Playfair Display'; font-size: 18px; color: oklch(0.4 0.13 258); }
  .stile[data-anteprima='svizzera'] .st-nome { font-family: 'Inter Tight'; font-weight: 800; letter-spacing: -0.03em; font-size: 18px; }
  .stile[data-anteprima='terracotta'] .st-nome { font-family: 'Fraunces'; font-weight: 600; font-size: 18px; }
  .stile[data-anteprima='taccuino'] .st-nome { font-family: 'Gloock'; font-weight: 400; font-size: 19px; }
  .stile[data-anteprima='macchina'] .st-nome { font-family: 'Courier Prime'; font-weight: 700; text-transform: uppercase; }
  .stile[data-anteprima='bauhaus'] .st-nome { font-family: 'Jost'; font-weight: 600; font-size: 18px; }
  .stile[data-anteprima='notturno'] .st-nome { font-family: 'Literata'; font-size: 18px; font-weight: 400; }
  .stile[data-anteprima='riso'] .st-nome { font-family: 'Anton'; text-transform: uppercase; font-size: 19px; font-weight: 400; color: oklch(0.6 0.22 355); text-shadow: 2px 1px 0 oklch(0.72 0.14 195 / 0.7); }
  .stile[data-anteprima='ufficio70'] .st-nome { font-family: 'Rubik'; font-weight: 600; font-size: 18px; color: oklch(0.55 0.15 50); }
</style>
