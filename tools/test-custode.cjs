#!/usr/bin/env node
// Test della logica del custode (node tools/test-custode.cjs)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { creaLocale } = require('./custode-locale.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-custode-'));
const c = creaLocale(dir, { proprietario: 'stefano@aula.it' });
let n = 0, falliti = 0;
function ok(cond, msg) { n++; if (!cond) { falliti++; console.log('NO  ' + msg); } else console.log('ok  ' + msg); }
const chiama = (email, azione, dati) => c.gestisci({ v: 1, token: 'dev:' + email + '|' + email.split('@')[0], azione, dati });
const busta = (kid = 'kprova') => ({ v: 1, alg: 'A256GCM', kid, iv: 'AAAAAAAAAAAAAAAA', comp: 'no', dati: 'AAAA' });
const cifratura = { kid: 'kprova', kdf: { nome: 'PBKDF2-SHA256', iterazioni: 600000, sale: 'AAAAAAAAAAAAAAAAAAAAAA==' }, verifica: busta() };
const voce = (id, tipo, ambito, versioneBase = 0, extra = {}) => Object.assign({ id, tipo, ambito, versioneBase, busta: busta() }, extra);

// accesso
ok(chiama('ignoto@x.it', 'io').errore === 'non-autorizzato', 'uno sconosciuto non entra');
const io = chiama('stefano@aula.it', 'io');
ok(io.ok && io.dati.ruolo === 'admin' && io.dati.proprietario, 'il proprietario è operatore');
ok(c.gestisci({ v: 1, token: 'falso', azione: 'io' }).errore === 'non-autenticato', 'token non valido rifiutato');

// senza chiave non si salva
ok(chiama('stefano@aula.it', 'sync', { invii: [voce('gmart', 'gruppo', 'aula')] }).errore === 'senza-chiave', 'niente invii prima della chiave');
ok(chiama('stefano@aula.it', 'cifratura.imposta', { cifratura }).ok, 'chiave dell\'aula creata');
ok(chiama('stefano@aula.it', 'cifratura.imposta', { cifratura: Object.assign({}, cifratura, { kid: 'kaltra' }) }).errore === 'conflitto', 'la chiave non si sostituisce per sbaglio');

// accessi
const acc = { utenti: {
  'elena@aula.it': { nome: 'Elena', ruolo: 'admin' },
  'giulia@aula.it': { nome: 'Giulia', ruolo: 'tirocinante', ragazzi: ['rluca01'] },
  'marco@aula.it': { nome: 'Marco', ruolo: 'tirocinante', ragazzi: [] },
} };
ok(chiama('giulia@aula.it', 'accessi.salva', { accessi: acc, versioneBase: 0 }).errore === 'non-autorizzato', 'prima di essere aggiunta Giulia non entra');
ok(chiama('stefano@aula.it', 'accessi.salva', { accessi: acc, versioneBase: 0 }).ok, 'accessi salvati');
ok(chiama('giulia@aula.it', 'accessi.leggi').errore === 'vietato', 'una tirocinante non legge gli accessi');
ok(chiama('stefano@aula.it', 'accessi.salva', { accessi: acc, versioneBase: 0 }).errore === 'conflitto', 'accessi: controllo di versione');

// dati
let r = chiama('stefano@aula.it', 'sync', { invii: [
  voce('gmart', 'gruppo', 'aula'), voce('rluca01', 'ragazzo', 'aula'), voce('rluca01s', 'scheda', 'r:rluca01'),
  voce('rmart07', 'ragazzo', 'aula'), voce('rmart07s', 'scheda', 'r:rmart07'),
  voce('sind1', 'seduta', 'r:rluca01'), voce('sind2', 'seduta', 'r:rmart07'), voce('sgr1', 'seduta', 'aula'),
] });
ok(r.ok && r.dati.esiti.every((e) => e.ok), 'l\'operatore salva gruppi, ragazzi, schede, sedute');
ok(r.dati.voci.length === 8, 'e nella stessa risposta riceve tutto');
const cur = r.dati.cursori;

