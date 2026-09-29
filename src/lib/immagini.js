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
export async function salvaImmagine(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Non è un\'immagine');
  const { img, url } = await carica(file);
  try {
    const grande = await codifica(img, LATO, 0.8);
    const mini = await codifica(img, MINI, 0.72);
    const id = 'i' + crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 14);
    await A.metti('immagini', {
      id, blob: grande.blob, mini: mini.blob, larghezza: grande.w, altezza: grande.h,
      tipo: grande.blob.type, pesoOriginale: file.size, creato: new Date().toISOString(),
    });
    return id;
  } finally { URL.revokeObjectURL(url); }
}

const cache = new Map();
/** URL (blob:) dell'immagine, grande o miniatura. */
export function urlImmagine(id, piccola = false) {
  const k = id + (piccola ? ':m' : '');
  if (!cache.has(k)) {
    cache.set(k, A.uno('immagini', id).then((r) => (r ? URL.createObjectURL(piccola ? r.mini : r.blob) : null)));
  }
  return cache.get(k);
}
export async function togliImmagine(id) {
  for (const k of [id, id + ':m']) { const u = await cache.get(k); if (u) URL.revokeObjectURL(u); cache.delete(k); }
  await A.togli('immagini', id);
}

/** Apre il selettore di file e restituisce l'id dell'immagine salvata (o null). */
export function scegliImmagine() {
  return new Promise((ok, ko) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => (i.files[0] ? salvaImmagine(i.files[0]).then(ok, ko) : ok(null));
    i.click();
  });
}
