/**
 * Sincronizzazione con il custode (Google Apps Script + Drive).
 *
 * Il dispositivo lavora sempre in locale (IndexedDB) e funziona anche senza
 * rete. Ogni modifica mette in coda le voci toccate; appena si può, le voci
 * partono cifrate e nella stessa chiamata arriva quello che hanno scritto gli
 * altri. Se due persone hanno modificato la stessa voce, il custode lo segnala
 * e qui le due versioni si uniscono (voci.js), senza perdere niente.
 *
 * Fasi: spento (nessun custode configurato: prototipo) · fuori (serve
 * l'accesso) · chiave (operatore: va creata o inserita la chiave dell'aula) ·
 * attesa (questo dispositivo aspetta che un operatore gli consegni la chiave)
 * · pronto.
 */
import { CONFIG, REALE } from './config.js';
import * as Auth from './accesso.js';
import { inviaAlCustode } from './trasporto.js';
import { tipoDi, aggiungi as aggiungiMisura, leggi as leggiMisure, CHIAVE_MISURE, aggiungiFasi, leggiFasi, pulisciFasi, CHIAVE_FASI } from './misure.js';
import * as C from './cifra.js';
import { vociDi, idVociDi, destinazione, applica, unisci, immaginiDi, TABELLA_DI } from './voci.js';
import { dati, salva, elimina, centro, ganci } from '../dati.svelte.js';
import { fileImmagine, salvaDaCustode, impostaRecupero } from '../immagini.js';

export const sync = $state({
  fase: REALE ? 'fuori' : 'spento', errore: null, negato: null, lavoro: false,
  inCoda: 0, ultima: null, online: typeof navigator === 'undefined' ? true : navigator.onLine,
  io: null, cfg: null, dispositivi: [],
  // dispositivi di persone abilitate che aspettano la chiave (lo sanno solo gli operatori)
  inAttesa: 0, consegna: false,
  // l'ultima consegna fatta da sola (n dispositivi, di chi): l'operatore la vede per qualche secondo
  consegnata: null,
  // gli ambiti che il custode dice che vedo (anche «aula»): la corsia veloce ascolta quelli
  ambiti: [],
});
// La corsia veloce (veloce.svelte.js) si aggancia qui: sync non sa niente di Firestore, sa solo a chi dire
// «ho salvato queste voci» e «la chiave è arrivata». Senza corsia (o spenta) restano funzioni che non fanno niente.
// `manuale`: l'operatore ha scelto di consegnare la chiave solo con un tocco (dopo aver controllato il codice di verifica):
// allora il giro di sincronizzazione non la consegna da solo (il tasto «Consegna la chiave» resta).
export const ganciVeloce = { attiva: () => false, manuale: () => false, pubblica: () => {}, chiaveArrivata: () => {} };
// Tempi di risposta del custode (ultime misure, anche tra una sessione e l'altra): servono al riquadro
// «Velocità del custode» in Impostazioni. Solo una comodità: se il browser non le tiene, si ricomincia.
const salvate = () => { try { return leggiMisure(localStorage.getItem(CHIAVE_MISURE) || ''); } catch { return []; } };
const salvateFasi = () => { try { return leggiFasi(localStorage.getItem(CHIAVE_FASI) || ''); } catch { return []; } };
// `fasi`: dove è andato il tempo dentro il custode negli ultimi salvataggi (il custode le manda in ogni risposta)
export const velocita = $state({ misure: salvate(), fasi: salvateFasi(), misurando: false, passo: 0, ultima: [], errore: null });
const orologio = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function registraMisura(azione, d, totale, ms, fasi) {
  const tipo = tipoDi(azione, d), t = Date.now();
  velocita.misure = aggiungiMisura(velocita.misure, { t, tipo, totale, ms });
  try { localStorage.setItem(CHIAVE_MISURE, JSON.stringify(velocita.misure)); } catch { /* solo una comodità */ }
  const f = pulisciFasi(fasi);
  if (f && tipo === 'salvataggio') {
    velocita.fasi = aggiungiFasi(velocita.fasi, { t, tipo, totale, ms, fasi: f });
    try { localStorage.setItem(CHIAVE_FASI, JSON.stringify(velocita.fasi)); } catch { /* solo una comodità */ }
  }
}
export function cancellaMisure() {
  velocita.misure = []; velocita.ultima = []; velocita.fasi = [];
  try { localStorage.removeItem(CHIAVE_MISURE); localStorage.removeItem(CHIAVE_FASI); } catch { /* niente */ }
}
let chiavi = {};             // kid → CryptoKey
const chiave = () => (sync.cfg ? chiavi[sync.cfg.kid] || null : null);
export const eOperatore = () => sync.io?.ruolo === 'admin';

// ---------------------------------------------------------------------------
// Chiamate al custode
class ErroreRete extends Error { constructor(m) { super(m); this.rete = true; } }
class ErroreCustode extends Error { constructor(c, m, x) { super(m || c); this.codice = c; this.extra = x || null; this.custode = true; } }
// Apps Script ogni tanto perde la risposta (404 "unable to open the file"),
// risponde con una pagina d'errore o è occupato: si riprova da soli. Ogni
// chiamata ha un identificativo che resta uguale nei tentativi: se l'azione
// era già fatta il custode restituisce la risposta di allora.
const ripetibile = (e) => e?.rete || (e?.custode && (e.codice === 'occupato' || e.codice === 'interno'));
const ATTESE = [1500, 4000, 9000, 15000];
const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));
function nuovoRid() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function chiama(azione, d, { tentativi = 4 } = {}) {
  const rid = nuovoRid();
  for (let n = 1; ; n++) {
    try { return await chiamaUnaVolta(azione, d, rid); }
    catch (e) {
      if (!ripetibile(e) || n >= tentativi || (typeof navigator !== 'undefined' && navigator.onLine === false)) throw e;
      const base = ATTESE[Math.min(n - 1, ATTESE.length - 1)];
      await attendi(base + Math.random() * base * 0.3);
    }
  }
}
Auth.usaCreaSessione((azione, t) => chiamaUnaVolta(azione, {}, Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24), t));
async function chiamaUnaVolta(azione, d, rid, tokenFisso) {
  const token = tokenFisso || await Auth.prendiToken();
  // Apps Script chiude ogni esecuzione dopo 6 minuti: oltre non arriva più niente
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 330000);
  let r, testo;
  const inizio = orologio();
  try {
    // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
    // se si perde solo la consegna della risposta, trasporto.js la richiede senza rifare il POST
    r = await inviaAlCustode(CONFIG.custodeUrl, { v: 1, token, azione, rid, dati: d || {} },
      { fetchImpl: (u, o) => fetch(u, { ...o, signal: ctrl.signal }) });
    testo = r.ok ? await r.text() : '';
  } catch (e) {
    throw new ErroreRete(e?.name === 'AbortError' ? 'Il custode non ha risposto in tempo.' : 'Nessuna connessione con il custode.');
  } finally { clearTimeout(timer); }
  if (!r.ok) throw new ErroreRete('Il custode non risponde (HTTP ' + r.status + ').');
  let j;
  try { j = JSON.parse(testo); } catch (e) { throw new ErroreRete('Risposta del custode non leggibile.'); }
  if (!j || typeof j !== 'object') throw new ErroreRete('Risposta del custode non leggibile.');
  // la risposta di «sono attivo» (GET) non è una misura; una risposta vera sì, anche se dice di no
  const misura = 'dati' in j || j.ok === false ? { totale: orologio() - inizio, ms: typeof j.ms === 'number' ? j.ms : null } : null;
  if (misura) registraMisura(azione, d, misura.totale, misura.ms, j.fasi);
  if (!j.ok) {
    if (j.errore === 'non-autenticato') {
      if (Auth.scartaSessione(token)) throw new ErroreRete('Sessione scaduta: riprovo con l\'accesso Google.');
      Auth.invalida(); throw new Auth.ErroreAccesso(j.messaggio);
    }
    throw new ErroreCustode(j.errore, j.messaggio, j.extra);
  }
  // la risposta di "sono attivo" (GET): la richiesta non è arrivata, si riprova
  if (!('dati' in j)) throw new ErroreRete('Il custode non ha ricevuto la richiesta: riprovo.');
  return j.dati;
}

