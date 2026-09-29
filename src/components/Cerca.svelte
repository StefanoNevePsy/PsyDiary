<script>
  // Ricerca unica: ragazzi, gruppi, tag, testo delle note e date scritte a mano.
  import { onMount } from 'svelte';
  import { dati, nomeCompleto, diarioAula, tuttiTag, gruppiDi } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { leggiData, lunga, nomeMese, anno, relativa } from '../lib/date.js';
  import Icona from './Icona.svelte';

  let { chiudi } = $props();
  let q = $state('');
  let sel = $state(0);
  let campo;
  let dialogo;

  onMount(() => { dialogo.showModal(); campo.focus(); });

  function frammento(testo, parola) {
    const i = testo.toLowerCase().indexOf(parola.toLowerCase());
    if (i < 0) return testo.slice(0, 90);
    const da = Math.max(0, i - 40);
    return (da ? '…' : '') + testo.slice(da, i + parola.length + 60) + '…';
  }

  const gruppiRis = $derived.by(() => {
    const t = q.trim().toLowerCase();
    const out = [];
    if (!t) {
      out.push({ nome: 'Vai a', voci: [
        { ico: 'calendario', testo: 'Oggi nel calendario', a: 'calendario' },
        { ico: 'diario', testo: 'Diario dell\'aula', a: 'diario' },
        { ico: 'sospesi', testo: 'In sospeso', a: 'sospesi' },
      ] });
      out.push({ nome: 'Suggerimenti', voci: [
        { ico: 'cerca', testo: 'Prova un nome, un #tag, «12 marzo», «ieri», «ottobre»', a: null },
      ] });
      return out;
    }
    const d = leggiData(t);
    if (d?.giorno) out.push({ nome: 'Data', voci: [
      { ico: 'calendario', testo: lunga(d.giorno, true), dett: relativa(d.giorno), a: 'calendario/settimana/' + d.giorno },
      { ico: 'diario', testo: 'Note di quel giorno', a: `diario?da=${d.giorno}&a=${d.giorno}` },
    ] });
    if (d?.mese) {
      const fine = d.mese.slice(0, 8) + '31';
      out.push({ nome: 'Mese', voci: [
        { ico: 'calendario', testo: `${nomeMese(d.mese)} ${anno(d.mese)}`, a: 'calendario/mese/' + d.mese },
        { ico: 'diario', testo: `Note di ${nomeMese(d.mese)}`, a: `diario?da=${d.mese}&a=${fine}` },
      ] });
    }
    const tt = t.replace(/^#/, '');
    const tag = tuttiTag().filter((x) => x.toLowerCase().startsWith(tt)).slice(0, 4);
    if (tag.length) out.push({ nome: 'Tag', voci: tag.map((x) => ({ tag: x, testo: x, a: 'diario?tag=' + encodeURIComponent(x) })) });
    if (!t.startsWith('#')) {
      const r = dati.ragazzi.filter((x) => nomeCompleto(x).toLowerCase().includes(t) || (x.cognome + ' ' + x.nome).toLowerCase().includes(t)).slice(0, 5);
      if (r.length) out.push({ nome: 'Ragazzi', voci: r.map((x) => ({ ico: 'persone', testo: nomeCompleto(x), dett: gruppiDi(x.id).map((g) => g.nome).join(', '), a: 'ragazzo/' + x.id })) });
      const g = dati.gruppi.filter((x) => (x.nome + ' ' + (x.tema || '')).toLowerCase().includes(t)).slice(0, 3);
      if (g.length) out.push({ nome: 'Gruppi', voci: g.map((x) => ({ ico: 'gruppo', testo: x.nome, dett: x.tema, a: 'gruppo/' + x.id })) });
      if (t.length >= 3) {
        const n = diarioAula().filter((v) => (v.titolo + ' ' + v.testo).toLowerCase().includes(t)).slice(0, 6);
        if (n.length) out.push({ nome: 'Nelle note', voci: [
          ...n.map((v) => ({ ico: 'diario', testo: `${v.titolo} · ${lunga(v.data)}`, dett: frammento(v.testo, t), a: v.sedutaId ? 'seduta/' + encodeURIComponent(v.sedutaId) : 'nota/' + v.notaId })),
          { ico: 'cerca', testo: `Tutte le note con «${q.trim()}»`, a: 'diario?q=' + encodeURIComponent(q.trim()) },
        ] });
      }
    }
    if (!out.length) out.push({ nome: 'Niente', voci: [{ ico: 'cerca', testo: 'Nessun risultato', a: null }] });
    return out;
  });
  const piatte = $derived(gruppiRis.flatMap((g) => g.voci).filter((v) => v.a));
  $effect(() => { q; sel = 0; });

  function vaiA(v) { if (!v?.a) return; chiudi(); vai(v.a); }
  function tasti(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(piatte.length - 1, sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); vaiA(piatte[sel]); }
  }
  $effect(() => { sel; dialogo?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogo} class="cerca" aria-label="Cerca" onclose={chiudi} onclick={(e) => { if (e.target === dialogo) dialogo.close(); }}>
  <div class="riquadro">
    <div class="campo-cerca">
      <Icona nome="cerca" />
      <input bind:this={campo} bind:value={q} onkeydown={tasti} placeholder="Nome, #tag, data, parole…" aria-label="Cerca" role="combobox" aria-expanded="true" aria-controls="risultati" aria-autocomplete="list" autocomplete="off" />
      <button class="btn nudo piccolo" onclick={() => dialogo.close()} aria-label="Chiudi"><kbd>Esc</kbd></button>
    </div>
    <div id="risultati" class="risultati" role="listbox" aria-label="Risultati">
      {#each gruppiRis as g (g.nome)}
        <div class="gruppo" role="group" aria-label={g.nome}>
          <p class="eti">{g.nome}</p>
          {#each g.voci as v (v.testo + (v.a || ''))}
            {@const i = piatte.indexOf(v)}
            <button role="option" aria-selected={i === sel && i >= 0} class="voce" class:inerte={!v.a} disabled={!v.a} onmousemove={() => { if (i >= 0) sel = i; }} onclick={() => vaiA(v)}>
              {#if v.tag}<span class="tag" aria-hidden="true">{v.tag}</span>{:else}<Icona nome={v.ico} />{/if}
              <span class="testo">{#if !v.tag}{v.testo}{:else}<span class="vis-nascosto">tag {v.testo}</span>{/if}{#if v.dett}<span class="dett">{v.dett}</span>{/if}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</dialog>

<style>
  dialog { padding: 0; border: 0; background: transparent; width: min(640px, calc(100vw - 24px)); max-height: min(620px, 80dvh); margin: 12vh auto auto; color: inherit; overflow: visible; }
  dialog::backdrop { background: oklch(0.2 0.03 265 / 0.35); }
  .riquadro { background: var(--carta); border: 1px solid var(--inchiostro); box-shadow: var(--ombra), 6px 6px 0 var(--spot-retino); display: grid; grid-template-rows: auto 1fr; max-height: inherit; animation: apre var(--d-media) var(--e-uscita); }
  .campo-cerca { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-bottom: 1.5px solid var(--inchiostro); }
  .campo-cerca :global(.ico) { width: 22px; height: 22px; }
  input { flex: 1; border: 0; background: transparent; font-family: var(--f-display); font-size: 24px; padding: 6px 0; min-width: 0; }
  input:focus { outline: none; }
  input::placeholder { color: var(--inchiostro-3); }
  kbd { font: 600 11px var(--f-testo); border: 1px solid var(--matita-forte); border-radius: var(--r); padding: 1px 5px; }
  .risultati { overflow: auto; padding: var(--s-2) 0 var(--s-3); }
  .gruppo { padding: var(--s-2) var(--s-2) 0; }
  .gruppo > .eti { padding: 4px var(--s-3); }
  .voce { display: flex; align-items: flex-start; gap: var(--s-3); width: 100%; padding: 8px var(--s-3); border: 0; background: none; text-align: left; cursor: pointer; border-radius: var(--r); }
  .voce :global(.ico) { margin-top: 2px; color: var(--inchiostro-2); }
  .voce[aria-selected='true'] { background: var(--carta-3); box-shadow: inset 3px 0 0 var(--spot); }
  .voce.inerte { cursor: default; color: var(--inchiostro-2); font-style: italic; }
  .testo { display: grid; min-width: 0; }
  .dett { font-size: var(--t-sm); color: var(--inchiostro-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @keyframes apre { from { opacity: 0; transform: translateY(-6px); } }
  @media (max-width: 720px) {
    dialog { margin: 8px auto auto; max-height: calc(100dvh - 16px); }
    input { font-size: 20px; }
  }
</style>
