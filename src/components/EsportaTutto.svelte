<script>
  // Esportazione completa, per passare a un altro sistema: i dati di tutti,
  // in uno zip cifrato con anagrafiche e diari leggibili, tabelle CSV, JSON e
  // allegati. La fa solo chi ospita il custode (l'unico che riceve tutto),
  // confermando con la frase della chiave dell'aula; resta nel registro, che
  // vedono tutti gli operatori. Tutto si compone qui: niente passa da server.
  import { onMount } from 'svelte';
  import { dati, eAdmin, io } from '../lib/dati.svelte.js';
  import { REALE } from '../lib/centro/config.js';
  import { sync, puoEsportareTutto, leggiEsportazioni, verificaFrase, fraseCanonica, raccogliTutto } from '../lib/centro/sync.svelte.js';
  import { fileImmagine } from '../lib/immagini.js';
  import { immaginiDi } from '../lib/centro/voci.js';
  import { componi } from '../lib/esporta-tutto.js';
  import Icona from './Icona.svelte';

  const puo = $derived(REALE ? puoEsportareTutto() : eAdmin());
  let registro = $state([]);
  onMount(() => { if (REALE && eAdmin()) leggiEsportazioni().then((r) => (registro = r || [])).catch(() => {}); });

  let dialogo = $state();
  let frase = $state(''), scelta = $state(REALE ? 'frase' : 'altra'), pw1 = $state(''), pw2 = $state(''), inChiaro = $state(false);
  let fase = $state(''), avanzamento = $state(''), errore = $state(''), esito = $state(null);
  const pronta = $derived((!REALE || frase.trim()) && (scelta === 'frase' || scelta === 'nessuna' ? true : pw1.length >= 10 && pw1 === pw2) && (scelta !== 'nessuna' || inChiaro));

  function apri() {
    frase = ''; pw1 = ''; pw2 = ''; inChiaro = false; errore = ''; esito = null; fase = '';
    scelta = REALE ? 'frase' : 'altra';
    dialogo?.showModal();
  }
  async function esporta() {
    errore = ''; esito = null;
    let password = '';
    try {
      if (REALE) {
        fase = 'verifica';
        if (!(await verificaFrase(frase))) { errore = 'La frase non è quella della chiave dell\'aula.'; fase = ''; return; }
      }
      password = scelta === 'frase' ? fraseCanonica(frase) : scelta === 'altra' ? pw1 : '';
      fase = 'raccolta';
      let raccolta;
      if (REALE) {
        raccolta = await raccogliTutto((i, n, cosa) => (avanzamento = `${cosa === 'dati' ? 'Scarico e decifro i dati' : 'Scarico gli allegati'}: ${i} di ${n}`));
      } else {
        // prototipo: i dati di questo browser
        const d = $state.snapshot(dati);
        const file = new Map();
        const ids = new Set(['ragazzi', 'gruppi', 'sedute', 'note', 'programmi'].flatMap((t) => (d[t] || []).flatMap((o) => immaginiDi(o))));
        for (const id of ids) { const f = await fileImmagine(id).catch(() => null); if (f?.blob) file.set(id, f.blob); }
        raccolta = { dati: { ragazzi: d.ragazzi, gruppi: d.gruppi, sedute: d.sedute, note: d.note, sospesi: d.sospesi, serie: d.serie, programmi: d.programmi }, file };
      }
      fase = 'zip';
      avanzamento = 'Compongo le pagine e le tabelle…';
      const { voci, riepilogo } = componi(raccolta.dati, raccolta.file, { da: io().nome || io().email || '', il: new Date().toISOString() });
      const { creaZip } = await import('../lib/zip-esporta.js');
      const zip = await creaZip(voci, { password, avanza: (i, n) => (avanzamento = `Cifro e comprimo: ${i} di ${n} file`) });
      const nome = `PsyDiary-esportazione-${new Date().toISOString().slice(0, 10)}.zip`;
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      esito = { ...riepilogo, nome, peso: zip.size, cifrato: !!password, conFrase: scelta === 'frase' };
      fase = 'fatto';
      if (REALE) leggiEsportazioni().then((r) => (registro = r || [])).catch(() => {});
    } catch (e) {
      errore = e.message || String(e); fase = '';
    } finally { password = ''; frase = ''; pw1 = ''; pw2 = ''; }
  }
  const peso = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const quando = (t) => new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