// ---------------------------------------------------------------------------
// Memoria della sincronizzazione (IndexedDB a parte)
//   voci: id → { id, tipo, ambito, version, base }   base = ultima copia comune
//   meta: coda, cursori, io, cfg, caricate (immagini), ambitiImmagini
// La connessione si apre una volta sola: aprirla a ogni lettura (per ogni voce) costava
// decine di millisecondi, su un telefono molto di più.
let connessione = null;
function apri() {
  if (connessione) return connessione;
  connessione = new Promise((ok, ko) => {
    const r = indexedDB.open('psydiary-sync', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('voci'); r.result.createObjectStore('meta'); };
    r.onerror = () => { connessione = null; ko(r.error); };
    r.onsuccess = () => {
      const d = r.result;
      d.onclose = () => { connessione = null; };
      d.onversionchange = () => { d.close(); connessione = null; };
      ok(d);
    };
  });
  return connessione;
}
async function op(store, modo, fn) {
  for (let tentativo = 0; ; tentativo++) {
    const d = await apri();
    try {
      return await new Promise((ok, ko) => {
        const t = d.transaction(store, modo), req = fn(t.objectStore(store));
        t.oncomplete = () => ok(req && req.result);
        t.onerror = () => ko(t.error);
        t.onabort = () => ko(t.error || new Error('operazione annullata'));
      });
    } catch (e) {
      // connessione chiusa dal browser: si riapre una volta
      if (tentativo === 0 && (e?.name === 'InvalidStateError' || e?.name === 'TransactionInactiveError')) { connessione = null; continue; }
      throw e;
    }
  }
}
const voceLocale = (id) => op('voci', 'readonly', (s) => s.get(id));
const tutteLocali = () => op('voci', 'readonly', (s) => s.getAll()).then((v) => v || []);
const scriviVoce = (v) => op('voci', 'readwrite', (s) => s.put(v, v.id));
const togliVoce = (id) => op('voci', 'readwrite', (s) => s.delete(id));
const meta = (k) => op('meta', 'readonly', (s) => s.get(k));
const scriviMeta = (k, v) => op('meta', 'readwrite', (s) => s.put($state.snapshot(v) ?? v, k));

// Pazienti riservati (se il custode li gestisce): nome e foto restano nel loro
// ambito, a meno che il paziente non sia aperto a tutta l'aula
const gestisceRiservati = () => (sync.io?.funzioni || []).includes('riservati');
function riservato(rid) {
  if (!gestisceRiservati()) return false;
  // riservato solo se lo dice il custode, o se l'ho appena creato io (voce
  // "locale"): un paziente che vedo nell'aula senza scheda è di tutta l'aula
  const a = centro.pazienti?.[rid];
  return !!a && !a.tutti;
}
// Gruppi e classi riservati: solo quelli che il custode conosce come tali (o
// appena creati qui); i gruppi di prima restano nell'aula
const gestisceGruppi = () => (sync.io?.funzioni || []).includes('gruppi-riservati');
function gruppoRiservato(gid) {
  if (!gestisceGruppi()) return false;
  const a = centro.gruppi?.[gid];
  return !!a && !a.tutti;
}
// Programmi riservati: di serie i programmi sono di tutta l'aula
function programmaRiservato(pid) {
  if (!(sync.io?.funzioni || []).includes('programmi')) return false;
  const a = centro.programmi?.[pid];
  return !!a && !a.tutti;
}
const opzVoci = { riservato, gruppoRiservato, programmaRiservato };

// coda: "tabella|id" degli oggetti cambiati qui e non ancora inviati
let coda = new Set();
async function salvaCoda() { sync.inCoda = coda.size; await scriviMeta('coda', [...coda]); }
function segna(tabella, id) {
  if (!idVociDi(tabella, id).length) return;
  coda.add(tabella + '|' + id);
  salvaCoda();
  programma(ganciVeloce.attiva() ? 700 : 1000);   // con la corsia veloce gli altri vedono la modifica appena il custode l'ha accettata
}

// ---------------------------------------------------------------------------
// Invio e ricezione
const aad = (ambito, id) => 'psy:' + ambito + ':' + id;
const oggettoLocale = (tabella, id) => dati[tabella].find((x) => x.id === id) || null;
let ambitiImmagini = {};
let caricate = new Set();

async function caricaImmagini(voce) {
  let nuove = false;
  for (const id of immaginiDi(voce.dati)) {
    if (caricate.has(id)) continue;
    const f = await fileImmagine(id);
    if (!f) continue;
    const u8 = new Uint8Array(await f.blob.arrayBuffer());
    const busta = await C.cifraByte(chiave(), sync.cfg.kid, u8, aad(voce.ambito, 'img:' + id), false);
    await chiama('immagine.carica', { id, ambito: voce.ambito, busta });
    caricate.add(id);
    ambitiImmagini[id] = voce.ambito;
    nuove = true;
  }
  if (!nuove) return;
  await scriviMeta('caricate', [...caricate]);
  await scriviMeta('ambitiImmagini', ambitiImmagini);
}
// Il custode conserva solo byte cifrati: il tipo si riconosce dall'inizio del file
function tipoDaiByte(u8) {
  const testo = new TextDecoder().decode(u8.slice(0, 256)).trimStart();
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'image/jpeg';
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png';
  if (testo.startsWith('GIF8')) return 'image/gif';
  if (testo.startsWith('RIFF') && testo.slice(8, 12) === 'WEBP') return 'image/webp';
  if (testo.startsWith('%PDF')) return 'application/pdf';
  if (testo.startsWith('{') || testo.startsWith('[')) return 'application/json';
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg/i.test(testo)) return 'image/svg+xml';
  return 'application/octet-stream';
}
async function recuperaImmagine(id) {
  const ambito = ambitiImmagini[id];
  if (!ambito || !chiave()) return false;
  try {
    const r = await chiama('immagine.leggi', { id, ambito });
    const u8 = await C.decifraByte(chiave(), r.busta, aad(ambito, 'img:' + id));
    const tipo = tipoDaiByte(u8);
    await salvaDaCustode(id, new Blob([u8], { type: tipo }));
    caricate.add(id);
    return true;
  } catch (e) { console.warn('immagine', id, e); return false; }
}
function ricordaImmagini(ambito, d) { for (const id of immaginiDi(d)) ambitiImmagini[id] = ambito; }

