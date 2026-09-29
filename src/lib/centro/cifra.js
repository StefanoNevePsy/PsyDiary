/**
 * Cifratura dei dati dell'aula (stesso schema di Centro TICE).
 *
 *   frase (25 caratteri) ──PBKDF2-SHA256 600k──▶ chiave AES-256
 *   dato ──gzip──▶ AES-256-GCM (iv casuale, legato alla voce) ──▶ busta
 *
 * Busta: { v: 1, alg: 'A256GCM', kid, iv, comp, dati } in base64.
 * La frase la conoscono solo gli operatori. Agli altri dispositivi la chiave
 * arriva cifrata per loro (RSA-OAEP) e non è esportabile: la usano senza
 * poterla vedere né copiare.
 */
const ITERAZIONI = 600000;
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford: niente I, L, O, U
const enc = new TextEncoder(), dec = new TextDecoder();
const S = () => crypto.subtle;
const casuali = (n) => crypto.getRandomValues(new Uint8Array(n));

export function aB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function daB64(s) {
  const b = atob(s), u8 = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
  return u8;
}

export function generaFrase() {
  const r = casuali(25);
  let s = '';
  for (let i = 0; i < 25; i++) s += ALFABETO[r[i] & 31] + (i % 5 === 4 && i < 24 ? '-' : '');
  return s;
}
export function normalizzaFrase(s) {
  const t = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  return t.length === 25 ? t.replace(/(.{5})(?!$)/g, '$1-') : null;
}
async function derivaChiave(frase, cfg, esportabile) {
  const f = normalizzaFrase(frase);
  if (!f) throw new Error('La chiave dell\'aula è di 25 caratteri (5 gruppi da 5).');
  const base = await S().importKey('raw', enc.encode(f), 'PBKDF2', false, ['deriveKey']);
  return S().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: daB64(cfg.kdf.sale), iterations: cfg.kdf.iterazioni },
    base, { name: 'AES-GCM', length: 256 }, !!esportabile, ['encrypt', 'decrypt']);
}

const haGzip = typeof CompressionStream !== 'undefined';
async function trasforma(u8, Stream) {
  const s = new Blob([u8]).stream().pipeThrough(new Stream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function cifraByte(chiave, kid, dati, aad, comprimi) {
  const comp = comprimi && haGzip && dati.length > 512;
  const chiaro = comp ? await trasforma(dati, CompressionStream) : dati;
  const iv = casuali(12);
  const c = await S().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, chiave, chiaro);
  return { v: 1, alg: 'A256GCM', kid, iv: aB64(iv), comp: comp ? 'gzip' : 'no', dati: aB64(new Uint8Array(c)) };
}
async function decifraByte(chiave, busta, aad) {
  if (!busta || busta.v !== 1 || busta.alg !== 'A256GCM') throw new Error('Formato di cifratura sconosciuto');
  let u8;
  try { u8 = new Uint8Array(await S().decrypt({ name: 'AES-GCM', iv: daB64(busta.iv), additionalData: enc.encode(aad) }, chiave, daB64(busta.dati))); }
  catch (e) { throw new Error('Impossibile aprire i dati: chiave sbagliata o file alterato.'); }
  return busta.comp === 'gzip' ? trasforma(u8, DecompressionStream) : u8;
}
export const cifra = (chiave, kid, oggetto, aad) => cifraByte(chiave, kid, enc.encode(JSON.stringify(oggetto)), aad, true);
export const decifra = async (chiave, busta, aad) => JSON.parse(dec.decode(await decifraByte(chiave, busta, aad)));
export { cifraByte, decifraByte };

const VERIFICA = { psydiary: 'chiave-dell-aula' };
export async function nuovaConfigurazione(frase) {
  const r = casuali(4);
  const kid = 'k' + Array.from(r, (x) => ALFABETO[x & 31].toLowerCase()).join('');
  const cfg = { kid, kdf: { nome: 'PBKDF2-SHA256', iterazioni: ITERAZIONI, sale: aB64(casuali(16)) } };
  const chiave = await derivaChiave(frase, cfg, true);
  cfg.verifica = await cifra(chiave, kid, VERIFICA, 'psy:verifica');
  return { cfg, chiave };
}
export async function apriConFrase(frase, cfg) {
  const chiave = await derivaChiave(frase, cfg, true);
  let v;
  try { v = await decifra(chiave, cfg.verifica, 'psy:verifica'); } catch (e) { throw new Error('Questa non è la chiave dell\'aula.'); }
  if (!v || v.psydiary !== VERIFICA.psydiary) throw new Error('Questa non è la chiave dell\'aula.');
  return chiave;
}

// ---- consegna della chiave ai dispositivi ----
const RSA = { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
async function nuovaCoppia() {
  const k = await S().generateKey(RSA, false, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']);
  const spki = await S().exportKey('spki', k.publicKey);
  const r = casuali(12);
  return { id: 'd' + Array.from(r, (x) => ALFABETO[x & 31].toLowerCase()).join(''), privata: k.privateKey, pubblica: aB64(new Uint8Array(spki)) };
}
export async function consegnaA(pubblicaB64, chiave) {
  const pub = await S().importKey('spki', daB64(pubblicaB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const grezza = await S().exportKey('raw', chiave);
  return aB64(new Uint8Array(await S().encrypt({ name: 'RSA-OAEP' }, pub, grezza)));
}
export const riceviChiave = (busta, privata, esportabile) =>
  S().unwrapKey('raw', daB64(busta), privata, { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, !!esportabile, ['encrypt', 'decrypt']);

// ---- sul dispositivo ----
function op(modo, fn) {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('psydiary-chiavi', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('chiavi');
    r.onerror = () => ko(r.error);
    r.onsuccess = () => {
      const d = r.result, t = d.transaction('chiavi', modo), req = fn(t.objectStore('chiavi'));
      t.oncomplete = () => { d.close(); ok(req && req.result); };
      t.onerror = () => { d.close(); ko(t.error); };
    };
  });
}
const leggi = (k) => op('readonly', (s) => s.get(k));
const scrivi = (k, v) => op('readwrite', (s) => s.put(v, k));
const togli = (k) => op('readwrite', (s) => s.delete(k));

export const portachiavi = async () => (await leggi('portachiavi')) || {};
export async function ricordaChiave(kid, chiave, soloQuesta) {
  const p = soloQuesta ? {} : await portachiavi();
  p[kid] = chiave;
  await scrivi('portachiavi', p);
}
export async function dispositivo() {
  const d = await leggi('dispositivo');
  if (d && d.privata) return d;
  const n = await nuovaCoppia();
  await scrivi('dispositivo', n);
  return n;
}
/** La frase resta sul dispositivo degli operatori, cifrata con una chiave locale non esportabile. */
export async function salvaFrase(frase) {
  let k = await leggi('locale');
  if (!k) { k = await S().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await scrivi('locale', k); }
  await scrivi('frase', await cifra(k, 'locale', { frase }, 'psy:frase'));
}
export async function frase() {
  const [k, b] = await Promise.all([leggi('locale'), leggi('frase')]);
  return k && b ? (await decifra(k, b, 'psy:frase')).frase : null;
}
export const dimenticaTutto = () => Promise.all(['portachiavi', 'dispositivo', 'frase', 'locale'].map(togli));
