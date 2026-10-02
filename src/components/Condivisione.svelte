<script module>
  // nomi delle persone abilitate, letti una volta (solo gli operatori possono)
  let nomiCondivisi = null;
</script>

<script>
  // Chi vede il paziente. Un paziente è di chi lo crea: lo vede tutto lui, e
  // gli altri solo se li sceglie (o se lo apre a tutti gli operatori dell'aula).
  // Lo decide chi l'ha creato; chi ospita il custode riprende i pazienti di chi
  // non è più abilitato.
  import { T } from '../lib/parole.svelte.js';
  import { dati, io, eAdmin, accessoDi, salva, nomeCompleto } from '../lib/dati.svelte.js';
  import { REALE } from '../lib/centro/config.js';
  import { leggiAccessi, condividiPaziente, gestisceCondivisioni, sync } from '../lib/centro/sync.svelte.js';
  import Icona from './Icona.svelte';

  let { r } = $props();
  const a = $derived(accessoDi(r.id));
  const funziona = $derived(!REALE || gestisceCondivisioni());
  const ioId = () => (REALE ? io().email : io().id);
  const proprietarioCustode = () => REALE && !!sync.io?.proprietario;
  const puoDecidere = $derived(!!a && eAdmin() && (a.mio || a.daPrima || (a.orfano && proprietarioCustode())));

  // nomi delle persone (col custode li conosce solo chi legge gli accessi)
  let persone = $state(null);       // [{ id, nome, ruolo }]
  const maiuscola = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const nomeDi = (id) => persone?.find((p) => p.id === id)?.nome || (REALE ? maiuscola(String(id).split('@')[0]) : dati.persone.find((p) => p.id === id)?.nome || id);
  async function carica() {
    if (persone) return;
    if (!REALE) { persone = dati.persone.map((p) => ({ id: p.id, nome: p.nome, ruolo: p.ruolo })); return; }
    if (nomiCondivisi) { persone = nomiCondivisi; return; }
    const acc = await leggiAccessi();
    const l = Object.entries(acc.utenti || {}).filter(([, u]) => u.attivo !== false).map(([email, u]) => ({ id: email, nome: u.nome || email, ruolo: u.ruolo }));
    if (acc.proprietario && !l.some((p) => p.id === acc.proprietario)) l.unshift({ id: acc.proprietario, nome: acc.proprietario === io().email ? io().nome : maiuscola(acc.proprietario.split('@')[0]), ruolo: 'admin' });
    persone = nomiCondivisi = l;
  }
  // per il riassunto bastano i nomi: si caricano da soli se c'è qualcun altro da nominare
  $effect(() => {
    if (REALE && eAdmin() && a && !a.daPrima && (!a.mio || (a.condivisi || []).length) && !persone) carica().catch(() => {});
  });

  const riassunto = $derived.by(() => {
    if (!a) return '';
    if (a.daPrima) return 'di tutta l\'aula · tutti gli operatori';
    const altri = (a.condivisi || []).filter((x) => x !== ioId());
    const di = a.mio ? '' : 'di ' + nomeDi(a.proprietario) + ' · ';
    if (a.tutti) return di + 'aperto a tutti gli operatori';
    if (!altri.length) return di + (a.mio ? 'lo vedi solo tu' : 'condiviso con te');
    return di + 'condiviso con ' + altri.map(nomeDi).join(', ');
  });

  let dialogo = $state(), scelti = $state([]), tutti = $state(false), prendo = $state(false), lavoro = $state(false), errore = $state('');
  async function apri() {
    errore = '';
    try { await carica(); } catch (e) { errore = e.message; }
    scelti = [...(a.condivisi || [])]; tutti = !!a.tutti || !!a.daPrima; prendo = false;
    dialogo?.showModal();
  }
  const alterna = (id) => (scelti = scelti.includes(id) ? scelti.filter((x) => x !== id) : [...scelti, id]);
  async function conferma() {
    lavoro = true; errore = '';
    try {
      if (REALE) await condividiPaziente(r.id, { condivisi: scelti, tutti, ...(prendo ? { proprietario: io().email } : {}) });
      else await salva('ragazzi', { ...$state.snapshot(r), accesso: { proprietario: a.daPrima || prendo ? io().id : a.proprietario, condivisi: scelti, tutti } });
      dialogo?.close();
    } catch (e) { errore = e.message || String(e); }
    lavoro = false;
  }
  const altrePersone = $derived((persone || []).filter((p) => p.id !== ioId() && p.id !== a?.proprietario));