async function apriVoce(r) {
  if (r.eliminato || !r.busta) return null;
  const k = chiavi[r.busta.kid];
  if (!k) throw new Error('Manca la chiave per aprire una voce.');
  return C.decifra(k, r.busta, aad(r.ambito, r.id));
}
/** Scrive in locale l'effetto di una voce (senza rimetterla in coda). */
async function scriviInLocale(voce, d) {
  const { tabella, id } = destinazione(voce);
  const attuale = oggettoLocale(tabella, id);
  const nuovo = applica(voce, attuale ? $state.snapshot(attuale) : null, d);
  if (nuovo) await salva(tabella, nuovo, true);
  else if (attuale) await elimina(tabella, id, true);
}

async function invia() {
  if (!coda.size) return false;
  const lotto = [...coda].slice(0, 60);
  const invii = [], prep = {};
  for (const k of lotto) {
    const [tabella, id] = k.split('|');
    const o = oggettoLocale(tabella, id);
    const voci = o ? vociDi(tabella, $state.snapshot(o), opzVoci) : idVociDi(tabella, id).map((vid) => ({ id: vid, eliminato: true }));
    for (const v of voci) {
      if (!v.eliminato && !/^(aula|[rgp]:[a-z0-9]{2,40})$/.test(v.ambito)) { console.warn('voce senza ambito valido', v); continue; }
      const l = await voceLocale(v.id);
      if (v.eliminato) {
        if (!l || !l.version) continue;   // mai arrivata al custode: niente da togliere
        invii.push({ id: v.id, tipo: l.tipo, ambito: l.ambito, versioneBase: l.version, eliminato: true });
        prep[v.id] = { v: { ...l, eliminato: true }, chiaveCoda: k, creatoDa: l.creatoDa };
        continue;
      }
      if (l && l.version && JSON.stringify(l.base) === JSON.stringify(v.dati) && l.ambito === v.ambito) continue;   // niente di nuovo
      await caricaImmagini(v);
      const busta = await C.cifra(chiave(), sync.cfg.kid, v.dati, aad(v.ambito, v.id));
      invii.push({ id: v.id, tipo: v.tipo, ambito: v.ambito, versioneBase: l ? l.version : 0, busta });
      prep[v.id] = { v, chiaveCoda: k, creatoDa: l?.creatoDa };
    }
    coda.delete(k);
  }
  await salvaCoda();
  if (!invii.length) return false;
  const r = await ricevi(invii);
  // conflitti: si unisce e si rimette in coda
  const pubblicabili = [];
  for (const e of r.esiti) {
    const p = prep[e.id];
    if (e.ok) {
      // chi ha creato la voce (serve alle regole della corsia veloce): io se nasce adesso o se il custode mi ha lasciato
      // modificare/togliere una nota di cui sono tirocinante (può solo se è mia); altrimenti quello che già sapevo
      const creatoDa = (e.version === 1 || (sync.io?.ruolo !== 'admin' && (p.v.tipo === 'nota' || p.v.eliminato))) ? sync.io?.email : p.creatoDa;
      if (p.v.eliminato) await togliVoce(e.id);
      else await scriviVoce({ id: e.id, tipo: p.v.tipo, ambito: p.v.ambito, version: e.version, base: p.v.dati, creatoDa });
      if (e.version > 0) {
        const inv = invii.find((x) => x.id === e.id);
        pubblicabili.push({ id: e.id, tipo: p.v.tipo, ambito: p.v.ambito, version: e.version, busta: inv?.busta || null, eliminato: !!p.v.eliminato, creatoDa });
      }
      continue;
    }
    if (e.errore === 'conflitto') {
      const att = e.extra?.attuale;
      const loro = att && !att.eliminato ? await apriVoce(att) : null;
      const l = await voceLocale(e.id);
      if (p.v.eliminato || !loro) {
        // eliminata qui e cambiata là (o il contrario): vince l'eliminazione
        if (att) await scriviVoce({ id: e.id, tipo: att.tipo, ambito: att.ambito, version: att.version, base: loro, creatoDa: att.creatoDa });
        if (!p.v.eliminato && !loro) { await scriviInLocale({ ...p.v, eliminato: true }, null); await togliVoce(e.id); }
        else coda.add(p.chiaveCoda);
        continue;
      }
      const unita = unisci(l?.base ?? null, p.v.dati, loro, att.aggiornatoDa);
      await scriviVoce({ id: e.id, tipo: att.tipo, ambito: att.ambito, version: att.version, base: loro, creatoDa: att.creatoDa });
      await scriviInLocale({ ...p.v, eliminato: false }, unita);
      coda.add(p.chiaveCoda);
    } else if (e.errore === 'chiave-cambiata') {
      coda.add(p.chiaveCoda);
      throw new Error('La chiave dell\'aula è cambiata: rientra per riceverla.');
    } else {
      // vietato o non valido: la modifica non può partire, si torna alla versione del custode
      console.warn('voce rifiutata', e);
      sync.errore = e.messaggio;
      const l = await voceLocale(e.id);
      if (l?.base) await scriviInLocale({ ...l, eliminato: false }, l.base);
    }
  }
  await salvaCoda();
  // corsia veloce: le stesse buste che il custode ha appena accettato, subito anche agli altri dispositivi
  // (senza aspettare: se qualcosa va storto la corsia si spegne da sola e il custode ha già tutto)
  if (pubblicabili.length && ganciVeloce.attiva()) { try { ganciVeloce.pubblica(pubblicabili); } catch (e) { /* solo una corsia in più */ } }
  return true;
}

// Cursori e impronta si tengono anche in memoria: un giro «niente di nuovo» non tocca il disco.
// L'impronta è quella di elenchi e accessi che questo dispositivo ha già (la dice il custode):
// se non è cambiata non li rimanda, e il giro è una risposta di poche righe.
let cursoriMem = null, improntaNota = null;
const elenchiCompleti = () => !!(centro.pazienti && centro.gruppi && centro.programmi);

/**
 * Una chiamata "sync": invia (se c'è) e applica quello che arriva.
 * con io: chiede anche il profilo (avvio in una richiesta sola); se la chiave dell'aula è
 * cambiata non applica niente e restituisce { cambiata: io }, così si riparte dalla preparazione.
 */