{#if puo || (REALE && eAdmin())}
    <h2 class="eti">Esportazione completa</h2>
    <p class="sotto">Per passare a un altro sistema: i dati di tutti (pazienti, gruppi, classi, sedute, note e allegati) in uno zip cifrato, con schede e diari da leggere o stampare, tabelle CSV e un file JSON da importare altrove.</p>
    {#if puo}
      <button class="btn" onclick={apri}><Icona nome="esporta" /> Esporta tutto…</button>
    {:else}
      <p class="sotto piccolo"><Icona nome="lucchetto" /> La fa solo chi ospita il custode: è l'unico che riceve tutti i dati, anche quelli riservati degli altri.</p>
    {/if}
    {#if registro.length}
      <p class="sotto piccolo registro">Ultime esportazioni: {registro.slice(0, 3).map((r) => `${r.nome || r.email} il ${quando(r.il)}`).join(' · ')}</p>
    {/if}
{/if}

<dialog bind:this={dialogo} class="dlg-esporta" aria-labelledby="esp-titolo" onclose={() => { frase = ''; pw1 = ''; pw2 = ''; }}>
  <h2 id="esp-titolo" class="display">Esporta tutto</h2>
  {#if fase === 'fatto' && esito}
    <p>Scaricato <b>{esito.nome}</b> ({peso(esito.peso)}): {esito.pazienti} pazienti, {esito.gruppi} gruppi e classi, {esito.sedute} sedute, {esito.note} note, {esito.file} file.</p>
    {#if esito.mancanti.length}<p class="avviso">{esito.mancanti.length} allegati non erano disponibili (mai arrivati al custode): sono elencati in tabelle/allegati.csv.</p>{/if}
    {#if esito.cifrato}
      <p class="sotto piccolo">Si apre con 7-Zip, Keka, WinRAR o The Unarchiver{esito.conFrase ? ', con la frase della chiave dell\'aula scritta in maiuscolo con i trattini (come te l\'ha mostrata PsyDiary)' : ''}. "Estrai tutto" di Windows non apre gli zip cifrati AES.</p>
    {:else}
      <p class="avviso">Lo zip NON è cifrato: chi lo trova legge tutto. Tienilo in un posto sicuro e cancellalo appena puoi.</p>
    {/if}
    <p class="sotto piccolo">Dentro c'è LEGGIMI.txt, che spiega come è fatto.</p>
    <div class="bottoni"><button class="btn pieno" onclick={() => dialogo?.close()}>Chiudi</button></div>
  {:else if fase && fase !== 'fatto'}
    <p class="mano lavoro" aria-live="polite">{fase === 'verifica' ? 'Controllo la frase…' : avanzamento || 'Preparo…'}</p>
    <p class="sotto piccolo">Non chiudere PsyDiary finché lo zip non è scaricato.</p>
  {:else}
    <p class="sotto">I dati di tutti, decifrati qui sul dispositivo e messi in uno zip. Niente passa da server; l'esportazione resta nel registro che vedono gli operatori.</p>
    {#if REALE}
      <label class="campo"><span>Frase della chiave dell'aula</span>
        <input class="input mono" type="password" autocomplete="off" bind:value={frase} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" /></label>
    {/if}
    <fieldset class="pw">
      <legend class="eti">Password dello zip</legend>
      {#if REALE}<label class="opz"><input type="radio" bind:group={scelta} value="frase" /> <span>La frase della chiave dell'aula<small class="sotto">una sola cosa da custodire. Se un giorno dovessi dare la password a qualcun altro, dopo cambia la chiave dell'aula.</small></span></label>{/if}
      <label class="opz"><input type="radio" bind:group={scelta} value="altra" /> <span>Un'altra password<small class="sotto">almeno 10 caratteri</small></span></label>
      {#if scelta === 'altra'}
        <div class="due">
          <input class="input" type="password" autocomplete="new-password" bind:value={pw1} placeholder="password" aria-label="Password dello zip" />
          <input class="input" type="password" autocomplete="new-password" bind:value={pw2} placeholder="ripetila" aria-label="Ripeti la password" />
        </div>
        {#if pw2 && pw1 !== pw2}<p class="avviso">Le due password non coincidono.</p>{/if}
      {/if}
      <label class="opz"><input type="radio" bind:group={scelta} value="nessuna" /> <span>Senza password<small class="sotto">sconsigliato: lo zip si legge così com'è</small></span></label>
      {#if scelta === 'nessuna'}<label class="opz conferma"><input type="checkbox" bind:checked={inChiaro} /> <span>Ho capito: i dati clinici di tutti saranno leggibili da chiunque abbia il file.</span></label>{/if}
    </fieldset>
    {#if errore}<p class="avviso">{errore}</p>{/if}
    <div class="bottoni">
      <button class="btn nudo" onclick={() => dialogo?.close()}>Annulla</button>
      <button class="btn pieno" onclick={esporta} disabled={!pronta}><Icona nome="esporta" /> Esporta</button>
    </div>
  {/if}
</dialog>

<style>
  .registro { margin-top: var(--s-2); }
  .dlg-esporta { width: min(94vw, 520px); padding: var(--s-5); border: 1px solid var(--matita-forte); border-radius: var(--r-grande); background: var(--carta); color: var(--inchiostro); }
  .dlg-esporta::backdrop { background: oklch(0.2 0.02 265 / 0.5); }
  .dlg-esporta[open] { display: grid; gap: var(--s-3); }
  .dlg-esporta h2 { margin: 0; font-size: var(--t-lg); }
  p { margin: 0; }
  .mono { font-family: ui-monospace, monospace; letter-spacing: 0.06em; }
  .pw { border: 0; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
  .opz { display: grid; grid-template-columns: auto 1fr; gap: 0 var(--s-2); align-items: start; cursor: pointer; }
  .opz input { margin-top: 4px; accent-color: var(--spot); }
  .opz small { display: block; font-size: 12px; }
  .conferma { margin-left: 24px; }
  .due { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); margin-left: 24px; }
  .lavoro { font-size: 19px; }
  .avviso { color: var(--spot-testo); font-size: var(--t-sm); }
  .bottoni { display: flex; justify-content: flex-end; gap: var(--s-2); }
</style>
