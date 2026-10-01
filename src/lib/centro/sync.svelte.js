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
async function chiama(azione, d) {
  const token = await Auth.prendiToken();
  let r;
  try {
    // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
    r = await inviaAlCustode(CONFIG.custodeUrl, { v: 1, token, azione, dati: d || {} });
  } catch (e) { throw new ErroreRete('Nessuna connessione con il custode.'); }
  if (!r.ok) throw new ErroreRete('Il custode non risponde (HTTP ' + r.status + ').');
  let j;
  try { j = await r.json(); } catch (e) { throw new ErroreRete('Risposta del custode non leggibile.'); }
  if (!j.ok) {
    if (j.errore === 'non-autenticato') { Auth.invalida(); throw new Auth.ErroreAccesso(j.messaggio); }
    throw new ErroreCustode(j.errore, j.messaggio, j.extra);
  }
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
async function recuperaImmagine(id) {
  const ambito = ambitiImmagini[id];
  if (!ambito || !chiave()) return false;
  try {
    const r = await chiama('immagine.leggi', { id, ambito });
    const u8 = await C.decifraByte(chiave(), r.busta, aad(ambito, 'img:' + id));
    const tipo = u8[0] === 0xff && u8[1] === 0xd8 ? 'image/jpeg' : u8[0] === 0x89 ? 'image/png' : 'image/webp';
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
    const voci = o ? vociDi(tabella, $state.snapshot(o)) : idVociDi(tabella, id).map((vid) => ({ id: vid, eliminato: true }));
    for (const v of voci) {
      if (!v.eliminato && !/^(aula|r:[a-z0-9]{2,40})$/.test(v.ambito)) { console.warn('voce senza ambito valido', v); continue; }
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
    if (l && l.version >= v.version && l.ambito === v.ambito) continue;
    let d = null;
    try { d = await apriVoce(v); } catch (e) { console.warn('voce illeggibile', v.id, e); continue; }
    if (d) ricordaImmagini(v.ambito, d);
    if (inCoda.has(v.id) && l) {
      // modificata qui e là: si unisce, e la versione unita ripartirà
      const { tabella, id } = destinazione(v);
      const mia = vociDi(tabella, $state.snapshot(oggettoLocale(tabella, id) || {})).find((x) => x.id === v.id)?.dati;
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
function gestisciErrore(e) {
  console.warn('sincronizzazione', e);
  if (e?.accesso) { sync.fase = 'fuori'; sync.errore = e.message; }
  else if (e?.custode && ['non-autorizzato', 'disattivato', 'scaduto'].includes(e.codice)) {
    sync.negato = e.message; sync.fase = 'fuori';
    cancellaDatiAula().catch(console.error);
  } else sync.errore = e?.message || String(e);
}

/** Accesso tolto: niente dati dell'aula su questo dispositivo. */
async function cancellaDatiAula() {
  for (const t of ['ragazzi', 'gruppi', 'sedute', 'note', 'sospesi', 'serie']) for (const o of [...dati[t]]) await elimina(t, o.id, true);
  await op('voci', 'readwrite', (s) => s.clear());
  await op('meta', 'readwrite', (s) => s.clear());
  await C.dimenticaTutto();
  coda.clear(); chiavi = {}; sync.io = null; centro.io = null; sync.cfg = null; sync.inCoda = 0;
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
