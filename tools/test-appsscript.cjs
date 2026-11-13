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

let contatore = 0, lettureDrive = 0;
// operazioni Drive per tipo (ciascuna costa da 0,3 a 1,5 s su Apps Script): si azzerano con azzeraOp()
const op = {};
const conta = (t) => { op[t] = (op[t] || 0) + 1; };
const azzeraOp = () => { Object.keys(op).forEach((k) => delete op[k]); };
const totaleOp = () => Object.values(op).reduce((a, b) => a + b, 0);
const tipiOp = () => Object.keys(op).sort().map((k) => k + ':' + op[k]).join(' ');
const tutti = {};
const it = (l) => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
const conSegno = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
function nuovoFile(nome, contenuto) {
  const x = { _tipo: 'file', _id: 'id' + ++contatore, _nome: nome, _testo: contenuto, _cestino: false,
    getId: () => x._id, getName: () => x._nome, isTrashed: () => { conta('isTrashed'); return x._cestino; },
    getBlob: () => { lettureDrive++; conta('leggi'); return { getDataAsString: () => x._testo }; }, setContent: (t) => { conta('setContent'); x._testo = t; } };
  tutti[x._id] = x; return x;
}
function nuovaCartella(nome) {
  const d = { _tipo: 'cartella', _id: 'id' + ++contatore, _nome: nome, _file: [], _cartelle: [],
    getId: () => d._id, getName: () => d._nome, getUrl: () => 'https://drive/' + d._id, setDescription: () => {},
    getFoldersByName: (x) => { conta('getFoldersByName'); return it(d._cartelle.filter((c) => c._nome === x)); },
    getFilesByName: (x) => { conta('getFilesByName'); return it(d._file.filter((c) => c._nome === x)); },
    createFolder: (x) => { conta('createFolder'); const c = nuovaCartella(x); d._cartelle.push(c); return c; },
    createFile: (x, t) => { conta('createFile'); const c = nuovoFile(x, t); d._file.push(c); return c; } };
  tutti[d._id] = d; return d;
}
const mioDrive = [];
const CLIENT_ID = '123-test.apps.googleusercontent.com';
const prop = {};
const cache = {};
let lucchettoAltrui = false;   // un'altra persona sta salvando
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
    getFolderById: (id) => { conta('getFolderById'); const x = tutti[id]; if (!x || x._tipo !== 'cartella') throw new Error('nf'); return x; },
    getFileById: (id) => { conta('getFileById'); const x = tutti[id]; if (!x || x._tipo !== 'file') throw new Error('nf'); return x; },
    createFolder: (nome) => { const c = nuovaCartella(nome); mioDrive.push(c); return c; },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => prop[k] || null, setProperty: (k, v) => { prop[k] = v; }, deleteProperty: (k) => { delete prop[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { if (String(v).length > 100000) throw new Error('valore troppo grande'); cache[k] = v; }, remove: (k) => { delete cache[k]; },
    getAll: (ks) => { const o = {}; ks.forEach((k) => { if (cache[k] != null) o[k] = cache[k]; }); return o; },
    putAll: (o) => { Object.entries(o).forEach(([k, v]) => { if (String(v).length > 100000) throw new Error('valore troppo grande'); cache[k] = v; }); } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => !lucchettoAltrui, waitLock: () => true, releaseLock: () => {} }) },
  UrlFetchApp: { fetch: (url) => {
    chiamateGoogle++;
    const t = decodeURIComponent((url.split('id_token=')[1] || ''));
    const info = tokeninfo(t);
    return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {}) };
  } },
  Utilities: { DigestAlgorithm: { SHA_256: 'x' }, formatDate: () => '12', computeDigest: (a, s) => conSegno(crypto.createHash('sha256').update(String(s)).digest()) },
  Session: { getEffectiveUser: () => ({ getEmail: () => emailSessione }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } }) },
  Logger: { log: () => {} },
};
execFileSync(process.execPath, [path.join(__dirname, 'componi-custode.cjs')], { env: { ...process.env, GOOGLE_CLIENT_ID: CLIENT_ID }, stdio: 'ignore' });
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../custode-pronto/custode-completo.gs'), 'utf8'), ctx);
let emailSessione = 'Stefano@Aula.it';
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

