<script>
  // Gli alunni di una classe, scritti direttamente qui: nome, sesso, una nota.
  // Invio aggiunge e passa al prossimo; si può anche incollare un elenco.
  import { SESSI, daElenco, nuovoAlunno, conteggio } from '../lib/classe.js';
  import { T } from '../lib/parole.svelte.js';
  import Icona from './Icona.svelte';

  let { alunni = [], gestisce = false, alCambio } = $props();
  let nome = $state(''), sesso = $state(''), incolla = $state(false), testo = $state('');
  let campoNome = $state();
  const ordinati = $derived([...(alunni || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'it')));

  function aggiungi() {
    if (!nome.trim()) return;
    alCambio([...(alunni || []), nuovoAlunno(nome, sesso)]);
    nome = '';
    campoNome?.focus();
  }
  function cambia(id, k, v) { alCambio((alunni || []).map((a) => (a.id === id ? { ...a, [k]: v } : a))); }
  function togli(a) { if (confirm(`Togliere ${a.nome} dalla classe?`)) alCambio((alunni || []).filter((x) => x.id !== a.id)); }
  function aggiungiElenco() {
    const nuovi = daElenco(testo);
    const gia = new Set((alunni || []).map((a) => a.nome.toLowerCase()));
    alCambio([...(alunni || []), ...nuovi.filter((a) => !gia.has(a.nome.toLowerCase()))]);
    testo = ''; incolla = false;
  }
</script>

<section class="alunni">
  <header>
    <h3 class="eti">Alunni</h3>
    {#if alunni?.length}<span class="sotto piccolo">{conteggio(alunni)}</span>{/if}
  </header>
  <p class="sotto piccolo">Restano dentro la classe: non sono {T('tanti')} e non compaiono nell'elenco. Li vede solo chi vede la classe.</p>
  {#if ordinati.length}
    <ul class="elenco">
      {#each ordinati as a (a.id)}
        <li>
          <input class="input nome" value={a.nome} disabled={!gestisce} aria-label="Nome" onchange={(e) => cambia(a.id, 'nome', e.currentTarget.value.trim() || a.nome)} />
          <span class="sesso" role="radiogroup" aria-label={'Sesso di ' + a.nome}>
            {#each SESSI as s (s.valore)}
              <button type="button" role="radio" aria-checked={a.sesso === s.valore} disabled={!gestisce} onclick={() => cambia(a.id, 'sesso', s.valore)} title={s.valore === '' ? 'non indicato' : s.valore === 'F' ? 'femmina' : 'maschio'}>{s.etichetta}</button>
            {/each}
          </span>
          <input class="input nota" value={a.nota || ''} disabled={!gestisce} placeholder="una nota…" aria-label={'Nota su ' + a.nome} oninput={(e) => cambia(a.id, 'nota', e.currentTarget.value)} />
          {#if gestisce}<button type="button" class="btn nudo piccolo via" onclick={() => togli(a)} aria-label={'Togli ' + a.nome}><Icona nome="chiudi" /></button>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if gestisce}
    <div class="nuovo">
      <input bind:this={campoNome} class="input nome" bind:value={nome} placeholder="Nome e cognome, poi Invio" aria-label="Nuovo alunno"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aggiungi(); } }} />
      <span class="sesso" role="radiogroup" aria-label="Sesso del nuovo alunno">
        {#each SESSI as s (s.valore)}<button type="button" role="radio" aria-checked={sesso === s.valore} onclick={() => (sesso = s.valore)}>{s.etichetta}</button>{/each}
      </span>
      <button type="button" class="btn piccolo" onclick={aggiungi} disabled={!nome.trim()}><Icona nome="piu" /> Aggiungi</button>
      <button type="button" class="btn nudo piccolo" aria-expanded={incolla} onclick={() => (incolla = !incolla)}>Incolla un elenco</button>
    </div>
    {#if incolla}
      <div class="incolla">
        <textarea class="input" rows="6" bind:value={testo} placeholder={'Un alunno per riga. Il sesso, se vuoi, in fondo:\nRossi Giulia F\nBianchi Marco M'} aria-label="Elenco di alunni"></textarea>
        <div class="bottoni">
          <span class="sotto piccolo">{daElenco(testo).length ? daElenco(testo).length + ' da aggiungere' : ''}</span>
          <button type="button" class="btn piccolo" onclick={aggiungiElenco} disabled={!daElenco(testo).length}>Aggiungi alla classe</button>
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .alunni { display: grid; gap: var(--s-2); }
  header { display: flex; align-items: baseline; gap: var(--s-3); }
  h3 { margin: 0; }
  p { margin: 0; }
  .elenco { list-style: none; margin: 0; padding: 0; display: grid; }
  .elenco li, .nuovo { display: grid; grid-template-columns: minmax(140px, 1.1fr) auto minmax(120px, 1.6fr) auto; gap: var(--s-3); align-items: center; padding: 2px 0; border-bottom: 1px dashed var(--matita); }
  .nuovo { grid-template-columns: minmax(160px, 1.4fr) auto auto auto; border-bottom: 0; margin-top: var(--s-2); }
  .elenco .input { min-height: 34px; padding: 4px 2px; border-bottom-color: transparent; }
  .elenco .input:hover, .elenco .input:focus { border-bottom-color: var(--matita-forte); }
  .nome { font-weight: 600; }
  .sesso { display: inline-flex; border: 1px solid var(--matita-forte); border-radius: 999px; overflow: hidden; }
  .sesso button { all: unset; cursor: pointer; min-width: 26px; text-align: center; padding: 2px 6px; font-size: 12.5px; font-weight: 600; color: var(--inchiostro-2); }
  .sesso button[aria-checked='true'] { background: var(--inchiostro); color: var(--carta); }
  .sesso button:focus-visible { outline: 2px solid var(--spot); outline-offset: -2px; }
  .sesso button:disabled { cursor: default; }
  .via :global(.ico) { width: 15px; height: 15px; }
  .incolla { display: grid; gap: var(--s-2); }
  .bottoni { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
  @media (max-width: 640px) {
    .elenco li { grid-template-columns: 1fr auto auto; }
    .elenco li .nota { grid-column: 1 / -1; grid-row: 2; }
    .nuovo { grid-template-columns: 1fr auto; }
  }
</style>