r = chiama('giulia@aula.it', 'sync', {});
const ids = r.dati.voci.map((v) => v.id).sort();
ok(ids.includes('rluca01s') && ids.includes('sind1') && !ids.includes('rmart07s') && !ids.includes('sind2'), 'Giulia riceve Luca (condiviso) ma non il personale di Martina');
ok(ids.includes('rmart07') && ids.includes('sgr1'), '…ma vede nome di Martina e sedute di gruppo');
ok(!r.dati.ambiti.includes('r:rmart07'), 'l\'ambito di Martina non le è nemmeno elencato');

r = chiama('marco@aula.it', 'sync', { invii: [voce('rluca01', 'ragazzo', 'aula', 1)] });
ok(r.dati.esiti[0].errore === 'vietato', 'un tirocinante non modifica i ragazzi');
r = chiama('marco@aula.it', 'sync', { invii: [voce('ri1', 'serie', 'aula')] });
ok(r.dati.esiti[0].errore === 'vietato', 'né crea appuntamenti ricorrenti');
r = chiama('marco@aula.it', 'sync', { invii: [voce('n1', 'nota', 'r:rluca01')] });
ok(r.dati.esiti[0].errore === 'vietato', 'né scrive nel personale di un ragazzo non condiviso');
r = chiama('marco@aula.it', 'sync', { invii: [voce('n2', 'nota', 'aula'), voce('sgr1', 'seduta', 'aula', 1)] });
ok(r.dati.esiti.every((e) => e.ok), 'ma scrive note "nel gruppo" e sedute di gruppo');
r = chiama('giulia@aula.it', 'sync', { invii: [voce('n2', 'nota', 'aula', 1)] });
ok(r.dati.esiti[0].errore === 'vietato', 'una tirocinante non modifica le note di un altro');
r = chiama('elena@aula.it', 'sync', { invii: [voce('sgr1', 'seduta', 'aula', 1)] });
ok(r.dati.esiti[0].errore === 'conflitto' && r.dati.esiti[0].extra.attuale.version === 2, 'conflitto con la versione attuale');

// incrementale
r = chiama('stefano@aula.it', 'sync', { cursori: cur });
ok(r.dati.voci.map((v) => v.id).sort().join() === 'n2,sgr1', 'con i cursori arrivano solo le novità');

// cambio di ambito: una nota personale di Luca che diventa "nel gruppo"
r = chiama('stefano@aula.it', 'sync', { invii: [voce('n3', 'nota', 'r:rluca01')] });
const cur2 = r.dati.cursori;
r = chiama('stefano@aula.it', 'sync', { cursori: cur2, invii: [voce('n3', 'nota', 'aula', 1)] });
const n3 = r.dati.voci.filter((v) => v.id === 'n3');
ok(n3.some((v) => v.ambito === 'aula' && !v.eliminato) && n3.some((v) => v.ambito === 'r:rluca01' && v.eliminato), 'nel vecchio ambito resta una lapide, nel nuovo la nota');
r = chiama('marco@aula.it', 'sync', {});
ok(r.dati.voci.some((v) => v.id === 'n3'), 'e ora anche chi non ha Luca la vede');

// eliminazione e storia
r = chiama('stefano@aula.it', 'sync', { invii: [{ id: 'sgr1', tipo: 'seduta', ambito: 'aula', versioneBase: 2, eliminato: true }] });
ok(r.dati.esiti[0].ok, 'eliminazione');
ok(chiama('stefano@aula.it', 'voce.storia', { id: 'sgr1', ambito: 'aula' }).dati.length === 2, 'le versioni precedenti restano nella storia');
ok(chiama('marco@aula.it', 'voce.storia', { id: 'sind1', ambito: 'r:rluca01' }).errore === 'vietato', 'storia di un ambito non condiviso: vietata');

// immagini
ok(chiama('giulia@aula.it', 'immagine.carica', { id: 'i123', ambito: 'r:rluca01', busta: busta() }).ok, 'immagine caricata nel personale di Luca');
ok(chiama('marco@aula.it', 'immagine.leggi', { id: 'i123', ambito: 'r:rluca01' }).errore === 'vietato', 'Marco non la legge');
ok(chiama('stefano@aula.it', 'immagine.leggi', { id: 'i123', ambito: 'r:rluca01' }).dati.busta.dati === 'AAAA', 'l\'operatore sì');

