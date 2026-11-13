/**
 * PsyDiary — corsia veloce (Firestore).
 *
 * Accanto al custode (Apps Script + Drive, che resta la base dati, l'archivio e la fonte di verità) c'è una
 * seconda strada, più rapida e facoltativa:
 *   - ogni voce salvata dal custode, già cifrata come l'ha ricevuta lui, viene scritta anche su Firestore;
 *     gli altri dispositivi la ricevono in tempo reale, la aprono e la uniscono con il meccanismo di sempre
 *     (voci.js). Poi il custode resta la verifica: al giro di sincronizzazione successivo i dati convergono;
 *   - un dispositivo nuovo chiede la chiave dell'aula e la riceve in uno o due secondi da un operatore che ha
 *     l'app aperta (la chiave viaggia cifrata per quel dispositivo, con un codice di verifica a 6 cifre);
 *   - qualunque errore (quota, rete, permessi, libreria non caricata) spegne la corsia e l'app funziona
 *     esattamente come prima. Il custode riceve sempre tutto.
 *
 * Senza configurazione (config.js) non succede niente: la libreria di Firebase non si carica nemmeno.
 *
 * Il file ha tre parti, tutte provabili in Node:
 *   1. funzioni pure (piano degli ascolti, codice di verifica, forma dei documenti);
 *   2. il «motore», che parla con un `backend` e con la sincronizzazione solo tramite interfacce, così si prova
 *      senza rete con un backend finto;
 *   3. il backend vero (SDK di Firebase) e il caricamento pigro della libreria.
 * Schema dei dati e delle regole: docs/firestore-progetto.md; regole: firestore.rules.
 */

export const RITENZIONE_MS = 3 * 86400000;   // le modifiche si cancellano dopo 3 giorni (chi manca da più si riallinea dal custode)
export const RICHIESTA_MS = 2 * 86400000;    // richieste e consegne della chiave: 2 giorni al massimo
export const MAX_BUSTA = 900000;             // caratteri della busta: Firestore accetta documenti fino a 1 MiB
export const MAX_IN = 30;                    // ambiti per ogni richiesta «ambito in [...]»
export const ATTESA_RIPROVA_MS = 5 * 60000;  // dopo un errore, nessun nuovo tentativo automatico prima
export const MAX_PUBBLICAZIONI = 40;         // oltre, è un'operazione massiva (es. un gruppo condiviso): viaggia solo dal custode
export const ORA = { $ora: true };           // «ora del server» (il backend lo traduce)
const RE_AMBITO = /^[rgp]:[a-z0-9]{2,40}$/;

export const configurata = (cfg) => !!(cfg && cfg.projectId && cfg.apiKey && cfg.appId);

