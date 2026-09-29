// Archivio sul dispositivo (IndexedDB). Una tabella per tipo di oggetto.
// Nella fase 2 lo stesso contenuto viaggerà cifrato verso il custode.

import { REALE } from './centro/config.js';

// i dati veri stanno in un archivio a parte: mai mescolati con quelli di prova
const NOME = REALE ? 'psydiary-aula' : 'psydiary';
const VERSIONE = 2;
export const TABELLE = ['ragazzi', 'gruppi', 'sedute', 'note', 'sospesi', 'persone'];
// le immagini non stanno nello stato dell'app: si leggono quando servono
const ALTRE = ['immagini'];

let db = null;
function apri() {
  if (db) return Promise.resolve(db);
  return new Promise((ok, ko) => {
    const r = indexedDB.open(NOME, VERSIONE);
    r.onupgradeneeded = () => {
      for (const t of [...TABELLE, ...ALTRE]) if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t, { keyPath: 'id' });
    };
    r.onsuccess = () => { db = r.result; ok(db); };
    r.onerror = () => ko(r.error);
  });
}
function op(tabella, modo, fn) {
  return apri().then((d) => new Promise((ok, ko) => {
    const t = d.transaction(tabella, modo);
    const req = fn(t.objectStore(tabella));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error || new Error('Salvataggio annullato'));
  }));
}
export const tutti = (tabella) => op(tabella, 'readonly', (s) => s.getAll());
export const uno = (tabella, id) => op(tabella, 'readonly', (s) => s.get(id));
export const metti = (tabella, oggetto) => op(tabella, 'readwrite', (s) => s.put(oggetto));
export const togli = (tabella, id) => op(tabella, 'readwrite', (s) => s.delete(id));
export async function svuota() {
  for (const t of [...TABELLE, ...ALTRE]) await op(t, 'readwrite', (s) => s.clear());
}
/** Scrive più tabelle in una sola transazione: o tutto o niente. */
export async function mettiTutto(contenuto) {
  const d = await apri();
  const tabelle = Object.keys(contenuto);
  return new Promise((ok, ko) => {
    const t = d.transaction(tabelle, 'readwrite');
    for (const k of tabelle) { const s = t.objectStore(k); for (const o of contenuto[k]) s.put(o); }
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error || new Error('Scrittura annullata'));
  });
}
