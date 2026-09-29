<script>
  // Una nota libera: su un ragazzo, su un gruppo o sull'aula.
  import { dati, salva, elimina, ragazzo, gruppo, nomeCompleto, puoModificare, sessione } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { lunga } from '../lib/date.js';
  import Editor from '../components/Editor.svelte';
  import Icona from '../components/Icona.svelte';

  let { id } = $props();
  const trovata = dati.note.find((n) => n.id === id);
  let n = $state(trovata ? { ...trovata } : null);
  let stato = $state('');
  let timer = null;

  const r = $derived(n?.ragazzoId ? ragazzo(n.ragazzoId) : null);
  const g = $derived(n?.gruppoId ? gruppo(n.gruppoId) : null);
  const modificabile = $derived(n ? puoModificare(n.autore, n.testo) : false);

  function modifica(campi) {
    Object.assign(n, campi);
    stato = 'scrivo…';
    clearTimeout(timer);
    timer = setTimeout(scrivi, 500);
  }
  async function scrivi() {
    clearTimeout(timer);
    try { await salva('note', $state.snapshot(n)); stato = 'salvato'; } catch (e) { stato = 'non salvato: ' + e.message; }
  }
  $effect(() => () => { if (stato === 'scrivo…') scrivi(); });

  async function togli() {
    if (!confirm('Eliminare questa nota? Non si può recuperare.')) return;
    clearTimeout(timer); stato = '';
    await elimina('note', n.id);
    vai(r ? 'ragazzo/' + r.id : g ? 'gruppo/' + g.id : 'diario');
  }
</script>

{#if n}
  <article class="nota">
    <a class="torna" href={r ? '#/ragazzo/' + r.id : g ? '#/gruppo/' + g.id : '#/diario'}><Icona nome="sinistra" /> {r ? nomeCompleto(r) : g ? g.nome : 'Diario'}</a>
    <div class="foglio">
      <p class="eti">Nota {r ? 'su ' + nomeCompleto(r) : g ? 'sul ' + g.nome : "sull'aula"}</p>
      {#if modificabile}
        <input class="titolo display" value={n.titolo} placeholder="Titolo" aria-label="Titolo della nota" oninput={(e) => modifica({ titolo: e.currentTarget.value })} />
        <label class="data"><span class="eti">Data</span><input class="input" type="date" value={n.data} onchange={(e) => modifica({ data: e.currentTarget.value })} /></label>
      {:else}
        <h1 class="titolo display">{n.titolo || 'Nota'}</h1>
        <p class="sotto">{lunga(n.data)}</p>
      {/if}
      <Editor testo={n.testo} etichetta="Testo della nota" soloLettura={!modificabile} autofocus={modificabile && !n.testo}
        segnaposto="Scrivi. **grassetto**, - elenchi, - [ ] cose da fare, #tag, @ per citare un ragazzo"
        alCambio={(t) => modifica({ testo: t })} />
      <footer>
        <span class="sotto piccolo">{n.autore && n.autore !== sessione.utente.nome ? 'di ' + n.autore + ' · ' : ''}<span aria-live="polite">{stato}</span></span>
        {#if modificabile}<button class="btn nudo piccolo" onclick={togli}><Icona nome="cestino" /> Elimina</button>{/if}
      </footer>
    </div>
  </article>
{:else}
  <p class="vuoto">Questa nota non c'è più. <a href="#/diario">Vai al diario</a></p>
{/if}

<style>
  .nota { max-width: 820px; margin: 0 auto; padding: var(--s-5) var(--s-5) var(--s-8); display: grid; gap: var(--s-4); }
  .torna { display: inline-flex; align-items: center; gap: 4px; font-size: var(--t-sm); font-weight: 600; text-decoration: none; color: var(--inchiostro-2); }
  .foglio { position: relative; background: var(--carta-2); box-shadow: var(--ombra); padding: var(--s-5) var(--s-6) var(--s-5) 88px; display: grid; gap: var(--s-4); }
  .foglio::before { content: ''; position: absolute; left: 68px; top: 0; bottom: 0; width: 1.5px; background: var(--spot); opacity: 0.55; }
  .titolo { font-size: var(--t-xl); line-height: 1.05; border: 0; background: transparent; padding: 0; width: 100%; }
  .titolo:focus { outline: none; }
  .titolo::placeholder { color: var(--inchiostro-3); }
  .data { display: flex; align-items: baseline; gap: var(--s-2); }
  .data .input { width: auto; }
  footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--matita); padding-top: var(--s-3); }
  .vuoto { padding: var(--s-7); text-align: center; color: var(--inchiostro-2); }
  @media (max-width: 720px) {
    .nota { padding: var(--s-3) 0 var(--s-7); }
    .torna { padding: 0 var(--s-4); }
    .foglio { padding: var(--s-4) var(--s-4) var(--s-5) 40px; box-shadow: none; }
    .foglio::before { left: 26px; }
    .titolo { font-size: var(--t-lg); }
  }
</style>
