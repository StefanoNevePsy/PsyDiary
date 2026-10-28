<script>
  // Più diagnosi o ipotesi, ognuna con il codice (facoltativo). Scegliendo una diagnosi comune il codice si compila da solo.
  import Icona from './Icona.svelte';
  import { DIAGNOSI_COMUNI } from '../lib/diagnosi.js';
  let { elenco = [], modificabile = false, alCambio } = $props();
  const id = 'diag-' + Math.random().toString(36).slice(2, 8);

  function cambia(i, k, v) {
    const nuovo = elenco.map((d, j) => (j === i ? { ...d, [k]: v } : d));
    if (k === 'testo' && !String(nuovo[i].codice || '').trim()) {
      const nota = DIAGNOSI_COMUNI.find(([t]) => t.toLowerCase() === v.trim().toLowerCase());
      if (nota) nuovo[i] = { ...nuovo[i], codice: nota[1] };
    }
    alCambio?.(nuovo);
  }
  function aggiungi() {
    alCambio?.([...elenco, { testo: '', codice: '' }]);
    queueMicrotask(() => { const c = document.querySelectorAll(`[data-diag="${id}"] .testo`); c[c.length - 1]?.focus(); });
  }
  const togli = (i) => alCambio?.(elenco.filter((_, j) => j !== i));
  function sposta(i, d) {
    const n = [...elenco], j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    alCambio?.(n);
  }
</script>

<div class="diagnosi" data-diag={id}>
  <span class="titolo">Diagnosi o ipotesi</span>
  {#if elenco.length}
    <ol>
      {#each elenco as d, i (i)}
        <li>
          <span class="n" aria-hidden="true">{i + 1}</span>
          <label class="campo testo-c"><span class="vis-nascosto">Diagnosi {i + 1}</span>
            <input class="input testo" list={id + '-comuni'} value={d.testo || ''} placeholder={i === 0 ? 'es. Disturbo specifico della lettura' : 'Altra diagnosi o ipotesi'}
              disabled={!modificabile} oninput={(e) => cambia(i, 'testo', e.currentTarget.value)} /></label>
          <label class="campo codice-c"><span class="vis-nascosto">Codice della diagnosi {i + 1}</span>
            <input class="input codice" value={d.codice || ''} placeholder="Codice (facoltativo)" maxlength="20" autocomplete="off" spellcheck="false"
              disabled={!modificabile} oninput={(e) => cambia(i, 'codice', e.currentTarget.value)} /></label>
          {#if modificabile}
            <span class="azioni">
              {#if elenco.length > 1}
                <button type="button" class="btn nudo piccolo" onclick={() => sposta(i, -1)} disabled={i === 0} aria-label="Sposta su" title="Sposta su"><span aria-hidden="true">↑</span></button>
                <button type="button" class="btn nudo piccolo" onclick={() => sposta(i, 1)} disabled={i === elenco.length - 1} aria-label="Sposta giù" title="Sposta giù"><span aria-hidden="true">↓</span></button>
              {/if}
              <button type="button" class="btn nudo piccolo" onclick={() => togli(i)} aria-label={'Togli ' + (d.testo || 'la diagnosi')} title="Togli"><Icona nome="chiudi" /></button>
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {:else if !modificabile}
    <p class="sotto piccolo">—</p>
  {/if}
  {#if modificabile}
    <button type="button" class="chip aggiungi" onclick={aggiungi}><Icona nome="piu" />{elenco.length ? 'Aggiungi un\'altra diagnosi' : 'Aggiungi una diagnosi'}</button>
    {#if elenco.length}<p class="sotto piccolo">La prima è la principale. Il codice (ICD-10, ICD-11, DSM-5…) è facoltativo; scegliendo una diagnosi dai suggerimenti si compila da solo.</p>{/if}
  {/if}
  <datalist id={id + '-comuni'}>{#each DIAGNOSI_COMUNI as [t, c] (t)}<option value={t}>{c}</option>{/each}</datalist>
</div>

<style>
  .diagnosi { display: grid; gap: var(--s-2); }
  .titolo { font-size: var(--t-xs); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; color: var(--inchiostro-2); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
  li { display: grid; grid-template-columns: 22px minmax(0, 1fr) 150px auto; gap: var(--s-3); align-items: end; }
  .n { align-self: center; font-size: var(--t-xs); font-weight: 700; color: var(--inchiostro-3); font-variant-numeric: tabular-nums; }
  .codice { font-variant-numeric: tabular-nums; font-family: var(--f-testo); letter-spacing: 0.02em; }
  .azioni { display: flex; gap: 2px; }
  .azioni :global(.btn.nudo) { min-height: 32px; padding: 2px 8px; }
  .chip { justify-self: start; display: inline-flex; align-items: center; gap: 3px; padding: 4px 10px 4px 7px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; color: var(--inchiostro); font: inherit; font-size: var(--t-sm); cursor: pointer; }
  .chip :global(.ico) { width: 13px; height: 13px; }
  .chip:hover { background: var(--carta-3); border-color: var(--inchiostro-2); }
  @media (max-width: 720px) {
    li { grid-template-columns: 18px minmax(0, 1fr) auto; }
    .codice-c { grid-column: 2; grid-row: 2; }
    .azioni { grid-column: 3; grid-row: 1 / 3; align-self: center; flex-direction: column; }
  }
</style>
