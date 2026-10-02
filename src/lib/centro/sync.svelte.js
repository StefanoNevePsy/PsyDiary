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
import * as C from './cifra.js';
import { vociDi, idVociDi, destinazione, applica, unisci, immaginiDi, TABELLA_DI } from './voci.js';
import { dati, salva, elimina, centro, ganci } from '../dati.svelte.js';
import { fileImmagine, salvaDaCustode, impostaRecupero } from '../immagini.js';

export const sync = $state({
  fase: REALE ? 'fuori' : 'spento', errore: null, negato: null, lavoro: false,
  inCoda: 0, ultima: null, online: typeof navigator === 'undefined' ? true : navigator.onLine,
  io: null, cfg: null, dispositivi: [],
});
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
async function chiamaUnaVolta(azione, d, rid) {
  const token = await Auth.prendiToken();
  // Apps Script chiude ogni esecuzione dopo 6 minuti: oltre non arriva più niente
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 330000);
  let r, testo;
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
  if (!j.ok) {
    if (j.errore === 'non-autenticato') { Auth.invalida(); throw new Auth.ErroreAccesso(j.messaggio); }
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
function op(store, modo, fn) {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('psydiary-sync', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('voci'); r.result.createObjectStore('meta'); };
    r.onerror = () => ko(r.error);
    r.onsuccess = () => {
      const d = r.result, t = d.transaction(store, modo), req = fn(t.objectStore(store));
      t.oncomplete = () => { d.close(); ok(req && req.result); };
      t.onerror = () => { d.close(); ko(t.error); };
    };
  });
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
const opzVoci = { riservato, gruppoRiservato };

// coda: "tabella|id" degli oggetti cambiati qui e non ancora inviati
let coda = new Set();
async function salvaCoda() { sync.inCoda = coda.size; await scriviMeta('coda', [...coda]); }
function segna(tabella, id) {
  if (!idVociDi(tabella, id).length) return;
  coda.add(tabella + '|' + id);
  salvaCoda();
  programma(1500);
}

// ---------------------------------------------------------------------------
// Invio e ricezione
const aad = (ambito, id) => 'psy:' + ambito + ':' + id;
const oggettoLocale = (tabella, id) => dati[tabella].find((x) => x.id === id) || null;
let ambitiImmagini = {};
let caricate = new Set();