</script>

{#if a && funziona}
  <p class="condivisione">
    <Icona nome={a.tutti || a.daPrima ? 'persone' : 'lucchetto'} />
    <span>{riassunto}</span>
    {#if puoDecidere}<button type="button" class="link" onclick={apri}>{a.mio || a.orfano ? 'Chi lo vede' : 'Rendilo riservato'}</button>{/if}
  </p>
{/if}

<dialog bind:this={dialogo} class="dlg-cond" aria-labelledby="cond-titolo">
  {#if a}
    <h2 id="cond-titolo" class="display">Chi vede {nomeCompleto(r)}</h2>
    {#if a.daPrima}<p class="sotto piccolo">Questo {T('uno')} è di prima dei riservati: oggi lo vedono tutti gli operatori. Togliendo "tutti gli operatori" diventa tuo e lo vedono solo le persone che scegli.</p>{/if}
    {#if a.orfano}<p class="avviso">Chi l'aveva creato non è più abilitato: puoi prenderlo in carico tu.</p>{/if}
    <label class="opz"><input type="checkbox" bind:checked={tutti} /> <span><b>Tutti gli operatori dell'aula</b><small class="sotto">come i {T('tanti')} dei gruppi: anagrafica, individuali e note li vedono tutti gli operatori</small></span></label>
    <p class="eti">{tutti ? 'Inoltre' : 'Solo'} queste persone</p>
    {#if errore && !persone}<p class="avviso">{errore}</p>{/if}
    <ul class="persone">
      {#each altrePersone as p (p.id)}
        <li><label class="opz"><input type="checkbox" checked={scelti.includes(p.id)} onchange={() => alterna(p.id)} />
          <span>{p.nome}<small class="sotto">{p.ruolo === 'admin' ? 'operatore' : 'tirocinante: vede anche individuali e anagrafica'}{REALE ? ' · ' + p.id : ''}</small></span></label></li>
      {:else}
        <li class="sotto piccolo">{persone ? 'Nessun altro abilitato.' : 'Carico le persone…'}</li>
      {/each}
    </ul>
    {#if a.orfano && proprietarioCustode()}<label class="opz"><input type="checkbox" bind:checked={prendo} /> <span>Prendilo in carico io</span></label>{/if}
    <p class="sotto piccolo">Chi non è scelto non riceve niente di questo {T('uno')}, nemmeno il nome. Puoi cambiare idea quando vuoi.</p>
    {#if errore && persone}<p class="avviso">{errore}</p>{/if}
    <div class="bottoni">
      <button type="button" class="btn nudo" onclick={() => dialogo?.close()} disabled={lavoro}>Annulla</button>
      <button type="button" class="btn pieno" onclick={conferma} disabled={lavoro}>{lavoro ? 'Salvo…' : 'Salva'}</button>
    </div>
  {/if}
</dialog>

<style>
  .condivisione { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; font-size: var(--t-sm); color: var(--inchiostro-2); }
  .condivisione :global(.ico) { width: 15px; height: 15px; }
  .link { all: unset; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; color: var(--inchiostro); font-weight: 600; margin-left: 4px; }
  .link:focus-visible { outline: 2px solid var(--spot); outline-offset: 2px; }
  .dlg-cond { width: min(94vw, 480px); padding: var(--s-5); border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .dlg-cond::backdrop { background: oklch(0.2 0.02 265 / 0.5); }
  .dlg-cond[open] { display: grid; gap: var(--s-3); }
  h2 { margin: 0; font-size: var(--t-lg); }
  p { margin: 0; }
  .opz { display: grid; grid-template-columns: auto 1fr; gap: 0 var(--s-2); align-items: start; cursor: pointer; }
  .opz input { margin-top: 4px; accent-color: var(--spot); }
  .opz small { display: block; font-size: 12px; }
  .persone { list-style: none; margin: 0; padding: 0; max-height: 40vh; overflow: auto; display: grid; gap: 2px; }
  .persone li { padding: 6px 0; border-bottom: 1px dashed var(--matita); }
  .avviso { color: var(--spot-testo); font-size: var(--t-sm); }
  .bottoni { display: flex; justify-content: flex-end; gap: var(--s-2); }
</style>
