<script>
  import CampoData from './CampoData.svelte';
  import Scelta from './Scelta.svelte';
  // "Si ripete?": mai, ogni settimana, ogni 2/3/4 settimane, una volta al mese.
  // Con i giorni della settimana e la fine (mai, una data, dopo N volte).
  import { giornoSettimana, lunga } from '../lib/date.js';
  import { descrivi, fine as testoFine, posizioneNelMese, ETICHETTE_ORDINALI } from '../lib/serie.js';

  let { data, ripeti = $bindable(null), fine = $bindable({ tipo: 'mai', al: '', volte: 10 }), ora = '', permettiMai = true } = $props();
  const SCELTE = [['mai', 'Non si ripete'], ['1', 'Ogni settimana'], ['2', 'Ogni 2 settimane'], ['3', 'Ogni 3 settimane'], ['4', 'Ogni 4 settimane'], ['mese', 'Una volta al mese']];
  const GIORNI = [[1, 'lun'], [2, 'mar'], [3, 'mer'], [4, 'gio'], [5, 'ven'], [6, 'sab'], [7, 'dom']];
  const scelta = $derived(!ripeti ? 'mai' : ripeti.come === 'mese' ? 'mese' : String(ripeti.ogni || 1));

  function scegli(v) {
    if (v === 'mai') ripeti = null;
    else if (v === 'mese') ripeti = { come: 'mese', ...posizioneNelMese(data) };
    else ripeti = { come: 'settimane', ogni: +v, giorni: ripeti?.giorni?.length && ripeti.come === 'settimane' ? ripeti.giorni : [giornoSettimana(data)] };
  }
  function giorno(n) {
    const g = ripeti.giorni.includes(n) ? ripeti.giorni.filter((x) => x !== n) : [...ripeti.giorni, n].sort();
    ripeti = { ...ripeti, giorni: g.length ? g : [n] };
  }
  const riassunto = $derived(ripeti ? descrivi({ ora: ora || '—', ripeti }) + (fine.tipo === 'data' && fine.al ? ', fino al ' + lunga(fine.al) : fine.tipo === 'volte' ? `, ${fine.volte} volte` : '') : '');
</script>

<div class="ripeti">
  <div class="campo"><span>Si ripete</span>
    <div class="scelte" role="radiogroup" aria-label="Ripetizione">
      {#each SCELTE.filter(([v]) => permettiMai || v !== 'mai') as [v, n] (v)}
        <button type="button" role="radio" aria-checked={scelta === v} class="scelta" onclick={() => scegli(v)}>{n}</button>
      {/each}
    </div>
  </div>
  {#if ripeti && ripeti.come === 'settimane'}
    <div class="campo"><span>Nei giorni</span>
      <div class="scelte">{#each GIORNI as [n, g] (n)}<button type="button" class="scelta giorno" aria-pressed={ripeti.giorni.includes(n)} onclick={() => giorno(n)}>{g}</button>{/each}</div>
    </div>
  {:else if ripeti && ripeti.come === 'mese'}
    <div class="campo"><span>Quale giorno del mese</span>
      <div class="riga">
        <Scelta value={ripeti.settimana} onchange={(v) => (ripeti = { ...ripeti, settimana: v })} etichetta="Quale settimana"
          opzioni={[1, 2, 3, 4, -1].map((k) => ({ valore: k, etichetta: k === -1 ? "l'ultimo" : 'il ' + ETICHETTE_ORDINALI[k] }))} />
        <Scelta value={ripeti.giorno} onchange={(v) => (ripeti = { ...ripeti, giorno: v })} etichetta="Giorno della settimana"
          opzioni={GIORNI.map(([n]) => ({ valore: n, etichetta: ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'][n] }))} />
        <span class="sotto piccolo">del mese</span>
      </div>
    </div>
  {/if}
  {#if ripeti}
    <div class="campo"><span>Fino a</span>
      <div class="scelte">
        <button type="button" class="scelta" aria-pressed={fine.tipo === 'mai'} onclick={() => (fine = { ...fine, tipo: 'mai' })}>Sempre</button>
        <button type="button" class="scelta" aria-pressed={fine.tipo === 'data'} onclick={() => (fine = { ...fine, tipo: 'data' })}>Una data</button>
        <button type="button" class="scelta" aria-pressed={fine.tipo === 'volte'} onclick={() => (fine = { ...fine, tipo: 'volte' })}>Un numero di volte</button>
        {#if fine.tipo === 'data'}<span class="breve-data"><CampoData class="input breve" min={data} value={fine.al} onchange={(v) => (fine = { ...fine, al: v })} etichetta="Ultimo giorno" /></span>{/if}
        {#if fine.tipo === 'volte'}<input class="input breve num" type="number" min="1" max="200" value={fine.volte} onchange={(e) => (fine = { ...fine, volte: Math.max(1, +e.currentTarget.value || 1) })} aria-label="Quante volte" /> <span class="sotto piccolo">volte</span>{/if}
      </div>
    </div>
    <p class="riassunto"><span class="mano">↻</span> {riassunto}</p>
  {/if}
</div>

<style>
  .ripeti { display: grid; gap: var(--s-3); }
  .scelte { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .scelta { min-height: 32px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; font-weight: 600; font-size: var(--t-sm); cursor: pointer; }
  .scelta[aria-checked='true'], .scelta[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .scelta.giorno { min-width: 44px; justify-content: center; }
  .riga { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
  .riga .input { width: auto; }
  .breve { width: auto; min-height: 32px; padding: 2px 4px; font-size: var(--t-sm); }
  .num { width: 64px; }
  .riassunto { margin: 0; padding: 6px 12px; border-radius: var(--r); background: var(--spot-tenue); font-size: var(--t-sm); font-weight: 600; }
  .riassunto .mano { font-size: 18px; }
</style>
