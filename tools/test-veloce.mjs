#!/usr/bin/env node
/**
 * Test della corsia veloce senza rete né emulatori: la logica di src/lib/centro/veloce.js con un backend e una
 * sincronizzazione finti, e la copia degli accessi del custode (custode/core.js) confrontata con quello che il
 * custode stesso fa vedere (`sync`). Le regole vere si provano con gli emulatori: sh tools/test-firebase.sh
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as V from '../src/lib/centro/veloce.js';
const require = createRequire(import.meta.url);
const { creaLocale } = require('./custode-locale.cjs');

let passati = 0; const falliti = [];
async function prova(nome, fn) {
  try { await fn(); passati++; console.log('  ok  ' + nome); } catch (e) { falliti.push(nome); console.log('  NO  ' + nome + '\n      ' + (e && e.stack || e)); }
}
const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms || 5));

// ---------------------------------------------------------------- finti
function backendFinto() {
  const b = { docs: {}, ascolti: [], scritture: [], errore: null, _u: null, inizializzato: 0 };
  const guasto = () => { if (b.errore) throw b.errore; };
  return Object.assign(b, {
    inizializza: async () => { b.inizializzato++; },
    utente: () => b._u,
    accedi: async (t) => { guasto(); b._u = { email: JSON.parse(t).email }; return b._u; },
    esci: async () => { b._u = null; },
    scrivi: async (c, id, d) => { guasto(); b.docs[c + '/' + id] = d; b.scritture.push([c, id]); },
    elimina: async (c, id) => { delete b.docs[c + '/' + id]; },
    leggi: async (c, id) => { guasto(); return b.docs[c + '/' + id] || null; },
    pubblicaModifica: async (meta, busta) => { guasto(); b.docs['modifiche/' + meta.id] = meta; b.docs['buste/' + meta.id] = busta; b.scritture.push(['modifica', meta.id]); },
    ascolta: (spec, cb, ko) => { const a = { spec, cb, ko, chiuso: false }; b.ascolti.push(a); return () => { a.chiuso = true; }; },
    ascoltaDoc: (coll, id, cb, ko) => { const a = { spec: { coll, id }, doc: true, cb, ko, chiuso: false }; b.ascolti.push(a); return () => { a.chiuso = true; }; },
    attivi: () => b.ascolti.filter((a) => !a.chiuso),
    piano: () => b.ascolti.filter((a) => !a.chiuso && !a.doc && a.spec.coll === 'modifiche'),
  });
}
const IO = { email: 'ann@c.test', ruolo: 'admin', funzioni: ['veloce'], veloce: { progetto: 'p1' }, cifratura: true };
function syncFinto(opz) {
  const x = Object.assign({
    email: 'ann@c.test', fase: 'pronto', pronto: true, eOperatore: false, chiaveEsportabile: false, ambiti: ['aula'],
    io: IO, versioni: {}, applicati: [], token: JSON.stringify({ email: 'ann@c.test' }), manuale: false, abilitati: new Set(['lia@c.test']),
    chiaviRicevute: [], cifrate: [], abilitate: [], notifiche: 0, riallineamenti: 0,
  }, opz || {});
  return Object.assign(x, {
    contesto: () => ({ email: x.email, io: x.io, pronto: x.pronto, fase: x.fase, ambiti: x.ambiti, eOperatore: x.eOperatore, chiaveEsportabile: x.chiaveEsportabile, kid: 'k1', cfgChiave: true }),
    idToken: () => x.token, dispositivo: async () => ({ id: x.idDisp || 'dispaaaa1111', pubblica: 'QUJDREVG' }), nomeDispositivo: () => 'Prova',
    versioneLocale: async (id) => x.versioni[id] || { version: 0, ambito: null },
    applica: async (v) => { x.applicati.push(v); x.versioni[v.id] = { version: v.version, ambito: v.ambito }; return true; },
    chiaveRicevuta: async (busta, kid) => { x.chiaviRicevute.push({ busta, kid }); return kid === 'k1'; },
    cifraChiaveA: async (p) => { x.cifrate.push(p); return 'BUSTA-PER-' + p; },
    abilitaSuCustode: async (o) => { x.abilitate.push(o); }, personaAbilitata: async (e) => x.abilitati.has(e),
    riallinea: async () => { x.riallineamenti++; }, consegnaManuale: () => x.manuale, cambiato: () => { x.notifiche++; },
  });
}
let tempo = 1700000000000;
const nuovo = (opzSync, opzMot) => {
  const backend = backendFinto(), sync = syncFinto(opzSync), mem = {};
  const motore = V.creaMotore({ cfg: { projectId: 'p1', apiKey: 'k', appId: 'a' }, backend, sync, ora: () => tempo,
    memoria: { leggi: (k) => mem[k] || null, scrivi: (k, v) => { mem[k] = v; } }, ...(opzMot || {}) });
  backend.docs['accessi/ann@c.test'] = { attivo: true, ruolo: 'admin', ambiti: [] };
  return { backend, sync, motore, mem };
};
const rec = (id, version, extra) => ({ id, tipo: 'nota', ambito: 'aula', version, busta: { v: 1, dati: 'x' }, eliminato: false, ...(extra || {}) });

console.log('\nFunzioni pure');
await prova('configurata solo con apiKey, projectId e appId', () => {
  assert.ok(!V.configurata(undefined) && !V.configurata({}) && !V.configurata({ apiKey: '', projectId: '', appId: '' }));
  assert.ok(V.configurata({ apiKey: 'a', projectId: 'p', appId: 'x' }));
});
await prova('il codice di verifica è di 6 cifre, stabile e dipende dalla chiave pubblica', async () => {
  const a = await V.codiceVerifica('QUJDREVG'), b = await V.codiceVerifica('QUJDREVG'), c = await V.codiceVerifica('QUJDREVH');
  assert.ok(/^\d{6}$/.test(a)); assert.strictEqual(a, b); assert.notStrictEqual(a, c);
  assert.strictEqual(V.formatoCodice('012345'), '012 345');
});
await prova('piano: «aula» sempre; gli altri ambiti in gruppi da 30 con «ambito in»; ambiti malformati ignorati', () => {
  const ambiti = ['aula', 'x:no', ...Array.from({ length: 65 }, (_, i) => (['r:', 'g:', 'p:'][i % 3]) + 'a' + String(i).padStart(3, '0'))];
  const p = V.pianoAscolto({ ambiti });
  assert.deepStrictEqual(p[0].filtri, [['ambito', '==', 'aula']]);
  assert.deepStrictEqual(p.slice(1).map((s) => s.filtri[0][2].length), [30, 30, 5]);
  assert.ok(p.slice(1).every((s) => s.filtri.length === 1 && s.filtri[0][0] === 'ambito' && s.filtri[0][1] === 'in'));
  assert.strictEqual(new Set(p.map((s) => s.k)).size, p.length);
  assert.ok(!JSON.stringify(p).includes('x:no'));
  assert.deepStrictEqual(V.pianoAscolto({ ambiti: ['aula'] }).length, 1);
});
await prova('piano stabile: un ambito nuovo non rifà i gruppi già ascoltati; uno tolto rifà solo il suo gruppo', () => {
  const base = Array.from({ length: 60 }, (_, i) => 'r:a' + String(i).padStart(3, '0'));
  const p1 = V.pianoAscolto({ ambiti: ['aula', ...base] });
  const p2 = V.pianoAscolto({ ambiti: ['aula', ...base, 'r:nuovo1'] }, p1);
  assert.deepStrictEqual(p2.slice(0, 3).map((s) => s.k), p1.map((s) => s.k));
  assert.deepStrictEqual(p2[3].filtri[0][2], ['r:nuovo1']);
  const p3 = V.pianoAscolto({ ambiti: ['aula', ...base.slice(1), 'r:nuovo1'] }, p2);
  assert.ok(p3.some((s) => s.k === p2[2].k), 'il secondo gruppo non cambia');
  assert.ok(p3.some((s) => s.k === p2[3].k), 'neanche quello dell\'ambito nuovo');
  assert.ok(!p3.some((s) => s.k === p2[1].k), 'il primo gruppo (con l\'ambito tolto) si rifà');
  assert.ok(p3.flatMap((s) => s.filtri[0][1] === 'in' ? s.filtri[0][2] : []).every((a) => a !== base[0]));
});
await prova('troppi gruppi piccoli (ambiti nati uno a uno): si rifà tutto in gruppi pieni', () => {
  let p = V.pianoAscolto({ ambiti: ['aula', 'r:u000'] });
  const tutti = ['r:u000'];
  for (let i = 1; i < 12; i++) { tutti.push('r:u' + String(i).padStart(3, '0')); p = V.pianoAscolto({ ambiti: ['aula', ...tutti] }, p); }
  assert.ok(p.length - 1 <= Math.ceil(tutti.length / V.MAX_IN) + 2, 'i gruppi restano pochi: ' + p.length);
  assert.deepStrictEqual(V.pianoAscolto({ ambiti: ['aula', ...tutti] }, p).flatMap((s) => s.filtri[0][1] === 'in' ? s.filtri[0][2] : []).sort(), tutti.slice().sort());
});
await prova('la modifica ha avviso e busta con gli stessi campi; il tempo lo mette il server; scade fra 3 giorni', () => {
  const m = V.costruisciModifica({ id: 'n1', tipo: 'nota', ambito: 'r:rx', version: 3, email: 'a@b.it', disp: 'd', creatoDa: 'a@b.it', busta: { v: 1 }, adesso: 1000 });
  assert.strictEqual(m.meta.ts, V.ORA); assert.strictEqual(m.busta.ts, V.ORA);
  assert.strictEqual(m.meta.scade.$ms, 1000 + V.RITENZIONE_MS);
  assert.deepStrictEqual(m.busta.busta, { v: 1 }); assert.strictEqual(m.meta.ambito, 'r:rx'); assert.strictEqual(m.busta.creatoDa, 'a@b.it'); assert.ok(!m.troppoGrande);
  assert.ok(V.costruisciModifica({ id: 'p', tipo: 'nota', ambito: 'aula', version: 1, email: 'a', busta: { d: 'x'.repeat(V.MAX_BUSTA) }, adesso: 1 }).troppoGrande);
  const e = V.costruisciModifica({ id: 'p', tipo: 'nota', ambito: 'aula', version: 2, eliminato: true, email: 'a', busta: null, adesso: 1 });
  assert.strictEqual(e.meta.eliminato, true); assert.deepStrictEqual(e.busta.busta, {}); assert.ok(!('creatoDa' in e.meta));
});
await prova('classificaErrore: quota fino a domani, permessi, rete, libreria', () => {
  assert.ok(V.classificaErrore({ code: 'resource-exhausted' }).finoADomani);
  assert.ok(/permessi/.test(V.classificaErrore({ code: 'permission-denied' }).motivo));
  assert.ok(V.classificaErrore({ code: 'unavailable' }).rete);
  assert.ok(V.classificaErrore({ code: 'sdk' }).rete);
  assert.ok(V.classificaErrore({ code: 'auth/invalid-credential' }).serveAccesso);
});

console.log('\nAvvio e spegnimento');
await prova('senza configurazione non fa niente', async () => {
  const t = nuovo(); const m = V.creaMotore({ cfg: {}, backend: t.backend, sync: t.sync });
  assert.strictEqual(await m.avvia(), false); assert.strictEqual(t.backend.inizializzato, 0);
});
await prova('custode non aggiornato o di un altro progetto: spenta con il motivo, prima di toccare la rete', async () => {
  let t = nuovo({ io: { email: 'ann@c.test', funzioni: ['io-cfg'] } });
  assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /custode.*aggiornato/);
  t = nuovo({ io: { ...IO, veloce: { progetto: 'altro' } } });
  assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /altro progetto/);
  assert.strictEqual(t.backend.inizializzato, 0);
});
await prova('si collega con l\'ID token di Google, poi ascolta ciò che il piano prevede (e la propria copia degli accessi)', async () => {
  const t = nuovo({ pronto: true, ambiti: ['aula', 'r:rx1', 'g:gx1'] });
  assert.strictEqual(await t.motore.avvia(), true);
  assert.strictEqual(t.backend._u.email, 'ann@c.test'); assert.ok(t.motore.attiva());
  assert.deepStrictEqual(t.backend.piano().map((a) => a.spec.filtri), [[['ambito', '==', 'aula']], [['ambito', 'in', ['g:gx1', 'r:rx1']]]]);
  assert.strictEqual(t.backend.attivi().filter((a) => a.doc).length, 1);
});
await prova('senza ID token fresco: spenta con «serve un nuovo accesso», e riparte dopo', async () => {
  const t = nuovo({ token: null });
  assert.strictEqual(await t.motore.avvia(), false);
  assert.ok(t.motore.stato().serveAccesso); assert.match(t.motore.stato().motivo, /accesso con Google/);
  t.sync.token = JSON.stringify({ email: 'ann@c.test' });
  assert.strictEqual(await t.motore.avvia({ forza: true }), true);
});
await prova('Firebase già collegato (sessione conservata): niente token richiesto', async () => {
  const t = nuovo({ token: null }); t.backend._u = { email: 'ann@c.test' };
  assert.strictEqual(await t.motore.avvia(), true);
});
await prova('un altro account Google su Firebase: spenta', async () => {
  const t = nuovo({ token: JSON.stringify({ email: 'altro@c.test' }) });
  assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /non coincide/);
});
await prova('copia degli accessi mancante: spenta con il motivo (e il nome della funzione da eseguire)', async () => {
  const t = nuovo(); delete t.backend.docs['accessi/ann@c.test'];
  assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /copiato gli accessi.*configuraFirebase/);
});
await prova('libreria non caricata (errore all\'inizializzazione): spenta, nessuna eccezione, riparte con la rete', async () => {
  const t = nuovo(); t.backend.inizializza = async () => { const e = new Error('x'); e.code = 'sdk'; throw e; };
  assert.strictEqual(await t.motore.avvia(), false); assert.match(t.motore.stato().motivo, /libreria/); assert.ok(t.motore.stato().rete);
});
await prova('dopo un errore niente nuovi tentativi automatici per 5 minuti; «Riprova» (forza) sì', async () => {
  const t = nuovo(); t.backend.errore = { code: 'unavailable' };
  assert.strictEqual(await t.motore.avvia(), false);
  t.backend.errore = null;
  assert.strictEqual(await t.motore.avvia(), false, 'troppo presto');
  tempo += V.ATTESA_RIPROVA_MS + 1;
  assert.strictEqual(await t.motore.avvia(), true);
});
await prova('quota esaurita: spenta fino alla mezzanotte, anche dopo un nuovo avvio; poi «Riprova» la riaccende', async () => {
  const t = nuovo(); await t.motore.avvia();
  assert.strictEqual(await t.motore.pubblica([rec('n1', 1)]), true);
  t.backend.errore = { code: 'resource-exhausted' };
  assert.strictEqual(await t.motore.pubblica([rec('n1', 2)]), false);
  assert.ok(!t.motore.attiva()); assert.match(t.motore.stato().motivo, /domani/);
  t.backend.errore = null; tempo += V.ATTESA_RIPROVA_MS + 1;
  assert.strictEqual(await t.motore.avvia(), false, 'fino a domani');
  assert.strictEqual(await t.motore.avvia({ forza: true }), true);
});
await prova('un errore nell\'ascolto (permessi) spegne e chiude tutti gli ascolti', async () => {
  const t = nuovo({ ambiti: ['aula', 'r:rx1'] });
  await t.motore.avvia(); assert.ok(t.backend.attivi().length >= 3);
  t.backend.piano()[0].ko({ code: 'permission-denied' });
  assert.ok(!t.motore.attiva()); assert.strictEqual(t.backend.attivi().length, 0);
});
await prova('l\'accesso viene tolto (la mia copia sparisce): la corsia si spegne e si chiede un giro al custode', async () => {
  const t = nuovo(); await t.motore.avvia(); tempo += 10000;
  t.backend.attivi().find((a) => a.doc).cb(null);
  assert.ok(!t.motore.attiva()); assert.strictEqual(t.sync.riallineamenti, 1);
});

await prova('uscendo dall\'aula Firebase si scollega, anche se in questa sessione non era partito', async () => {
  const t = nuovo(); await t.motore.avvia(); assert.strictEqual(t.mem.collegato, '1');
  t.motore.ferma(); await attendi(20); assert.strictEqual(t.backend._u, null); assert.strictEqual(t.mem.collegato, '0');
  const u = nuovo(); u.mem.collegato = '1'; u.backend._u = { email: 'ann@c.test' };
  u.motore.ferma(); await attendi(20); assert.strictEqual(u.backend._u, null);
});

console.log('\nLa mia copia degli accessi');
await prova('se cambia (ambito condiviso con me) chiede un giro al custode; l\'avvio con la stessa copia no', async () => {
  const t = nuovo({ ambiti: ['aula', 'r:rx1'] }); await t.motore.avvia();
  const a = t.backend.attivi().find((x) => x.doc);
  a.cb({ ruolo: 'admin', scadeIl: 1, ambiti: ['r:rx1'] });
  assert.strictEqual(t.sync.riallineamenti, 0, 'la copia coincide con quello che il custode ha già detto');
  tempo += 5000;
  a.cb({ ruolo: 'admin', scadeIl: 1, ambiti: ['r:rx1', 'g:nuovo'] });
  assert.strictEqual(t.sync.riallineamenti, 1);
});
await prova('due cambiamenti ravvicinati: il secondo non si perde, si rimanda (e non si ripete più di una volta)', async () => {
  const rimandati = [];
  const t = nuovo({ ambiti: ['aula'] }, { setTimeout: (f, ms) => { rimandati.push([f, ms]); return rimandati.length; }, clearTimeout: () => {} });
  await t.motore.avvia();
  const a = t.backend.attivi().find((x) => x.doc);
  a.cb({ ruolo: 'admin', scadeIl: 1, ambiti: ['r:rx1'] });
  assert.strictEqual(t.sync.riallineamenti, 1);
  tempo += 1000;
  a.cb({ ruolo: 'admin', scadeIl: 1, ambiti: [] }); a.cb({ ruolo: 'admin', scadeIl: 1, ambiti: ['r:rx2'] });
  assert.strictEqual(t.sync.riallineamenti, 1, 'subito no');
  assert.strictEqual(rimandati.length, 1); assert.ok(rimandati[0][1] > 1000 && rimandati[0][1] <= 3000);
  rimandati[0][0](); assert.strictEqual(t.sync.riallineamenti, 2);
});
await prova('se all\'avvio la copia ha ambiti che l\'app non conosce, chiede subito un giro', async () => {
  const t = nuovo({ ambiti: ['aula'] }); await t.motore.avvia();
  t.backend.attivi().find((x) => x.doc).cb({ ruolo: 'admin', scadeIl: 1, ambiti: ['r:rx9'] });
  assert.strictEqual(t.sync.riallineamenti, 1);
});

console.log('\nVoci');
const attiva = async (o) => { const t = nuovo(o); await t.motore.avvia(); await attendi(20); return t; };
const cambi = (t, dati, tipo) => t.backend.piano()[0].cb([{ tipo: tipo || 'added', id: dati.id, dati }]);
await prova('pubblica busta e avviso con tipo, ambito, autore e creatore', async () => {
  const t = await attiva();
  assert.strictEqual(await t.motore.pubblica([rec('n1', 4, { tipo: 'seduta', ambito: 'r:rx1', creatoDa: 'ann@c.test' })]), true);
  const m = t.backend.docs['modifiche/n1'];
  assert.deepStrictEqual([m.tipo, m.ambito, m.v, m.da, m.disp, m.creatoDa, m.eliminato], ['seduta', 'r:rx1', 4, 'ann@c.test', 'dispaaaa1111', 'ann@c.test', false]);
  assert.deepStrictEqual(t.backend.docs['buste/n1'].busta, { v: 1, dati: 'x' });
});
await prova('spenta non pubblica; busta troppo grande resta solo sul custode senza spegnere; oltre 40 voci è massivo', async () => {
  const t = await attiva();
  assert.strictEqual(await t.motore.pubblica([rec('n1', 1, { busta: { d: 'x'.repeat(V.MAX_BUSTA) } })]), true);
  assert.ok(t.motore.attiva()); assert.strictEqual(t.backend.scritture.length, 0);
  assert.strictEqual(await t.motore.pubblica(Array.from({ length: 41 }, (_, i) => rec('m' + i + 'x', 1))), false);
  assert.strictEqual(t.backend.scritture.length, 0);
  t.motore.spegni('prova'); assert.strictEqual(await t.motore.pubblica([rec('n1', 1)]), false);
});
await prova('una voce degli altri si applica una volta sola, e solo se è più nuova di ciò che ho', async () => {
  const t = await attiva();
  t.backend.docs['buste/n1'] = { id: 'n1', tipo: 'nota', ambito: 'aula', v: 5, da: 'bob@c.test', eliminato: false, busta: { v: 1, dati: 'n' } };
  const m = (v, disp) => ({ id: 'n1', tipo: 'nota', ambito: 'aula', v, da: 'bob@c.test', disp: disp || 'altro', eliminato: false });
  cambi(t, m(5)); await attendi(); cambi(t, m(5)); cambi(t, m(4)); await attendi();
  assert.strictEqual(t.sync.applicati.length, 1); assert.strictEqual(t.sync.applicati[0].version, 5);
  assert.strictEqual(t.sync.applicati[0].aggiornatoDa, 'bob@c.test');
  t.sync.versioni.n2 = { version: 9, ambito: 'aula' }; cambi(t, { ...m(7), id: 'n2' }); await attendi();
  assert.strictEqual(t.sync.applicati.length, 1, 'già aggiornato localmente');
  t.sync.versioni.n3 = { version: 9, ambito: 'aula' };
  t.backend.docs['buste/n3'] = { id: 'n3', tipo: 'nota', ambito: 'r:rx', v: 9, da: 'b', eliminato: false, busta: { v: 1, dati: 'n' } };
  cambi(t, { ...m(9), id: 'n3', ambito: 'r:rx' }); await attendi();
  assert.strictEqual(t.sync.applicati.length, 2, 'stessa versione ma in un altro ambito: si applica');
});
await prova('un\'eliminazione si applica senza leggere la busta', async () => {
  const t = await attiva(); t.sync.versioni.n1 = { version: 2, ambito: 'aula' };
  cambi(t, { id: 'n1', tipo: 'nota', ambito: 'aula', v: 3, da: 'bob@c.test', disp: 'altro', eliminato: true }); await attendi();
  assert.strictEqual(t.sync.applicati.length, 1); assert.strictEqual(t.sync.applicati[0].eliminato, true); assert.strictEqual(t.sync.applicati[0].busta, null);
});
await prova('le proprie voci (stesso dispositivo) non si riapplicano; una busta mancante o più vecchia non si applica', async () => {
  const t = await attiva();
  cambi(t, { id: 'n1', tipo: 'nota', ambito: 'aula', v: 3, da: 'ann@c.test', disp: 'dispaaaa1111', eliminato: false }); await attendi();
  assert.strictEqual(t.sync.applicati.length, 0);
  cambi(t, { id: 'n2', tipo: 'nota', ambito: 'aula', v: 3, da: 'bob@c.test', disp: 'altro', eliminato: false }); await attendi();
  t.backend.docs['buste/n3'] = { id: 'n3', v: 1, busta: { dati: 'x' } };
  cambi(t, { id: 'n3', tipo: 'nota', ambito: 'aula', v: 3, da: 'bob@c.test', disp: 'altro', eliminato: false }); await attendi();
  assert.strictEqual(t.sync.applicati.length, 0);
});
await prova('gli ascolti seguono gli ambiti visibili (si aggiungono e si tolgono) senza rifare quelli rimasti', async () => {
  const t = nuovo({ ambiti: ['aula', 'r:rx1'] });
  await t.motore.avvia(); assert.strictEqual(t.backend.piano().length, 2);
  const primo = t.backend.piano()[1];
  t.sync.ambiti = ['aula', 'r:rx1', 'g:gx1']; t.motore.ricalcola();
  assert.strictEqual(t.backend.piano().length, 3); assert.ok(!primo.chiuso, 'il gruppo di prima resta com\'era');
  t.sync.ambiti = ['aula', 'g:gx1']; t.motore.ricalcola();
  assert.deepStrictEqual(t.backend.piano().map((a) => a.spec.filtri[0][2]), ['aula', ['g:gx1']]);
  assert.ok(primo.chiuso);
  t.sync.ambiti = ['aula']; t.sync.pronto = false; t.motore.ricalcola(); assert.strictEqual(t.backend.piano().length, 0, 'senza chiave non si ascolta niente');
});

console.log('\nChiave');
await prova('dispositivo senza chiave: scrive la richiesta con il proprio codice e ascolta la consegna', async () => {
  const t = await attiva({ fase: 'attesa', pronto: false });
  const r = t.backend.docs['richieste/dispaaaa1111'];
  assert.strictEqual(r.email, 'ann@c.test'); assert.strictEqual(r.pubblica, 'QUJDREVG'); assert.ok(!('aula' in r));
  assert.strictEqual(t.motore.stato().codice, await V.codiceVerifica('QUJDREVG'));
  const asc = t.backend.attivi().find((a) => a.spec.coll === 'consegne'); assert.deepStrictEqual(asc.spec.filtri, [['email', '==', 'ann@c.test']]);
  asc.cb([{ tipo: 'added', id: 'dispaaaa1111', dati: { busta: 'B64', kid: 'k1' } }]); await attendi(20);
  assert.deepStrictEqual(t.sync.chiaviRicevute, [{ busta: 'B64', kid: 'k1' }]);
  assert.ok(!t.backend.docs['richieste/dispaaaa1111'] && !t.backend.docs['consegne/dispaaaa1111'], 'ripulite dopo l\'uso');
  assert.strictEqual(t.motore.stato().codice, null);
});
await prova('una consegna per un altro dispositivo o con un\'altra chiave non conta', async () => {
  const t = await attiva({ fase: 'attesa', pronto: false });
  const asc = t.backend.attivi().find((a) => a.spec.coll === 'consegne');
  asc.cb([{ tipo: 'added', id: 'altrodisp1234', dati: { busta: 'B', kid: 'k1' } }]); await attendi(20);
  assert.strictEqual(t.sync.chiaviRicevute.length, 0);
  asc.cb([{ tipo: 'added', id: 'dispaaaa1111', dati: { busta: 'B', kid: 'k9' } }]); await attendi(20);
  assert.ok(t.backend.docs['richieste/dispaaaa1111'], 'resta in attesa della chiave giusta');
});
const operatore = (o) => attiva({ eOperatore: true, chiaveEsportabile: true, ...(o || {}) });
const arriva = (t, id, dati) => t.backend.attivi().find((a) => a.spec.coll === 'richieste').cb([{ tipo: 'added', id, dati }]);
await prova('operatore con la chiave: ascolta tutte le richieste e consegna in automatico a chi è abilitato', async () => {
  const t = await operatore();
  assert.deepStrictEqual(t.backend.attivi().filter((a) => a.spec.coll === 'richieste').map((a) => a.spec.filtri), [[]]);
  t.backend.docs['richieste/dispbbbb2222'] = { email: 'lia@c.test' };
  arriva(t, 'dispbbbb2222', { email: 'lia@c.test', pubblica: 'PUBB', nome: 'Tel' }); await attendi(30);
  const c = t.backend.docs['consegne/dispbbbb2222'];
  assert.strictEqual(c.busta, 'BUSTA-PER-PUBB'); assert.strictEqual(c.email, 'lia@c.test'); assert.strictEqual(c.da, 'ann@c.test'); assert.strictEqual(c.kid, 'k1');
  assert.ok(!t.backend.docs['richieste/dispbbbb2222']);
  assert.strictEqual(t.sync.abilitate[0].id, 'dispbbbb2222');
});
await prova('chi non è abilitato non riceve la chiave', async () => {
  const t = await operatore();
  arriva(t, 'dispcccc3333', { email: 'sconosciuto@x.it', pubblica: 'PUBC', nome: 'Tel' }); await attendi(30);
  assert.ok(!t.backend.docs['consegne/dispcccc3333']); assert.strictEqual(t.sync.cifrate.length, 0);
});
await prova('con la consegna manuale la richiesta aspetta il tasto, con il codice di verifica', async () => {
  const t = await operatore({ manuale: true });
  arriva(t, 'dispdddd4444', { email: 'lia@c.test', pubblica: 'PUBD', nome: 'Tel' }); await attendi(30);
  assert.ok(!t.backend.docs['consegne/dispdddd4444']);
  const l = t.motore.richieste(); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].codice, await V.codiceVerifica('PUBD'));
  assert.strictEqual(await t.motore.consegna('dispdddd4444'), true);
  assert.strictEqual(t.backend.docs['consegne/dispdddd4444'].busta, 'BUSTA-PER-PUBD'); assert.strictEqual(t.motore.richieste().length, 0);
});
await prova('un dispositivo la cui chiave non è esportabile, o di un tirocinante, non ascolta le richieste', async () => {
  let t = await operatore({ chiaveEsportabile: false });
  assert.strictEqual(t.backend.attivi().filter((a) => a.spec.coll === 'richieste').length, 0);
  t = await operatore({ eOperatore: false });
  assert.strictEqual(t.backend.attivi().filter((a) => a.spec.coll === 'richieste').length, 0);
});
await prova('la chiave arrivata dal custode toglie la richiesta su Firestore', async () => {
  const t = await attiva({ fase: 'attesa', pronto: false });
  assert.ok(t.backend.docs['richieste/dispaaaa1111']);
  t.motore.chiaveArrivata(); await attendi(20);
  assert.ok(!t.backend.docs['richieste/dispaaaa1111']);
});

console.log('\nBackend vero e caricamento pigro');
await prova('il backend pigro carica la libreria solo al primo uso e riprova se non è riuscito', async () => {
  let carichi = 0, falli = true;
  const finto = { app: { initializeApp: () => ({}) }, auth: {}, firestore: {} };
  const b = V.backendPigro({ projectId: 'p' }, () => { carichi++; return falli ? Promise.reject(Object.assign(new Error('x'), { code: 'sdk' })) : Promise.resolve(finto); });
  assert.strictEqual(carichi, 0); assert.strictEqual(b.utente(), null);
  await assert.rejects(b.inizializza()); assert.strictEqual(carichi, 1);
  falli = false; finto.auth.initializeAuth = () => ({ currentUser: null }); finto.firestore.initializeFirestore = () => ({});
  await b.inizializza(); assert.strictEqual(carichi, 2);
  await b.inizializza(); assert.strictEqual(carichi, 2, 'una volta caricata, basta');
});

// ======================================================================
// La copia degli accessi: quello che il custode scrive per Firestore deve coincidere con quello che il custode
// stesso fa vedere (`sync`), per ogni persona.
// ======================================================================
console.log('\nLa copia degli accessi coincide con il custode');
function decodifica(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('timestampValue' in v) return { $ts: v.timestampValue };
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodifica);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decodifica(x)]));
  throw new Error('valore sconosciuto');
}
function firestoreFinto() {
  const f = { docs: {}, commit: 0, guasto: false, progetto: 'prova' };
  f.commitFn = (c) => {
    if (f.guasto) throw new Error('Firestore 503');
    f.commit++;
    for (const w of c.writes) {
      if (w.update) { const nome = w.update.name.split('/documents/')[1]; f.docs[nome] = Object.fromEntries(Object.entries(w.update.fields).map(([k, x]) => [k, decodifica(x)])); }
      else delete f.docs[w['delete'].split('/documents/')[1]];
    }
    return {};
  };
  f.specchio = { progetto: 'prova', commit: f.commitFn, interroga: () => [] };
  return f;
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-veloce-'));
const fb = firestoreFinto();
const PROP = 'stefano@aula.it';
const oggi = new Date().toISOString().slice(0, 10);
const giorno = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let ora = () => new Date().toISOString();
const c = creaLocale(dir, { proprietario: PROP, specchio: fb.specchio, ora: () => ora() });
const chiama = (email, azione, dati) => c.gestisci({ v: 1, token: 'dev:' + email + '|' + email.split('@')[0], azione, dati });
const ok = (r) => { assert.ok(r.ok, `atteso ok, ricevuto ${r.errore}: ${r.messaggio}`); return r.dati; };
const busta = () => ({ v: 1, alg: 'A256GCM', kid: 'kprova', iv: 'AAAAAAAAAAAAAAAA', comp: 'no', dati: 'AAAA' });
const cifratura = { kid: 'kprova', kdf: { nome: 'PBKDF2-SHA256', iterazioni: 600000, sale: 'AAAAAAAAAAAAAAAAAAAAAA==' }, verifica: busta() };
const voce = (id, tipo, ambito, versioneBase = 0) => ({ id, tipo, ambito, versioneBase, busta: busta() });
const invia = (email, voci) => ok(chiama(email, 'sync', { invii: voci }));
const E = { elena: 'elena@aula.it', lara: 'lara@aula.it', giulia: 'giulia@aula.it', marco: 'marco@aula.it', sara: 'sara@aula.it', orf: 'orfano@aula.it',
  off: 'off@aula.it', vecchio: 'vecchio@aula.it', futuro: 'futuro@aula.it', ignoto: 'ignoto@aula.it' };

// Tutte le persone e quello che il custode risponde loro: { email: { sync: dati | null, errore } }
function viste() {
  const out = {};
  for (const email of [PROP, ...Object.values(E)]) {
    const s = chiama(email, 'sync', {});
    const io = chiama(email, 'io');
    out[email] = s.ok ? { ambiti: s.dati.ambiti, io: io.dati } : { errore: s.errore };
  }
  return out;
}
// la copia scritta (da Firestore finto) deve essere quella che il custode calcola adesso, e coincidere con ciò che `sync` dice
function controllaCopia(contesto) {
  const v = viste();
  const copia = c.copiaFirestore();
  const scritta = Object.fromEntries(Object.entries(fb.docs).filter(([k]) => k.startsWith('accessi/')));
  assert.deepStrictEqual(scritta, JSON.parse(JSON.stringify(copia)), contesto + ': Firestore diverso dalla copia calcolata');
  for (const [email, x] of Object.entries(v)) {
    const doc = scritta['accessi/' + email];
    if (x.errore) { assert.ok(!doc, `${contesto}: ${email} (${x.errore}) non deve avere il documento`); continue; }
    assert.ok(doc, `${contesto}: ${email} deve avere il documento`);
    assert.deepStrictEqual(doc.ambiti, x.ambiti.filter((a) => a !== 'aula').sort(), `${contesto}: ambiti di ${email}`);
    assert.strictEqual(doc.ruolo, x.io.ruolo, `${contesto}: ruolo di ${email}`);
    assert.strictEqual(doc.proprietario, !!x.io.proprietario, `${contesto}: proprietario ${email}`);
    assert.strictEqual(doc.attivo, true);
    const sc = x.io.scadenza;
    assert.strictEqual(doc.scadeIl.$ts, sc ? new Date(Date.parse(sc + 'T00:00:00Z') + 86400000).toISOString() : '2100-01-01T00:00:00.000Z', `${contesto}: scadenza di ${email}`);
  }
  return v;
}

await prova('preparazione: chiave, accessi, ambiti di ogni genere', async () => {
  ok(chiama(PROP, 'cifratura.imposta', { cifratura }));
  const acc = { utenti: {
    [E.elena]: { nome: 'Elena', ruolo: 'admin' }, [E.lara]: { nome: 'Lara', ruolo: 'admin' }, [E.orf]: { nome: 'Orfano', ruolo: 'admin' },
    [E.giulia]: { nome: 'Giulia', ruolo: 'tirocinante', ragazzi: ['rluca01'] },
    [E.marco]: { nome: 'Marco', ruolo: 'tirocinante', ragazzi: [] }, [E.sara]: { nome: 'Sara', ruolo: 'tirocinante', ragazzi: [] },
    [E.off]: { nome: 'Off', ruolo: 'tirocinante', ragazzi: [], attivo: false },
    [E.vecchio]: { nome: 'Vecchio', ruolo: 'tirocinante', ragazzi: [], scadenza: giorno(-3) },
    [E.futuro]: { nome: 'Futuro', ruolo: 'tirocinante', ragazzi: ['rluca01'], scadenza: giorno(3) },
  } };
  ok(chiama(PROP, 'accessi.salva', { accessi: acc, versioneBase: 0 }));
  // il proprietario crea Luca (poi assegnato a Giulia), Elena i suoi, Lara un gruppo riservato
  invia(PROP, [voce('gmart', 'gruppo', 'aula'), voce('sgr1', 'seduta', 'aula'), voce('rluca01', 'ragazzo', 'r:rluca01'), voce('rluca01sc', 'scheda', 'r:rluca01'), voce('nluca', 'nota', 'r:rluca01')]);
  invia(E.elena, [voce('rel1', 'ragazzo', 'r:rel1'), voce('rel1sc', 'scheda', 'r:rel1'), voce('rcond', 'ragazzo', 'r:rcond'), voce('rcondsc', 'scheda', 'r:rcond'), voce('rtutti', 'ragazzo', 'r:rtutti'), voce('rtuttisc', 'scheda', 'r:rtutti'), voce('rleg', 'scheda', 'r:rleg')]);
  invia(E.lara, [voce('gres', 'gruppo', 'g:gres'), voce('sres', 'seduta', 'g:gres'), voce('pres', 'programma', 'p:pres')]);
  invia(E.orf, [voce('rorf', 'scheda', 'r:rorf'), voce('gorf', 'gruppo', 'g:gorf')]);
  ok(chiama(E.elena, 'paziente.condivisione', { id: 'rcond', condivisi: [E.lara], tutti: false }));
  ok(chiama(E.elena, 'paziente.condivisione', { id: 'rtutti', condivisi: [], tutti: true }));
  // Marco: «tutti i pazienti» dell'operatore Elena (tuttiDa)
  const a = ok(chiama(PROP, 'accessi.leggi')); a.utenti[E.marco].tuttiRagazzi = true;
  ok(chiama(E.elena, 'accessi.salva', { accessi: a, versioneBase: a.version }));
  // un paziente «di prima» (nessuna riga nel registro): lo vedono tutti gli operatori
  const reg = JSON.parse(fs.readFileSync(path.join(dir, '_config/pazienti.json'), 'utf8')); delete reg.pazienti.rleg;
  fs.writeFileSync(path.join(dir, '_config/pazienti.json'), JSON.stringify(reg)); c.cache.scadi();
  controllaCopia('stato iniziale');
});
await prova('ognuno ha esattamente gli ambiti che il custode gli fa vedere (operatori, tirocinanti, proprietario)', () => {
  const v = controllaCopia('ambiti');
  const amb = (e) => v[e].ambiti.filter((a) => a !== 'aula').sort();
  assert.deepStrictEqual(amb(E.elena), ['r:rcond', 'r:rel1', 'r:rleg', 'r:rtutti'], 'Elena: i suoi, quello di tutti e quello di prima');
  assert.deepStrictEqual(amb(E.lara), ['g:gres', 'p:pres', 'r:rcond', 'r:rleg', 'r:rtutti'], 'Lara: il suo gruppo, il programma, il condiviso, quello di tutti e di prima');
  assert.deepStrictEqual(amb(E.giulia), ['r:rluca01'], 'Giulia: solo il paziente assegnato');
  assert.ok(amb(E.marco).includes('r:rel1') && amb(E.marco).includes('r:rcond') && !amb(E.marco).includes('g:gres'), 'Marco vede quello che vede Elena (tuttiDa)');
  assert.deepStrictEqual(amb(E.sara), [], 'Sara: niente di personale');
  assert.ok(amb(PROP).includes('r:rluca01') && amb(PROP).includes('r:rorf') === false, 'il proprietario vede i suoi, e gli orfani solo quando lo sono');
});
await prova('chi non è abilitato (disattivato, scaduto, sconosciuto) non ha il documento; il futuro sì, con la scadenza giusta', () => {
  const v = viste(); const d = (e) => fb.docs['accessi/' + e];
  for (const e of [E.off, E.vecchio, E.ignoto]) { assert.ok(v[e].errore, e); assert.ok(!d(e), e); }
  assert.ok(d(E.futuro)); assert.strictEqual(d(E.futuro).scadeIl.$ts, new Date(Date.parse(giorno(3) + 'T00:00:00Z') + 86400000).toISOString());
  assert.strictEqual(d(PROP).scadeIl.$ts.slice(0, 4), '2100'); assert.strictEqual(d(PROP).proprietario, true);
});
await prova('un ambito nuovo (primo dato di un paziente) aggiorna la copia nella stessa richiesta', () => {
  const prima = fb.commit;
  invia(E.lara, [voce('rnuovo', 'scheda', 'r:rnuovo')]);
  assert.ok(fb.commit > prima);
  const v = controllaCopia('ambito nuovo');
  assert.ok(fb.docs['accessi/' + E.lara].ambiti.includes('r:rnuovo'));
  assert.ok(!fb.docs['accessi/' + E.elena].ambiti.includes('r:rnuovo'), 'Elena non lo vede (è di Lara)');
  assert.ok(v[PROP].ambiti.indexOf('r:rnuovo') < 0);
});
await prova('condivisione, «tutti», cambio di proprietario: la copia segue subito', () => {
  ok(chiama(E.lara, 'paziente.condivisione', { id: 'rnuovo', condivisi: [E.giulia], tutti: false }));
  let v = controllaCopia('condiviso con Giulia');
  assert.ok(v[E.giulia].ambiti.includes('r:rnuovo'));
  ok(chiama(E.lara, 'paziente.condivisione', { id: 'rnuovo', condivisi: [], tutti: true }));
  v = controllaCopia('aperto agli operatori'); assert.ok(!v[E.giulia].ambiti.includes('r:rnuovo')); assert.ok(v[E.elena].ambiti.includes('r:rnuovo'));
  ok(chiama(E.lara, 'gruppo.condivisione', { id: 'gres', condivisi: [E.marco], tutti: false }));
  v = controllaCopia('gruppo condiviso'); assert.ok(v[E.marco].ambiti.includes('g:gres'));
  ok(chiama(E.lara, 'programma.condivisione', { id: 'pres', condivisi: [E.giulia], tutti: false }));
  v = controllaCopia('programma condiviso'); assert.ok(v[E.giulia].ambiti.includes('p:pres'));
});
await prova('accessi cambiati (ruolo, assegnazioni, disattivazione): la copia segue subito', () => {
  let a = ok(chiama(PROP, 'accessi.leggi')); a.utenti[E.sara].ragazzi = ['rel1'];
  // Sara è tirocinante: l'operatore Elena assegna un suo paziente
  ok(chiama(E.elena, 'accessi.salva', { accessi: a, versioneBase: a.version }));
  let v = controllaCopia('assegnazione'); assert.ok(v[E.sara].ambiti.includes('r:rel1'));
  a = ok(chiama(PROP, 'accessi.leggi')); a.utenti[E.marco].attivo = false;
  ok(chiama(PROP, 'accessi.salva', { accessi: a, versioneBase: a.version }));
  v = controllaCopia('Marco disattivato'); assert.ok(!fb.docs['accessi/' + E.marco]);
  a = ok(chiama(PROP, 'accessi.leggi')); a.utenti[E.marco].attivo = true; a.utenti[E.lara].ruolo = 'tirocinante'; a.utenti[E.lara].ragazzi = [];
  ok(chiama(PROP, 'accessi.salva', { accessi: a, versioneBase: a.version }));
  v = controllaCopia('Lara declassata'); assert.strictEqual(fb.docs['accessi/' + E.lara].ruolo, 'tirocinante');
  assert.ok(fb.docs['accessi/' + E.marco]);
});
await prova('un operatore non più abilitato lascia orfani i suoi pazienti: li vede il proprietario', () => {
  const a = ok(chiama(PROP, 'accessi.leggi')); a.utenti[E.orf].attivo = false;
  ok(chiama(PROP, 'accessi.salva', { accessi: a, versioneBase: a.version }));
  const v = controllaCopia('orfano'); assert.ok(v[PROP].ambiti.includes('r:rorf') && v[PROP].ambiti.includes('g:gorf'));
  assert.ok(fb.docs['accessi/' + PROP].ambiti.includes('r:rorf'));
});
await prova('il cambio di giorno: una scadenza passata toglie il documento (e chi dipendeva da quella persona)', () => {
  const dopo = () => new Date(Date.now() + 5 * 86400000).toISOString();
  ora = dopo;   // fra cinque giorni «Futuro» è scaduto
  const v = controllaCopia('fra 5 giorni');
  assert.ok(v[E.futuro].errore, 'il custode lo rifiuta'); assert.ok(!fb.docs['accessi/' + E.futuro], 'e la copia anche, alla prima richiesta del giorno');
  ora = () => new Date().toISOString();
  controllaCopia('di nuovo oggi');
});
await prova('Firestore che non risponde non rompe il custode; la copia si rifà dopo, da sola', () => {
  fb.guasto = true;
  const r = chiama(E.elena, 'sync', { invii: [voce('rguasto', 'scheda', 'r:rguasto')] });
  assert.ok(r.ok && r.dati.esiti[0].ok, 'il salvataggio riesce lo stesso');
  assert.match(c.erroreSpecchio() || '', /Firestore 503/);
  assert.ok(!fb.docs['accessi/' + E.elena].ambiti.includes('r:rguasto'));
  fb.guasto = false; c.cache.scadi();
  chiama(E.elena, 'sync', {});   // la prima richiesta dopo: ci riprova
  assert.ok(fb.docs['accessi/' + E.elena].ambiti.includes('r:rguasto'));
  controllaCopia('dopo il guasto');
});
await prova('senza modifiche non si scrive niente (un giro «niente di nuovo» non tocca Firestore)', () => {
  const prima = fb.commit;
  for (let i = 0; i < 5; i++) chiama(E.elena, 'sync', {});
  assert.strictEqual(fb.commit, prima);
  c.riallinea(false); assert.strictEqual(fb.commit, prima, 'nemmeno dal risveglio');
  const r = c.riallinea(true); assert.ok(r.copia > 0 && fb.commit > prima, 'riallinea(tutto) riscrive tutto');
});
await prova('«io» dice che la corsia veloce esiste e di quale progetto (senza Firestore non lo dice)', () => {
  const io = ok(chiama(E.elena, 'io')); assert.ok(io.funzioni.includes('veloce')); assert.deepStrictEqual(io.veloce, { progetto: 'prova' });
  const senza = creaLocale(fs.mkdtempSync(path.join(os.tmpdir(), 'psy-veloce2-')), { proprietario: PROP });
  const i2 = senza.gestisci({ v: 1, token: 'dev:' + PROP + '|x', azione: 'io' }).dati;
  assert.ok(!i2.funzioni.includes('veloce')); assert.strictEqual(i2.veloce, null);
});
await prova('la pulizia cancella ciò che è scaduto (modifiche, buste, richieste, consegne)', () => {
  const cancellati = [];
  const f2 = { progetto: 'p', commit: (x) => { x.writes.forEach((w) => w['delete'] && cancellati.push(w['delete'].split('/documents/')[1])); return {}; },
    interroga: (q) => { const coll = q.structuredQuery.from[0].collectionId; return coll === 'modifiche' ? [{ document: { name: 'projects/p/databases/(default)/documents/modifiche/vecchia' } }, {}] : []; } };
  const k = creaLocale(fs.mkdtempSync(path.join(os.tmpdir(), 'psy-veloce3-')), { proprietario: PROP, specchio: f2 });
  const r = k.riallinea(false); assert.strictEqual(r.pulite, 1); assert.deepStrictEqual(cancellati, ['modifiche/vecchia']);
});

console.log(`\n${passati} prove superate, ${falliti.length} fallite`);
if (falliti.length) { console.log('Fallite:\n - ' + falliti.join('\n - ')); process.exit(1); }