async function ricevi(invii = [], { io = false } = {}) {
  if (!cursoriMem) cursoriMem = (await meta('cursori')) || {};
  const richiesta = { cursori: cursoriMem, invii };
  if (io) richiesta.io = true;
  if (improntaNota && elenchiCompleti()) richiesta.impronta = improntaNota;
  const r = await chiama('sync', richiesta);
  if (!r || !Array.isArray(r.voci) || !Array.isArray(r.esiti)) throw new ErroreRete('Risposta del custode incompleta: riprovo.');
  if (io) {
    // custode non aggiornato: non manda il profilo, si chiede a parte
    const profilo = r.io || await chiama('io');
    if (!sync.cfg || !profilo.cifratura || profilo.kid !== sync.cfg.kid || profilo.email !== sync.io?.email) return { cambiata: profilo, esiti: [], voci: [] };
    sync.io = profilo; centro.io = profilo;
    if (profilo.cfg) { sync.cfg = profilo.cfg; await scriviMeta('cfg', sync.cfg); }
    await scriviMeta('io', profilo);
  }
  ultimaRisposta = { inAttesa: r.inAttesa };
  if (typeof r.inAttesa === 'number' && eOperatore()) sync.inAttesa = r.inAttesa;
  if (r.accesso && sync.io && ['scadenza', 'tuttiRagazzi', 'ragazzi'].some((k) => JSON.stringify(sync.io[k] ?? null) !== JSON.stringify(r.accesso[k] ?? null))) {
    sync.io = { ...sync.io, ...r.accesso };
    centro.io = sync.io;
    await scriviMeta('io', sync.io);
  }
  const inCoda = new Set([...coda].flatMap((k) => { const [t, id] = k.split('|'); return idVociDi(t, id); }));
  const mieInviate = new Set(invii.map((v) => v.id));
  // prima le lapidi, poi le voci vive (una voce che cambia ambito arriva come tutte e due)
  const voci = [...r.voci].sort((a, b) => (b.eliminato ? 1 : 0) - (a.eliminato ? 1 : 0));
  for (const v of voci) {
    if (mieInviate.has(v.id)) {
      // la mia appena salvata, o un conflitto che invia() unisce da sé
      const e = r.esiti.find((x) => x.id === v.id);
      if (!e || !e.ok || e.version >= v.version) continue;
    }
    const l = await voceLocale(v.id);
    if (v.eliminato && l && l.ambito !== v.ambito) continue;   // lapide di un vecchio ambito
    // spostata in un ambito che vedo (es. paziente reso riservato e condiviso
    // con me): arriva la versione nuova, la lapide non deve togliere niente
    if (v.eliminato && v.spostato && r.ambiti.includes(v.spostato)) continue;
    if (l && l.version >= v.version && l.ambito === v.ambito) continue;
    let d = null;
    try { d = await apriVoce(v); } catch (e) { console.warn('voce illeggibile', v.id, e); continue; }
    if (d) ricordaImmagini(v.ambito, d);
    if (v.eliminato && inCoda.has(v.id)) {
      // tolta (o spostata dove non la vedo più) mentre la stavo modificando:
      // la modifica non può più partire, vince la rimozione
      const { tabella, id } = destinazione(v);
      coda.delete(tabella + '|' + id);
      await scriviInLocale(v, null);
      await togliVoce(v.id);
      continue;
    }
    if (inCoda.has(v.id) && l) {
      // modificata qui e là: si unisce, e la versione unita ripartirà
      const { tabella, id } = destinazione(v);
      const mia = vociDi(tabella, $state.snapshot(oggettoLocale(tabella, id) || {}), opzVoci).find((x) => x.id === v.id)?.dati;
      if (d && mia) await scriviInLocale(v, unisci(l.base, mia, d, v.aggiornatoDa));
      await scriviVoce({ id: v.id, tipo: v.tipo, ambito: v.ambito, version: v.version, base: d, creatoDa: v.creatoDa });
      continue;
    }
    await scriviInLocale(v, d);
    if (v.eliminato) await togliVoce(v.id);
    else await scriviVoce({ id: v.id, tipo: v.tipo, ambito: v.ambito, version: v.version, base: d, creatoDa: v.creatoDa });
  }
  // ragazzi non più condivisi: il loro personale lascia questo dispositivo
  // (gli ambiti visibili cambiano solo quando cambia l'impronta: negli altri giri non si controlla)
  if (r.ambiti && !r.uguale) {
    const visibili = new Set(r.ambiti);
    for (const l of await tutteLocali()) {
      if (l.ambito === 'aula' || visibili.has(l.ambito)) continue;
      await scriviInLocale({ ...l, eliminato: true }, null);
      await togliVoce(l.id);
    }
  }
  if (r.ambiti && r.cursori) {
    const nuovi = {};
    for (const a of r.ambiti) nuovi[a] = r.cursori[a];
    cursoriMem = nuovi;
    sync.ambiti = Object.keys(nuovi);
    await scriviMeta('cursori', nuovi);
  }
  if (r.pazienti) {
    // i pazienti creati qui e non ancora arrivati al custode restano miei
    const p = { ...r.pazienti };
    for (const [rid, a] of Object.entries(centro.pazienti || {})) if (a.locale && !p[rid] && coda.has('ragazzi|' + rid)) p[rid] = a;
    centro.pazienti = p; centro.pazientiNoti = true;
    await scriviMeta('pazienti', p);
  }
  if (r.programmi) { centro.programmi = { ...r.programmi }; await scriviMeta('programmi', centro.programmi); }
  if (r.gruppi) {
    const g = { ...r.gruppi };
    for (const [gid, a] of Object.entries(centro.gruppi || {})) if (a.locale && !g[gid] && coda.has('gruppi|' + gid)) g[gid] = a;
    centro.gruppi = g;
    await scriviMeta('gruppi', g);
  }
  if (!r.uguale || r.voci.length) await scriviMeta('ambitiImmagini', ambitiImmagini);
  if (!r.uguale) {
    // per ultima: se qualcosa sopra non è arrivato in fondo, il prossimo giro riceve tutto di nuovo
    improntaNota = typeof r.impronta === 'string' && r.pazienti && r.gruppi && r.programmi ? r.impronta : null;
    await scriviMeta('impronta', improntaNota);
  }
  return r;
}

let incorso = null, timer = null, ultimaRisposta = {}, ultimaConsegna = 0, ultimoGiro = 0, primoSegno = 0;
// Dopo una modifica si aspetta un attimo (altre ne possono seguire e partono insieme), ma
// scrivendo di continuo si parte comunque entro pochi secondi.
const ATTESA_MASSIMA = 6000;
const INTERVALLO_GIRO = 30000;
const INTERVALLO_VERIFICA = 300000;   // con la corsia veloce attiva
function programma(ms) {
  clearTimeout(timer);
  if (!primoSegno) primoSegno = Date.now();
  timer = setTimeout(() => sincronizza(), Math.max(0, Math.min(ms, ATTESA_MASSIMA - (Date.now() - primoSegno))));
}
/** avvio: una richiesta sola per profilo e novità. Se la chiave è cambiata si riparte da prepara(). */
let avvioRapido = false;
export function sincronizza() {
  if (sync.fase !== 'pronto' || !sync.online) return Promise.resolve();
  if (incorso) return incorso.then(() => (coda.size ? sincronizza() : null));
  sync.lavoro = true;
  clearTimeout(timer); primoSegno = 0;
  const conIo = avvioRapido; avvioRapido = false;
  incorso = (async () => {
    let rifare = null;
    try {
      // l'invio è già una "sync": riceve anche le novità, non serve chiederle di nuovo
      let ricevuto = false;
      if (conIo) {
        const r = await ricevi([], { io: true });
        if (r.cambiata) { rifare = r.cambiata; return; }
        ricevuto = true;
      }
      for (let giro = 0; giro < 4 && coda.size; giro++) { if (await invia()) ricevuto = true; }
      if (!ricevuto) await ricevi();
      if (coda.size) await invia();
      // l'elenco dei dispositivi solo se il custode dice che qualcuno aspetta la chiave
      // (i custodi vecchi non lo dicono: allora ogni 10 minuti)
      if (eOperatore() && !ganciVeloce.manuale() && (ultimaRisposta.inAttesa > 0 || (ultimaRisposta.inAttesa === undefined && Date.now() - ultimaConsegna > 600000))) {
        ultimaConsegna = Date.now();
        await consegnaChiavi();
      }
      sync.ultima = new Date().toISOString();
      ultimoGiro = Date.now();
      sync.errore = null;
    } catch (e) { gestisciErrore(e); } finally { sync.lavoro = false; incorso = null; }
    // la chiave dell'aula è cambiata (o l'accesso): si riparte dalla preparazione completa
    if (rifare) await prepara(rifare).catch(gestisciErrore);
  })();
  return incorso;
}
/**
 * «Misura ora»: tre controlli «c'è qualcosa di nuovo?» uno dopo l'altro, come quelli che l'app fa da sola ma
 * senza applicare niente (le novità, se ci sono, arrivano al prossimo giro vero). Ognuno lascia la sua misura.
 */
