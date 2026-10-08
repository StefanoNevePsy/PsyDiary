<script>
  import CampoData from '../CampoData.svelte';
  import { T, M } from '../../lib/parole.svelte.js';
  import Scelta from '../Scelta.svelte';
  // Persone e accessi, sul custode: chi entra (per email), con che ruolo, e per
  // ogni tirocinante quali ragazzi vede per intero.
  import { onMount } from 'svelte';
  import { leggiAccessi, accessiNoti, salvaAccessi, elencoDispositivi, togliDispositivo, sync } from '../../lib/centro/sync.svelte.js';
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

  // Subito l'ultimo elenco visto su questo dispositivo, poi quello del custode;
  // accessi e dispositivi si chiedono insieme. Si salva solo partendo da quello aggiornato.
  let aggiornato = $state(false);
  async function carica() {
    const noto = accessiNoti();
    if (noto && !acc) acc = JSON.parse(JSON.stringify(noto));
    try {
      const [a, d] = await Promise.all([leggiAccessi(), elencoDispositivi().catch(() => dispositivi)]);
      if (!modificato) acc = a;
      else acc = { ...a, utenti: { ...a.utenti, ...acc.utenti } };   // modifiche fatte intanto: restano, sulla versione nuova
      aggiornato = true; errore = ''; dispositivi = d;
    } catch (e) { errore = e.message; }
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
    if (!membri.length) return;
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
  // accesso a tempo: proposta di sei mesi, modificabile
  function traSeiMesi() { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function togli(email) {
    if (!confirm(`Togliere l'accesso a ${acc.utenti[email].nome}? Le note che ha scritto restano; i suoi dispositivi perdono la chiave.`)) return;
    delete acc.utenti[email];
    modificato = true;
  }
  async function salvaTutto() {
    try {
      const pulito = { utenti: Object.fromEntries(Object.entries($state.snapshot(acc.utenti)).map(([e, u]) => [e, { ...u, ragazzi: u.ruolo === 'admin' ? [] : (u.ragazzi || []).filter((r) => tutti.some((x) => x.id === r)), tuttiRagazzi: u.ruolo !== 'admin' && !!u.tuttiRagazzi }])) };
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
    <p class="sotto">Entra solo chi è in questo elenco, con il suo account Google. Gli operatori vedono tutto; ogni tirocinante vede per intero solo {T('i')} condivisi con lui, degli altri le sedute di gruppo e le note "nel gruppo". I dati non condivisi non arrivano proprio sul suo dispositivo.</p>
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
              <button class="btn piccolo" aria-expanded={aperto === p.email} onclick={() => (aperto = aperto === p.email ? null : p.email)}>{p.tuttiRagazzi ? `tutti ${T('i')}` : n ? `${n} condivisi` : 'solo gruppi'}</button>
            {/if}
            <button class="btn nudo piccolo" onclick={() => togli(p.email)} aria-label={'Togli ' + p.nome}><Icona nome="cestino" /></button>
          </div>
          <div class="riga extra">
            <label class="spunta"><input type="checkbox" checked={p.attivo} onchange={(e) => cambia(p.email, { attivo: e.currentTarget.checked })} /> attivo</label>
            <span class="interruttore" role="group" aria-label={'Durata dell\'accesso di ' + p.nome}>
              <button class="pill" aria-pressed={!p.scadenza} onclick={() => cambia(p.email, { scadenza: null })}>senza scadenza</button>
              <button class="pill" aria-pressed={!!p.scadenza} onclick={() => { if (!p.scadenza) cambia(p.email, { scadenza: traSeiMesi() }); }}>con scadenza</button>
            </span>
            {#if p.scadenza}
              <label class="scade"><span class="eti">fino al</span><CampoData class="input breve" value={p.scadenza} etichetta="Accesso fino al" onchange={(v) => cambia(p.email, { scadenza: v || null })} /></label>
              {#if p.scadenza < oggi()}<span class="err">scaduto</span>{/if}
            {/if}
          </div>
          {#if p.scadenza}
            <p class="sotto piccolo nota">Il giorno dopo l'accesso si chiude da solo: il custode toglie la chiave ai suoi dispositivi e i dati dell'aula spariscono da lì, anche senza rete. Spostando la data in avanti la chiave gli torna da sola.</p>
          {/if}
          {#if aperto === p.email && p.ruolo === 'tirocinante'}
            <div class="scelta">
              <span class="interruttore" role="group" aria-label={'Pazienti di ' + p.nome}>
                <button class="pill" aria-pressed={!!p.tuttiRagazzi} onclick={() => cambia(p.email, { tuttiRagazzi: true })}>tutti {T('i')}</button>
                <button class="pill" aria-pressed={!p.tuttiRagazzi} onclick={() => cambia(p.email, { tuttiRagazzi: false })}>solo alcuni</button>
              </span>
              {#if p.tuttiRagazzi}
                {@const da = p.tuttiDa && p.tuttiDa !== sync.io?.email ? (acc.utenti[p.tuttiDa]?.nome || p.tuttiDa) : null}
                <p class="sotto piccolo">{da ? `Vede per intero tutti ${T('i')} che vede ${da}, che gli ha dato l'accesso: i suoi, quelli condivisi con lei o lui e quelli di tutta l'aula.` : `Vede per intero tutti ${T('i')} che vedi tu: i tuoi, quelli condivisi con te e quelli di tutta l'aula.`} Anche quelli aggiunti in futuro; i riservati degli altri operatori restano esclusi.</p>
              {:else}
              <div class="rapidi">
                <span class="eti">Interi gruppi</span>
                {#each gruppi as g (g.id)}
                  {@const membri = membriAl(g, oggi())}
                  <!-- un gruppo senza pazienti (es. una classe con soli alunni) non ha niente da condividere -->
                  <button class="pill" aria-pressed={membri.length > 0 && membri.every((m) => (p.ragazzi || []).includes(m))} disabled={!membri.length}
                    title={membri.length ? '' : 'Nessun paziente in questo gruppo, oggi'} onclick={() => gruppoIntero(p.email, g)}>{g.nome}</button>
                {/each}
              </div>
              <div class="ragazzi">
                {#each tutti as r (r.id)}
                  <label class="ragazzo" class:si={(p.ragazzi || []).includes(r.id)}>
                    <input type="checkbox" checked={(p.ragazzi || []).includes(r.id)} onchange={() => alterna(p.email, r.id)} /> {nomeCompleto(r)}
                  </label>
                {/each}
              </div>
              {/if}
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
      <button class="btn pieno" disabled={!modificato || !aggiornato} onclick={salvaTutto}>{aggiornato ? 'Salva gli accessi' : 'Aggiorno l\'elenco…'}</button>
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
  .interruttore { display: inline-flex; gap: 4px; flex-wrap: wrap; }
  .nota { margin: 0; }
  .scelta { display: grid; gap: var(--s-3); padding-top: var(--s-3); border-top: 1px dashed var(--matita); }
  .rapidi { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pill { min-height: 30px; padding: 2px 12px; border: 1px solid var(--matita-forte); border-radius: 999px; background: transparent; font-weight: 600; font-size: var(--t-sm); cursor: pointer; }
  .pill[aria-pressed='true'] { background: var(--inchiostro); color: var(--su-inchiostro); border-color: var(--inchiostro); }
  .pill:disabled { opacity: 0.45; cursor: default; border-style: dashed; }
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
