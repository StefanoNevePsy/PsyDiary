// Immagini: ridotte e convertite in WebP sul dispositivo, poi salvate a parte.
// Nel testo delle note si citano come ![didascalia](img:ID).
import * as A from './archivio.js';

const LATO = 1600;   // lato lungo dell'immagine salvata
const MINI = 360;    // lato lungo della miniatura

function carica(file) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => ok({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Formato di immagine non leggibile')); };
    img.src = url;
  });
}
function codifica(img, lato, qualita) {
  const k = Math.min(1, lato / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  return new Promise((ok) => c.toBlob((b) => {
    // Safari non sa ancora scrivere WebP: in quel caso JPEG
    if (b && b.type === 'image/webp') ok({ blob: b, w, h });
    else c.toBlob((j) => ok({ blob: j, w, h }), 'image/jpeg', 0.84);
  }, 'image/webp', qualita));
}

/** Converte e salva un file immagine; restituisce l'id. */
export async function salvaImmagine(file, { lato = LATO } = {}) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Non è un\'immagine');
  const { img, url } = await carica(file);
  try {
    const grande = await codifica(img, lato, 0.8);
    const mini = await codifica(img, MINI, 0.72);
    const id = 'i' + crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 14);
    await A.metti('immagini', {
      id, blob: grande.blob, mini: mini.blob, larghezza: grande.w, altezza: grande.h,
      tipo: grande.blob.type, pesoOriginale: file.size, creato: new Date().toISOString(),
    });
    return id;
  } finally { URL.revokeObjectURL(url); }
}

// ---------------------------------------------------------------------------
// Allegati dell'anagrafica (genogrammi, documenti): il file così com'è, cifrato
// e sincronizzato come le immagini. Le immagini troppo grandi si riducono, ma
// meno delle foto: in un genogramma il testo deve restare leggibile.
export const MAX_ALLEGATO = 5 * 1024 * 1024;   // cifrato e in base64 deve stare nel limite del custode
const IMMAGINI_TALI = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export async function salvaAllegato(file) {
  if (!file) throw new Error('Nessun file');
  const tipo = file.type || tipoDaNome(file.name);
  const id = 'a' + crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 14);
  let blob = file, mini = null, larghezza = null, altezza = null;
  if (IMMAGINI_TALI.includes(tipo) || tipo === 'image/svg+xml') {
    const { img, url } = await carica(file);
    try {
      larghezza = img.naturalWidth || null; altezza = img.naturalHeight || null;
      if (tipo !== 'image/svg+xml' && file.size > 3 * 1024 * 1024) {
        const g = await codifica(img, 2600, 0.9);
        blob = g.blob; larghezza = g.w; altezza = g.h;
      }
      mini = (await codifica(img, MINI, 0.75)).blob;
    } finally { URL.revokeObjectURL(url); }
  }
  if (blob.size > MAX_ALLEGATO) throw new Error(`«${file.name}» è troppo grande (${Math.round(blob.size / 1048576)} MB): al massimo 5 MB.`);
  await A.metti('immagini', { id, blob, mini, larghezza, altezza, tipo: blob.type || tipo, allegato: true, pesoOriginale: file.size, creato: new Date().toISOString() });
  return { id, nome: file.name || 'allegato', tipo: blob.type || tipo, peso: blob.size, aggiunto: new Date().toISOString().slice(0, 10) };
}
function tipoDaNome(n) {
  const e = String(n || '').toLowerCase().split('.').pop();
  return { pdf: 'application/pdf', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text',
    txt: 'text/plain', json: 'application/json' }[e] || 'application/octet-stream';
}
/** Il contenuto testuale di un allegato (per i genogrammi in JSON). */
export async function testoAllegato(id) {
  let r = await A.uno('immagini', id);
  if (!r && recupera && (await recupera(id))) r = await A.uno('immagini', id);
  return r ? r.blob.text() : null;
}
/** URL (blob:) del file di un allegato, con il suo tipo (per aprirlo o scaricarlo). */
export async function urlAllegato(id, tipo) {
  let r = await A.uno('immagini', id);
  if (!r && recupera && (await recupera(id))) r = await A.uno('immagini', id);
  if (!r) return null;
  return URL.createObjectURL(tipo && r.blob.type !== tipo ? new Blob([r.blob], { type: tipo }) : r.blob);
}

const cache = new Map();
// Con il custode: un'immagine che non è su questo dispositivo si scarica (e si decifra) da lì
let recupera = null;
export const impostaRecupero = (fn) => { recupera = fn; };
/** URL (blob:) dell'immagine, grande o miniatura. */
export function urlImmagine(id, piccola = false) {
  const k = id + (piccola ? ':m' : '');
  if (!cache.has(k)) {
    const p = A.uno('immagini', id)
      .then(async (r) => r || (recupera && (await recupera(id)) ? A.uno('immagini', id) : null))
      .then((r) => (r && (piccola ? r.mini || r.blob : r.blob) ? URL.createObjectURL(piccola ? r.mini || r.blob : r.blob) : null))
      .catch(() => null);
    cache.set(k, p);
    p.then((u) => { if (!u) cache.delete(k); });   // si riprova la prossima volta
  }
  return cache.get(k);
}
/** Il file salvato (per caricarlo, cifrato, sul custode). */
export const fileImmagine = (id) => A.uno('immagini', id);
/** Salva un'immagine arrivata dal custode, con la sua miniatura. */
export async function salvaDaCustode(id, blob) {
  // un allegato che non è un'immagine (PDF, documento) si salva com'è
  if (!/^image\//.test(blob.type)) {
    await A.metti('immagini', { id, blob, mini: null, tipo: blob.type, allegato: true, creato: new Date().toISOString() });
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const mini = await codifica(img, MINI, 0.72);
    await A.metti('immagini', { id, blob, mini: mini.blob, larghezza: img.naturalWidth, altezza: img.naturalHeight, tipo: blob.type, creato: new Date().toISOString() });
  } finally { URL.revokeObjectURL(url); }
}
export async function togliImmagine(id) {
  for (const k of [id, id + ':m']) { const u = await cache.get(k); if (u) URL.revokeObjectURL(u); cache.delete(k); }
  await A.togli('immagini', id);
}

/** Apre il selettore di file e restituisce l'id dell'immagine salvata (o null). */
export function scegliImmagine(opz = {}) {
  return new Promise((ok, ko) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => (i.files[0] ? salvaImmagine(i.files[0], opz).then(ok, ko) : ok(null));
    i.click();
  });
}
