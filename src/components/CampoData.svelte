<script>
  // Una data in formato europeo (gg/mm/aaaa), qualunque sia la lingua del
  // dispositivo; il calendario è quello del sistema. Il valore resta AAAA-MM-GG.
  import { untrack } from 'svelte';
  import { dataEuropea, leggiDataEuropea } from '../lib/orario.js';
  import Icona from './Icona.svelte';

  let { value = $bindable(''), min = '', max = '', required = false, disabled = false, etichetta = 'Data', class: cls = 'input', onchange } = $props();
  let testo = $state(untrack(() => dataEuropea(value)));
  let errore = $state(false);
  let cal;
  // il valore cambiato da fuori (calendario, altro campo) si rispecchia nel testo
  $effect(() => { const v = value; untrack(() => { if (leggiDataEuropea(testo) !== v) testo = dataEuropea(v); }); });

  function imposta(v) {
    if (v !== value) { value = v; onchange?.(v); }
    testo = dataEuropea(v);
  }
  function conferma(e) {
    const v = leggiDataEuropea(testo);
    const fuori = v && ((min && v < min) || (max && v > max));
    errore = v === null || !!fuori;
    e?.currentTarget?.setCustomValidity?.(v === null ? 'Scrivi la data come gg/mm/aaaa' : fuori ? 'Data fuori dall\'intervallo' : '');
    if (!errore) imposta(v);
  }
  function apri() {
    if (disabled) return;
    try { if (cal.showPicker) { cal.showPicker(); return; } } catch (x) { /* senza showPicker: il clic */ }
    cal.focus(); cal.click();
  }
</script>

<span class="campo-data" class:errore>
  <input class={cls} type="text" inputmode="numeric" autocomplete="off" placeholder="gg/mm/aaaa" maxlength="10"
    bind:value={testo} onchange={conferma} onblur={conferma} {required} {disabled} aria-label={etichetta} aria-invalid={errore} />
  <button type="button" class="apri" onclick={apri} {disabled} aria-label="Scegli dal calendario" title="Calendario"><Icona nome="calendario" /></button>
  <input bind:this={cal} class="nascosto" type="date" tabindex="-1" aria-hidden="true" value={value || ''} min={min || undefined} max={max || undefined}
    onchange={(e) => { errore = false; imposta(e.currentTarget.value); }} />
</span>

<style>
  .campo-data { position: relative; display: inline-flex; align-items: center; width: 100%; min-width: 9.5em; }
  .campo-data .input, .campo-data input:not(.nascosto) { width: 100%; padding-right: 30px; font-variant-numeric: tabular-nums; }
  .apri { position: absolute; right: 2px; border: 0; background: none; padding: 4px; color: var(--inchiostro-2); cursor: pointer; display: grid; place-items: center; }
  .apri:hover { color: var(--spot-testo); }
  .nascosto { position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; padding: 0; }
  .errore :global(input:not(.nascosto)) { border-bottom-color: var(--spot); color: var(--spot-testo); }
</style>