export async function misuraOra(volte = 3) {
  if (velocita.misurando || sync.fase !== 'pronto' || !sync.online) return;
  velocita.misurando = true; velocita.errore = null; velocita.ultima = []; velocita.passo = 0;
  try {
    if (!cursoriMem) cursoriMem = (await meta('cursori')) || {};
    for (let i = 0; i < volte; i++) {
      velocita.passo = i + 1;
      const prima = velocita.misure.length ? velocita.misure[velocita.misure.length - 1] : null;
      const richiesta = { cursori: cursoriMem };
      if (improntaNota && elenchiCompleti()) richiesta.impronta = improntaNota;
      await chiamaUnaVolta('sync', richiesta, nuovoRid());
      const ultima = velocita.misure[velocita.misure.length - 1];
      if (ultima && ultima !== prima) velocita.ultima = [...velocita.ultima, ultima];
    }
  } catch (e) { velocita.errore = e?.message || String(e); }
  finally { velocita.misurando = false; velocita.passo = 0; }
}
const NEGATI = ['non-autorizzato', 'disattivato', 'scaduto'];
function gestisciErrore(e) {
  console.warn('sincronizzazione', e);
  if (e?.accesso) { sync.fase = 'fuori'; sync.errore = e.message; }
  else if (e?.custode && NEGATI.includes(e.codice)) {
    sync.negato = e.message; sync.fase = 'fuori';
    confermaNegato(e.codice);
  } else sync.errore = e?.message || String(e);
}

// Una risposta "non abilitato" non basta per cancellare i dati dell'aula da
// questo dispositivo: si richiede al custode chi sei e si cancella solo se lo
// conferma. Se invece risponde normalmente (era un intoppo) si riparte.
let verifica = null, pulizia = null;
function confermaNegato(codice) {
  if (verifica) return verifica;
  verifica = (async () => {
    await attendi(2500);
    let ancora = false;
    try { await chiama('io'); } catch (e) { ancora = e?.custode && NEGATI.includes(e.codice); if (!ancora) throw e; }
    if (ancora) {
      pulizia = cancellaDatiAula().finally(() => { pulizia = null; });
      await pulizia;
      sync.fase = 'fuori';
    } else await prepara();
  })().catch((e) => console.warn('verifica dell\'accesso', codice, e)).finally(() => { verifica = null; });
  return verifica;
}

// Accesso a tempo: passata la data, i dati dell'aula lasciano il dispositivo
// anche senza rete (il custode intanto ha già revocato la chiave)
const oggiQui = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
async function controllaScadenza() {
  const sc = sync.io?.scadenza;
  if (!sc || oggiQui() <= sc || pulizia) return false;
  pulizia = cancellaDatiAula().finally(() => { pulizia = null; });
  await pulizia;
  sync.fase = 'fuori';
  sync.negato = 'Il tuo accesso è scaduto il ' + sc.split('-').reverse().join('/') + ': i dati dell\'aula sono stati tolti da questo dispositivo.';
  return true;
}

/** Accesso tolto: niente dati dell'aula su questo dispositivo. */
async function cancellaDatiAula() {
  for (const t of ['ragazzi', 'gruppi', 'sedute', 'note', 'sospesi', 'serie', 'programmi']) for (const o of [...dati[t]]) await elimina(t, o.id, true);
  await op('voci', 'readwrite', (s) => s.clear());
  await op('meta', 'readwrite', (s) => s.clear());
  await C.dimenticaTutto();
  coda.clear(); chiavi = {}; accessiCache = null; cursoriMem = null; improntaNota = null; sync.inAttesa = 0; sync.io = null; centro.io = null; centro.pazienti = null; centro.gruppi = null; centro.programmi = null; centro.pazientiNoti = false; sync.cfg = null; sync.inCoda = 0; sync.ambiti = [];
}