// Google a volte non dice l'email del proprietario: resta operatore lo stesso
ok(prop.PROPRIETARIO === 'stefano@aula.it', 'il proprietario si ricorda nelle proprietà dello script (minuscolo)');
emailSessione = '';
vm.runInContext('_custode = null;', ctx);
const io1 = chiama('stefano@aula.it', 'io');
ok(io1.ok && io1.dati.ruolo === 'admin', 'anche quando Google non dice chi è il proprietario, resta operatore');
emailSessione = 'stefano@aula.it';

// ---- cache del contenuto dei file: sempre coerente con Drive ----
{
  const nuovaEsecuzione = () => vm.runInContext('_custode = null;', ctx);
  const A = () => vm.runInContext('archivioDrive_()', ctx);
  nuovaEsecuzione();
  A().scriviJSON('_config/prova.json', { a: 1 });
  nuovaEsecuzione();
  ok(A().leggiJSON('_config/prova.json').a === 1, 'cache: si rilegge quello appena scritto');
  A().scriviJSON('_config/prova.json', { a: 2 });
  nuovaEsecuzione();
  ok(A().leggiJSON('_config/prova.json').a === 2, 'cache: dopo una scrittura si legge il nuovo, mai il vecchio');
  const grande = { testo: 'x'.repeat(350000) };
  A().scriviJSON('Dati/grande.json', grande);
  nuovaEsecuzione();
  ok(A().leggiJSON('Dati/grande.json').testo.length === 350000, 'cache: un file da 350 KB si tiene in pezzi e si ricompone');
  ok(A().leggiJSON('_config/manca.json') === null && !A().esiste('_config/manca.json'), 'cache: un file assente resta assente');
  A().scriviJSON('_config/manca.json', { c: 3 });
  nuovaEsecuzione();
  ok(A().esiste('_config/manca.json') && A().leggiJSON('_config/manca.json').c === 3, 'cache: appena creato non risulta più assente');
  // Google svuota la cache quando vuole: si torna a Drive
  Object.keys(cache).filter((k) => k.startsWith('c:')).forEach((k) => delete cache[k]);
  nuovaEsecuzione();
  ok(A().leggiJSON('_config/prova.json').a === 2 && A().leggiJSON('Dati/grande.json').testo.length === 350000, 'cache svuotata: si rilegge da Drive');
  // un pezzo perso non fa leggere un file a metà
  A().scriviJSON('Dati/grande.json', { testo: 'y'.repeat(350000) });
  const pezzo = Object.keys(cache).find((k) => /^c:.*:1$/.test(k) && cache[k].startsWith('y'));
  delete cache[pezzo];
  nuovaEsecuzione();
  ok(A().leggiJSON('Dati/grande.json').testo === 'y'.repeat(350000), 'un pezzo perso: si legge da Drive, mai mezzo file');
  // mentre un'altra persona salva (lucchetto occupato) una lettura da Drive non entra in cache:
  // potrebbe essere la versione appena superata
  Object.keys(cache).filter((k) => k.startsWith('c')).forEach((k) => delete cache[k]);
  lucchettoAltrui = true; nuovaEsecuzione();
  ok(A().leggiJSON('_config/prova.json').a === 2, 'lucchetto occupato: si legge da Drive');
  ok(!Object.keys(cache).some((k) => /^c[^:]*:/.test(k)), 'lucchetto occupato: niente in cache');
  lucchettoAltrui = false; nuovaEsecuzione();
  A().leggiJSON('_config/prova.json');
  ok(Object.keys(cache).some((k) => /^c[^:]*:/.test(k)), 'lucchetto libero: la lettura entra in cache');
  ok(typeof ctx.attivaRisveglio === 'function' && typeof ctx.risveglio === 'function', 'risveglio facoltativo disponibile');
  // un file cambiato a mano su Drive: dopo svuotaCache si legge quello
  const f = Object.values(tutti).find((x) => x._tipo === 'file' && x._nome === 'prova.json');
  f._testo = JSON.stringify({ a: 99 });
  nuovaEsecuzione();
  ok(A().leggiJSON('_config/prova.json').a === 2, 'cambio a mano su Drive: per ora resta la copia in cache');
  ctx.svuotaCache(); nuovaEsecuzione();
  ok(A().leggiJSON('_config/prova.json').a === 99, 'dopo svuotaCache si legge da Drive');
}

