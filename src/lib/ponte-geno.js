// Ponte con GenoGram Creator: i genogrammi passano da una finestra all'altra
// con postMessage, solo sul dispositivo e solo su richiesta esplicita.
//
// Ogni scambio è accettato solo se:
// - arriva dall'indirizzo esatto di GenoGram Creator (configurabile con
//   VITE_GENOGRAM_URL; oggi è la stessa origine, domani potrà non esserlo);
// - arriva dalla finestra che ha aperto noi, o che ci ha aperto;
// - porta il codice monouso (nonce) scelto per quello scambio.
// Il genogramma non passa mai da un server: resta nel dispositivo finché
// PsyDiary non lo cifra come allegato.
//
// Protocollo (anche in GenoGram Creator, src/services/psydiary.ts):
//   { protocollo: 'psydiary-genogram', v: 1, nonce, tipo, ... }
//   tipo 'pronto'      chi è stato aperto avvisa che ascolta
//   tipo 'genogramma'  { genogramma: { id, title, lastModified, data } }
//   tipo 'ricevuto'    conferma (facoltativa)
//   tipo 'annulla'     l'altra parte ha rinunciato

import { leggiGenogrammi } from './genogramma.js';

export const PROTOCOLLO = 'psydiary-genogram';
const PREDEFINITO = 'https://stefanonevepsy.github.io/GenoGram-Creator/';
export const URL_GENOGRAM = (import.meta.env?.VITE_GENOGRAM_URL || PREDEFINITO).replace(/\/?$/, '/');
export const ORIGINE_GENOGRAM = new URL(URL_GENOGRAM).origin;
const MAX_BYTE = 4 * 1024 * 1024;

export function nonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Un messaggio del ponte, se valido per questo scambio; altrimenti null. */
export function messaggioValido(e, { finestra, codice, origine = ORIGINE_GENOGRAM }) {
  if (!e || e.origin !== origine) return null;
  if (finestra && e.source !== finestra) return null;
  const m = e.data;
  if (!m || typeof m !== 'object' || m.protocollo !== PROTOCOLLO || m.v !== 1) return null;
  if (typeof m.nonce !== 'string' || m.nonce !== codice) return null;
  return m;
}

/** Il genogramma dentro un messaggio, controllato come un file importato. */
export function genogrammaDa(m) {
  if (!m || m.tipo !== 'genogramma' || !m.genogramma) return null;
  let testo;
  try { testo = JSON.stringify(m.genogramma); } catch (e) { return null; }
  if (testo.length > MAX_BYTE) return null;
  return leggiGenogrammi(testo)[0] || null;
}

const busta = (codice, tipo, extra = {}) => ({ protocollo: PROTOCOLLO, v: 1, nonce: codice, tipo, ...extra });

/**
 * Apre GenoGram Creator e aspetta un genogramma.
 * modo 'scegli': l'utente sceglie quale mandare; 'aggiorna': quello con l'id dato.
 * Restituisce { id, titolo, modificato, data } o null se si rinuncia.
 */
export function chiediAGenoGram({ modo = 'scegli', id = '' } = {}) {
  const codice = nonce();
  const q = new URLSearchParams({ da: location.origin, n: codice, modo, ...(id ? { id } : {}) });
  const w = window.open(URL_GENOGRAM + '#psydiary?' + q, 'genogram-creator');
  if (!w) return Promise.reject(new Error('Il browser ha bloccato la finestra di GenoGram Creator: consenti i popup per PsyDiary.'));
  return new Promise((ok, no) => {
    const fine = (fn, x) => { clearInterval(guarda); window.removeEventListener('message', ascolta); fn(x); };
    const ascolta = (e) => {
      const m = messaggioValido(e, { finestra: w, codice });
      if (!m) return;
      if (m.tipo === 'annulla') return fine(ok, null);
      if (m.tipo !== 'genogramma') return;
      const g = genogrammaDa(m);
      if (!g) return fine(no, new Error('GenoGram Creator ha mandato un genogramma che non si riesce a leggere.'));
      try { w.postMessage(busta(codice, 'ricevuto'), ORIGINE_GENOGRAM); } catch (x) { /* la finestra si è già chiusa */ }
      fine(ok, g);
    };
    window.addEventListener('message', ascolta);
    // finestra chiusa senza mandare niente
    const guarda = setInterval(() => { if (w.closed) fine(ok, null); }, 700);
  });
}

/**
 * Apre GenoGram Creator e gli passa un genogramma da modificare (anche se su
 * questo dispositivo GenoGram non l'ha mai visto).
 */
export function apriInGenoGram(g) {
  const codice = nonce();
  const q = new URLSearchParams({ da: location.origin, n: codice, modo: 'apri' });
  const w = window.open(URL_GENOGRAM + '#psydiary?' + q, 'genogram-creator');
  if (!w) return Promise.reject(new Error('Il browser ha bloccato la finestra di GenoGram Creator: consenti i popup per PsyDiary.'));
  return new Promise((ok) => {
    const fine = (x) => { clearInterval(guarda); clearTimeout(scade); window.removeEventListener('message', ascolta); ok(x); };
    const ascolta = (e) => {
      const m = messaggioValido(e, { finestra: w, codice });
      if (!m || m.tipo !== 'pronto') return;
      w.postMessage(busta(codice, 'genogramma', { genogramma: { id: g.id, title: g.titolo, lastModified: g.modificato || Date.now(), data: g.data } }), ORIGINE_GENOGRAM);
      fine(true);
    };
    window.addEventListener('message', ascolta);
    const guarda = setInterval(() => { if (w.closed) fine(false); }, 700);
    const scade = setTimeout(() => fine(false), 120000);
  });
}

/**
 * PsyDiary aperto da GenoGram Creator ("Invia a PsyDiary"): l'indirizzo porta
 * #/ricevi-genogramma?n=<nonce>. Si annuncia all'apertore quando è pronto e
 * restituisce il genogramma che arriva (o null).
 */
export function richiestaInArrivo(query) {
  const codice = String(query?.n || '');
  if (!/^[0-9a-f]{32}$/.test(codice) || !window.opener) return null;
  return { codice, finestra: window.opener };
}
export function ricevi({ codice, finestra }) {
  return new Promise((ok) => {
    const fine = (x) => { clearTimeout(scade); window.removeEventListener('message', ascolta); ok(x); };
    const ascolta = (e) => {
      const m = messaggioValido(e, { finestra, codice });
      if (!m) return;
      if (m.tipo === 'annulla') return fine(null);
      const g = genogrammaDa(m);
      if (g) fine(g);
    };
    window.addEventListener('message', ascolta);
    const scade = setTimeout(() => fine(null), 10 * 60000);
    try { finestra.postMessage(busta(codice, 'pronto'), ORIGINE_GENOGRAM); } catch (e) { fine(null); }
  });
}
export function conferma({ codice, finestra }, esito) {
  try { finestra.postMessage(busta(codice, esito ? 'ricevuto' : 'annulla'), ORIGINE_GENOGRAM); } catch (e) { /* chiusa */ }
}
