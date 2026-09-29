<script>
  import { dati, membriAl, ragazzo, nomeBreve, puoGestire, salva, nuovoId, sedutePeriodo, statoSeduta, storicoGruppo } from '../lib/dati.svelte.js';
  import { vai } from '../lib/rotta.svelte.js';
  import { oggi, piu, relativa, lunga, nomeGiorno } from '../lib/date.js';
  import { anteprima } from '../lib/testo.js';
  import Icona from '../components/Icona.svelte';

  const O = oggi();
  let archiviati = $state(false);
  const elenco = $derived(dati.gruppi.filter((g) => !!g.archiviato === archiviati));
  const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  const prossima = (g) => sedutePeriodo(O, piu(O, 30)).find((s) => s.gruppoId === g.id);
  const daScrivere = (g) => storicoGruppo(g.id).filter((v) => v.tipo === 'gruppo' && v.stato === 'da-scrivere').length;
  async function nuovo() {
    const g = await salva('gruppi', { id: nuovoId('g'), nome: 'Nuovo gruppo', tema: '', obiettivi: '', membri: [], ricorrenza: { giorni: [], ora: '15:00', durata: 90, dal: O } });
    vai('gruppo/' + g.id + '?impostazioni=1');
  }
</script>

<section class="gruppi">
  <header class="testa">
    <div><p class="eti">{elenco.length} {archiviati ? 'archiviati' : 'attivi'}</p><h1 class="display">Gruppi</h1></div>
    <div class="comandi">
      <button class="btn nudo piccolo" aria-pressed={archiviati} onclick={() => (archiviati = !archiviati)}>{archiviati ? 'Attivi' : 'Archiviati'}</button>
      {#if puoGestire()}<button class="btn pieno" onclick={nuovo}><Icona nome="piu" /> Nuovo gruppo</button>{/if}
    </div>
  </header>
  <div class="carte">
    {#each elenco as g, i (g.id)}
      {@const p = prossima(g)}
      {@const n = daScrivere(g)}
      <a class="carta" href={'#/gruppo/' + g.id}>
        <span class="numero display" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        <span class="eti">{g.ricorrenza?.giorni?.length ? `${GIORNI[g.ricorrenza.giorni[0]]} · ${g.ricorrenza.ora}` : 'senza giorno fisso'}</span>
        <span class="nome display">{g.nome}</span>
        {#if g.tema}<span class="tema mano">{g.tema}</span>{/if}
        <span class="membri sotto">{membriAl(g, O).map((r) => nomeBreve(ragazzo(r))).join(', ') || 'nessun membro'}</span>
        <span class="piede">
          {#if p}<span><span class="eti">Prossima</span> {relativa(p.data)}{p.argomento ? ': ' + anteprima(p.argomento, 50) : ''}</span>{/if}
          {#if n}<span class="spot">{n} da scrivere</span>{/if}
        </span>
      </a>
    {:else}
      <p class="sotto">Nessun gruppo {archiviati ? 'archiviato' : 'attivo'}.</p>
    {/each}
  </div>
</section>

<style>
  .gruppi { max-width: 1240px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-8); }
  .testa { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-5); }
  h1 { font-size: var(--t-xl); line-height: 1; margin-top: 4px; }
  .comandi { display: flex; gap: var(--s-3); align-items: center; }
  .carte { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--s-5); }
  .carta {
    position: relative; display: grid; gap: var(--s-2); align-content: start; padding: var(--s-5); text-decoration: none; overflow: hidden;
    background: var(--carta-2); border: 1px solid var(--matita); border-top: 3px solid var(--inchiostro);
    transition: transform var(--d-breve) var(--e-uscita), box-shadow var(--d-breve) var(--e-uscita);
  }
  .carta:hover { transform: translateY(-2px); box-shadow: var(--ombra); }
  .numero { position: absolute; right: 14px; top: 2px; font-size: 64px; line-height: 1; color: transparent; -webkit-text-stroke: 1px var(--matita-forte); }
  .nome { font-size: var(--t-lg); line-height: 1.05; padding-right: 60px; }
  .tema { font-size: 22px; transform: rotate(-2deg); transform-origin: left; width: max-content; }
  .membri { font-size: var(--t-sm); }
  .piede { display: grid; gap: 4px; margin-top: var(--s-2); padding-top: var(--s-3); border-top: 1px dashed var(--matita); font-size: var(--t-sm); }
  .spot { color: var(--spot-testo); font-weight: 600; }
  @media (max-width: 720px) { .gruppi { padding: var(--s-4) var(--s-4) var(--s-7); } h1 { font-size: var(--t-lg); } .carte { grid-template-columns: 1fr; } }
</style>