// ---------------------------------------------------------------------------
// Chiave dell'aula su questo dispositivo
function nomeDispositivo() {
  const ua = navigator.userAgent || '';
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const tipo = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /Mobile|iPhone/.test(ua) ? 'telefono' : 'computer';
  return `${br} · ${so} · ${tipo}`;
}
async function accogliChiave(d, r) {
  const busta = sync.cfg && r.chiavi?.[sync.cfg.kid];
  if (!busta) return false;
  // gli operatori la ricevono esportabile (per consegnarla ad altri), gli altri no
  const k = await C.riceviChiave(busta, d.privata, eOperatore());
  await C.ricordaChiave(sync.cfg.kid, k, !eOperatore());
  chiavi = await C.portachiavi();
  try { ganciVeloce.chiaveArrivata(); } catch (e) { /* ok */ }   // la richiesta su Firestore non serve più
  return true;
}
async function ottieniChiave() {
  const d = await C.dispositivo();
  await chiama('dispositivo.registra', { id: d.id, nome: nomeDispositivo(), pubblica: d.pubblica });
  const r = await chiama('dispositivo.chiave', { id: d.id });
  return accogliChiave(d, r);
}
// Chi aspetta la chiave la chiede spesso, ma solo finché aspetta: i primi 3 minuti ogni 5 secondi
// (c'è qualcuno davanti allo schermo), poi ogni 15 per un quarto d'ora, poi ogni minuto.
// Chi ha la chiave non fa controlli in più: vede quanti la aspettano e può consegnarla subito.
let inizioAttesa = 0, ultimoControllo = 0, controllando = false;
const aspetta = () => sync.fase === 'attesa' || (sync.fase === 'chiave' && !!sync.cfg);
function intervalloAttesa() {
  const da = Date.now() - inizioAttesa;
  return da < 180000 ? 5000 : da < 1080000 ? 15000 : 60000;
}
/** Una richiesta leggera: la chiave è stata consegnata a questo dispositivo? */
async function controllaChiave() {
  if (controllando || !aspetta() || !sync.online || !sync.cfg) return;
  controllando = true; ultimoControllo = Date.now();
  try {
    const d = await C.dispositivo();
    let r;
    try { r = await chiama('dispositivo.chiave', { id: d.id }, { tentativi: 1 }); }
    catch (e) {
      // dispositivo tolto dagli operatori, o chiave cambiata: si ricomincia dalla preparazione
      if (e?.custode && e.codice === 'non-trovato') { await prepara(); return; }
      throw e;
    }
    if (r.kid && r.kid !== sync.cfg.kid) { await prepara(); return; }
    if (await accogliChiave(d, r)) {
      aggiornaFase();
      if (sync.fase === 'pronto') { sync.errore = null; sincronizza(); }
    }
  } catch (e) { if (!e?.rete) gestisciErrore(e); } finally { controllando = false; }
}
function aggiornaFase() {
  // senza sapere chi sei non si entra (mai un "ospite" con l'app aperta)
  const prima = sync.fase;
  if (!sync.io || !centro.io) { sync.fase = 'fuori'; return; }
  sync.fase = chiave() ? 'pronto' : eOperatore() ? 'chiave' : 'attesa';
  if (sync.fase !== prima && (sync.fase === 'attesa' || sync.fase === 'chiave')) { inizioAttesa = Date.now(); ultimoControllo = 0; }
}
/** Gli operatori consegnano la chiave ai dispositivi delle persone abilitate che la aspettano. */
async function consegnaChiavi() {
  const k = chiave();
  if (!k || !k.extractable) return 0;
  const el = await chiama('dispositivi.elenco');
  let n = 0;
  for (const d of el) {
    if (d.abilitato || !d.personaAbilitata) continue;
    try {
      await chiama('dispositivi.abilita', { id: d.id, kid: sync.cfg.kid, chiave: await C.consegnaA(d.pubblica, k), pubblica: d.pubblica });
      d.abilitato = true; d.consegnata = true; n++;
    } catch (e) { console.warn('consegna della chiave', d.id, e); }
  }
  sync.dispositivi = el;
  if (n) sync.consegnata = { n, persone: [...new Set(el.filter((d) => d.consegnata).map((d) => d.email))], id: Date.now() };
  sync.inAttesa = el.filter((d) => !d.abilitato && d.personaAbilitata).length;
  return n;
}
/**
 * A mano, da un operatore: consegna subito la chiave ai dispositivi che la aspettano, senza
 * aspettare il prossimo giro. Restituisce { consegnate, inAttesa }.
 */
export async function consegnaOra() {
  if (!eOperatore()) throw new Error('La chiave la consegnano gli operatori.');
  if (!chiave()?.extractable) throw new Error('Su questo dispositivo la chiave non si può consegnare ad altri: inseriscila una volta con la frase dell\'aula, oppure usa il dispositivo su cui l\'hai creata.');
  sync.consegna = true;
  try {
    const consegnate = await consegnaChiavi();
    return { consegnate, inAttesa: sync.inAttesa };
  } finally { sync.consegna = false; }
}

async function prepara(profilo = null) {
  // se è in corso la cancellazione dei dati (accesso tolto) si aspetta che
  // finisca, così non svuota il profilo appena ricaricato
  if (pulizia) await pulizia.catch(() => {});
  // Già dentro e con la chiave su questo dispositivo (di norma a ogni avvio): una richiesta sola
  // porta profilo e novità. Se la chiave è cambiata o l'accesso no, si riparte da qui per intero.
  if (!profilo && sync.fase === 'pronto' && chiave() && sync.io && sync.cfg) { avvioRapido = true; return sincronizza(); }
  sync.io = profilo || await chiama('io');
  centro.io = sync.io;
  await scriviMeta('io', sync.io);
  // i custodi aggiornati la mandano insieme a "io": una chiamata in meno all'accesso
  sync.cfg = !sync.io.cifratura ? null : sync.io.cfg !== undefined ? sync.io.cfg : await chiama('cifratura.leggi');
  await scriviMeta('cfg', sync.cfg);
  chiavi = await C.portachiavi();
  sync.negato = null; sync.errore = null;
  aggiornaFase();
  if (sync.cfg && !chiave()) { await ottieniChiave(); aggiornaFase(); }
  if (sync.fase === 'pronto') sincronizza();
}

export async function avvia() {
  if (!REALE) return;
  ganci.alCambio = segna;
  impostaRecupero(recuperaImmagine);
  coda = new Set((await meta('coda')) || []);
  sync.inCoda = coda.size;
  caricate = new Set((await meta('caricate')) || []);
  improntaNota = (await meta('impronta')) || null;
  ambitiImmagini = (await meta('ambitiImmagini')) || {};
  sync.ambiti = Object.keys((await meta('cursori')) || {});
  const u = Auth.inizia();
  Auth.alCambio(async (nuovo) => {
    if (!nuovo) return;
    if (sync.fase === 'fuori' || (sync.io && sync.io.email !== nuovo.email)) {
      try { await prepara(); } catch (e) { gestisciErrore(e); }
    }
  });
  const aperta = () => document.visibilityState === 'visible';
  window.addEventListener('online', () => { sync.online = true; sincronizza(); controllaChiave(); });
  window.addEventListener('offline', () => { sync.online = false; });
  document.addEventListener('visibilitychange', () => { if (aperta()) { sincronizza(); controllaChiave(); } });
  // Un solo battito ogni 5 secondi, poi ognuno decide se serve: la sincronizzazione ogni mezzo
  // minuto (un giro «niente di nuovo» costa una richiesta di poche righe), chi aspetta la chiave
  // con il ritmo di intervalloAttesa(), la scadenza dell'accesso ogni minuto.
  let ultimaScadenza = 0;
  setInterval(() => {
    if (Date.now() - ultimaScadenza >= 60000) { ultimaScadenza = Date.now(); controllaScadenza(); }
    if (!aperta()) return;
    if (aspetta()) { if (Date.now() - ultimoControllo >= intervalloAttesa() - 500) controllaChiave(); return; }
    // con la corsia veloce le modifiche arrivano da sole: il custode si controlla ogni 5 minuti, come verifica
    if (sync.fase === 'pronto' && Date.now() - ultimoGiro >= (ganciVeloce.attiva() ? INTERVALLO_VERIFICA : INTERVALLO_GIRO) - 500) sincronizza();
  }, 5000);
  if (!u) { sync.fase = 'fuori'; return; }
  // senza rete si lavora con quanto già noto: profilo e chiave ricordati
  sync.io = await meta('io');
  sync.cfg = await meta('cfg');
  centro.pazienti = (await meta('pazienti')) || null;
  centro.pazientiNoti = !!centro.pazienti;
  centro.gruppi = (await meta('gruppi')) || null;
  centro.programmi = (await meta('programmi')) || null;
  accessiCache = (await meta('accessi')) || null;
  chiavi = await C.portachiavi();
  if (sync.io && sync.io.email === u.email) { centro.io = sync.io; aggiornaFase(); } else sync.fase = 'fuori';
  await controllaScadenza();
  try { await prepara(); } catch (e) { gestisciErrore(e); }
}