// ---- corsia rapida: lo stato in cache ----
{
  const nuovaEsecuzione = () => vm.runInContext('_custode = null;', ctx);
  nuovaEsecuzione();
  const prima = chiama('stefano@aula.it', 'sync', { cursori: {} }).dati;
  nuovaEsecuzione();
  lettureDrive = 0;
  const q = chiama('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta });
  ok(q.ok && q.dati.uguale === true && lettureDrive === 0, 'sync a riposo in un\'esecuzione nuova: zero letture da Drive [' + lettureDrive + ']');
  ok(typeof q.ms === 'number', 'la risposta porta «ms»');
  lettureDrive = 0;
  nuovaEsecuzione();
  ok(chiama('stefano@aula.it', 'io').dati.cfg.kid === 'kx' && lettureDrive === 0, 'anche il profilo («io») senza leggere file');
  // una scrittura: la voce si rifà e l'altro vede la novità, poi di nuovo a riposo
  const inv = chiama('stefano@aula.it', 'sync', { invii: [{ id: 'nz1', tipo: 'nota', ambito: 'aula', versioneBase: 0, busta: b }] });
  ok(inv.ok && inv.dati.esiti[0].ok, 'invio dopo la corsia rapida');
  nuovaEsecuzione(); lettureDrive = 0;
  const q2 = chiama('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta }).dati;
  ok(q2.voci.some((v) => v.id === 'nz1') && q2.rev === inv.dati.rev, 'la novità arriva (mai «niente di nuovo»)');
  nuovaEsecuzione(); lettureDrive = 0;
  ok(chiama('stefano@aula.it', 'sync', { cursori: q2.cursori, impronta: q2.impronta }).dati.uguale === true && lettureDrive === 0, 'e poi di nuovo zero letture');
  // svuotaCache: tutto si rilegge da Drive e poi si rifà la voce
  ctx.svuotaCache(); nuovaEsecuzione(); lettureDrive = 0;
  const q3 = chiama('stefano@aula.it', 'sync', { cursori: q2.cursori, impronta: q2.impronta }).dati;
  ok(q3.uguale === true && lettureDrive > 0, 'dopo svuotaCache si rilegge da Drive (' + lettureDrive + ' letture)');
  nuovaEsecuzione(); lettureDrive = 0;
  chiama('stefano@aula.it', 'sync', { cursori: q2.cursori, impronta: q2.impronta });
  ok(lettureDrive === 0, 'e subito dopo è di nuovo veloce');
  // cache che scade da sola
  Object.keys(cache).filter((k) => /^q/.test(k)).forEach((k) => delete cache[k]);
  nuovaEsecuzione(); lettureDrive = 0;
  ok(chiama('stefano@aula.it', 'sync', { cursori: q2.cursori, impronta: q2.impronta }).dati.uguale === true && Object.keys(cache).some((k) => /^q/.test(k)), 'voce scaduta: risposta giusta e la voce si rifà');
  // mentre un'altra persona scrive (lucchetto occupato) non si rifà la voce da una lettura che potrebbe essere vecchia
  Object.keys(cache).filter((k) => /^q/.test(k)).forEach((k) => delete cache[k]);
  lucchettoAltrui = true; nuovaEsecuzione();
  ok(chiama('stefano@aula.it', 'sync', { cursori: q2.cursori, impronta: q2.impronta }).dati.uguale === true, 'lucchetto occupato: risposta giusta dai file');
  ok(!Object.keys(cache).some((k) => /^q/.test(k)), 'lucchetto occupato: lo stato non entra in cache');
  lucchettoAltrui = false;
  // il risveglio tiene pronta la voce
  nuovaEsecuzione(); ctx.risveglio(); nuovaEsecuzione(); lettureDrive = 0;
  chiama('stefano@aula.it', 'sync', { cursori: q2.cursori, impronta: q2.impronta });
  ok(Object.keys(cache).some((k) => /^q/.test(k)) && lettureDrive === 0, 'il risveglio rifà lo stato in cache (se l\'ora è di lavoro)');
  // valori grandi: si spezzano e si ricompongono; un pezzo perso = voce assente
  nuovaEsecuzione();
  const cs = vm.runInContext('cacheStato_()', ctx);
  const grande = '{"x":"' + 'z'.repeat(250000) + '"}';
  cs.put('prova', grande, 60);
  ok(cs.get('prova') === grande, 'cache dello stato: un valore da 250 KB si spezza e si ricompone');
  const pz = Object.keys(cache).find((k) => /^q[^:]*:prova:/.test(k));
  delete cache[pz];
  ok(cs.get('prova') === null, 'cache dello stato: un pezzo perso vale come voce assente');
  let rifiutato = false; try { cs.put('enorme', 'y'.repeat(1000000), 60); } catch (e) { rifiutato = true; }
  ok(rifiutato, 'cache dello stato: oltre ~900 KB non si tiene (si leggono i file)');
  cs.remove('prova');
  ok(cs.get('prova') === null, 'cache dello stato: remove');
}

// ---- quante operazioni Drive costa un salvataggio (ciascuna: 0,3-1,5 s su Apps Script) ----
{
  const nuovaEsecuzione = () => vm.runInContext('_custode = null;', ctx);
  const E = 'stefano@aula.it', E2 = 'elena@aula.it';
  const unica = (i) => Object.assign({}, b, { iv: 'AAAAAAAAAAAA' + String(i).padStart(4, '0') });
  const v = (id, tipo, ambito, ver, i) => ({ id, tipo, ambito, versioneBase: ver, busta: unica(i) });
  const salva = (invii, chi = E) => { nuovaEsecuzione(); azzeraOp(); return chiama(chi, 'sync', { invii }); };
  chiama(E, 'accessi.salva', { accessi: { utenti: { [E2]: { nome: 'Elena', ruolo: 'admin' } } }, versioneBase: 0 });
  nuovaEsecuzione(); chiama(E, 'sync', { cursori: {} });   // una richiesta di lettura prima, come fa l'app: la cache dello stato è calda
  const MAX_NUOVO = 10, MAX_NORMALE = 6, MAX_RAFFICA = 2;
  let ver = 0, i = 0;

  // voce nuova in un ambito che c'è già: il file dell'ambito e stato.json (l'indice)
  let r = salva([v('sg1', 'seduta', 'aula', 0, ++i)]); ver = 1;
  ok(r.ok && r.dati.esiti[0].ok && totaleOp() <= 4, 'voce nuova: al massimo 4 operazioni Drive [' + tipiOp() + ']');
  // la prima modifica crea il file della storia (una volta sola nella vita dell'ambito)
  r = salva([v('sg1', 'seduta', 'aula', ver++, ++i)]);
  ok(r.dati.esiti[0].ok, 'prima modifica (crea il file della storia)');
  // un'altra persona modifica: si archivia la versione di Stefano: dati + storia, stato.json no
  r = salva([v('sg1', 'seduta', 'aula', ver++, ++i)], E2);
  ok(r.dati.esiti[0].ok && totaleOp() <= MAX_NORMALE && !op.isTrashed, 'salvataggio normale: al massimo ' + MAX_NORMALE + ' operazioni Drive [' + tipiOp() + ']');
  ok(op.setContent === 2 && op.leggi === undefined && op.getFilesByName === undefined && op.getFoldersByName === undefined, 'normale: due scritture, nessuna lettura né ricerca per nome [' + tipiOp() + ']');
  ok(r.fasi && r.fasi.ops && r.fasi.ops.setContent && r.fasi.ops.setContent[0] === 2 && r.fasi.ops.getFileById[0] === 2 && r.fasi.nScritture === 2, 'la risposta dice le operazioni Drive per tipo e il loro tempo');
  // la raffica: due operazioni, il file dei dati
  r = salva([v('sg1', 'seduta', 'aula', ver++, ++i)], E2);   // (il secondo di Elena archivia ancora: la versione precedente era di Stefano)
  ok(r.dati.esiti[0].ok, 'ancora una modifica di Elena');
  for (let k = 0; k < 3; k++) {
    r = salva([v('sg1', 'seduta', 'aula', ver++, ++i)], E2);
    ok(r.dati.esiti[0].ok && totaleOp() <= MAX_RAFFICA, 'raffica #' + (k + 1) + ': al massimo ' + MAX_RAFFICA + ' operazioni Drive [' + tipiOp() + ']');
  }
  ok(op.getFileById === 1 && op.setContent === 1 && r.fasi.nLetture <= 1, 'raffica: un getFileById e un setContent');
  // lo stato visto da un altro dispositivo è giusto (stato.json su Drive è in ritardo di proposito)
  nuovaEsecuzione();
  const dopo = chiama(E, 'sync', { cursori: {} }).dati;
  ok(dopo.rev === r.dati.rev && dopo.voci.some((x) => x.id === 'sg1' && x.version === ver), 'la raffica arriva intera a chi chiede dopo');
  // con tutta la cache svuotata (Google lo fa quando vuole)
  Object.keys(cache).forEach((k) => delete cache[k]);
  r = salva([v('sg1', 'seduta', 'aula', ver++, ++i)], E2);
  ok(r.dati.esiti[0].ok && r.dati.rev === dopo.rev + 1, 'cache svuotata del tutto: il salvataggio riparte e la revisione non torna indietro');
  r = salva([v('sg1', 'seduta', 'aula', ver++, ++i)], E2);
  ok(r.dati.esiti[0].ok && totaleOp() <= MAX_RAFFICA, 'e subito dopo si torna a ' + MAX_RAFFICA + ' operazioni [' + tipiOp() + ']');

  // paziente nuovo: registro, ambito aula, file del paziente (nuovo) e stato.json
  r = salva([v('rnuovo1', 'ragazzo', 'aula', 0, ++i), v('rnuovo1sc', 'scheda', 'r:rnuovo1', 0, ++i)]);
  ok(r.dati.esiti.every((e) => e.ok) && totaleOp() <= MAX_NUOVO, 'paziente nuovo: al massimo ' + MAX_NUOVO + ' operazioni Drive [' + tipiOp() + ']');
  // la sua scheda (riservata a Stefano): la prima modifica crea il file della storia del paziente (una volta sola)
  r = salva([v('rnuovo1sc', 'scheda', 'r:rnuovo1', 1, ++i)]);
  ok(r.dati.esiti[0].ok && totaleOp() <= 8, 'prima modifica della scheda (crea la storia del paziente): al massimo 8 operazioni [' + tipiOp() + ']');
  r = salva([v('rnuovo1sc', 'scheda', 'r:rnuovo1', 2, ++i)]);
  ok(r.dati.esiti[0].ok && totaleOp() <= MAX_RAFFICA, 'modifica successiva della scheda (raffica): al massimo ' + MAX_RAFFICA + ' operazioni [' + tipiOp() + ']');
  // un controllo a riposo non tocca Drive
  nuovaEsecuzione();
  const cur = chiama(E, 'sync', { cursori: {} }).dati;
  nuovaEsecuzione(); azzeraOp();
  const q = chiama(E, 'sync', { cursori: cur.cursori, impronta: cur.impronta });
  ok(q.dati.uguale && totaleOp() === 0 && q.fasi && q.fasi.nCache >= 1, 'controllo a riposo: zero operazioni Drive, e dice quante volte ha usato la cache');
}

console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