async function caricaImmagini(voce) {
  for (const id of immaginiDi(voce.dati)) {
    if (caricate.has(id)) continue;
    const f = await fileImmagine(id);
    if (!f) continue;
    const u8 = new Uint8Array(await f.blob.arrayBuffer());
    const busta = await C.cifraByte(chiave(), sync.cfg.kid, u8, aad(voce.ambito, 'img:' + id), false);
    await chiama('immagine.carica', { id, ambito: voce.ambito, busta });
    caricate.add(id);
    ambitiImmagini[id] = voce.ambito;
  }
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
  if (!coda.size) return;
  const lotto = [...coda].slice(0, 60);
  const invii = [], prep = {};
  for (const k of lotto) {
    const [tabella, id] = k.split('|');
    const o = oggettoLocale(tabella, id);
    const voci = o ? vociDi(tabella, $state.snapshot(o), opzVoci) : idVociDi(tabella, id).map((vid) => ({ id: vid, eliminato: true }));
    for (const v of voci) {
      if (!v.eliminato && !/^(aula|[rg]:[a-z0-9]{2,40})$/.test(v.ambito)) { console.warn('voce senza ambito valido', v); continue; }
      const l = await voceLocale(v.id);
      if (v.eliminato) {
        if (!l || !l.version) continue;   // mai arrivata al custode: niente da togliere
        invii.push({ id: v.id, tipo: l.tipo, ambito: l.ambito, versioneBase: l.version, eliminato: true });
        prep[v.id] = { v: { ...l, eliminato: true }, chiaveCoda: k };
        continue;
      }
      if (l && l.version && JSON.stringify(l.base) === JSON.stringify(v.dati) && l.ambito === v.ambito) continue;   // niente di nuovo
      await caricaImmagini(v);
      const busta = await C.cifra(chiave(), sync.cfg.kid, v.dati, aad(v.ambito, v.id));
      invii.push({ id: v.id, tipo: v.tipo, ambito: v.ambito, versioneBase: l ? l.version : 0, busta });
      prep[v.id] = { v, chiaveCoda: k };
    }
    coda.delete(k);
  }
  await salvaCoda();
  if (!invii.length) return;
  const r = await ricevi(invii);
  // conflitti: si unisce e si rimette in coda
  for (const e of r.esiti) {
    const p = prep[e.id];
    if (e.ok) {
      if (p.v.eliminato) await togliVoce(e.id);
      else await scriviVoce({ id: e.id, tipo: p.v.tipo, ambito: p.v.ambito, version: e.version, base: p.v.dati });
      continue;
    }
    if (e.errore === 'conflitto') {
      const att = e.extra?.attuale;
      const loro = att && !att.eliminato ? await apriVoce(att) : null;
      const l = await voceLocale(e.id);
      if (p.v.eliminato || !loro) {
        // eliminata qui e cambiata là (o il contrario): vince l'eliminazione
        if (att) await scriviVoce({ id: e.id, tipo: att.tipo, ambito: att.ambito, version: att.version, base: loro });
        if (!p.v.eliminato && !loro) { await scriviInLocale({ ...p.v, eliminato: true }, null); await togliVoce(e.id); }
        else coda.add(p.chiaveCoda);
        continue;
      }
      const unita = unisci(l?.base ?? null, p.v.dati, loro, att.aggiornatoDa);
      await scriviVoce({ id: e.id, tipo: att.tipo, ambito: att.ambito, version: att.version, base: loro });
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
}

/** Una chiamata "sync": invia (se c'è) e applica quello che arriva. */
async function ricevi(invii = []) {
  const cursori = (await meta('cursori')) || {};
  const r = await chiama('sync', { cursori, invii });
  if (!r || !Array.isArray(r.voci) || !Array.isArray(r.esiti)) throw new ErroreRete('Risposta del custode incompleta: riprovo.');
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
    if (inCoda.has(v.id) && l) {
      // modificata qui e là: si unisce, e la versione unita ripartirà
      const { tabella, id } = destinazione(v);
      const mia = vociDi(tabella, $state.snapshot(oggettoLocale(tabella, id) || {}), opzVoci).find((x) => x.id === v.id)?.dati;
      if (d && mia) await scriviInLocale(v, unisci(l.base, mia, d, v.aggiornatoDa));
      await scriviVoce({ id: v.id, tipo: v.tipo, ambito: v.ambito, version: v.version, base: d });
      continue;
    }
    await scriviInLocale(v, d);
    if (v.eliminato) await togliVoce(v.id);
    else await scriviVoce({ id: v.id, tipo: v.tipo, ambito: v.ambito, version: v.version, base: d });
  }
  // ragazzi non più condivisi: il loro personale lascia questo dispositivo
  const visibili = new Set(r.ambiti);
  for (const l of await tutteLocali()) {
    if (l.ambito === 'aula' || visibili.has(l.ambito)) continue;
    await scriviInLocale({ ...l, eliminato: true }, null);
    await togliVoce(l.id);
  }
  const nuovi = {};
  for (const a of r.ambiti) nuovi[a] = r.cursori[a];
  await scriviMeta('cursori', nuovi);
  if (r.pazienti) {
    // i pazienti creati qui e non ancora arrivati al custode restano miei
    const p = { ...r.pazienti };
    for (const [rid, a] of Object.entries(centro.pazienti || {})) if (a.locale && !p[rid] && coda.has('ragazzi|' + rid)) p[rid] = a;
    centro.pazienti = p; centro.pazientiNoti = true;
    await scriviMeta('pazienti', p);
  }
  if (r.gruppi) {
    const g = { ...r.gruppi };
    for (const [gid, a] of Object.entries(centro.gruppi || {})) if (a.locale && !g[gid] && coda.has('gruppi|' + gid)) g[gid] = a;
    centro.gruppi = g;
    await scriviMeta('gruppi', g);
  }
  await scriviMeta('ambitiImmagini', ambitiImmagini);
  return r;
}

let incorso = null, timer = null;
function programma(ms) { clearTimeout(timer); timer = setTimeout(() => sincronizza(), ms); }
export function sincronizza() {
  if (sync.fase !== 'pronto' || !sync.online) return Promise.resolve();
  if (incorso) return incorso.then(() => (coda.size ? sincronizza() : null));
  sync.lavoro = true;
  incorso = (async () => {
    try {
      for (let giro = 0; giro < 4 && coda.size; giro++) await invia();
      await ricevi();
      if (coda.size) await invia();
      if (eOperatore()) await consegnaChiavi();
      sync.ultima = new Date().toISOString();
      sync.errore = null;
    } catch (e) { gestisciErrore(e); } finally { sync.lavoro = false; incorso = null; }
  })();
  return incorso;
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

/** Accesso tolto: niente dati dell'aula su questo dispositivo. */
async function cancellaDatiAula() {
  for (const t of ['ragazzi', 'gruppi', 'sedute', 'note', 'sospesi', 'serie']) for (const o of [...dati[t]]) await elimina(t, o.id, true);
  await op('voci', 'readwrite', (s) => s.clear());
  await op('meta', 'readwrite', (s) => s.clear());
  await C.dimenticaTutto();
  coda.clear(); chiavi = {}; sync.io = null; centro.io = null; centro.pazienti = null; centro.gruppi = null; centro.pazientiNoti = false; sync.cfg = null; sync.inCoda = 0;
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
async function ottieniChiave() {
  const d = await C.dispositivo();
  await chiama('dispositivo.registra', { id: d.id, nome: nomeDispositivo(), pubblica: d.pubblica });
  const r = await chiama('dispositivo.chiave', { id: d.id });
  const busta = sync.cfg && r.chiavi?.[sync.cfg.kid];
  if (!busta) return false;
  // gli operatori la ricevono esportabile (per consegnarla ad altri), gli altri no
  const k = await C.riceviChiave(busta, d.privata, eOperatore());
  await C.ricordaChiave(sync.cfg.kid, k, !eOperatore());
  chiavi = await C.portachiavi();
  return true;
}
function aggiornaFase() {
  // senza sapere chi sei non si entra (mai un "ospite" con l'app aperta)
  if (!sync.io || !centro.io) { sync.fase = 'fuori'; return; }
  sync.fase = chiave() ? 'pronto' : eOperatore() ? 'chiave' : 'attesa';
}
/** Gli operatori consegnano la chiave ai dispositivi delle persone abilitate che la aspettano. */
async function consegnaChiavi() {
  const k = chiave();
  if (!k || !k.extractable) return 0;
  const el = await chiama('dispositivi.elenco');
  sync.dispositivi = el;
  let n = 0;
  for (const d of el) {
    if (d.abilitato || !d.personaAbilitata) continue;
    try {
      await chiama('dispositivi.abilita', { id: d.id, kid: sync.cfg.kid, chiave: await C.consegnaA(d.pubblica, k), pubblica: d.pubblica });
      d.abilitato = true; n++;
    } catch (e) { console.warn('consegna della chiave', d.id, e); }
  }
  return n;
}

async function prepara() {
  // se è in corso la cancellazione dei dati (accesso tolto) si aspetta che
  // finisca, così non svuota il profilo appena ricaricato
  if (pulizia) await pulizia.catch(() => {});
  sync.io = await chiama('io');
  centro.io = sync.io;
  await scriviMeta('io', sync.io);
  sync.cfg = sync.io.cifratura ? await chiama('cifratura.leggi') : null;
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
  ambitiImmagini = (await meta('ambitiImmagini')) || {};
  const u = Auth.inizia();
  Auth.alCambio(async (nuovo) => {
    if (!nuovo) return;
    if (sync.fase === 'fuori' || (sync.io && sync.io.email !== nuovo.email)) {
      try { await prepara(); } catch (e) { gestisciErrore(e); }
    }
  });
  window.addEventListener('online', () => { sync.online = true; sincronizza(); });
  window.addEventListener('offline', () => { sync.online = false; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizza(); });
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (sync.fase === 'attesa') prepara().catch(gestisciErrore); else sincronizza();
  }, 60000);
  if (!u) { sync.fase = 'fuori'; return; }
  // senza rete si lavora con quanto già noto: profilo e chiave ricordati
  sync.io = await meta('io');
  sync.cfg = await meta('cfg');
  centro.pazienti = (await meta('pazienti')) || null;
  centro.pazientiNoti = !!centro.pazienti;
  centro.gruppi = (await meta('gruppi')) || null;
  chiavi = await C.portachiavi();
  if (sync.io && sync.io.email === u.email) { centro.io = sync.io; aggiornaFase(); } else sync.fase = 'fuori';
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
  for (const t of ['ragazzi', 'gruppi', 'sedute', 'note', 'sospesi', 'serie']) for (const o of dati[t]) coda.add(t + '|' + o.id);
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
export const leggiAccessi = () => chiama('accessi.leggi');

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
  const tabelle = { ragazzi: {}, gruppi: {}, sedute: {}, note: {}, sospesi: {}, serie: {} };
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
export const gestisceCondivisioni = gestisceRiservati;
export const gestisceCondivisioniGruppi = gestisceGruppi;
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
export const salvaAccessi = (accessi, versioneBase) => chiama('accessi.salva', { accessi, versioneBase });
export const accessoDev = Auth.accessoDev;
export const pulsanteGoogle = Auth.pulsante;
export async function esci(cancella) {
  if (cancella) await cancellaDatiAula();
  await scriviMeta('io', null);
  Auth.esci();
  sync.io = null; centro.io = null; sync.fase = 'fuori';
}
export { TABELLA_DI };
