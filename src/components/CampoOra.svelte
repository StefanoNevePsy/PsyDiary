<script>
  // Un'ora a 24 ore o a 12 ore (impostazioni), scritta come si vuole:
  // "1630", "16.30", "9", "4:30 pm". Il valore resta HH:MM.
  import { untrack } from 'svelte';
  import { leggiOra, oraTesto, usaOre12 } from '../lib/orario.js';

  let { value = $bindable(''), required = false, disabled = false, etichetta = 'Ora', class: cls = 'input', onchange } = $props();
  const dodici = usaOre12();
  const testoDi = (v) => (v ? (dodici ? oraTesto(v, { ore12: true }).replace(/ (am|pm)$/, '') : oraTesto(v, { ore12: false })) : '');
  let pm = $state(untrack(() => (value ? +value.slice(0, 2) >= 12 : true)));
  let testo = $state(untrack(() => testoDi(value)));
  let errore = $state(false);
  $effect(() => { const v = value; untrack(() => { if (leggiOra(testo, { ore12: dodici, pm }) !== v) { testo = testoDi(v); if (v) pm = +v.slice(0, 2) >= 12; } }); });

  function conferma(e) {
    const v = leggiOra(testo, { ore12: dodici, pm });
    errore = v === null;
    e?.currentTarget?.setCustomValidity?.(v === null ? (dodici ? 'Scrivi l\'ora come 4:30' : 'Scrivi l\'ora come 16:30') : '');
    if (errore) return;
    if (v && dodici) pm = +v.slice(0, 2) >= 12;
    testo = testoDi(v);
    if (v !== value) { value = v; onchange?.(v); }
  }
  function alterna() {
    pm = !pm;
    if (value) { const h = +value.slice(0, 2), m = value.slice(3); const n = pm ? (h % 12) + 12 : h % 12; value = `${String(n).padStart(2, '0')}:${m}`; onchange?.(value); }
  }
</script>

<span class="campo-ora" class:errore class:dodici>
  <input class={cls} type="text" inputmode="numeric" autocomplete="off" maxlength={dodici ? 8 : 5} placeholder={dodici ? 'h:mm' : 'hh:mm'}
    bind:value={testo} onchange={conferma} onblur={conferma} {required} {disabled} aria-label={etichetta} aria-invalid={errore} />
  {#if dodici}<button type="button" class="ampm" onclick={alterna} {disabled} aria-label={pm ? 'Pomeriggio: tocca per mattina' : 'Mattina: tocca per pomeriggio'}>{pm ? 'pm' : 'am'}</button>{/if}
</span>

<style>
  .campo-ora { display: inline-flex; align-items: center; gap: 4px; width: 100%; min-width: 5.5em; }
  .campo-ora input { width: 100%; font-variant-numeric: tabular-nums; }
  .ampm { flex: none; border: 1px solid var(--matita-forte); background: transparent; border-radius: 999px; padding: 2px 9px; font: inherit; font-size: var(--t-sm); font-weight: 600; cursor: pointer; color: var(--inchiostro); }
  .ampm:hover { border-color: var(--spot); }
  .errore :global(input) { border-bottom-color: var(--spot); color: var(--spot-testo); }
</style>