/** Prima configurazione (operatore): crea la chiave dell'aula. */
export async function creaChiave(frase, preparata) {
  const { cfg, chiave: k } = preparata || await C.nuovaConfigurazione(frase);
  sync.cfg = await chiama('cifratura.imposta', { cifratura: cfg });
  await C.ricordaChiave(sync.cfg.kid, k);
  await C.salvaFrase(frase);
  await scriviMeta('cfg', sync.cfg);
  chiavi = await C.portachiavi();
  sync.io.cifratura = true;
  aggiornaFase();
  // tutto quello che c'è già su questo dispositivo parte verso il custode
  for (const t of ['ragazzi', 'gruppi', 'sedute', 'note', 'sospesi', 'serie', 'programmi']) for (const o of dati[t]) coda.add(t + '|' + o.id);
  await salvaCoda();
  return sincronizza();
}
/** Operatore su un nuovo dispositivo: inserisce la frase invece di aspettare. */
export async function inserisciChiave(frase) {
  if (!sync.cfg) sync.cfg = await chiama('cifratura.leggi');
  const k = await C.apriConFrase(frase, sync.cfg);
  await C.ricordaChiave(sync.cfg.kid, k);
  await C.salvaFrase(frase);
  chiavi = await C.portachiavi();
  aggiornaFase();
  return sincronizza();
}
export const riprova = () => prepara().catch(gestisciErrore);
export const mostraFrase = () => (eOperatore() ? C.frase() : Promise.resolve(null));
export const nuovaFrase = C.generaFrase;
export const preparaChiave = C.nuovaConfigurazione;
export async function elencoDispositivi() { sync.dispositivi = await chiama('dispositivi.elenco'); return sync.dispositivi; }
export async function togliDispositivo(id) { await chiama('dispositivo.togli', { id }); return elencoDispositivi(); }
// Gli accessi si ricordano sul dispositivo: l'elenco compare subito e si aggiorna appena risponde il custode
let accessiCache = null;
export const accessiNoti = () => accessiCache;
export async function leggiAccessi() {
  const a = await chiama('accessi.leggi');
  accessiCache = a;
  scriviMeta('accessi', a).catch(() => {});
  return a;
}

// ---------------------------------------------------------------------------
// Esportazione completa (solo chi ospita il custode)
export const puoEsportareTutto = () => !!sync.io?.proprietario && (sync.io?.funzioni || []).includes('esportazione');
export const leggiEsportazioni = () => chiama('esportazioni.leggi');
/** La frase come la mostra PsyDiary (maiuscolo, a gruppi di cinque): è la password dello zip. */
export const fraseCanonica = (f) => C.normalizzaFrase(f);
/** La frase è quella della chiave dell'aula? (si controlla qui, il custode non la conosce) */
export async function verificaFrase(frase) {
  if (!sync.cfg) return false;
  try { await C.apriConFrase(frase, sync.cfg); return true; } catch (e) { return false; }
}
/**
 * Tutti i dati dell'aula, di tutti, decifrati sul dispositivo:
 * { dati: { ragazzi, gruppi, sedute, note, sospesi, serie }, file: Map(id → Blob), mancanti: [id] }.
 * avanza(fatti, totale, cosa) per la barra di avanzamento.
 */
export async function raccogliTutto(avanza = () => {}) {
  const ini = await chiama('esporta.inizia');
  const tabelle = { ragazzi: {}, gruppi: {}, sedute: {}, note: {}, sospesi: {}, serie: {}, programmi: {} };
  const ambitoImm = {};
  const ambiti = ini.ambiti;
  for (let i = 0; i < ambiti.length; i += 25) {
    avanza(i, ambiti.length, 'dati');
    const r = await chiama('esporta.ambiti', { ambiti: ambiti.slice(i, i + 25) });
    // prima i nomi (ragazzo) poi le schede, così l'unione è completa
    const voci = [...r.voci].sort((a, b) => (a.tipo === 'scheda') - (b.tipo === 'scheda'));
    for (const v of voci) {
      let d;
      try { d = await apriVoce(v); } catch (e) { console.warn('voce illeggibile', v.id, e); continue; }
      if (!d) continue;
      const { tabella, id } = destinazione(v);
      if (!tabelle[tabella]) continue;
      tabelle[tabella][id] = applica(v, tabelle[tabella][id] || null, d);
      for (const im of immaginiDi(d)) ambitoImm[im] = v.ambito;
    }
  }
  const file = new Map(), mancanti = [];
  const ids = Object.keys(ambitoImm);
  for (let i = 0; i < ids.length; i++) {
    avanza(i, ids.length, 'allegati');
    const id = ids[i], ambito = ambitoImm[id];
    try {
      const r = await chiama('esporta.immagine', { id, ambito });
      const k = chiavi[r.busta.kid];
      const u8 = await C.decifraByte(k, r.busta, aad(ambito, 'img:' + id));
      file.set(id, new Blob([u8], { type: tipoDaiByte(u8) }));
    } catch (e) {
      // non ancora sul custode (mai partita da un dispositivo): magari c'è qui
      const f = await fileImmagine(id).catch(() => null);
      if (f?.blob) file.set(id, f.blob); else mancanti.push(id);
    }
  }
  const dati = Object.fromEntries(Object.entries(tabelle).map(([t, m]) => [t, Object.values(m).filter(Boolean)]));
  return { dati, file, mancanti, registro: ini.registro };
}
// ---------------------------------------------------------------------------
// Per la corsia veloce (veloce.svelte.js): tutto quello che può chiedere a questa sincronizzazione, e niente di più.
let codaLive = Promise.resolve();
const inCodaVoce = (id) => [...coda].some((k) => { const [t, i] = k.split('|'); return idVociDi(t, i).includes(id); });
/**
 * Una voce arrivata in tempo reale (la busta è quella del custode, versione `v.version`): si apre e si applica
 * come quando arriva dal custode, con la stessa fusione. Il custode resta la verifica: al giro dopo la stessa
 * versione risulta già applicata, e se qualcosa è andato storto converge comunque.
 * v = { id, tipo, ambito, version, busta | null, eliminato, aggiornatoDa, creatoDa }
 */
