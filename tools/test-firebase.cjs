#!/usr/bin/env node
/**
 * Prova della corsia veloce con gli emulatori di Firebase (Firestore + Auth): regole, custode e client veri.
 * Non gira dentro `npm test` perché richiede Java e le librerie di Firebase: si lancia con
 *
 *   sh tools/test-firebase.sh
 *
 * che avvia gli emulatori e passa di qui (vedi docs/firebase.md, «Provare tutto in locale»). Nessuna chiamata al
 * progetto vero: il custode scrive la copia degli accessi nell'emulatore e i client si collegano solo a lui.
 *
 * Cosa dimostra, con il custode VERO (core.js) che scrive la copia degli accessi nell'emulatore:
 *  - per ogni persona (ruolo, ambiti, assegnazioni, «tutti», orfani, attiva/scaduta) le richieste di veloce.js ricevono
 *    ESATTAMENTE le voci che il custode farebbe vedere con `sync`;
 *  - per ogni persona, ambito e tipo di voce, le regole lasciano scrivere ESATTAMENTE quello che il custode lascerebbe
 *    scrivere (nuove voci, modifiche, eliminazioni; tirocinanti: solo ciò che è loro);
 *  - nessun client scrive la copia degli accessi; il custode la aggiorna a ogni cambio;
 *  - la richiesta della chiave è solo a proprio nome e la consegna la legge solo il richiedente.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { creaLocale, firestoreEmulatore } = require('./custode-locale.cjs');

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const PROGETTO = process.env.GCLOUD_PROJECT || 'demo-psydiary';
if (!/^demo-/.test(PROGETTO)) { console.error('Solo progetti «demo-…» (emulatori): ' + PROGETTO); process.exit(2); }
const PROP = 'stefano@aula.test';

const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const sdk = { app: require('firebase/app'), auth: require('firebase/auth'), firestore: require('firebase/firestore') };
sdk.firestore.setLogLevel('silent');   // i rifiuti delle regole sono attesi: niente rumore

let passati = 0; const fallimenti = [];
async function prova(nome, fn) {
  try { await fn(); passati++; console.log('  ok  ' + nome); }
  catch (e) { fallimenti.push(nome); console.log('  NO  ' + nome + '\n      ' + (e && e.stack || e)); }
}
const negato = (e) => /permission-denied|PERMISSION_DENIED|insufficient/i.test(String(e && (e.code || e.message)));
const nega = async (p, nome) => {
  try { await p; } catch (e) { if (negato(e)) return; throw e; }
  throw new Error('atteso permission-denied: ' + nome);
};
const permetti = async (p, nome) => { try { await p; } catch (e) { throw new Error('atteso permesso: ' + nome + ' → ' + (e && e.code || e)); } };

// ---------------------------------------------------------------- custode con copia su emulatore
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-fb-'));
const emu = firestoreEmulatore(HOST, PROGETTO);
const custode = creaLocale(dir, { proprietario: PROP, specchio: emu });
const chiama = (email, azione, dati) => custode.gestisci({ v: 1, token: 'dev:' + email + '|' + email.split('@')[0], azione, dati });
const ok = (r) => { assert.ok(r.ok, `atteso ok, ricevuto ${r.errore}: ${r.messaggio}`); return r.dati; };
const busta = () => ({ v: 1, alg: 'A256GCM', kid: 'kprova', iv: 'AAAAAAAAAAAAAAAA', comp: 'no', dati: 'AAAA' });
const cifratura = { kid: 'kprova', kdf: { nome: 'PBKDF2-SHA256', iterazioni: 600000, sale: 'AAAAAAAAAAAAAAAAAAAAAA==' }, verifica: busta() };
const giorno = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const E = { elena: 'elena@aula.test', lara: 'lara@aula.test', giulia: 'giulia@aula.test', marco: 'marco@aula.test', sara: 'sara@aula.test',
  orf: 'orfano@aula.test', off: 'off@aula.test', vecchio: 'vecchio@aula.test', futuro: 'futuro@aula.test', ignoto: 'ignoto@aula.test' };
const TUTTI = [PROP, ...Object.values(E)];
// voci create dal test: id → { tipo, ambito, creatoDa }  (per riempire Firestore come se qualcuno le avesse salvate)
const voci = {};
let contatore = 0;
const nuovoId = (p) => p + String(++contatore).padStart(4, '0');
function invia(email, lista) {
  const r = chiama(email, 'sync', { invii: lista.map((v) => ({ id: v.id, tipo: v.tipo, ambito: v.ambito, versioneBase: v.base || 0, busta: v.eliminato ? undefined : busta(), eliminato: v.eliminato || undefined })) });
  assert.ok(r.ok, r.errore + ' ' + r.messaggio);
  r.dati.esiti.forEach((e, i) => { if (e.ok && !lista[i].eliminato && !voci[e.id]) voci[e.id] = { tipo: lista[i].tipo, ambito: lista[i].ambito, creatoDa: email, v: e.version }; });
  return r.dati;
}
const crea = (email, id, tipo, ambito) => { const d = invia(email, [{ id, tipo, ambito }]); assert.ok(d.esiti[0].ok, `${email} crea ${id}: ${d.esiti[0].errore}`); };

async function main() {
  const V = await import(pathToFileURL(path.join(__dirname, '../src/lib/centro/veloce.js')).href);
  console.log('\nPreparazione: regole, custode, accessi, voci');
  const env = await initializeTestEnvironment({ projectId: PROGETTO, firestore: { host: HOST.split(':')[0], port: Number(HOST.split(':')[1]), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
  await env.clearFirestore();
  ok(chiama(PROP, 'cifratura.imposta', { cifratura }));
  ok(chiama(PROP, 'accessi.salva', { versioneBase: 0, accessi: { utenti: {
    [E.elena]: { nome: 'Elena', ruolo: 'admin' }, [E.lara]: { nome: 'Lara', ruolo: 'admin' }, [E.orf]: { nome: 'Orfano', ruolo: 'admin' },
    [E.giulia]: { nome: 'Giulia', ruolo: 'tirocinante', ragazzi: ['rluca01'] },
    [E.marco]: { nome: 'Marco', ruolo: 'tirocinante', ragazzi: [] }, [E.sara]: { nome: 'Sara', ruolo: 'tirocinante', ragazzi: [] },
    [E.off]: { nome: 'Off', ruolo: 'tirocinante', ragazzi: [], attivo: false },
    [E.vecchio]: { nome: 'Vecchio', ruolo: 'tirocinante', ragazzi: [], scadenza: giorno(-3) },
    [E.futuro]: { nome: 'Futuro', ruolo: 'tirocinante', ragazzi: ['rluca01'], scadenza: giorno(3) },
  } } }));
  crea(PROP, 'gmart', 'gruppo', 'aula'); crea(PROP, 'sgr1', 'seduta', 'aula'); crea(PROP, 'ngr1', 'nota', 'aula');
  crea(PROP, 'rluca01', 'ragazzo', 'r:rluca01'); crea(PROP, 'rluca01sc', 'scheda', 'r:rluca01'); crea(PROP, 'nluca', 'nota', 'r:rluca01');
  crea(E.elena, 'rel1', 'ragazzo', 'r:rel1'); crea(E.elena, 'rel1sc', 'scheda', 'r:rel1');
  crea(E.elena, 'rcond', 'ragazzo', 'r:rcond'); crea(E.elena, 'rcondsc', 'scheda', 'r:rcond');
  crea(E.elena, 'rtutti', 'scheda', 'r:rtutti'); crea(E.elena, 'rleg', 'scheda', 'r:rleg');
  crea(E.lara, 'gres', 'gruppo', 'g:gres'); crea(E.lara, 'sres', 'seduta', 'g:gres'); crea(E.lara, 'pres', 'programma', 'p:pres');
  crea(E.orf, 'rorf', 'scheda', 'r:rorf'); crea(E.orf, 'gorf', 'gruppo', 'g:gorf');
  ok(chiama(E.elena, 'paziente.condivisione', { id: 'rcond', condivisi: [E.lara], tutti: false }));
  ok(chiama(E.elena, 'paziente.condivisione', { id: 'rtutti', condivisi: [], tutti: true }));
  const a0 = ok(chiama(PROP, 'accessi.leggi')); a0.utenti[E.marco].tuttiRagazzi = true;
  ok(chiama(E.elena, 'accessi.salva', { accessi: a0, versioneBase: a0.version }));
  const reg = JSON.parse(fs.readFileSync(path.join(dir, '_config/pazienti.json'), 'utf8')); delete reg.pazienti.rleg;   // «di prima»: nessuna riga nel registro
  fs.writeFileSync(path.join(dir, '_config/pazienti.json'), JSON.stringify(reg)); custode.cache.scadi();
  const o = ok(chiama(PROP, 'accessi.leggi')); a0.version = o.version;
  const a1 = ok(chiama(PROP, 'accessi.leggi')); a1.utenti[E.orf].attivo = false;
  ok(chiama(PROP, 'accessi.salva', { accessi: a1, versioneBase: a1.version }));   // i pazienti di Orfano restano orfani: li vede il proprietario
  ok(chiama(E.elena, 'sync', {}));   // un giro qualunque: la copia è aggiornata

  // ---- Firestore riempito come se ogni voce fosse stata salvata (senza regole)
  async function semina(id, v) {
    await env.withSecurityRulesDisabled(async (c) => {
      const comuni = { id, tipo: v.tipo, ambito: v.ambito, eliminato: false, v: v.v || 1, da: v.creatoDa, ts: new Date(), scade: new Date(Date.now() + 86400000), creatoDa: v.creatoDa };
      await c.firestore().doc('modifiche/' + id).set({ ...comuni, disp: 'altro' });
      await c.firestore().doc('buste/' + id).set({ ...comuni, busta: { v: 1, dati: 'x' } });
    });
  }
  for (const [id, v] of Object.entries(voci)) await semina(id, v);

  // ---- client veri
  const cfg = { apiKey: 'demo', authDomain: 'localhost', projectId: PROGETTO, appId: 'demo', emulatore: { firestore: HOST, auth: 'http://' + AUTH } };
  let n = 0;
  async function cliente(email) {
    const b = V.creaBackendFirebase(sdk, cfg, { nome: 'c' + (++n), persistenza: 'memoria' });
    await b.inizializza();
    await b.accedi(JSON.stringify({ sub: 'u-' + email, email, email_verified: true }));
    return b;
  }
  const raccogli = (b, spec) => new Promise((ok2, ko) => {
    const visti = new Set(); let annulla;
    annulla = b.ascolta(spec, (cambi) => { cambi.forEach((x) => visti.add(x.id)); setTimeout(() => { annulla && annulla(); ok2(visti); }, 60); }, (e) => ko(e));
  });
  const vistaDi = (email) => { const r = chiama(email, 'sync', {}); return r.ok ? r.dati : null; };
  const idVisibili = (d) => new Set(d.voci.filter((v) => !v.eliminato).map((v) => v.id));

  console.log('\nChi vede cosa: le richieste del client contro il custode');
  for (const [nome, email] of Object.entries({ proprietario: PROP, ...Object.fromEntries(Object.entries(E).filter(([k]) => !['off', 'vecchio', 'ignoto', 'orf'].includes(k))) })) {
    await prova(`${nome}: riceve esattamente le voci che il custode gli fa vedere`, async () => {
      const d = vistaDi(email), atteso = idVisibili(d);
      const b = await cliente(email);
      const piano = V.pianoAscolto({ ambiti: d.ambiti });
      const visti = new Set();
      for (const spec of piano) (await raccogli(b, spec)).forEach((x) => visti.add(x));
      assert.deepStrictEqual([...visti].sort(), [...atteso].sort());
      // e le voci che il custode non fa vedere sono negate anche una per una
      for (const id of Object.keys(voci).filter((x) => !atteso.has(x))) {
        await nega(b.leggi('buste', id), nome + ' legge ' + id);
        await nega(b.leggi('modifiche', id), nome + ' legge modifiche ' + id);
      }
      for (const id of atteso) assert.ok(await b.leggi('buste', id), 'busta di ' + id);
    });
  }
  await prova('Elena: non vede i riservati di Lara né quelli di Luca (del proprietario); vede quello di prima e quello «di tutti»', async () => {
    const d = vistaDi(E.elena); const a = d.ambiti.sort();
    assert.deepStrictEqual(a.filter((x) => x !== 'aula'), ['r:rcond', 'r:rel1', 'r:rleg', 'r:rtutti']);
  });
  await prova('Marco (tutti i pazienti di Elena) vede come Elena i pazienti; Giulia solo quello assegnato; Sara niente di personale', async () => {
    const ambitiPersonali = (e) => vistaDi(e).ambiti.filter((x) => x !== 'aula').sort();
    assert.deepStrictEqual(ambitiPersonali(E.marco), ['r:rcond', 'r:rel1', 'r:rleg', 'r:rtutti']);
    assert.deepStrictEqual(ambitiPersonali(E.giulia), ['r:rluca01']); assert.deepStrictEqual(ambitiPersonali(E.sara), []);
  });
  await prova('il proprietario vede gli orfani (di un operatore disattivato) e i suoi, non i riservati degli altri', async () => {
    const a = vistaDi(PROP).ambiti.filter((x) => x !== 'aula').sort();
    assert.ok(a.includes('r:rorf') && a.includes('g:gorf') && a.includes('r:rluca01'));
    assert.ok(!a.includes('r:rel1') && !a.includes('g:gres') && !a.includes('p:pres'));
    const b = await cliente(PROP);
    await nega(b.leggi('buste', 'rel1sc'), 'proprietario legge rel1sc'); await nega(b.leggi('buste', 'sres'), 'proprietario legge sres');
    assert.ok(await b.leggi('buste', 'rorf'));
  });
  for (const [nome, email] of [['disattivato', E.off], ['disattivato (operatore con pazienti orfani)', E.orf], ['scaduto', E.vecchio], ['sconosciuto', E.ignoto]]) {
    await prova(`${nome}: non legge niente (nemmeno l'aula) e non scrive`, async () => {
      assert.strictEqual(vistaDi(email), null, 'il custode lo rifiuta');
      const b = await cliente(email);
      await nega(raccogli(b, { coll: 'modifiche', filtri: [['ambito', '==', 'aula']] }), nome + ' aula');
      await nega(b.leggi('buste', 'sgr1'), nome + ' busta');
      const m = V.costruisciModifica({ id: 'sgr1', tipo: 'seduta', ambito: 'aula', version: 9, email, disp: 'x', busta: { v: 1 }, adesso: Date.now() });
      await nega(b.pubblicaModifica(m.meta, m.busta), nome + ' scrive');
    });
  }
  await prova('una richiesta più larga di quanto le regole garantiscono è negata per intero (le regole non sono filtri)', async () => {
    const b = await cliente(E.giulia);
    await nega(raccogli(b, { coll: 'modifiche', filtri: [['ambito', '==', 'r:rel1']] }), 'ambito altrui');
    await nega(raccogli(b, { coll: 'modifiche', filtri: [['ambito', 'in', ['r:rluca01', 'r:rel1']]] }), 'un gruppo con un ambito non suo');
    await nega(raccogli(b, { coll: 'modifiche', filtri: [] }), 'tutta la raccolta');
    await nega(raccogli(b, { coll: 'buste', filtri: [['tipo', '==', 'nota']] }), 'per tipo');
    assert.ok((await raccogli(b, { coll: 'modifiche', filtri: [['ambito', 'in', ['r:rluca01']]] })).has('nluca'));
    assert.ok((await raccogli(b, { coll: 'modifiche', filtri: [['ambito', '==', 'aula']] })).has('sgr1'));
  });
  await prova('un operatore non vede i riservati altrui (Lara non vede quello di Elena), nemmeno con tutto l\'aula', async () => {
    const b = await cliente(E.lara);
    await nega(b.leggi('buste', 'rel1sc'), 'Lara legge rel1sc');
    assert.ok(await b.leggi('buste', 'rcondsc'), 'quello condiviso sì');
  });

  console.log('\nScrivere: le regole fanno quello che fa il custode');
  const pub = (b, email, id, o) => {
    const m = V.costruisciModifica({ id, tipo: 'nota', ambito: 'aula', version: 40, email, disp: 'd1', busta: { v: 1, kid: 'kprova', dati: 'AAAA' }, creatoDa: email, adesso: Date.now(), ...(o || {}) });
    return b.pubblicaModifica(m.meta, m.busta);
  };
  const esito = async (p) => { try { await p; return true; } catch (e) { if (negato(e)) return false; throw e; } };
  const clienti = {};
  const di = async (email) => clienti[email] || (clienti[email] = await cliente(email));
  const AMBITI = ['aula', 'r:rluca01', 'r:rel1', 'r:rcond', 'r:rtutti', 'r:rleg', 'g:gres', 'p:pres'];
  const TIPI = ['nota', 'seduta', 'sospeso', 'ragazzo', 'scheda', 'gruppo', 'serie', 'programma'];
  await prova('NUOVE voci: per ogni persona, ambito e tipo il custode e le regole dicono la stessa cosa', async () => {
    const diversi = [];
    let confrontate = 0, permesse = 0;
    for (const email of [PROP, E.elena, E.lara, E.giulia, E.marco, E.sara, E.futuro, E.off, E.vecchio, E.ignoto]) {
      const b = await di(email);
      for (const ambito of AMBITI) {
        for (const tipo of TIPI) {
          const id = nuovoId('w');
          const r = chiama(email, 'sync', { invii: [{ id, tipo, ambito, versioneBase: 0, busta: busta() }] });
          const custodeOk = !!(r.ok && r.dati.esiti[0].ok);
          if (custodeOk) voci[id] = { tipo, ambito, creatoDa: email, v: 1 };
          const regoleOk = await esito(pub(b, email, id, { tipo, ambito, version: 1 }));
          confrontate++; if (custodeOk) permesse++;
          if (custodeOk !== regoleOk) diversi.push(`${email} ${tipo} in ${ambito}: custode ${custodeOk ? 'sì' : 'no'}, regole ${regoleOk ? 'sì' : 'no'}`);
        }
      }
    }
    assert.deepStrictEqual(diversi, [], 'differenze:\n' + diversi.join('\n'));
    assert.ok(confrontate >= 600 && permesse > 60 && permesse < confrontate - 60, `confronti ${confrontate}, permessi ${permesse}`);
    console.log(`      (${confrontate} confronti, ${permesse} consentiti dal custode e dalle regole)`);
  });
  await prova('VOCI ESISTENTI: modificare ed eliminare — tirocinanti solo ciò che è loro (note), per ogni persona', async () => {
    const diversi = [];
    let confrontate = 0, permesse = 0;
    const scenari = [['nota', PROP], ['nota', E.giulia], ['seduta', PROP], ['seduta', E.giulia], ['sospeso', PROP], ['sospeso', E.giulia]];
    for (const email of [PROP, E.elena, E.giulia, E.futuro, E.sara, E.marco]) {
      const b = await di(email);
      for (const [tipo, creatore] of scenari) {
        for (const op of ['modifica', 'elimina']) {
          const id = nuovoId('e');
          crea(creatore, id, tipo, 'r:rluca01'); await semina(id, voci[id]);
          const eliminato = op === 'elimina';
          const r = chiama(email, 'sync', { invii: [{ id, tipo, ambito: 'r:rluca01', versioneBase: 1, busta: eliminato ? undefined : busta(), eliminato: eliminato || undefined }] });
          const custodeOk = !!(r.ok && r.dati.esiti[0].ok);
          // come fa l'app: chi non è operatore e tocca una nota o toglie qualcosa dichiara se stesso come creatore
          const claim = (!(email === PROP || email === E.elena) && (tipo === 'nota' || eliminato)) ? email : voci[id].creatoDa;
          const regoleOk = await esito(pub(b, email, id, { tipo, ambito: 'r:rluca01', version: 2, eliminato, busta: eliminato ? null : { v: 1, dati: 'y' }, creatoDa: claim }));
          confrontate++; if (custodeOk) permesse++;
          if (custodeOk !== regoleOk) diversi.push(`${email} ${op} ${tipo} di ${creatore}: custode ${custodeOk ? 'sì' : 'no'}, regole ${regoleOk ? 'sì' : 'no'}`);
        }
      }
    }
    assert.deepStrictEqual(diversi, [], 'differenze:\n' + diversi.join('\n'));
    assert.ok(permesse > 15 && permesse < confrontate - 15, `confronti ${confrontate}, permessi ${permesse}`);
    console.log(`      (${confrontate} confronti, ${permesse} consentiti)`);
  });
  await prova('una voce che cambia ambito: serve vedere sia dove stava sia dove va; il tipo non cambia', async () => {
    const id = nuovoId('m'); crea(E.elena, id, 'nota', 'r:rel1'); await semina(id, voci[id]);
    const g = await di(E.giulia), e = await di(E.elena);
    await nega(pub(g, E.giulia, id, { ambito: 'r:rluca01', version: 2 }), 'Giulia sposta una voce che non vedeva');
    await permetti(pub(e, E.elena, id, { ambito: 'aula', version: 2 }), 'Elena sposta la sua nota nell\'aula');
    // ora sta nell'aula: Elena non può portarla dove non vede
    await nega(pub(e, E.elena, id, { ambito: 'r:rluca01', version: 3 }), 'verso un ambito non visibile');
    await nega(pub(e, E.elena, id, { tipo: 'seduta', ambito: 'aula', version: 3 }), 'il tipo non cambia');
  });
  await prova('forme sbagliate: autore falso, id diverso, tempo del client, scadenza lontana, campi extra, tipo o ambito inventati', async () => {
    const b = await di(E.elena);
    const m = V.costruisciModifica({ id: 'sgr1', tipo: 'seduta', ambito: 'aula', version: 50, email: E.elena, disp: 'd', busta: { v: 1 }, adesso: Date.now() });
    await permetti(b.pubblicaModifica(m.meta, m.busta), 'la forma giusta');
    const prova2 = (extra, nome) => nega(b.pubblicaModifica({ ...m.meta, ...extra }, { ...m.busta, ...(extra.disp ? {} : extra) }), nome);
    await nega(b.pubblicaModifica({ ...m.meta, da: E.lara }, { ...m.busta, da: E.lara }), 'a nome di altri');
    await nega(b.pubblicaModifica({ ...m.meta, id: 'altro1' }, m.busta), 'id diverso dal documento');
    await nega(b.pubblicaModifica({ ...m.meta, ts: { $ms: 5 } }, m.busta), 'ts del client');
    await nega(b.pubblicaModifica({ ...m.meta, scade: { $ms: Date.now() + 30 * 86400000 } }, m.busta), 'scadenza lontana');
    await nega(b.pubblicaModifica({ ...m.meta, extra: 1 }, m.busta), 'campo extra');
    await nega(b.pubblicaModifica({ ...m.meta, tipo: 'inventato' }, { ...m.busta, tipo: 'inventato' }), 'tipo inventato');
    await nega(b.pubblicaModifica({ ...m.meta, ambito: 'x:abc' }, { ...m.busta, ambito: 'x:abc' }), 'ambito inventato');
    await nega(b.pubblicaModifica({ ...m.meta, v: 0 }, { ...m.busta, v: 0 }), 'versione zero');
    await nega(b.pubblicaModifica(m.meta, { ...m.busta, busta: 'testo' }), 'busta che non è una mappa');
    void prova2;
  });
  await prova('nessuno elimina un documento: ci pensa il custode (pulizia)', async () => {
    const b = await di(E.elena), F = sdk.firestore;
    await nega(F.deleteDoc(F.doc(b._db(), 'modifiche', 'sgr1')), 'delete modifiche'); await nega(F.deleteDoc(F.doc(b._db(), 'buste', 'sgr1')), 'delete buste');
  });

  console.log('\nLa copia degli accessi');
  await prova('nessun client scrive o legge la copia (solo la propria persona legge il proprio documento)', async () => {
    const b = await cliente(E.elena), F = sdk.firestore, db = b._db();
    await nega(F.setDoc(F.doc(db, 'accessi', E.elena), { email: E.elena, attivo: true }), 'scrive accessi');
    await nega(F.setDoc(F.doc(db, 'accessi', E.ignoto), { email: E.ignoto, attivo: true }), 'crea accessi');
    await nega(F.deleteDoc(F.doc(db, 'accessi', E.elena)), 'cancella accessi');
    await nega(F.setDoc(F.doc(db, 'pazienti', 'x'), { aula: 'principale' }), 'raccolta inesistente');
    await nega(b.leggi('accessi', E.lara), 'legge accessi altrui');
    await nega(raccogli(b, { coll: 'accessi', filtri: [] }), 'elenca accessi');
    const mio = await b.leggi('accessi', E.elena);
    assert.strictEqual(mio.ruolo, 'admin'); assert.deepStrictEqual(mio.ambiti, vistaDi(E.elena).ambiti.filter((a) => a !== 'aula').sort());
  });
  await prova('la copia segue il custode: chi viene disattivato perde subito la lettura; un ambito nuovo si legge subito', async () => {
    const b = await cliente(E.futuro);
    assert.ok(await b.leggi('buste', 'sgr1'));
    const a = ok(chiama(PROP, 'accessi.leggi')); a.utenti[E.futuro].attivo = false;
    ok(chiama(PROP, 'accessi.salva', { accessi: a, versioneBase: a.version }));
    await nega(b.leggi('buste', 'sgr1'), 'disattivato');
    a.utenti[E.futuro].attivo = true;
    const v2 = ok(chiama(PROP, 'accessi.leggi')); v2.utenti[E.futuro].attivo = true;
    ok(chiama(PROP, 'accessi.salva', { accessi: v2, versioneBase: v2.version }));
    assert.ok(await b.leggi('buste', 'sgr1'), 'riabilitato');
    // un paziente condiviso con Giulia: da quel momento (stessa richiesta del custode) i suoi dati sono leggibili
    const gb = await cliente(E.giulia);
    await nega(gb.leggi('buste', 'rcondsc'), 'prima');
    ok(chiama(E.elena, 'paziente.condivisione', { id: 'rcond', condivisi: [E.lara, E.giulia], tutti: false }));
    assert.ok(await gb.leggi('buste', 'rcondsc'), 'dopo');
    ok(chiama(E.elena, 'paziente.condivisione', { id: 'rcond', condivisi: [E.lara], tutti: false }));
    await nega(gb.leggi('buste', 'rcondsc'), 'tolto di nuovo');
  });
  await prova('la scadenza è controllata con l\'ora del server anche senza che il custode intervenga', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await c.firestore().doc('accessi/' + E.futuro).update({ scadeIl: new Date(Date.now() - 1000) }); });
    await nega((await cliente(E.futuro)).leggi('buste', 'sgr1'), 'scadeIl passato');
    ok(chiama(PROP, 'sync', {})); custode.riallinea(true);
    assert.ok(await (await cliente(E.futuro)).leggi('buste', 'sgr1'), 'ripristinata dal custode');
  });
  await prova('pulizia: il custode cancella ciò che è scaduto', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await c.firestore().doc('modifiche/vecchia').set({ id: 'vecchia', scade: new Date(Date.now() - 1000) }); });
    const r = custode.riallinea(false);
    assert.ok(r.pulite >= 1, JSON.stringify(r));
    await env.withSecurityRulesDisabled(async (c) => { assert.ok(!(await c.firestore().doc('modifiche/vecchia').get()).exists); });
  });

  console.log('\nLa chiave dell\'aula');
  const richiesta = (email, extra) => ({ email, nome: 'Telefono', pubblica: 'QUJD', ts: V.ORA, scade: { $ms: Date.now() + 86400000 }, ...(extra || {}) });
  await prova('la richiesta si scrive solo a proprio nome e da chi è abilitato', async () => {
    const b = await cliente(E.giulia);
    await permetti(b.scrivi('richieste', 'disp11111111', richiesta(E.giulia)), 'la propria');
    await nega(b.scrivi('richieste', 'disp22222222', richiesta(E.elena)), 'a nome di altri');
    await nega(b.scrivi('richieste', 'disp33333333', richiesta(E.giulia, { aula: 'x' })), 'campi in più');
    await nega((await cliente(E.ignoto)).scrivi('richieste', 'disp44444444', richiesta(E.ignoto)), 'sconosciuto');
    await nega((await cliente(E.off)).scrivi('richieste', 'disp55555555', richiesta(E.off)), 'disattivato');
    await nega((await cliente(E.elena)).scrivi('richieste', 'disp11111111', richiesta(E.elena)), 'sovrascrive la richiesta di un altro');
    await nega(b.scrivi('richieste', 'disp66666666', richiesta(E.giulia, { scade: { $ms: Date.now() + 30 * 86400000 } })), 'scadenza lontana');
  });
  await prova('le richieste le vedono tutti gli operatori (e chi le ha fatte), non i tirocinanti', async () => {
    const q = { coll: 'richieste', filtri: [] };
    assert.ok((await raccogli(await cliente(E.elena), q)).has('disp11111111'));
    assert.ok((await raccogli(await cliente(PROP), q)).has('disp11111111'));
    await nega(raccogli(await cliente(E.sara), q), 'tirocinante');
    await nega(raccogli(await cliente(E.giulia), q), 'nemmeno chi ne ha una: l\'elenco è degli operatori');
    assert.ok(await (await cliente(E.giulia)).leggi('richieste', 'disp11111111'), 'la propria sì, una per una');
    await nega((await cliente(E.sara)).leggi('richieste', 'disp11111111'), 'quella di altri');
  });
  await prova('la consegna la scrive solo un operatore per una richiesta esistente di una persona abilitata; la legge solo il richiedente', async () => {
    const cons = (da, email) => ({ email, kid: 'kprova', busta: 'QUJD', da, ts: V.ORA, scade: { $ms: Date.now() + 86400000 } });
    await nega((await cliente(E.sara)).scrivi('consegne', 'disp11111111', cons(E.sara, E.giulia)), 'un tirocinante');
    await nega((await cliente(E.giulia)).scrivi('consegne', 'disp11111111', cons(E.giulia, E.giulia)), 'il richiedente si consegna da solo');
    await nega((await cliente(E.elena)).scrivi('consegne', 'disp99999999', cons(E.elena, E.giulia)), 'senza richiesta');
    await nega((await cliente(E.elena)).scrivi('consegne', 'disp11111111', cons(E.elena, E.sara)), 'a un\'altra persona');
    await nega((await cliente(E.elena)).scrivi('consegne', 'disp11111111', cons(E.lara, E.giulia)), 'a nome di un altro operatore');
    await permetti((await cliente(E.elena)).scrivi('consegne', 'disp11111111', cons(E.elena, E.giulia)), 'un operatore');
    const mia = { coll: 'consegne', filtri: [['email', '==', E.giulia]] };
    assert.ok((await raccogli(await cliente(E.giulia), mia)).has('disp11111111'));
    await nega(raccogli(await cliente(E.elena), mia), 'l\'operatore che l\'ha scritta non la rilegge');
    await nega((await cliente(E.sara)).leggi('consegne', 'disp11111111'), 'altri leggono');
    await nega((await cliente(E.elena)).leggi('consegne', 'disp11111111'), 'nemmeno l\'operatore');
    const b = await cliente(E.giulia);
    await b.elimina('consegne', 'disp11111111'); await b.elimina('richieste', 'disp11111111');
  });
  await prova('un operatore toglie la richiesta dopo averla soddisfatta; un tirocinante non quelle degli altri', async () => {
    await (await cliente(E.sara)).scrivi('richieste', 'disp77777777', richiesta(E.sara));
    await nega((await cliente(E.giulia)).elimina('richieste', 'disp77777777'), 'un altro tirocinante');
    await permetti((await cliente(E.lara)).elimina('richieste', 'disp77777777'), 'un operatore');
  });
  await prova('tutto il resto è chiuso', async () => {
    const b = await cliente(E.elena), F = sdk.firestore;
    await nega(F.setDoc(F.doc(b._db(), 'qualcosa', 'x'), { a: 1 }), 'raccolta inventata');
    await nega(F.getDoc(F.doc(b._db(), 'qualcosa', 'x')), 'lettura inventata');
  });

  await env.cleanup();
  console.log(`\n${passati} prove superate, ${fallimenti.length} fallite`);
  if (fallimenti.length) { console.log('Fallite:\n - ' + fallimenti.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
