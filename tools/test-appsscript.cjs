#!/usr/bin/env node
/**
 * Prova il custode composto (custode-pronto/custode-completo.gs) fuori da
 * Google, con finti DriveApp, CacheService, LockService, UrlFetchApp: gli
 * errori di collegamento si trovano qui, non al primo deploy.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'ok  ' : 'NO  ') + m); };

let contatore = 0;
const tutti = {};
const it = (l) => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
const conSegno = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
function nuovoFile(nome, contenuto) {
  const x = { _tipo: 'file', _id: 'id' + ++contatore, _nome: nome, _testo: contenuto, _cestino: false,
    getId: () => x._id, getName: () => x._nome, isTrashed: () => x._cestino,
    getBlob: () => ({ getDataAsString: () => x._testo }), setContent: (t) => { x._testo = t; } };
  tutti[x._id] = x; return x;
}
function nuovaCartella(nome) {
  const d = { _tipo: 'cartella', _id: 'id' + ++contatore, _nome: nome, _file: [], _cartelle: [],
    getId: () => d._id, getName: () => d._nome, getUrl: () => 'https://drive/' + d._id, setDescription: () => {},
    getFoldersByName: (x) => it(d._cartelle.filter((c) => c._nome === x)),
    getFilesByName: (x) => it(d._file.filter((c) => c._nome === x)),
    createFolder: (x) => { const c = nuovaCartella(x); d._cartelle.push(c); return c; },
    createFile: (x, t) => { const c = nuovoFile(x, t); d._file.push(c); return c; } };
  tutti[d._id] = d; return d;
}
const mioDrive = [];
const CLIENT_ID = '123-test.apps.googleusercontent.com';
const prop = {};
const cache = {};
let chiamateGoogle = 0;
const adesso = Math.floor(Date.now() / 1000);
function tokeninfo(t) {
  t = t.split('#')[0];   // i token veri sono lunghi: qui un'imbottitura dopo #
  const base = { iss: 'https://accounts.google.com', aud: CLIENT_ID, email_verified: 'true', exp: String(adesso + 3600) };
  if (t.startsWith('tok-altraapp-')) return { ...base, aud: 'altra', email: t.slice(13) };
  if (t.startsWith('tok-scaduto-')) return { ...base, exp: String(adesso - 5), email: t.slice(12) };
  if (t.startsWith('tok-')) return { ...base, email: t.slice(4), given_name: t.slice(4).split('@')[0] };
  return null;
}
const ctx = {
  console,
  DriveApp: {
    getFolderById: (id) => { const x = tutti[id]; if (!x || x._tipo !== 'cartella') throw new Error('nf'); return x; },
    getFileById: (id) => { const x = tutti[id]; if (!x || x._tipo !== 'file') throw new Error('nf'); return x; },
    createFolder: (nome) => { const c = nuovaCartella(nome); mioDrive.push(c); return c; },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => prop[k] || null, setProperty: (k, v) => { prop[k] = v; }, deleteProperty: (k) => { delete prop[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => true, releaseLock: () => {} }) },
  UrlFetchApp: { fetch: (url) => {
    chiamateGoogle++;
    const t = decodeURIComponent((url.split('id_token=')[1] || ''));
    const info = tokeninfo(t);
    return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {}) };
  } },
  Utilities: { DigestAlgorithm: { SHA_256: 'x' }, computeDigest: (a, s) => conSegno(crypto.createHash('sha256').update(String(s)).digest()) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'stefano@aula.it' }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } }) },
  Logger: { log: () => {} },
};
execFileSync(process.execPath, [path.join(__dirname, 'componi-custode.cjs')], { env: { ...process.env, GOOGLE_CLIENT_ID: CLIENT_ID }, stdio: 'ignore' });
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../custode-pronto/custode-completo.gs'), 'utf8'), ctx);
const post = (o) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } })._t);
const PAD = '#' + 'x'.repeat(40);
const chiama = (email, azione, dati) => post({ v: 1, token: 'tok-' + email + PAD, azione, dati });

ok(JSON.parse(ctx.doGet()._t).configurato === false, 'appena copiato: non ancora configurato');
ctx.configura();
ok(mioDrive.length === 1 && mioDrive[0]._nome === 'PsyDiary · dati cifrati' && !!prop.CARTELLA_RADICE, 'configura crea la cartella nel Drive del proprietario');
ctx.configura();
ok(mioDrive.length === 1, 'rieseguire configura non crea doppioni');
ok(JSON.parse(ctx.doGet()._t).configurato === true, 'configurato (client ID da Configurazione.gs)');
const io0 = chiama('stefano@aula.it', 'io'); if (!io0.ok) console.log(io0);
ok(io0.ok && io0.dati.ruolo === 'admin', 'il proprietario entra come operatore');
const g0 = chiamateGoogle;
chiama('stefano@aula.it', 'io');
ok(chiamateGoogle === g0, 'il token verificato si ricorda (niente chiamate a Google ogni volta)');
ok(post({ v: 1, token: 'tok-altraapp-stefano@aula.it' + PAD, azione: 'io' }).errore === 'non-autenticato', 'token di un\'altra app rifiutato');
ok(post({ v: 1, token: 'tok-scaduto-stefano@aula.it' + PAD, azione: 'io' }).errore === 'non-autenticato', 'token scaduto rifiutato');
ok(JSON.parse(ctx.doPost({ postData: { contents: 'non json' } })._t).errore === 'richiesta-non-valida', 'corpo non leggibile');

const b = { v: 1, alg: 'A256GCM', kid: 'kx', iv: 'AAAAAAAAAAAAAAAA', comp: 'no', dati: 'AAAA' };
chiama('stefano@aula.it', 'cifratura.imposta', { cifratura: { kid: 'kx', kdf: { nome: 'PBKDF2-SHA256', iterazioni: 600000, sale: 'AAAAAAAAAAAAAAAAAAAAAA==' }, verifica: b } });
let r = chiama('stefano@aula.it', 'sync', { invii: [{ id: 'rluca01', tipo: 'ragazzo', ambito: 'aula', versioneBase: 0, busta: b }, { id: 'rluca01sc', tipo: 'scheda', ambito: 'r:rluca01', versioneBase: 0, busta: b }] });
ok(r.ok && r.dati.esiti.every((e) => e.ok), 'voci salvate su Drive');
const radice = tutti[prop.CARTELLA_RADICE];
const dati = radice._cartelle.find((c) => c._nome === 'Dati');
ok(dati && dati._file.some((x) => x._nome === 'aula.json') && dati._cartelle.find((c) => c._nome === 'ragazzi')._file.some((x) => x._nome === 'rluca01.json'), 'file in Dati/aula.json e Dati/ragazzi/rluca01.json');
r = chiama('stefano@aula.it', 'sync', { cursori: {} });
ok(r.dati.voci.length === 2, 'si rileggono');
ok(chiama('stefano@aula.it', 'immagine.carica', { id: 'i12345', ambito: 'aula', busta: b }).ok && chiama('stefano@aula.it', 'immagine.leggi', { id: 'i12345', ambito: 'aula' }).dati.id === 'i12345', 'immagini su Drive');

console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
