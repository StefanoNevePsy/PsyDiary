<script>
  import Scelta from '../Scelta.svelte';
  // Persone e accessi, sul custode: chi entra (per email), con che ruolo, e per
  // ogni tirocinante quali ragazzi vede per intero.
  import { onMount } from 'svelte';
  import { leggiAccessi, salvaAccessi, elencoDispositivi, togliDispositivo, sync } from '../../lib/centro/sync.svelte.js';
  import { dati, nomeCompleto, ragazziAttivi, membriAl } from '../../lib/dati.svelte.js';
  import { oggi, lunga, relativa } from '../../lib/date.js';
  import Icona from '../Icona.svelte';

  let acc = $state(null);          // { version, utenti: { email: {...} }, proprietario }
  let modificato = $state(false);
  let errore = $state('');
  let messaggio = $state('');
  let aperto = $state(null);
  const RUOLI = [{ valore: 'admin', etichetta: 'operatore' }, { valore: 'tirocinante', etichetta: 'tirocinante' }];
  let nuovo = $state({ nome: '', email: '', ruolo: 'tirocinante' });
  let dispositivi = $state([]);

  async function carica() {
    try { acc = await leggiAccessi(); modificato = false; errore = ''; dispositivi = await elencoDispositivi(); }
    catch (e) { errore = e.message; }
  }
  onMount(carica);

  const persone = $derived(acc ? Object.entries(acc.utenti).map(([email, u]) => ({ email, ...u })).sort((a, b) => (a.ruolo === b.ruolo ? a.nome.localeCompare(b.nome) : a.ruolo === 'admin' ? -1 : 1)) : []);
  const gruppi = $derived(dati.gruppi.filter((g) => !g.archiviato));
  const tutti = $derived(ragazziAttivi());

  function cambia(email, campi) { acc.utenti[email] = { ...acc.utenti[email], ...campi }; modificato = true; messaggio = ''; }
  function alterna(email, rid) {
    const l = acc.utenti[email].ragazzi || [];
    cambia(email, { ragazzi: l.includes(rid) ? l.filter((x) => x !== rid) : [...l, rid] });
  }
  function gruppoIntero(email, g) {
    const membri = membriAl(g, oggi()), l = acc.utenti[email].ragazzi || [];
    const dentro = membri.every((m) => l.includes(m));
    cambia(email, { ragazzi: dentro ? l.filter((x) => !membri.includes(x)) : [...new Set([...l, ...membri])] });
  }
  function aggiungi(e) {
    e.preventDefault();
    const email = nuovo.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { errore = 'Email non valida.'; return; }
    if (acc.utenti[email]) { errore = 'Questa persona c\'è già.'; return; }
    acc.utenti[email] = { nome: nuovo.nome.trim() || email.split('@')[0], ruolo: nuovo.ruolo, ragazzi: [], attivo: true, scadenza: null };
    aperto = nuovo.ruolo === 'tirocinante' ? email : null;
    nuovo = { nome: '', email: '', ruolo: 'tirocinante' };
    modificato = true; errore = '';
  }
  function togli(email) {
    if (!confirm(`Togliere l'accesso a ${acc.utenti[email].nome}? Le note che ha scritto restano; i suoi dispositivi perdono la chiave.`)) return;
    delete acc.utenti[email];
    modificato = true;
  }
  async function salvaTutto() {
    try {
      const pulito = { utenti: Object.fromEntries(Object.entries($state.snapshot(acc.utenti)).map(([e, u]) => [e, { ...u, ragazzi: u.ruolo === 'admin' ? [] : (u.ragazzi || []).filter((r) => tutti.some((x) => x.id === r)) }])) };
      acc = await salvaAccessi(pulito, acc.version || 0);
      modificato = false; errore = ''; messaggio = 'Salvato. Chi entra per la prima volta riceve la chiave da un vostro dispositivo entro un minuto.';
      dispositivi = await elencoDispositivi();
    } catch (e) {
      errore = e.codice === 'conflitto' ? 'Un altro operatore ha cambiato gli accessi nel frattempo: ricarico la versione attuale, rifai la modifica.' : e.message;
      if (e.codice === 'conflitto') await carica();
    }
  }
  async function toglid(id) {
    if (!confirm('Togliere questo dispositivo? Perde la chiave e deve essere abilitato di nuovo.')) return;
    dispositivi = await togliDispositivo(id);
  }
</script>