// chiave vecchia rifiutata
r = chiama('stefano@aula.it', 'sync', { invii: [Object.assign(voce('x9z', 'nota', 'aula'), { busta: busta('kvecchia') })] });
ok(r.dati.esiti[0].errore === 'chiave-cambiata', 'buste con una chiave diversa rifiutate');

// risposte perse per strada: il reinvio identico non diventa un conflitto
{
  const unica = (iv) => Object.assign(busta(), { iv });
  const v1 = Object.assign(voce('rinv1', 'nota', 'aula'), { busta: unica('BBBBBBBBBBBBBBBB') });
  const a = chiama('stefano@aula.it', 'sync', { invii: [v1] }).dati.esiti[0];
  const b = chiama('stefano@aula.it', 'sync', { invii: [v1] }).dati.esiti[0];
  ok(a.ok && b.ok && a.version === 1 && b.version === 1, 'stesso invio rimandato: accettato una volta sola');
  const altra = Object.assign(voce('rinv1', 'nota', 'aula'), { busta: unica('CCCCCCCCCCCCCCCC') });
  ok(chiama('stefano@aula.it', 'sync', { invii: [altra] }).dati.esiti[0].errore === 'conflitto', 'un invio diverso sulla stessa base resta un conflitto');
  ok(chiama('elena@aula.it', 'sync', { invii: [v1] }).dati.esiti[0].errore === 'conflitto', 'e vale solo per chi l\'aveva mandato');
  const rid = 'rid-prova-001';
  const r1 = c.gestisci({ v: 1, token: 'dev:stefano@aula.it|stefano', azione: 'dispositivo.registra', rid, dati: { id: 'dstefano01', pubblica: 'AAAA', nome: 'Mac' } });
  const r2 = c.gestisci({ v: 1, token: 'dev:stefano@aula.it|stefano', azione: 'dispositivo.registra', rid, dati: { id: 'dstefano01', pubblica: 'AAAA', nome: 'Mac' } });
  ok(r1.ok && JSON.stringify(r1) === JSON.stringify(r2), 'scrittura rimandata con lo stesso identificativo: stessa risposta');
  chiama('stefano@aula.it', 'dispositivo.togli', { id: 'dstefano01' });
}

// dispositivi
const pub = 'AAAA';
ok(chiama('giulia@aula.it', 'dispositivo.registra', { id: 'dgiulia001', pubblica: pub, nome: 'Telefono' }).dati.abilitato === false, 'dispositivo registrato, in attesa');
const el = chiama('stefano@aula.it', 'dispositivi.elenco').dati;
ok(el.length === 1 && el[0].personaAbilitata, 'l\'operatore lo vede');
ok(chiama('stefano@aula.it', 'dispositivi.abilita', { id: 'dgiulia001', kid: 'kprova', chiave: 'BBBB', pubblica: pub }).ok, 'e gli consegna la chiave');
ok(chiama('giulia@aula.it', 'dispositivo.chiave', { id: 'dgiulia001' }).dati.chiavi.kprova === 'BBBB', 'il dispositivo la riceve');
ok(chiama('marco@aula.it', 'dispositivo.chiave', { id: 'dgiulia001' }).errore === 'non-trovato', 'un altro non la prende');
// chi esce dagli accessi perde i dispositivi
const acc2 = JSON.parse(JSON.stringify(acc)); delete acc2.utenti['giulia@aula.it'];
chiama('stefano@aula.it', 'accessi.salva', { accessi: acc2, versioneBase: 1 });
ok(chiama('stefano@aula.it', 'dispositivi.elenco').dati.length === 0, 'tolta dagli accessi, il suo dispositivo sparisce');
ok(chiama('giulia@aula.it', 'io').errore === 'non-autorizzato', 'e lei non entra più');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${n - falliti}/${n} superati`);
process.exit(falliti ? 1 : 0);