export function applicaLive(v) {
  const lavoro = codaLive.then(async () => {
    if (sync.fase !== 'pronto' || !chiave()) return false;
    if (incorso) { try { await incorso; } catch (e) { /* il giro ha avuto un problema suo */ } }
    // un ambito che il custode non mi ha ancora detto di vedere: ci pensa il giro di sincronizzazione
    if (v.ambito !== 'aula' && !sync.ambiti.includes(v.ambito)) { sincronizza(); return false; }
    const l = await voceLocale(v.id);
    if (l && l.version >= v.version && l.ambito === v.ambito) return false;
    if (v.eliminato) {
      if (!l || l.ambito !== v.ambito) return false;   // non l'avevo, o nel frattempo è altrove
      const { tabella, id } = destinazione(v);
      if (inCodaVoce(v.id)) { coda.delete(tabella + '|' + id); await salvaCoda(); }   // tolta mentre la modificavo: vince la rimozione
      await scriviInLocale(v, null);
      await togliVoce(v.id);
      return true;
    }
    let d = null;
    try { d = await apriVoce(v); } catch (e) { console.warn('voce illeggibile', v.id, e); return false; }
    if (!d) return false;
    ricordaImmagini(v.ambito, d);
    if (inCodaVoce(v.id) && l) {
      // modificata qui e là: si unisce, e la versione unita ripartirà
      const { tabella, id } = destinazione(v);
      const mia = vociDi(tabella, $state.snapshot(oggettoLocale(tabella, id) || {}), opzVoci).find((x) => x.id === v.id)?.dati;
      if (mia) await scriviInLocale(v, unisci(l.base, mia, d, v.aggiornatoDa));
      await scriviVoce({ id: v.id, tipo: v.tipo, ambito: v.ambito, version: v.version, base: d, creatoDa: v.creatoDa ?? l.creatoDa });
      return true;
    }
    await scriviInLocale(v, d);
    await scriviVoce({ id: v.id, tipo: v.tipo, ambito: v.ambito, version: v.version, base: d, creatoDa: v.creatoDa ?? l?.creatoDa });
    // un paziente, un gruppo o un programma nuovo: chi lo vede, di chi è, con chi è condiviso lo dice il custode
    if (!l && ['ragazzo', 'gruppo', 'programma'].includes(v.tipo)) sincronizza();
    return true;
  });
  codaLive = lavoro.catch(() => {});
  return lavoro.catch((e) => { console.warn('modifica in tempo reale', v.id, e); return false; });
}
/** La chiave consegnata da un operatore tramite la corsia veloce: la stessa cosa di ottieniChiave. */
async function chiaveRicevuta(busta, kid) {
  if (!sync.cfg || sync.cfg.kid !== kid || chiave()) return false;
  const d = await C.dispositivo();
  const k = await C.riceviChiave(busta, d.privata, eOperatore());
  await C.ricordaChiave(sync.cfg.kid, k, !eOperatore());
  chiavi = await C.portachiavi();
  aggiornaFase();
  if (sync.fase === 'pronto') { sync.errore = null; sincronizza(); }
  return true;
}
/** La persona è abilitata adesso? (stessa regola del custode: operatore proprietario, o accesso attivo e non scaduto) */
async function personaAbilitata(email) {
  if (email === sync.io?.email) return true;
  const ok = (a) => {
    if (!a) return false;
    if (email === String(a.proprietario || '').toLowerCase()) return true;
    const u = a.utenti?.[email];
    return !!u && u.attivo !== false && !(u.scadenza && oggiQui() > u.scadenza);
  };
  if (ok(accessiCache)) return true;
  try { await leggiAccessi(); } catch (e) { return false; }
  return ok(accessiCache);
}
export const veloceInterno = {
  contesto: () => ({
    email: sync.io?.email ?? null, io: $state.snapshot(sync.io), pronto: sync.fase === 'pronto', fase: sync.fase, ambiti: [...sync.ambiti],
    eOperatore: eOperatore(), chiaveEsportabile: !!chiave()?.extractable, kid: sync.cfg?.kid ?? null, cfgChiave: !!sync.cfg,
  }),
  dispositivo: () => C.dispositivo(),
  nomeDispositivo,
  versioneLocale: async (id) => { const l = await voceLocale(id); return { version: l?.version || 0, ambito: l?.ambito || null }; },
  applica: applicaLive,
  chiaveRicevuta,
  cifraChiaveA: (pubblica) => C.consegnaA(pubblica, chiave()),
  // il custode resta allineato: chi ha ricevuto la chiave, da chi, quando
  abilitaSuCustode: ({ id, kid, busta, pubblica }) => chiama('dispositivi.abilita', { id, kid, chiave: busta, pubblica }, { tentativi: 1 }),
  personaAbilitata,
  // un giro con il custode DOPO quello eventualmente in corso (quello poteva essere partito prima del cambiamento)
  riallinea: async () => { if (incorso) { try { await incorso; } catch (e) { /* ok */ } } return sincronizza(); },
};
export const gestisceCondivisioni = gestisceRiservati;
export const gestisceCondivisioniGruppi = gestisceGruppi;
export const gestisceCondivisioniProgrammi = () => (sync.io?.funzioni || []).includes('programmi');
/** Con chi è condiviso un programma della biblioteca (poi viaggia nell'ambito giusto). */
export async function condividiProgramma(pid, scelta) {
  if (coda.has('programmi|' + pid)) await sincronizza();
  if (coda.has('programmi|' + pid)) throw new Error('Il programma non è ancora arrivato al custode: riprova quando c\'è rete.');
  const a = await chiama('programma.condivisione', { id: pid, ...scelta });
  centro.programmi = { ...(centro.programmi || {}), [pid]: a };
  await scriviMeta('programmi', centro.programmi);
  coda.add('programmi|' + pid);
  await salvaCoda();
  await sincronizza();
  return a;
}
/**
 * Con chi è condiviso un gruppo o una classe. Poi il gruppo e tutto ciò che
 * gli appartiene (sedute, note, ricorrenze, idee) ripartono nell'ambito giusto.
 */
export async function condividiGruppo(gid, scelta) {
  if (coda.has('gruppi|' + gid)) await sincronizza();
  if (coda.has('gruppi|' + gid)) throw new Error('Il gruppo non è ancora arrivato al custode: riprova quando c\'è rete.');
  const a = await chiama('gruppo.condivisione', { id: gid, ...scelta });
  centro.gruppi = { ...(centro.gruppi || {}), [gid]: a };
  await scriviMeta('gruppi', centro.gruppi);
  coda.add('gruppi|' + gid);
  for (const t of ['sedute', 'note', 'serie', 'sospesi']) for (const o of dati[t]) if (o.gruppoId === gid) coda.add(t + '|' + o.id);
  await salvaCoda();
  await sincronizza();
  return a;
}
/**
 * Con chi è condiviso un paziente: { condivisi: [email], tutti, proprietario? }.
 * Poi nome e foto si spostano nell'ambito giusto (aula se aperto a tutti).
 */
export async function condividiPaziente(rid, scelta) {
  // un paziente appena creato deve prima arrivare al custode
  if (coda.has('ragazzi|' + rid)) await sincronizza();
  if (coda.has('ragazzi|' + rid)) throw new Error('Il paziente non è ancora arrivato al custode: riprova quando c\'è rete.');
  const a = await chiama('paziente.condivisione', { id: rid, ...scelta });
  centro.pazienti = { ...(centro.pazienti || {}), [rid]: a };
  await scriviMeta('pazienti', centro.pazienti);
  coda.add('ragazzi|' + rid);
  // le note "nel gruppo" su di lui seguono il paziente
  for (const n of dati.note) if (n.ragazzoId === rid && n.categoria === 'gruppo') coda.add('note|' + n.id);
  await salvaCoda();
  await sincronizza();
  return a;
}
export async function salvaAccessi(accessi, versioneBase) {
  const a = await chiama('accessi.salva', { accessi, versioneBase });
  accessiCache = a;
  scriviMeta('accessi', a).catch(() => {});
  return a;
}
export const accessoDev = Auth.accessoDev;
export const pulsanteGoogle = Auth.pulsante;
export async function esci(cancella) {
  if (cancella) await cancellaDatiAula();
  await scriviMeta('io', null);
  Auth.esci();
  sync.io = null; centro.io = null; sync.fase = 'fuori';
}
export { TABELLA_DI };