{#if !acc}
  <p class="sotto">{errore || 'Carico gli accessi dal custode…'}</p>
{:else}
  <div class="accessi">
    <p class="sotto">Entra solo chi è in questo elenco, con il suo account Google. Gli operatori vedono tutto; ogni tirocinante vede per intero solo i ragazzi condivisi con lui, degli altri le sedute di gruppo e le note "nel gruppo". I dati non condivisi non arrivano proprio sul suo dispositivo.</p>
    <ul class="persone">
      <li class="persona"><div class="riga"><span class="display nome">{acc.proprietario}</span><span class="eti">proprietario · operatore sempre</span></div></li>
      {#each persone.filter((p) => p.email !== acc.proprietario) as p (p.email)}
        {@const n = (p.ragazzi || []).filter((x) => tutti.some((r) => r.id === x)).length}
        <li class="persona" class:spenta={!p.attivo}>
          <div class="riga">
            <span class="display nome">{p.nome}</span>
            <span class="sotto piccolo">{p.email}</span>
            <span class="spazio"></span>
            <Scelta breve value={p.ruolo} onchange={(v) => cambia(p.email, { ruolo: v })} etichetta={'Ruolo di ' + p.nome} opzioni={RUOLI} />
            {#if p.ruolo === 'tirocinante'}
              <button class="btn piccolo" aria-expanded={aperto === p.email} onclick={() => (aperto = aperto === p.email ? null : p.email)}>{n ? `${n} condivisi` : 'solo gruppi'}</button>
            {/if}
            <button class="btn nudo piccolo" onclick={() => togli(p.email)} aria-label={'Togli ' + p.nome}><Icona nome="cestino" /></button>
          </div>
          <div class="riga extra">
            <label class="spunta"><input type="checkbox" checked={p.attivo} onchange={(e) => cambia(p.email, { attivo: e.currentTarget.checked })} /> attivo</label>
            <label class="scade"><span class="eti">accesso fino al</span><input class="input breve" type="date" value={p.scadenza || ''} onchange={(e) => cambia(p.email, { scadenza: e.currentTarget.value || null })} /></label>
          </div>
          {#if aperto === p.email && p.ruolo === 'tirocinante'}
            <div class="scelta">
              <div class="rapidi">
                <span class="eti">Interi gruppi</span>
                {#each gruppi as g (g.id)}
                  <button class="pill" aria-pressed={membriAl(g, oggi()).every((m) => (p.ragazzi || []).includes(m))} onclick={() => gruppoIntero(p.email, g)}>{g.nome}</button>
                {/each}
              </div>
              <div class="ragazzi">
                {#each tutti as r (r.id)}
                  <label class="ragazzo" class:si={(p.ragazzi || []).includes(r.id)}>
                    <input type="checkbox" checked={(p.ragazzi || []).includes(r.id)} onchange={() => alterna(p.email, r.id)} /> {nomeCompleto(r)}
                  </label>
                {/each}
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <form class="nuovo" onsubmit={aggiungi}>
      <input class="input" placeholder="Nome" bind:value={nuovo.nome} aria-label="Nome" />
      <input class="input" type="email" placeholder="email Google" bind:value={nuovo.email} aria-label="Email" required />
      <Scelta bind:value={nuovo.ruolo} etichetta="Ruolo" opzioni={RUOLI} />
      <button class="btn piccolo"><Icona nome="piu" /> Aggiungi</button>
    </form>
    <div class="salva">
      <button class="btn pieno" disabled={!modificato} onclick={salvaTutto}>Salva gli accessi</button>
      {#if modificato}<span class="mano">modifiche da salvare</span>{/if}
      {#if messaggio}<span class="sotto piccolo">{messaggio}</span>{/if}
      {#if errore}<span class="err">{errore}</span>{/if}
    </div>

    <h3 class="eti titoletto">Dispositivi</h3>
    <ul class="dispositivi">
      {#each dispositivi as d (d.id)}
        <li>
          <span><strong>{d.nome}</strong> <span class="sotto piccolo">{d.email}</span></span>
          <span class="sotto piccolo">{d.abilitato ? 'con la chiave' : d.personaAbilitata ? 'riceve la chiave al prossimo giro' : 'persona non abilitata'}{d.ultimoAccesso ? ' · visto ' + relativa(d.ultimoAccesso.slice(0, 10)) : ''}</span>
          <button class="btn nudo piccolo" onclick={() => toglid(d.id)} aria-label={'Togli ' + d.nome}><Icona nome="chiudi" /></button>
        </li>
      {:else}
        <li class="sotto">Nessun dispositivo ancora.</li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .accessi { display: grid; gap: var(--s-4); width: 100%; }
  .persone { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
  .persona { border: 1px solid var(--matita); border-radius: var(--r-grande); padding: var(--s-3) var(--s-4); background: var(--carta-2); display: grid; gap: 6px; }
  .persona.spenta { opacity: 0.6; }
  .riga { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--s-3); }
  .extra { font-size: var(--t-sm); }
  .nome { font-size: 20px; }
  .spazio { flex: 1; }
  .breve { width: auto; min-height: 32px; padding: 2px 24px 2px 2px; font-size: var(--t-sm); }
  .spunta { display: inline-flex; gap: 6px; align-items: center; }
  .spunta input, .ragazzo input { accent-color: var(--spot); }
  .scade { display: inline-flex; gap: 6px; align-items: baseline; }
  .scelta { display: grid; gap: var(--s-3); padding-top: var(--s-3); border-top: 1px dashed var(--matita); }
  .rapidi { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pill { min-height: 30px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; font-weight: 600; font-size: var(--t-sm); cursor: pointer; }
  .pill[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .ragazzi { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 4px var(--s-3); }
  .ragazzo { display: flex; align-items: center; gap: var(--s-2); padding: 3px 8px; border-radius: 999px; cursor: pointer; }
  .ragazzo.si { font-weight: 600; }
  .nuovo { display: grid; grid-template-columns: 1fr 1.4fr auto auto; gap: var(--s-2); align-items: center; }
  .salva { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; }
  .salva .mano { font-size: 20px; }
  .err { color: var(--spot-testo); font-weight: 600; font-size: var(--t-sm); }
  .titoletto { margin-top: var(--s-4); }
  .dispositivi { list-style: none; margin: 0; padding: 0; }
  .dispositivi li { display: flex; flex-wrap: wrap; gap: 4px var(--s-3); align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--matita); }
  @media (max-width: 720px) { .nuovo { grid-template-columns: 1fr; } }
</style>
