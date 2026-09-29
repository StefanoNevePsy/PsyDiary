<script>
  // Per ogni tirocinante: quali ragazzi vede per intero. Degli altri vede solo
  // quello che succede nei gruppi (resoconti e note di gruppo).
  import { dati, salva, elimina, nuovoId, nomeCompleto, ragazziAttivi, membriAl, io } from '../lib/dati.svelte.js';
  import { oggi } from '../lib/date.js';
  import Immagine from './Immagine.svelte';
  import Icona from './Icona.svelte';

  const tirocinanti = $derived(dati.persone.filter((p) => p.ruolo === 'tirocinante'));
  const operatori = $derived(dati.persone.filter((p) => p.ruolo === 'admin'));
  const gruppi = $derived(dati.gruppi.filter((g) => !g.archiviato));
  const tutti = $derived(ragazziAttivi());
  let aperto = $state(null);
  let nuovo = $state('');

  const salvaPersona = (p, ragazzi) => salva('persone', { ...$state.snapshot(p), ragazzi });
  function alterna(p, rid) {
    const l = p.ragazzi || [];
    salvaPersona(p, l.includes(rid) ? l.filter((x) => x !== rid) : [...l, rid]);
  }
  function gruppoIntero(p, g) {
    const membri = membriAl(g, oggi());
    const l = p.ragazzi || [];
    const tuttiDentro = membri.every((m) => l.includes(m));
    salvaPersona(p, tuttiDentro ? l.filter((x) => !membri.includes(x)) : [...new Set([...l, ...membri])]);
  }
  async function aggiungi(e) {
    e.preventDefault();
    if (!nuovo.trim()) return;
    const p = await salva('persone', { id: nuovoId('u'), nome: nuovo.trim(), ruolo: 'tirocinante', ragazzi: [] });
    nuovo = ''; aperto = p.id;
  }
  async function togli(p) {
    if (!confirm(`Togliere l'accesso a ${p.nome}? Le note che ha scritto restano.`)) return;
    await elimina('persone', p.id);
  }
</script>

<div class="accessi">
  <p class="sotto">Gli operatori vedono tutto. Ogni tirocinante vede per intero solo i ragazzi condivisi con lui (sedute individuali, genitori, conoscenza, note, anagrafica); degli altri vede soltanto quello che succede nei gruppi.</p>
  <ul class="persone">
    {#each operatori as p (p.id)}
      <li class="persona"><div class="riga"><span class="display nome">{p.nome}</span><span class="eti">operatore · vede tutto</span></div></li>
    {/each}
    {#each tirocinanti as p (p.id)}
      {@const n = (p.ragazzi || []).filter((x) => tutti.some((r) => r.id === x)).length}
      <li class="persona" class:aperta={aperto === p.id}>
        <div class="riga">
          <span class="display nome">{p.nome}</span>
          <span class="eti">tirocinante · {n ? `${n} ragazz${n === 1 ? 'o' : 'i'} condivis${n === 1 ? 'o' : 'i'}` : 'solo i gruppi'}</span>
          <span class="spazio"></span>
          <button class="btn piccolo" aria-expanded={aperto === p.id} onclick={() => (aperto = aperto === p.id ? null : p.id)}>{aperto === p.id ? 'Chiudi' : 'Scegli i ragazzi'}</button>
          {#if p.id !== io().id}<button class="btn nudo piccolo" onclick={() => togli(p)} aria-label={'Togli ' + p.nome}><Icona nome="cestino" /></button>{/if}
        </div>
        {#if aperto === p.id}
          <div class="scelta">
            <div class="rapidi">
              <span class="eti">Interi gruppi</span>
              {#each gruppi as g (g.id)}
                {@const dentro = membriAl(g, oggi()).every((m) => (p.ragazzi || []).includes(m))}
                <button class="pill" aria-pressed={dentro} onclick={() => gruppoIntero(p, g)}>{g.nome}</button>
              {/each}
            </div>
            <div class="ragazzi">
              {#each tutti as r (r.id)}
                {@const si = (p.ragazzi || []).includes(r.id)}
                <label class="ragazzo" class:si>
                  <input type="checkbox" checked={si} onchange={() => alterna(p, r.id)} />
                  <span class="av"><Immagine id={r.foto} forma="tondo" seme={r.id} iniziale={r.nome[0]} piccola colori={false} /></span>
                  <span>{nomeCompleto(r)}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  <form class="nuovo" onsubmit={aggiungi}>
    <label class="vis-nascosto" for="nuovo-tirocinante">Nome del tirocinante</label>
    <input id="nuovo-tirocinante" class="input" placeholder="Nome di un nuovo tirocinante" bind:value={nuovo} />
    <button class="btn piccolo" disabled={!nuovo.trim()}><Icona nome="piu" /> Aggiungi</button>
  </form>
  <p class="sotto piccolo">Nella versione vera l'accesso si dà con l'email Google, e i dati non condivisi non arrivano proprio sul dispositivo del tirocinante.</p>
</div>

<style>
  .accessi { display: grid; gap: var(--s-4); width: 100%; }
  .persone { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
  .persona { border: 1px solid var(--matita); border-radius: var(--r-grande); padding: var(--s-3) var(--s-4); background: var(--carta-2); }
  .riga { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--s-3); }
  .nome { font-size: 20px; }
  .spazio { flex: 1; }
  .scelta { display: grid; gap: var(--s-3); margin-top: var(--s-3); padding-top: var(--s-3); border-top: 1px dashed var(--matita); }
  .rapidi { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pill { min-height: 30px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; font-weight: 600; font-size: var(--t-sm); cursor: pointer; }
  .pill[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .ragazzi { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 4px var(--s-3); }
  .ragazzo { display: flex; align-items: center; gap: var(--s-2); padding: 4px 8px; border-radius: 999px; cursor: pointer; }
  .ragazzo:hover { background: var(--carta-3); }
  .ragazzo.si { font-weight: 600; }
  .ragazzo input { accent-color: var(--spot); width: 16px; height: 16px; }
  .av { width: 26px; height: 26px; flex: none; }
  .av :global(.iniziale) { font-size: 13px; }
  .nuovo { display: flex; gap: var(--s-2); align-items: center; max-width: 480px; }
</style>