// ======================================================================
// 1. Funzioni pure
// ======================================================================
function daB64(s) {
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

/**
 * Codice di verifica a 6 cifre, derivato dall'impronta (SHA-256) della chiave pubblica del dispositivo.
 * Lo mostrano il dispositivo che chiede la chiave e quello dell'operatore che la consegna: se qualcuno si
 * fosse infilato nel mezzo con un'altra chiave pubblica, i due codici sarebbero diversi.
 */
export async function codiceVerifica(pubblicaB64) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', daB64(pubblicaB64));
  const h = new Uint8Array(d);
  const n = (((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % 1000000;
  return String(n).padStart(6, '0');
}
export const formatoCodice = (c) => (c ? c.slice(0, 3) + ' ' + c.slice(3) : '');

const chiaveSpec = (filtri) => JSON.stringify(filtri);
/**
 * Quali ascolti servono a questa persona. Le regole non sono filtri: ogni richiesta deve essere dimostrabile
 * dalle regole, quindi si chiede solo quello che le regole garantiscono:
 *   - l'ambito «aula»: lo vede chiunque sia abilitato (una richiesta `ambito ==`);
 *   - gli altri ambiti che il custode dice che vedo (`r:`, `g:`, `p:`): `ambito in [...]` a gruppi di 30,
 *     tutti presenti nell'elenco `ambiti` della mia copia degli accessi.
 * `prec` = il piano di prima: i gruppi ancora validi restano com'erano, così un ambito nuovo non fa
 * riscaricare tutto quello che già si ascolta (ogni documento letto all'avvio di un ascolto si paga).
 * ctx = { ambiti: [ambiti visibili secondo il custode] }
 */
export function pianoAscolto(ctx, prec = []) {
  const voluti = new Set((ctx.ambiti || []).filter((a) => RE_AMBITO.test(a)));
  const crea = (filtri) => ({ coll: 'modifiche', filtri, k: chiaveSpec(filtri) });
  const piano = [crea([['ambito', '==', 'aula']])];
  const assegnati = new Set();
  for (const s of prec || []) {
    const f = (s.filtri || []).find((x) => x[1] === 'in');
    if (!f || !f[2].every((a) => voluti.has(a))) continue;   // un ambito non più visibile: il gruppo si rifà
    piano.push(crea(s.filtri));
    f[2].forEach((a) => assegnati.add(a));
  }
  const nuovi = [...voluti].filter((a) => !assegnati.has(a)).sort();
  for (let i = 0; i < nuovi.length; i += MAX_IN) piano.push(crea([['ambito', 'in', nuovi.slice(i, i + MAX_IN)]]));
  // troppi gruppi piccoli (nati uno a uno): si rifà tutto da capo, in gruppi pieni
  const gruppi = piano.length - 1;
  if (gruppi > Math.ceil(voluti.size / MAX_IN) + 2) return pianoAscolto(ctx, []);
  return piano;
}

/**
 * I due documenti di una voce salvata: il piccolo avviso (`modifiche/<id>`) e la busta (`buste/<id>`).
 * o = { id, tipo, ambito, version, eliminato, creatoDa, email, disp, busta, adesso }
 */
export function costruisciModifica(o) {
  const comuni = { id: o.id, tipo: o.tipo, ambito: o.ambito, eliminato: !!o.eliminato, v: o.version, da: o.email, ts: ORA, scade: { $ms: o.adesso + RITENZIONE_MS } };
  if (o.creatoDa) comuni.creatoDa = o.creatoDa;
  const grandezza = o.busta ? JSON.stringify(o.busta).length : 0;
  const meta = { ...comuni, disp: String(o.disp || '').slice(0, 40) };
  if (grandezza <= MAX_BUSTA) meta.n = grandezza;
  return { meta, busta: { ...comuni, busta: o.eliminato || !o.busta ? {} : o.busta }, troppoGrande: grandezza > MAX_BUSTA };
}

/** Cosa fare davanti a un errore di Firestore: spegnere la corsia, per quanto, e cosa dire. */
export function classificaErrore(e) {
  const c = String((e && (e.code || e.codice)) || '').replace(/^(firestore|auth)\//, '');
  const m = (e && e.message) || '';
  if (c === 'resource-exhausted') return { motivo: 'limite giornaliero di Firebase raggiunto: riprova domani', finoADomani: true };
  if (c === 'permission-denied') return { motivo: 'permessi non concessi da Firebase (le regole o la copia degli accessi non sono aggiornate)' };
  if (c === 'unauthenticated' || /credential|id-token|invalid-credential|user-token|requires-recent-login|operation-not-allowed|unauthorized-domain/.test(c)) return { motivo: 'accesso a Firebase non riuscito', serveAccesso: true };
  if (c === 'unavailable' || c === 'deadline-exceeded' || c === 'network-request-failed') return { motivo: 'nessuna connessione con Firebase', rete: true };
  if (c === 'sdk') return { motivo: 'non riesco a caricare la libreria di Firebase (rete?)', rete: true };
  if (c === 'failed-precondition') return { motivo: 'Firebase non è pronto (manca il database Firestore?)' };
  return { motivo: 'errore di Firebase' + (c ? ' (' + c + ')' : m ? ' (' + m.slice(0, 60) + ')' : '') };
}
const fineGiorno = (ms) => { const d = new Date(ms); d.setHours(24, 0, 0, 0); return d.getTime(); };
const firmaAccesso = (d) => (d ? JSON.stringify([d.ruolo, d.scadeIl, [...(d.ambiti || [])].sort()]) : null);

// ======================================================================
// 2. Il motore
// ======================================================================
/**
 * dep = { cfg, backend, sync, ora(), memoria: { leggi(k), scrivi(k, v) }, setTimeout, log }
 * backend (asincrono):
 *   inizializza(), utente() -> {email}|null, accedi(idToken) -> {email}, esci(),
 *   scrivi(coll, id, dati), elimina(coll, id), leggi(coll, id) -> dati|null, pubblicaModifica(meta, busta),
 *   ascolta({coll, filtri}, suCambi([{tipo, id, dati}]), suErrore(e)) -> annulla(),
 *   ascoltaDoc(coll, id, suDato(dati|null), suErrore(e)) -> annulla()
 * sync (la sincronizzazione con il custode, sync.svelte.js):
 *   contesto() -> { email, io, pronto, fase, ambiti, eOperatore, chiaveEsportabile, kid, cfgChiave }
 *   idToken() -> ID token di Google o null;  dispositivo() -> {id, pubblica};  nomeDispositivo()
 *   versioneLocale(id) -> {version, ambito};  applica(voce) -> bool;  chiaveRicevuta(bustaB64, kid) -> bool
 *   cifraChiaveA(pubblica) -> busta;  abilitaSuCustode({id, kid, busta, pubblica});  personaAbilitata(email) -> bool
 *   riallinea() (un giro con il custode);  cambiato();  consegnaManuale() -> bool
 */
export function creaMotore(dep) {
  const backend = dep.backend, sync = dep.sync, cfg = dep.cfg || {};
  const ora = dep.ora || Date.now;
  const memoria = dep.memoria || { leggi: () => null, scrivi: () => {} };
  const st = {
    stato: 'spenta', motivo: 'non avviata', serveAccesso: false, rete: false,
    avviando: null, iscrizioni: new Map(), piano: [], visti: {}, elabora: Promise.resolve(),
    disp: null, email: null, richiestaId: null, codice: null, annullaConsegna: null, firmaAccessi: undefined, ultimoRiallineo: 0,
    richieste: new Map(), codici: {}, consegnate: {}, pubblicate: 0, ricevute: 0, ultimoErrore: null, fisso: null,
  };
  const log = dep.log || (() => {});
  const notifica = () => { try { if (sync.cambiato) sync.cambiato(); } catch (e) { /* solo un avviso */ } };
  const manuale = () => !!(sync.consegnaManuale && sync.consegnaManuale());
  const ritardo = (ms) => new Promise((ok) => (dep.setTimeout || setTimeout)(ok, ms));

  function chiudi() {
    st.iscrizioni.forEach((annulla) => { try { annulla(); } catch (e) { /* ok */ } });
    st.iscrizioni.clear(); st.piano = []; st.firmaAccessi = undefined;
    if (st.riallineoTimer) { (dep.clearTimeout || clearTimeout)(st.riallineoTimer); st.riallineoTimer = null; }
    if (st.annullaConsegna) { try { st.annullaConsegna(); } catch (e) { /* ok */ } st.annullaConsegna = null; }
    st.richiestaId = null; st.richieste.clear();
  }
  /** Spegne la corsia: l'app torna a usare solo il custode. `finoADomani`: la quota del giorno è finita. */
  function spegni(motivo, opz = {}) {
    const era = st.stato;
    chiudi();
    st.stato = 'spenta'; st.motivo = motivo; st.serveAccesso = !!opz.serveAccesso; st.rete = !!opz.rete;
    st.spentaIl = ora();
    if (opz.finoADomani) { try { memoria.scrivi('fino', String(fineGiorno(ora()))); } catch (e) { /* ok */ } }
    st.avviando = null;
    log('corsia veloce spenta: ' + motivo);
    if (era !== 'spenta' || opz.notifica) notifica();
    return false;
  }
  function spegniPerErrore(e) {
    const c = classificaErrore(e);
    st.ultimoErrore = e;
    return spegni(c.motivo, c);
  }
  /** Spenta per una ragione che non passa da sola (configurazione o custode da aggiornare). */
  function spegniFisso(motivo) { st.fisso = motivo; spegni(motivo, { notifica: true }); }

  async function avvia(opz) {
    if (st.stato === 'attiva') return true;
    if (st.avviando) return st.avviando;
    if (!configurata(cfg)) return false;
    // dopo un errore non si riprova a ogni piccolo cambiamento: ci pensano il tasto «Riprova», la rete che torna, il rientro nell'app
    if (st.stato === 'spenta' && st.spentaIl && !st.fisso && !(opz && opz.forza) && ora() - st.spentaIl < ATTESA_RIPROVA_MS) return false;
    const c = sync.contesto();
    if (!c.io || !c.email) return false;
    if (!(c.io.funzioni || []).includes('veloce')) { spegniFisso('il custode va aggiornato'); return false; }
    if (c.io.veloce && c.io.veloce.progetto && c.io.veloce.progetto !== cfg.projectId) { spegniFisso('il custode usa un altro progetto Firebase'); return false; }
    st.fisso = null;
    const fino = Number(memoria.leggi('fino') || 0);
    if (fino > ora() && !(opz && opz.forza)) { st.motivo = 'limite giornaliero raggiunto: riprova domani'; notifica(); return false; }
    st.avviando = (async () => {
      try {
        st.stato = 'avvio'; st.motivo = 'in avvio'; notifica();
        await backend.inizializza();
        let u = backend.utente();
        if (!u || String(u.email || '').toLowerCase() !== c.email) {
          const t = sync.idToken();
          if (!t) { st.stato = 'spenta'; st.serveAccesso = true; st.motivo = 'serve un nuovo accesso con Google'; st.avviando = null; notifica(); return false; }
          if (u) await backend.esci();
          u = await backend.accedi(t);
          if (String(u.email || '').toLowerCase() !== c.email) { await backend.esci(); return spegni('l\'account Google non coincide con quello dell\'aula'); }
        }
        // la copia degli accessi la scrive il custode: se non c'è ancora, le regole negherebbero tutto
        const mia = await backend.leggi('accessi', c.email);
        if (!mia) return spegni('il custode non ha ancora copiato gli accessi su Firebase: esegui «configuraFirebase» nell\'editor di Apps Script e riprova');
        st.email = c.email;
        try { memoria.scrivi('collegato', '1'); } catch (e) { /* ok */ }
        st.disp = (await sync.dispositivo()).id;
        st.stato = 'attiva'; st.motivo = ''; st.serveAccesso = false; st.rete = false;
        st.avviando = null;
        notifica();
        ricalcola();
        avviaChiave();
        return true;
      } catch (e) { st.avviando = null; return spegniPerErrore(e); }
    })();
    return st.avviando;
  }

  function ferma(motivo) {
    chiudi();
    // uscendo dall'aula anche Firebase si scollega (anche se in questa sessione non era ancora partito: lo ricorda `collegato`)
    let collegato = false;
    try { collegato = memoria.leggi('collegato') === '1'; } catch (e) { /* ok */ }
    if (backend.utente() || collegato) {
      Promise.resolve().then(() => backend.inizializza()).then(() => backend.esci())
        .then(() => { try { memoria.scrivi('collegato', '0'); } catch (e) { /* ok */ } }).catch(() => {});
    }
    st.stato = 'spenta'; st.motivo = motivo || 'uscito dall\'aula'; st.avviando = null; st.email = null; notifica();
  }

  // ---------- modifiche ----------
  function ricalcola() {
    if (st.stato !== 'attiva') return;
    const c = sync.contesto();
    if (!c.io || c.email !== st.email) return;
    const voluti = new Map();
    if (c.pronto) { st.piano = pianoAscolto(c, st.piano); st.piano.forEach((s) => voluti.set(s.k, s)); }
    else st.piano = [];
    for (const k of [...st.iscrizioni.keys()]) {
      if (k[0] === '#' || voluti.has(k)) continue;
      try { st.iscrizioni.get(k)(); } catch (e) { /* ok */ }
      st.iscrizioni.delete(k);
    }
    voluti.forEach((s, k) => {
      if (st.iscrizioni.has(k)) return;
      st.iscrizioni.set(k, backend.ascolta(s, (cambi) => {
        cambi.forEach((x) => { if (x.tipo === 'added' || x.tipo === 'modified') accoda(x.dati || {}); });
      }, spegniPerErrore));
    });
    ricalcolaAccessi(c);
    ricalcolaRichieste(c);
  }
  /**
   * La mia copia degli accessi: se cambia (nuovo ambito condiviso con me, ambito tolto, ruolo, scadenza) il custode
   * ha qualcosa da dirmi — un giro di sincronizzazione porta i dati nuovi e l'elenco aggiornato degli ambiti.
   */
  function ricalcolaAccessi(c) {
    if (!c.pronto) { const a = st.iscrizioni.get('#accessi'); if (a) { try { a(); } catch (e) { /* ok */ } st.iscrizioni.delete('#accessi'); st.firmaAccessi = undefined; } return; }
    if (st.iscrizioni.has('#accessi')) return;
    st.iscrizioni.set('#accessi', backend.ascoltaDoc('accessi', st.email, (d) => {
      if (!d) { spegni('il tuo accesso non risulta più abilitato', { notifica: true }); riallinea(); return; }
      const f = firmaAccesso(d);
      const miei = JSON.stringify([...(sync.contesto().ambiti || [])].filter((a) => a !== 'aula').sort());
      const loro = JSON.stringify([...(d.ambiti || [])].sort());
      const cambiata = st.firmaAccessi !== undefined && st.firmaAccessi !== f;
      st.firmaAccessi = f;
      if (cambiata || miei !== loro) riallinea();
    }, spegniPerErrore));
  }
  // al massimo un giro ogni 3 secondi, ma mai perso: se arriva presto si rimanda (una volta sola)
  function riallinea() {
    if (st.riallineoTimer) return;
    const attesa = Math.max(0, 3000 - (ora() - st.ultimoRiallineo));
    const vai = () => { st.riallineoTimer = null; st.ultimoRiallineo = ora(); try { Promise.resolve(sync.riallinea()).catch(() => {}); } catch (e) { /* ok */ } };
    if (!attesa) return vai();
    st.riallineoTimer = (dep.setTimeout || setTimeout)(vai, attesa);
  }
  function accoda(meta) {
    st.elabora = st.elabora.then(() => riceviModifica(meta)).catch((e) => { log('modifica non applicata: ' + (e && e.message)); });
  }
  async function riceviModifica(meta) {
    if (st.stato !== 'attiva' || !meta.id || !(meta.v > 0)) return;
    if (meta.disp === st.disp) return;                         // l'ho scritta io
    if ((st.visti[meta.id] || 0) >= meta.v) return;
    const l = await sync.versioneLocale(meta.id);
    if (l.version >= meta.v && l.ambito === meta.ambito) { st.visti[meta.id] = meta.v; return; }   // l'ho già
    let b = null;
    if (!meta.eliminato) {
      b = await backend.leggi('buste', meta.id);
      if (!b || !b.busta || !b.busta.dati || !(b.v >= meta.v)) return;
    }
    const x = b || meta;
    const voce = { id: meta.id, tipo: x.tipo, ambito: x.ambito, version: x.v, busta: b ? b.busta : null, eliminato: !!x.eliminato, aggiornatoDa: x.da, creatoDa: x.creatoDa };
    if (await sync.applica(voce)) { st.visti[meta.id] = x.v; st.ricevute++; notifica(); }
  }
  /**
   * Dopo che il custode ha accettato dei salvataggi: le stesse buste, subito, anche su Firestore.
   * recs = [{ id, tipo, ambito, version, busta, eliminato, creatoDa }]. Mai un errore per chi chiama.
   */
  async function pubblica(recs) {
    if (st.stato !== 'attiva' || !Array.isArray(recs) || !recs.length) return false;
    if (recs.length > MAX_PUBBLICAZIONI) return false;          // operazione massiva: arriva agli altri dal custode
    let ok = true;
    for (const rec of recs) {
      try {
        if (st.stato !== 'attiva') return false;
        const m = costruisciModifica({ ...rec, email: st.email, disp: st.disp, adesso: ora() });
        if (m.troppoGrande) continue;                           // resta solo sul custode (arriva al giro di sincronizzazione)
        st.visti[rec.id] = rec.version;
        await Promise.race([backend.pubblicaModifica(m.meta, m.busta), ritardo(20000).then(() => { throw { code: 'deadline-exceeded' }; })]);
        st.pubblicate++; notifica();
      } catch (e) { spegniPerErrore(e); ok = false; }
    }
    return ok;
  }

  // ---------- la chiave dell'aula ----------
  function avviaChiave() {
    const c = sync.contesto();
    if (st.stato !== 'attiva' || !c.io) return;
    if (c.fase === 'attesa' || c.fase === 'chiave') richiediChiave().catch(spegniPerErrore);
    ricalcolaRichieste(c);
  }
  async function richiediChiave() {
    if (st.richiestaId || st.stato !== 'attiva') return;
    const c = sync.contesto();
    if (!c.io.cifratura && !c.cfgChiave) return;
    const d = await sync.dispositivo();
    st.richiestaId = d.id;
    st.codice = await codiceVerifica(d.pubblica);
    await backend.scrivi('richieste', d.id, { email: st.email, nome: String(sync.nomeDispositivo()).slice(0, 80), pubblica: d.pubblica, ts: ORA, scade: { $ms: ora() + RICHIESTA_MS } });
    notifica();
    st.annullaConsegna = backend.ascolta({ coll: 'consegne', filtri: [['email', '==', st.email]] }, (cambi) => {
      cambi.forEach((x) => {
        if ((x.tipo === 'added' || x.tipo === 'modified') && x.id === d.id && x.dati && x.dati.busta) riceviChiave(d.id, x.dati).catch(spegniPerErrore);
      });
    }, spegniPerErrore);
  }
  async function riceviChiave(id, d) {
    if (!(await sync.chiaveRicevuta(d.busta, d.kid))) return;
    await ripulisciRichiesta(id);
    notifica();
  }
  async function ripulisciRichiesta(id) {
    if (st.annullaConsegna) { try { st.annullaConsegna(); } catch (e) { /* ok */ } st.annullaConsegna = null; }
    st.richiestaId = null; st.codice = null;
    await Promise.all([backend.elimina('consegne', id), backend.elimina('richieste', id)].map((p) => p.catch(() => {})));
  }
  /** La chiave è arrivata per un'altra strada (il custode): la richiesta non serve più. */
  function chiaveArrivata() {
    if (st.stato === 'attiva' && st.richiestaId) ripulisciRichiesta(st.richiestaId).then(notifica);
  }

  // l'operatore con la chiave in mano ascolta le richieste di chi aspetta
  function ricalcolaRichieste(c) {
    c = c || sync.contesto();
    const puoConsegnare = st.stato === 'attiva' && c.eOperatore && c.pronto && c.chiaveEsportabile;
    if (!puoConsegnare) {
      const a = st.iscrizioni.get('#richieste');
      if (a) { try { a(); } catch (e) { /* ok */ } st.iscrizioni.delete('#richieste'); st.richieste.clear(); }
      return;
    }
    if (st.iscrizioni.has('#richieste')) return;
    st.iscrizioni.set('#richieste', backend.ascolta({ coll: 'richieste', filtri: [] }, (cambi) => {
      cambi.forEach((x) => {
        if (x.tipo === 'removed') { st.richieste.delete(x.id); return; }
        if (x.id === st.richiestaId || !x.dati) return;       // la mia stessa richiesta
        st.richieste.set(x.id, { id: x.id, ...x.dati });
      });
      smista().catch(spegniPerErrore);
    }, spegniPerErrore));
  }
  async function smista() {
    for (const r of [...st.richieste.values()]) {
      if (!(r.id in st.codici)) st.codici[r.id] = await codiceVerifica(r.pubblica).catch(() => '');
    }
    if (manuale()) { notifica(); return; }
    for (const q of [...st.richieste.values()]) { try { await consegna(q.id); } catch (e) { log('consegna non riuscita: ' + (e && e.message)); } }
    notifica();
  }
  /** Consegna la chiave a un dispositivo che l'ha chiesta, dopo aver controllato che la persona sia abilitata. */
  async function consegna(id) {
    const r = st.richieste.get(id);
    const c = sync.contesto();
    if (!r || !c.chiaveEsportabile || st.consegnate[id]) return false;
    const email = String(r.email || '').toLowerCase();
    if (!(await sync.personaAbilitata(email))) return false;
    st.consegnate[id] = true;
    let busta;
    try {
      busta = await sync.cifraChiaveA(r.pubblica);
      await backend.scrivi('consegne', id, { email, kid: c.kid, busta, da: c.email, ts: ORA, scade: { $ms: ora() + RICHIESTA_MS } });
    } catch (e) { delete st.consegnate[id]; throw e; }
    st.richieste.delete(id);
    // il custode resta allineato (chi è abilitato, a chi è stata consegnata) e la richiesta si toglie
    Promise.resolve(sync.abilitaSuCustode({ id, kid: c.kid, busta, pubblica: r.pubblica })).catch(() => {});
    backend.elimina('richieste', id).catch(() => {});
    notifica();
    return true;
  }

  return {
    avvia, ferma, spegni, ricalcola, pubblica, chiaveArrivata, consegna, avviaChiave, smista,
    attiva: () => st.stato === 'attiva',
    stato: () => ({ stato: st.stato, attiva: st.stato === 'attiva', motivo: st.motivo, serveAccesso: st.serveAccesso, rete: st.rete, fisso: !!st.fisso,
      codice: st.codice, pubblicate: st.pubblicate, ricevute: st.ricevute, spentaIl: st.spentaIl || 0 }),
    richieste: () => [...st.richieste.values()].map((r) => ({ ...r, codice: st.codici[r.id] || '' })),
    _st: st,
  };
}

// ======================================================================
// 3. Backend vero (SDK di Firebase)
// ======================================================================
/** sdk = { app, auth, firestore }: i moduli «firebase/app», «firebase/auth», «firebase/firestore» (o un sottoinsieme: firebase-sdk.js). */
export function creaBackendFirebase(sdk, cfg, opz = {}) {
  const A = sdk.app, Au = sdk.auth, F = sdk.firestore;
  let app, auth, db;
  function converti(d) {
    const o = {};
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (v && v.$ora) o[k] = F.serverTimestamp();
      else if (v && typeof v.$ms === 'number') o[k] = F.Timestamp.fromMillis(v.$ms);
      else o[k] = v;
    }
    return o;
  }
  function semplice(d) {
    const o = {};
    for (const k of Object.keys(d || {})) { const v = d[k]; o[k] = v && typeof v.toMillis === 'function' ? v.toMillis() : v; }
    return o;
  }
  return {
    async inizializza() {
      if (db) return;
      app = A.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId }, opz.nome || 'psydiary-veloce');
      // senza risolutori di popup/redirect: niente pagine di Google caricate, basta signInWithCredential
      auth = Au.initializeAuth(app, { persistence: opz.persistenza === 'memoria' ? Au.inMemoryPersistence : Au.indexedDBLocalPersistence });
      db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
      if (cfg.emulatore) {
        Au.connectAuthEmulator(auth, cfg.emulatore.auth, { disableWarnings: true });
        const hp = String(cfg.emulatore.firestore).split(':');
        F.connectFirestoreEmulator(db, hp[0], Number(hp[1]));
      }
      if (auth.authStateReady) await auth.authStateReady();
    },
    utente: () => (auth && auth.currentUser ? { email: auth.currentUser.email, uid: auth.currentUser.uid } : null),
    async accedi(idToken) {
      const r = await Au.signInWithCredential(auth, Au.GoogleAuthProvider.credential(idToken));
      return { email: r.user.email, uid: r.user.uid };
    },
    esci: () => (auth ? Au.signOut(auth) : Promise.resolve()),
    scrivi: (coll, id, dati) => F.setDoc(F.doc(db, coll, id), converti(dati)),
    elimina: (coll, id) => F.deleteDoc(F.doc(db, coll, id)),
    async leggi(coll, id) {
      const s = await F.getDoc(F.doc(db, coll, id));
      return s.exists() ? semplice(s.data()) : null;
    },
    pubblicaModifica(meta, busta) {
      const b = F.writeBatch(db);
      b.set(F.doc(db, 'modifiche', meta.id), converti(meta));
      b.set(F.doc(db, 'buste', meta.id), converti(busta));
      return b.commit();
    },
    ascolta(spec, suCambi, suErrore) {
      const q = F.query(F.collection(db, spec.coll), ...spec.filtri.map((f) => F.where(f[0], f[1], f[2])));
      return F.onSnapshot(q, (snap) => {
        suCambi(snap.docChanges().map((ch) => ({ tipo: ch.type, id: ch.doc.id, dati: semplice(ch.doc.data()) })));
      }, suErrore);
    },
    ascoltaDoc(coll, id, suDato, suErrore) {
      return F.onSnapshot(F.doc(db, coll, id), (s) => suDato(s.exists() ? semplice(s.data()) : null), suErrore);
    },
    _db: () => db, _auth: () => auth,
  };
}

/** La libreria si scarica solo quando serve (un pezzo a parte del sito): mai all'avvio e mai senza configurazione. */
export function caricaSdk() {
  return import('./firebase-sdk.js').then((m) => m.sdk).catch((e) => {
    const x = new Error('libreria di Firebase non caricata: ' + (e && e.message));
    x.code = 'sdk';
    throw x;
  });
}

/** Un backend che carica la libreria al primo uso (il motore lo vede come un backend normale). */
export function backendPigro(cfg, carica = caricaSdk) {
  let vero = null, promessa = null;
  const ottieni = () => {
    if (vero) return Promise.resolve(vero);
    if (!promessa) promessa = carica().then((sdk) => { vero = creaBackendFirebase(sdk, cfg); return vero; }, (e) => { promessa = null; throw e; });
    return promessa;
  };
  const b = {
    utente: () => (vero ? vero.utente() : null),
    ascolta(spec, ok, ko) {
      let annulla = null, chiuso = false;
      ottieni().then((v) => { if (!chiuso) annulla = v.ascolta(spec, ok, ko); }, ko);
      return () => { chiuso = true; if (annulla) annulla(); };
    },
    ascoltaDoc(coll, id, ok, ko) {
      let annulla = null, chiuso = false;
      ottieni().then((v) => { if (!chiuso) annulla = v.ascoltaDoc(coll, id, ok, ko); }, ko);
      return () => { chiuso = true; if (annulla) annulla(); };
    },
  };
  for (const m of ['inizializza', 'esci', 'scrivi', 'elimina', 'leggi', 'pubblicaModifica', 'accedi']) b[m] = (...a) => ottieni().then((v) => v[m](...a));
  return b;
}
