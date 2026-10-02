<script module>
  // nomi delle persone abilitate, letti una volta (solo gli operatori possono)
  let nomiCondivisi = null;
</script>

<script>
  // Chi vede un paziente, o un gruppo/classe (g). È di chi lo crea: lo vede
  // tutto lui, e gli altri solo se li sceglie (o se lo apre a tutta l'aula).
  // Lo decide chi l'ha creato; chi ospita il custode riprende ciò che era di
  // chi non è più abilitato.
  import { T } from '../lib/parole.svelte.js';
  import { dati, io, eAdmin, accessoDi, accessoGruppo, accessoProgramma, salva, nomeCompleto, tipoGruppo } from '../lib/dati.svelte.js';
  import { REALE } from '../lib/centro/config.js';
  import { leggiAccessi, condividiPaziente, condividiGruppo, condividiProgramma, gestisceCondivisioni, gestisceCondivisioniGruppi, gestisceCondivisioniProgrammi, sync } from '../lib/centro/sync.svelte.js';
  import Icona from './Icona.svelte';

  let { r = null, g = null, p = null } = $props();
  const o = $derived(g || p || r);
  const diProgramma = $derived(!!p);
  // un programma si comporta come un gruppo: "tutta l'aula" vale anche per i tirocinanti
  const diGruppo = $derived(!!g || !!p);
  const classe = $derived(diGruppo && tipoGruppo(g) === 'classe');
  // "questo paziente", "questo gruppo", "questa classe"
  const questo = $derived(diProgramma ? 'questo programma' : classe ? 'questa classe' : diGruppo ? 'questo gruppo' : 'questo ' + T('uno'));
  const a = $derived(diProgramma ? accessoProgramma(p.id) : g ? accessoGruppo(g.id) : accessoDi(r.id));
  const funziona = $derived(!REALE || (diProgramma ? gestisceCondivisioniProgrammi() : g ? gestisceCondivisioniGruppi() : gestisceCondivisioni()));
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
    if (a.daPrima) return diGruppo ? 'di tutta l\'aula · lo vedono tutti' : 'di tutta l\'aula · tutti gli operatori';
    const altri = (a.condivisi || []).filter((x) => x !== ioId());
    const di = a.mio ? '' : 'di ' + nomeDi(a.proprietario) + ' · ';
    if (a.tutti) return di + (diGruppo ? 'aperto a tutta l\'aula' : 'aperto a tutti gli operatori');
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
      const scelta = { condivisi: scelti, tutti, ...(prendo ? { proprietario: io().email } : {}) };
      if (REALE) await (diProgramma ? condividiProgramma(p.id, scelta) : g ? condividiGruppo(g.id, scelta) : condividiPaziente(r.id, scelta));
      else await salva(diProgramma ? 'programmi' : g ? 'gruppi' : 'ragazzi', { ...$state.snapshot(o), accesso: { proprietario: a.daPrima || prendo ? io().id : a.proprietario, condivisi: scelti, tutti } });
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
    {#if puoDecidere}<button type="button" class="btn piccolo condividi" onclick={apri}><Icona nome="persone" /> {a.mio || a.orfano ? 'Condividi · chi lo vede' : 'Rendilo riservato'}</button>{/if}
  </p>
{:else if REALE && !funziona && eAdmin()}
  <!-- custode non ancora aggiornato: la condivisione c'è, ma il custode non la conosce -->
  <p class="condivisione">
    <Icona nome="persone" />
    <span>di tutta l'aula · per scegliere chi lo vede va aggiornato il custode (vedi la guida: «Aggiornare il custode»)</span>
  </p>
{/if}

<dialog bind:this={dialogo} class="dlg-cond" aria-labelledby="cond-titolo">
  {#if a}
    <h2 id="cond-titolo" class="display">Chi vede {diProgramma ? p.nome : g ? g.nome : nomeCompleto(r)}</h2>
    {#if a.daPrima}<p class="sotto piccolo">{questo[0].toUpperCase() + questo.slice(1)} è di prima dei riservati: oggi {diGruppo ? 'lo vedono tutti' : 'lo vedono tutti gli operatori'}. Togliendo la spunta qui sotto diventa tuo e lo vedono solo le persone che scegli.</p>{/if}
    {#if a.orfano}<p class="avviso">Chi l'aveva creato non è più abilitato: puoi prenderlo in carico tu.</p>{/if}
    {#if diGruppo}
      <label class="opz"><input type="checkbox" bind:checked={tutti} /> <span><b>Tutta l'aula</b><small class="sotto">{diProgramma ? 'nella biblioteca comune: lo vedono e lo assegnano tutti' : 'come i gruppi di prima: sedute e note li vedono tutti, operatori e tirocinanti'}</small></span></label>
    {:else}
      <label class="opz"><input type="checkbox" bind:checked={tutti} /> <span><b>Tutti gli operatori dell'aula</b><small class="sotto">come i {T('tanti')} dei gruppi: anagrafica, individuali e note li vedono tutti gli operatori</small></span></label>
    {/if}
    <p class="eti">{tutti ? 'Inoltre' : 'Solo'} queste persone</p>
    {#if errore && !persone}<p class="avviso">{errore}</p>{/if}
    <ul class="persone">
      {#each altrePersone as x (x.id)}
        <li><label class="opz"><input type="checkbox" checked={scelti.includes(x.id)} onchange={() => alterna(x.id)} />
          <span>{x.nome}<small class="sotto">{x.ruolo === 'admin' ? 'operatore' : diProgramma ? 'tirocinante: lo legge' : diGruppo ? 'tirocinante: scrive sedute e note' : 'tirocinante: vede anche individuali e anagrafica'}{REALE ? ' · ' + x.id : ''}</small></span></label></li>
      {:else}
        <li class="sotto piccolo">{persone ? 'Nessun altro abilitato.' : 'Carico le persone…'}</li>
      {/each}
    </ul>
    {#if a.orfano && proprietarioCustode()}<label class="opz"><input type="checkbox" bind:checked={prendo} /> <span>Prendilo in carico io</span></label>{/if}
    <p class="sotto piccolo">Chi non è scelto non riceve niente di {questo}, nemmeno il nome{diProgramma ? '' : diGruppo ? ', le sedute e le note' : ''}. Puoi cambiare idea quando vuoi.</p>
    {#if errore && persone}<p class="avviso">{errore}</p>{/if}
    <div class="bottoni">
      <button type="button" class="btn nudo" onclick={() => dialogo?.close()} disabled={lavoro}>Annulla</button>
      <button type="button" class="btn pieno" onclick={conferma} disabled={lavoro}>{lavoro ? 'Salvo…' : 'Salva'}</button>
    </div>
  {/if}
</dialog>

<style>
  .condivisione { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 0; font-size: var(--t-sm); color: var(--inchiostro-2); }
  .condividi { margin-left: 6px; }
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
