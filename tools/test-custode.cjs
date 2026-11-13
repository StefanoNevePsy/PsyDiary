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
{
  // mentre si scrive l'app salva ogni secondo e mezzo: nella storia non 15 bozze dello stesso minuto
  let ver = 0;
  for (let k = 0; k < 8; k++) { const x = chiama('stefano@aula.it', 'sync', { invii: [voce('bozza1', 'seduta', 'aula', ver)] }); ver = x.dati.esiti[0].version; }
  const st = chiama('stefano@aula.it', 'voce.storia', { id: 'bozza1', ambito: 'aula' }).dati;
  ok(st.length === 1, 'otto salvataggi di fila della stessa persona: una versione precedente sola (' + st.length + ')');
  // poi scrive Elena: nella storia l'ultima di Stefano e, dal suo secondo salvataggio, la sua
  const el = chiama('elena@aula.it', 'sync', { invii: [voce('bozza1', 'seduta', 'aula', ver)] });
  chiama('elena@aula.it', 'sync', { invii: [voce('bozza1', 'seduta', 'aula', el.dati.esiti[0].version)] });
  const st2 = chiama('stefano@aula.it', 'voce.storia', { id: 'bozza1', ambito: 'aula' }).dati;
  ok(st2.length === 2 && st2[0].aggiornatoDa === 'elena@aula.it' && st2[1].aggiornatoDa === 'stefano@aula.it', 'un\'altra persona: una versione per ciascuno');
}

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
  ok(r1.ok && JSON.stringify(r1.dati) === JSON.stringify(r2.dati), 'scrittura rimandata con lo stesso identificativo: stessa risposta');
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

// pazienti riservati: di chi li crea, visibili ad altri solo se condivisi
{
  // tutto quello creato sopra fa da "pazienti di prima" (custode senza registro)
  fs.rmSync(path.join(dir, '_config/pazienti.json'), { force: true });
  c.cache.scadi();   // un file tolto a mano si vede solo dopo aver svuotato la cache (come svuotaCache su Apps Script)
  const vede = (email, rid) => { const d = chiama(email, 'sync', {}).dati; return d.ambiti.includes('r:' + rid); };
  ok((chiama('elena@aula.it', 'io').dati.funzioni || []).includes('riservati'), 'il custode dichiara i pazienti riservati');
  let r = chiama('elena@aula.it', 'sync', { invii: [voce('rpriv1', 'ragazzo', 'r:rpriv1'), voce('rpriv1sc', 'scheda', 'r:rpriv1')] });
  ok(r.dati.esiti.every((e) => e.ok), 'Elena crea un paziente (nome e scheda nel suo ambito)');
  ok(r.dati.pazienti.rpriv1 && r.dati.pazienti.rpriv1.mio && !r.dati.pazienti.rpriv1.tutti, 'è suo e riservato');
  const st = chiama('stefano@aula.it', 'sync', {}).dati;
  ok(!st.ambiti.includes('r:rpriv1') && !st.voci.some((v) => v.id.startsWith('rpriv1')), 'un altro operatore non lo riceve, nemmeno il nome');
  ok(st.pazienti.rluca01 && st.pazienti.rluca01.daPrima && st.pazienti.rluca01.tutti, 'i pazienti di prima restano di tutta l\'aula');
  ok(chiama('stefano@aula.it', 'sync', { invii: [voce('npriv', 'nota', 'r:rpriv1')] }).dati.esiti[0].errore === 'vietato', 'e non ci scrive');
  ok(chiama('stefano@aula.it', 'paziente.condivisione', { id: 'rpriv1', condivisi: ['stefano@aula.it'] }).errore === 'vietato', 'né se lo condivide da solo');
  ok(chiama('elena@aula.it', 'paziente.condivisione', { id: 'rpriv1', condivisi: ['stefano@aula.it'] }).ok, 'Elena lo condivide con Stefano');
  const st2 = chiama('stefano@aula.it', 'sync', {}).dati;
  ok(st2.ambiti.includes('r:rpriv1') && st2.voci.some((v) => v.id === 'rpriv1sc'), 'ora Stefano lo riceve tutto');
  ok(st2.pazienti.rpriv1.mio === false && st2.pazienti.rpriv1.proprietario === 'elena@aula.it', 'e sa che è di Elena');
  ok(chiama('stefano@aula.it', 'sync', { invii: [voce('npriv', 'nota', 'r:rpriv1')] }).dati.esiti[0].ok, 'e ci scrive');
  ok(chiama('elena@aula.it', 'paziente.condivisione', { id: 'rpriv1', condivisi: [], tutti: true }).ok && vede('stefano@aula.it', 'rpriv1') && !vede('marco@aula.it', 'rpriv1'), 'aperto a tutta l\'aula: tutti gli operatori, non i tirocinanti');
  ok(chiama('elena@aula.it', 'paziente.condivisione', { id: 'rpriv1', condivisi: [], tutti: false }).ok && !vede('stefano@aula.it', 'rpriv1'), 'richiuso: Stefano non lo vede più');
  // tirocinanti: li assegna solo chi vede il paziente
  const a = chiama('stefano@aula.it', 'accessi.leggi').dati;
  const conMarco = JSON.parse(JSON.stringify({ utenti: a.utenti })); conMarco.utenti['marco@aula.it'].ragazzi = ['rpriv1'];
  ok(chiama('stefano@aula.it', 'accessi.salva', { accessi: conMarco, versioneBase: a.version }).errore === 'vietato', 'Stefano non può assegnare a Marco un riservato che non vede');
  ok(chiama('elena@aula.it', 'accessi.salva', { accessi: conMarco, versioneBase: a.version }).ok && vede('marco@aula.it', 'rpriv1'), 'Elena sì, e Marco lo vede');
  // pazienti di prima: decide chi ne ha creato la scheda
  ok(chiama('elena@aula.it', 'paziente.condivisione', { id: 'rluca01', condivisi: [] }).errore === 'vietato', 'un paziente di prima lo rende riservato solo chi l\'ha creato');
  ok(chiama('stefano@aula.it', 'paziente.condivisione', { id: 'rluca01', condivisi: [] }).ok && !vede('elena@aula.it', 'rluca01') && vede('stefano@aula.it', 'rluca01'), 'Stefano lo rende riservato: Elena non lo vede più');
  ok(chiama('stefano@aula.it', 'paziente.condivisione', { id: 'rnonce', condivisi: [] }).errore === 'non-trovato', 'paziente inesistente');
  // chi esce dall'aula: i suoi pazienti passano a chi ospita il custode
  const a2 = chiama('stefano@aula.it', 'accessi.leggi').dati;
  const senzaElena = { utenti: JSON.parse(JSON.stringify(a2.utenti)) }; delete senzaElena.utenti['elena@aula.it'];
  chiama('stefano@aula.it', 'accessi.salva', { accessi: senzaElena, versioneBase: a2.version });
  const st3 = chiama('stefano@aula.it', 'sync', {}).dati;
  ok(st3.ambiti.includes('r:rpriv1') && st3.pazienti.rpriv1.orfano, 'Elena non è più abilitata: chi ospita il custode vede i suoi pazienti');
  ok(chiama('stefano@aula.it', 'paziente.condivisione', { id: 'rpriv1', condivisi: [], proprietario: 'stefano@aula.it' }).dati.mio, 'e può prenderli in carico');
}

// gruppi e classi riservati: le stesse regole, nell'ambito "g:<id>"
{
  const vede = (email, a) => chiama(email, 'sync', {}).dati.ambiti.includes(a);
  ok((chiama('stefano@aula.it', 'io').dati.funzioni || []).includes('gruppi-riservati'), 'il custode dichiara i gruppi riservati');
  // Elena torna operatrice per le prove
  const a0 = chiama('stefano@aula.it', 'accessi.leggi').dati;
  const conElena = { utenti: JSON.parse(JSON.stringify(a0.utenti)) }; conElena.utenti['elena@aula.it'] = { nome: 'Elena', ruolo: 'admin' };
  ok(chiama('stefano@aula.it', 'accessi.salva', { accessi: conElena, versioneBase: a0.version }).ok, 'Elena di nuovo abilitata');
  let r = chiama('stefano@aula.it', 'sync', { invii: [voce('gcla3b', 'gruppo', 'g:gcla3b'), voce('scla1', 'seduta', 'g:gcla3b'), voce('ncla1', 'nota', 'g:gcla3b')] });
  ok(r.dati.esiti.every((e) => e.ok) && r.dati.gruppi.gcla3b.mio && !r.dati.gruppi.gcla3b.tutti, 'Stefano crea una classe riservata, con seduta e nota');
  const el = chiama('elena@aula.it', 'sync', {}).dati;
  ok(!el.ambiti.includes('g:gcla3b') && !el.voci.some((v) => ['gcla3b', 'scla1', 'ncla1'].includes(v.id)) && !el.gruppi.gcla3b, 'Elena non riceve niente della classe');
  ok(chiama('elena@aula.it', 'sync', { invii: [voce('ncla2', 'nota', 'g:gcla3b')] }).dati.esiti[0].errore === 'vietato', 'e non ci scrive');
  ok(chiama('elena@aula.it', 'gruppo.condivisione', { id: 'gcla3b', condivisi: ['elena@aula.it'] }).errore === 'vietato', 'né se la condivide');
  ok(chiama('stefano@aula.it', 'gruppo.condivisione', { id: 'gcla3b', condivisi: ['elena@aula.it', 'marco@aula.it'] }).ok, 'Stefano la condivide con Elena e con il tirocinante Marco');
  ok(vede('elena@aula.it', 'g:gcla3b') && vede('marco@aula.it', 'g:gcla3b'), 'ora la vedono tutti e due');
  ok(chiama('marco@aula.it', 'sync', { invii: [voce('ncla3', 'nota', 'g:gcla3b')] }).dati.esiti[0].ok, 'il tirocinante scrive le note della classe');
  ok(chiama('marco@aula.it', 'sync', { invii: [voce('gcla3b', 'gruppo', 'g:gcla3b', 1)] }).dati.esiti[0].errore === 'vietato', 'ma non modifica la classe');
  ok(chiama('stefano@aula.it', 'gruppo.condivisione', { id: 'gcla3b', condivisi: [] }).ok && !vede('elena@aula.it', 'g:gcla3b') && !vede('marco@aula.it', 'g:gcla3b'), 'tolta la condivisione: non la vedono più');
  // un gruppo di prima, nell'aula: lo rende riservato solo chi l'ha creato
  ok(chiama('elena@aula.it', 'gruppo.condivisione', { id: 'gmart', condivisi: [] }).errore === 'vietato', 'gruppo di prima: Elena non lo rende riservato');
  const gp = chiama('stefano@aula.it', 'gruppo.condivisione', { id: 'gmart', condivisi: [] });
  ok(gp.ok && gp.dati.mio, 'Stefano sì (registrato prima di spostarne i dati)');
  const st = chiama('stefano@aula.it', 'sync', {}).dati;
  const vg = st.voci.find((v) => v.id === 'gmart') || chiama('stefano@aula.it', 'sync', { cursori: {} }).dati.voci.find((v) => v.id === 'gmart');
  r = chiama('stefano@aula.it', 'sync', { invii: [voce('gmart', 'gruppo', 'g:gmart', vg.version)] });
  ok(r.dati.esiti[0].ok && !vede('elena@aula.it', 'g:gmart'), 'i dati del gruppo passano in g:gmart, che Elena non vede');
  const lap = chiama('elena@aula.it', 'sync', { cursori: {} }).dati.voci.find((v) => v.id === 'gmart');
  ok(lap && lap.eliminato && lap.spostato === 'g:gmart', 'a Elena arriva solo la lapide nell\'aula');
  ok(chiama('stefano@aula.it', 'gruppo.condivisione', { id: 'gnessuno', condivisi: [] }).errore === 'non-trovato', 'gruppo inesistente');
  // aperto a tutti: chiunque lo vede nell'aula, e sa di chi è
  ok(chiama('stefano@aula.it', 'gruppo.condivisione', { id: 'gcla3b', condivisi: [], tutti: true }).ok, 'classe aperta a tutti');
  const el2 = chiama('elena@aula.it', 'sync', {}).dati;
  ok(el2.gruppi.gcla3b && el2.gruppi.gcla3b.tutti && el2.gruppi.gcla3b.proprietario === 'stefano@aula.it', 'Elena sa che è di Stefano, aperta a tutti');
}

// programmi: di serie di tutta l'aula, riservabili come i gruppi
{
  const vede = (email, a) => chiama(email, 'sync', {}).dati.ambiti.includes(a);
  let r = chiama('stefano@aula.it', 'sync', { invii: [voce('plife', 'programma', 'aula')] });
  ok(r.dati.esiti[0].ok, 'Stefano mette un programma nella biblioteca dell\'aula');
  ok(chiama('marco@aula.it', 'sync', { invii: [voce('pmarco', 'programma', 'aula')] }).dati.esiti[0].errore === 'vietato', 'i tirocinanti non scrivono programmi');
  ok(chiama('marco@aula.it', 'sync', {}).dati.voci.some((v) => v.id === 'plife'), 'ma li leggono');
  ok(chiama('elena@aula.it', 'programma.condivisione', { id: 'plife', condivisi: [] }).errore === 'vietato', 'Elena non rende riservato il programma di Stefano');
  ok(chiama('stefano@aula.it', 'programma.condivisione', { id: 'plife', condivisi: ['elena@aula.it'] }).ok, 'Stefano lo rende riservato, condiviso con Elena');
  const vp = chiama('stefano@aula.it', 'sync', { cursori: {} }).dati.voci.find((v) => v.id === 'plife');
  r = chiama('stefano@aula.it', 'sync', { invii: [voce('plife', 'programma', 'p:plife', vp.version)] });
  ok(r.dati.esiti[0].ok && vede('elena@aula.it', 'p:plife') && !vede('marco@aula.it', 'p:plife'), 'passa in p:plife: Elena lo vede, Marco no');
  ok(chiama('elena@aula.it', 'sync', {}).dati.programmi.plife.proprietario === 'stefano@aula.it', 'e sa di chi è');
  ok((chiama('stefano@aula.it', 'io').dati.funzioni || []).includes('programmi'), 'il custode dichiara i programmi');
}

// esportazione completa: solo chi ospita il custode, tutto, e resta nel registro
{
  ok(chiama('elena@aula.it', 'esporta.inizia').errore === 'vietato', 'un\'operatrice non fa l\'esportazione completa');
  const ini = chiama('stefano@aula.it', 'esporta.inizia');
  ok(ini.ok && ini.dati.ambiti.includes('aula') && ini.dati.ambiti.some((a) => a.startsWith('g:')) && ini.dati.ambiti.some((a) => a.startsWith('r:')), 'Stefano riceve l\'elenco di tutti gli ambiti');
  const priv = ini.dati.ambiti.filter((a) => a !== 'aula');
  const v = chiama('stefano@aula.it', 'esporta.ambiti', { ambiti: ini.dati.ambiti.slice(0, 40) });
  ok(v.ok && v.dati.voci.length > 0 && v.dati.voci.every((x) => x.busta && !x.eliminato), 'le voci arrivano cifrate, senza le lapidi');
  ok(chiama('elena@aula.it', 'esporta.ambiti', { ambiti: priv.slice(0, 1) }).errore === 'vietato', 'le voci degli altri ambiti non le chiede nessun altro');
  ok(chiama('stefano@aula.it', 'esporta.ambiti', { ambiti: Array(41).fill('aula') }).errore === 'richiesta-non-valida', 'al massimo 40 ambiti per volta');
  const reg = chiama('elena@aula.it', 'esportazioni.leggi');
  ok(reg.ok && reg.dati[0].email === 'stefano@aula.it' && reg.dati[0].il, 'l\'esportazione resta nel registro, che Elena vede');
  ok(chiama('marco@aula.it', 'esportazioni.leggi').errore === 'vietato', 'i tirocinanti no');
}

// tirocinanti: tutti i pazienti dell'aula, accesso a tempo con revoca della chiave
{
  let adesso = new Date('2026-10-08T09:00:00Z');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-custode-'));
  const c2 = creaLocale(d2, { proprietario: 'stefano@aula.it', ora: () => adesso.toISOString() });
  const ch = (email, azione, dati) => c2.gestisci({ v: 1, token: 'dev:' + email + '|' + email.split('@')[0], azione, dati });
  ch('stefano@aula.it', 'cifratura.imposta', { cifratura });
  ch('stefano@aula.it', 'accessi.salva', { accessi: { utenti: {
    'luca@aula.it': { nome: 'Luca', ruolo: 'tirocinante', ragazzi: [], tuttiRagazzi: true, scadenza: '2026-12-31' },
    'sara@aula.it': { nome: 'Sara', ruolo: 'admin', tuttiRagazzi: true },
  } }, versioneBase: 0 });
  const acc = ch('stefano@aula.it', 'accessi.leggi').dati;
  ok(acc.utenti['luca@aula.it'].tuttiRagazzi === true && acc.utenti['sara@aula.it'].tuttiRagazzi === false, 'tutti i pazienti: solo per i tirocinanti');
  ch('stefano@aula.it', 'sync', { invii: [voce('raula1', 'ragazzo', 'r:raula1'), voce('rmio1', 'ragazzo', 'r:rmio1')] });
  ch('stefano@aula.it', 'paziente.condivisione', { id: 'raula1', condivisi: [], tutti: true });
  const io = ch('luca@aula.it', 'io').dati;
  ok(io.tuttiRagazzi === true && io.scadenza === '2026-12-31', 'l\'app sa che Luca vede tutti, fino al 31/12');
  ch('sara@aula.it', 'sync', { invii: [voce('rsara1', 'ragazzo', 'r:rsara1')] });
  const amb = ch('luca@aula.it', 'sync', {}).dati.ambiti;
  ok(acc.utenti['luca@aula.it'].tuttiDa === 'stefano@aula.it', 'tutti: quelli di chi concede l\'accesso (Stefano)');
  ok(amb.includes('r:raula1') && amb.includes('r:rmio1') && !amb.includes('r:rsara1'), 'Luca vede i pazienti di Stefano, anche riservati, non quelli riservati di Sara');
  ch('stefano@aula.it', 'sync', { invii: [voce('rnuovo1', 'ragazzo', 'r:rnuovo1')] });
  ok(ch('luca@aula.it', 'sync', {}).dati.ambiti.includes('r:rnuovo1'), 'e anche quelli nuovi');
  const ac2 = ch('sara@aula.it', 'accessi.leggi').dati;
  ch('sara@aula.it', 'accessi.salva', { accessi: { utenti: ac2.utenti }, versioneBase: ac2.version });
  ok(ch('sara@aula.it', 'accessi.leggi').dati.utenti['luca@aula.it'].tuttiDa === 'stefano@aula.it', 'se Sara salva gli accessi non diventa lei a concederli');
  // dispositivo con la chiave, poi la scadenza
  ch('luca@aula.it', 'dispositivo.registra', { id: 'dluca00001', pubblica: 'AAAA', nome: 'Telefono' });
  ok(ch('stefano@aula.it', 'dispositivi.abilita', { id: 'dluca00001', kid: 'kprova', chiave: 'BBBB', pubblica: 'AAAA' }).ok, 'Luca riceve la chiave');
  adesso = new Date('2027-01-01T09:00:00Z');
  ok(c2.revocaScaduti() === 1 && c2.revocaScaduti() === 0, 'il giorno dopo la scadenza il risveglio revoca la chiave (una volta)');
  ok(ch('luca@aula.it', 'io').errore === 'scaduto', 'e Luca non entra più');
  const d = ch('stefano@aula.it', 'dispositivi.elenco').dati.find((x) => x.id === 'dluca00001');
  ok(d && !d.abilitato && !d.personaAbilitata, 'il dispositivo resta, senza chiave');
  // prolungato: torna in attesa di una nuova consegna
  const a2 = ch('stefano@aula.it', 'accessi.leggi').dati;
  a2.utenti['luca@aula.it'].scadenza = '2027-06-30';
  ch('stefano@aula.it', 'accessi.salva', { accessi: { utenti: a2.utenti }, versioneBase: a2.version });
  const d3 = ch('stefano@aula.it', 'dispositivi.elenco').dati.find((x) => x.id === 'dluca00001');
  ok(d3.personaAbilitata && !d3.abilitato, 'prolungato: riceverà di nuovo la chiave');
  ch('stefano@aula.it', 'dispositivi.abilita', { id: 'dluca00001', kid: 'kprova', chiave: 'BBBB', pubblica: 'AAAA' });
  adesso = new Date('2027-07-01T09:00:00Z');
  ok(ch('luca@aula.it', 'dispositivo.chiave', { id: 'dluca00001' }).errore === 'scaduto'
    && !ch('stefano@aula.it', 'dispositivi.elenco').dati.find((x) => x.id === 'dluca00001').abilitato, 'scaduto e si ripresenta: la chiave si revoca subito');
  fs.rmSync(d2, { recursive: true, force: true });
}

// giro di sincronizzazione veloce: impronta, avvio in una richiesta, raffica, letture
{
  const PD = require('../custode/core.js');
  const { archivioSuDisco } = require('./custode-locale.cjs');
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-veloce-'));
  const base = archivioSuDisco(d3), conta = { r: 0, scritti: [] };
  let t = Date.parse('2026-05-04T09:00:00Z');
  const c3 = PD.creaCustode({
    archivio: { leggiJSON: (x) => { conta.r++; return base.leggiJSON(x); }, scriviJSON: (x, o) => { conta.scritti.push(x); base.scriviJSON(x, o); }, esiste: base.esiste, conLock: base.conLock },
    verificaToken: (tk) => { const m = /^dev:([^|]+)/.exec(tk); return { email: m[1], nome: m[1] }; },
    proprietario: () => 'stefano@aula.it', ora: () => new Date(t).toISOString(),
  });
  const ch3 = (email, azione, dati) => c3.gestisci({ v: 1, token: 'dev:' + email, azione, dati });
  ch3('stefano@aula.it', 'cifratura.imposta', { cifratura });
  ch3('stefano@aula.it', 'accessi.salva', { accessi: { utenti: { 'elena@aula.it': { nome: 'Elena', ruolo: 'admin' } } }, versioneBase: 0 });
  for (let i = 0; i < 5; i++) ch3('elena@aula.it', 'dispositivo.registra', { id: 'dispo' + i + 'abcd', pubblica: 'AAAA', nome: 'x' });
  const inv = [];
  for (let i = 0; i < 20; i++) { const id = 'rp' + String(i).padStart(2, '0'); inv.push(voce(id, 'ragazzo', 'aula'), voce(id + 's', 'scheda', 'r:' + id)); }
  const prima = ch3('stefano@aula.it', 'sync', { invii: inv }).dati;
  ok(prima.impronta && !prima.uguale && prima.pazienti && Object.keys(prima.pazienti).length === 20, 'la prima risposta porta tutto e un\'impronta');
  const completo = ch3('stefano@aula.it', 'sync', { cursori: prima.cursori }).dati;
  conta.r = 0;
  const lieve = ch3('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta });
  ok(lieve.dati.uguale === true && lieve.dati.voci.length === 0 && !lieve.dati.pazienti && !lieve.dati.ambiti, 'con l\'impronta giusta il giro «niente di nuovo» non rimanda elenchi');
  ok(JSON.stringify(lieve).length < 400 && JSON.stringify(lieve).length * 8 < JSON.stringify(completo).length, 'e pesa una frazione (' + JSON.stringify(lieve).length + ' contro ' + JSON.stringify(completo).length + ' byte)');
  ok(conta.r <= 5, 'e legge pochi file: ' + conta.r + ' letture con 5 dispositivi registrati');
  ok(ch3('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: 'sbagliata' }).dati.pazienti, 'con un\'impronta diversa torna l\'elenco completo');
  ok(ch3('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta }).dati.impronta === prima.impronta, 'l\'impronta è stabile finché non cambia niente');
  // una novità: arrivano le voci e i cursori, ma non gli elenchi
  const novita = ch3('elena@aula.it', 'sync', { invii: [voce('nx1', 'nota', 'aula')] }).dati;
  const vede = ch3('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta }).dati;
  ok(vede.uguale && vede.voci.length === 1 && vede.voci[0].id === 'nx1' && vede.cursori && vede.ambiti, 'una novità arriva con i cursori, senza rimandare gli elenchi');
  // un paziente nuovo cambia l'impronta
  ch3('stefano@aula.it', 'sync', { invii: [voce('rzz01', 'ragazzo', 'aula'), voce('rzz01s', 'scheda', 'r:rzz01')] });
  ok(ch3('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta }).dati.pazienti, 'un paziente nuovo: elenchi di nuovo completi');
  // l'accesso che cambia cambia l'impronta
  const ie = ch3('elena@aula.it', 'sync', { cursori: {} }).dati;
  const a3 = ch3('stefano@aula.it', 'accessi.leggi').dati;
  a3.utenti['elena@aula.it'].scadenza = '2099-01-01';
  ch3('stefano@aula.it', 'accessi.salva', { accessi: { utenti: a3.utenti }, versioneBase: a3.version });
  const ie2 = ch3('elena@aula.it', 'sync', { cursori: {}, impronta: ie.impronta }).dati;
  ok(!ie2.uguale && ie2.accesso.scadenza === '2099-01-01', 'cambia l\'accesso: l\'app lo riceve');
  // avvio: profilo e novità insieme
  const av = ch3('elena@aula.it', 'sync', { cursori: {}, io: true }).dati;
  ok(av.io && av.io.email === 'elena@aula.it' && av.io.kid === 'kprova' && av.io.cfg && av.io.funzioni.includes('sync-rapido') && av.voci.length > 0, 'avvio in una richiesta: profilo, chiave e voci insieme');
  ok(!ch3('elena@aula.it', 'sync', { cursori: {} }).dati.io, 'senza chiederlo il profilo non c\'è');
  // salvataggi a raffica: la storia non si riscrive, poi sì
  const unica = (n) => Object.assign(busta(), { iv: 'AAAAAAAAAAAA' + String(n).padStart(4, '0') });
  const salva = (ver, n) => ch3('elena@aula.it', 'sync', { invii: [Object.assign(voce('sraf1', 'seduta', 'aula', ver), { busta: unica(n) })] }).dati.esiti[0].version;
  let ver = salva(0, 0);
  conta.scritti = [];
  ver = salva(ver, 1);                        // la prima versione si archivia
  ok(conta.scritti.includes('Storia/aula.json'), 'il secondo salvataggio archivia la prima versione');
  for (let k = 2; k <= 6; k++) { t += 5000; conta.scritti = []; ver = salva(ver, k); ok(!conta.scritti.includes('Storia/aula.json') && conta.scritti.includes('Dati/aula.json'), 'salvataggio a raffica #' + k + ': si scrive il dato, non la storia'); }
  ok(ch3('elena@aula.it', 'voce.storia', { id: 'sraf1', ambito: 'aula' }).dati.length === 1, 'nella storia resta una versione sola');
  t += 4 * 60000; conta.scritti = [];
  ver = salva(ver, 7);
  ok(conta.scritti.includes('Storia/aula.json'), 'dopo qualche minuto la storia si aggiorna di nuovo');
  ok(ch3('elena@aula.it', 'voce.storia', { id: 'sraf1', ambito: 'aula' }).dati.length === 1, '(sempre una versione, le bozze si condensano)');
  t += 5000; conta.scritti = [];
  ch3('stefano@aula.it', 'sync', { invii: [Object.assign(voce('sraf1', 'seduta', 'aula', ver), { busta: unica(8) })] });
  ok(conta.scritti.includes('Storia/aula.json'), 'se interviene un\'altra persona la versione di Elena si archivia subito');
  fs.rmSync(d3, { recursive: true, force: true });
}

// ---- corsia rapida: lo stato in cache ----
{
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-rapido-'));
  const k = creaLocale(d4, { proprietario: 'stefano@aula.it' });
  const ch = (email, azione, dati) => k.gestisci({ v: 1, token: 'dev:' + email, azione, dati });
  const letture = (fn) => { k.conta.letture = 0; k.conta.file = []; const r = fn(); return { r, n: k.conta.letture, file: k.conta.file.join(',') }; };
  ch('stefano@aula.it', 'cifratura.imposta', { cifratura });
  ch('stefano@aula.it', 'accessi.salva', { accessi: { utenti: {
    'elena@aula.it': { nome: 'Elena', ruolo: 'admin' },
    'giulia@aula.it': { nome: 'Giulia', ruolo: 'tirocinante', ragazzi: ['rlu01'] },
  } }, versioneBase: 0 });
  const prima = ch('stefano@aula.it', 'sync', { invii: [voce('gmart', 'gruppo', 'aula'), voce('rlu01', 'ragazzo', 'aula'), voce('rlu01s', 'scheda', 'r:rlu01'), voce('sind1', 'seduta', 'r:rlu01')] }).dati;
  const ioG = ch('giulia@aula.it', 'sync', { cursori: {} }).dati;

  // a riposo: nessuna lettura di file, per chiunque, e la risposta è quella di sempre
  let x = letture(() => ch('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta }));
  ok(x.r.ok && x.r.dati.uguale === true && x.r.dati.voci.length === 0 && x.n === 0, 'sync a riposo (operatore): zero letture di file [' + x.n + ']');
  x = letture(() => ch('giulia@aula.it', 'sync', { cursori: ioG.cursori, impronta: ioG.impronta }));
  ok(x.r.dati.uguale === true && x.n === 0, 'sync a riposo (tirocinante): zero letture di file [' + x.n + ']');
  x = letture(() => ch('stefano@aula.it', 'sync', { cursori: prima.cursori }));
  ok(x.r.dati.pazienti && x.r.dati.pazienti.rlu01 && x.n === 0, 'senza impronta: elenchi completi, sempre senza leggere file');
  x = letture(() => ch('stefano@aula.it', 'sync', { cursori: {}, io: true }));
  ok(x.r.dati.io && x.r.dati.io.cfg && x.r.dati.io.kid === 'kprova' && x.r.dati.voci.length > 0 && x.n <= 3, 'avvio con profilo e voci: soltanto i file degli ambiti [' + x.file + ']');
  x = letture(() => ch('stefano@aula.it', 'io'));
  ok(x.r.dati.cfg && x.n === 0, 'il profilo («io») si legge dalla cache');
  ok(typeof x.r.ms === 'number' && x.r.ms >= 0 && typeof ch('ignoto@x.it', 'io').ms === 'number', 'ogni risposta dice «ms», anche gli errori');

  // un invio: il cambiamento arriva all'altro e subito dopo si torna a riposo
  const inv = ch('elena@aula.it', 'sync', { invii: [voce('n1', 'nota', 'aula')] }).dati;
  ok(inv.esiti[0].ok, 'Elena invia una nota');
  x = letture(() => ch('stefano@aula.it', 'sync', { cursori: prima.cursori, impronta: prima.impronta }));
  ok(x.r.dati.voci.length === 1 && x.r.dati.voci[0].id === 'n1' && x.r.dati.rev === inv.rev, 'dopo l\'invio l\'altro riceve la nota e la revisione nuova (mai «niente di nuovo»)');
  const cur2 = x.r.dati.cursori;
  x = letture(() => ch('stefano@aula.it', 'sync', { cursori: cur2, impronta: prima.impronta }));
  ok(x.r.dati.uguale && x.r.dati.voci.length === 0 && x.n === 0, 'e di nuovo a riposo, senza letture');
  // un paziente nuovo cambia l'impronta e la cache lo sa
  const eleP = ch('elena@aula.it', 'sync', { cursori: {} }).dati;
  ch('stefano@aula.it', 'sync', { invii: [voce('rpa02', 'ragazzo', 'aula'), voce('rpa02s', 'scheda', 'r:rpa02')] });
  x = letture(() => ch('stefano@aula.it', 'sync', { cursori: cur2, impronta: prima.impronta }));
  ok(!x.r.dati.uguale && x.r.dati.pazienti.rpa02 && x.r.dati.pazienti.rpa02.proprietario === 'stefano@aula.it' && x.r.dati.voci.some((v) => v.id === 'rpa02s'), 'un paziente nuovo: elenchi aggiornati e voci per chi lo vede');
  const eleD = ch('elena@aula.it', 'sync', { cursori: eleP.cursori, impronta: eleP.impronta }).dati;
  ok(!eleD.ambiti.includes('r:rpa02') && !eleD.voci.some((v) => v.id === 'rpa02s'), '…ma non per chi non lo vede (anche con l\'impronta vecchia)');

  // una scrittura che fallisce a metà non lascia in cache uno stato falso
  const stF = ch('stefano@aula.it', 'sync', { cursori: {} }).dati;
  k.conta.guastoSu = '_config/stato.json';
  ok(ch('elena@aula.it', 'sync', { invii: [voce('nfail', 'nota', 'aula')] }).errore === 'interno', 'scrittura interrotta: errore, l\'app riprova');
  k.conta.guastoSu = null;
  const dopoG = ch('stefano@aula.it', 'sync', { cursori: stF.cursori, impronta: stF.impronta }).dati;
  ok(dopoG.rev === stF.rev && !dopoG.voci.some((v) => v.id === 'nfail'), 'dopo l\'interruzione la cache non dice cose false');
  ok(ch('elena@aula.it', 'sync', { invii: [voce('nfail', 'nota', 'aula')] }).dati.esiti[0].ok, 'il reinvio va a buon fine');
  ok(ch('elena@aula.it', 'sync', { invii: [voce('nfail2', 'nota', 'aula')] }).dati.esiti[0].ok, 'un altro invio dopo l\'interruzione');
  const dopoR = ch('stefano@aula.it', 'sync', { cursori: stF.cursori, impronta: stF.impronta }).dati;
  ok(dopoR.voci.some((v) => v.id === 'nfail2') && dopoR.rev > stF.rev, 'e Stefano lo riceve');

  // accessi: cambiano e l'effetto è immediato (scadenza, pazienti assegnati, disattivazione)
  let acc;
  const sa = (mod) => { acc = ch('stefano@aula.it', 'accessi.leggi').dati; mod(acc.utenti); return ch('stefano@aula.it', 'accessi.salva', { accessi: { utenti: acc.utenti }, versioneBase: acc.version }); };
  const cG = ch('giulia@aula.it', 'sync', { cursori: {} }).dati;
  ok(cG.voci.some((v) => v.id === 'sind1'), 'Giulia vede Luca (assegnato)');
  ok(sa((u) => { u['giulia@aula.it'].ragazzi = []; }).ok, 'tolgo Luca a Giulia');
  x = letture(() => ch('giulia@aula.it', 'sync', { cursori: cG.cursori, impronta: cG.impronta }));
  ok(!x.r.dati.uguale && !x.r.dati.ambiti.includes('r:rlu01') && x.r.dati.accesso.ragazzi.length === 0, 'cambio accessi: l\'impronta di Giulia non coincide più e il paziente non le è più elencato');
  ok(sa((u) => { u['giulia@aula.it'].scadenza = '2020-01-01'; }).ok, 'scadenza nel passato');
  ok(ch('giulia@aula.it', 'sync', { cursori: cG.cursori, impronta: cG.impronta }).errore === 'scaduto', 'accesso scaduto: rifiutato subito');
  ok(sa((u) => { u['giulia@aula.it'].scadenza = null; u['giulia@aula.it'].attivo = false; }).ok, 'disattivata');
  ok(ch('giulia@aula.it', 'sync', { cursori: cG.cursori }).errore === 'disattivato', 'accesso disattivato: rifiutato subito');
  ok(sa((u) => { u['giulia@aula.it'].attivo = true; }).ok && ch('giulia@aula.it', 'sync', { cursori: {} }).ok, 'riattivata: rientra');
  ok(sa((u) => { delete u['giulia@aula.it']; }).ok && ch('giulia@aula.it', 'sync', { cursori: {} }).errore === 'non-autorizzato', 'tolta dall\'elenco: fuori subito');
  ok(sa((u) => { u['giulia@aula.it'] = { nome: 'Giulia', ruolo: 'tirocinante', ragazzi: [] }; }).ok, 'rimessa');

  // dispositivi: richiesta di chiave in attesa, consegna, revoca
  const attesa = (e) => ch(e, 'sync', { cursori: {} }).dati.inAttesa;
  ok(attesa('stefano@aula.it') === 0, 'nessuno aspetta la chiave');
  ok(ch('giulia@aula.it', 'dispositivo.registra', { id: 'dispo01giulia', pubblica: 'AAAA', nome: 'Telefono' }).ok, 'Giulia registra un dispositivo');
  ok(attesa('stefano@aula.it') === 1, 'l\'operatore vede subito 1 richiesta in attesa');
  x = letture(() => ch('giulia@aula.it', 'dispositivo.chiave', { id: 'dispo01giulia' }));
  ok(x.r.dati.kid === 'kprova' && Object.keys(x.r.dati.chiavi).length === 0 && x.n === 0, 'chi aspetta controlla senza leggere file [' + x.n + ']');
  const el = ch('stefano@aula.it', 'dispositivi.elenco').dati.find((z) => z.id === 'dispo01giulia');
  ok(ch('stefano@aula.it', 'dispositivi.abilita', { id: 'dispo01giulia', kid: 'kprova', chiave: 'QUJD', pubblica: el.pubblica }).ok, 'l\'operatore consegna la chiave');
  ok(attesa('stefano@aula.it') === 0 && Object.keys(ch('giulia@aula.it', 'dispositivo.chiave', { id: 'dispo01giulia' }).dati.chiavi).length === 1, 'chiave consegnata: nessuna attesa, e Giulia la trova');
  ok(sa((u) => { delete u['giulia@aula.it']; }).ok, 'Giulia tolta dagli accessi');
  ok(ch('stefano@aula.it', 'dispositivi.elenco').dati.every((z) => z.id !== 'dispo01giulia'), 'il suo dispositivo (e la chiave) non c\'è più');
  ok(sa((u) => { u['giulia@aula.it'] = { nome: 'Giulia', ruolo: 'tirocinante', ragazzi: [] }; }).ok, 'rimessa');
  ch('giulia@aula.it', 'dispositivo.registra', { id: 'dispo02giulia', pubblica: 'AAAA', nome: 'Tablet' });
  const el2 = ch('stefano@aula.it', 'dispositivi.elenco').dati.find((z) => z.id === 'dispo02giulia');
  ch('stefano@aula.it', 'dispositivi.abilita', { id: 'dispo02giulia', kid: 'kprova', chiave: 'QUJD', pubblica: el2.pubblica });
  ok(ch('giulia@aula.it', 'dispositivo.togli', { id: 'dispo02giulia' }).ok, 'Giulia toglie il suo dispositivo');
  ok(ch('giulia@aula.it', 'dispositivo.chiave', { id: 'dispo02giulia' }).errore === 'non-trovato', 'revocato: il dispositivo non è più riconosciuto');
  // scadenza: le chiavi di chi scade si ritirano
  ch('giulia@aula.it', 'dispositivo.registra', { id: 'dispo03giulia', pubblica: 'AAAA', nome: 'Altro' });
  const el3 = ch('stefano@aula.it', 'dispositivi.elenco').dati.find((z) => z.id === 'dispo03giulia');
  ch('stefano@aula.it', 'dispositivi.abilita', { id: 'dispo03giulia', kid: 'kprova', chiave: 'QUJD', pubblica: el3.pubblica });
  sa((u) => { u['giulia@aula.it'].scadenza = '2020-01-01'; });
  ok(ch('giulia@aula.it', 'dispositivo.chiave', { id: 'dispo03giulia' }).errore === 'scaduto', 'accesso scaduto: anche il controllo della chiave è rifiutato');
  const d3g = ch('stefano@aula.it', 'dispositivi.elenco').dati.find((z) => z.id === 'dispo03giulia');
  ok(d3g && d3g.abilitato === false, 'e il dispositivo ha perso la chiave');
  sa((u) => { u['giulia@aula.it'].scadenza = null; });

  // condivisione di un paziente riservato
  ok(!ch('giulia@aula.it', 'sync', { cursori: {} }).dati.ambiti.includes('r:rpa02'), 'un paziente riservato non è elencato a chi non c\'entra');
  ok(ch('stefano@aula.it', 'paziente.condivisione', { id: 'rpa02', condivisi: ['elena@aula.it'], tutti: false }).ok, 'Stefano condivide un paziente con Elena');
  const curE = Object.fromEntries(eleD.ambiti.map((a) => [a, eleD.cursori[a]]));   // l'app tiene i cursori dei soli ambiti visibili
  const dE = ch('elena@aula.it', 'sync', { cursori: curE, impronta: eleD.impronta }).dati;
  ok(!dE.uguale && dE.pazienti.rpa02.condivisi.includes('elena@aula.it') && dE.voci.some((v) => v.id === 'rpa02s'), 'Elena lo vede subito, con le sue voci');
  ok(ch('stefano@aula.it', 'paziente.condivisione', { id: 'rpa02', condivisi: ['giulia@aula.it'], tutti: false }).ok && ch('giulia@aula.it', 'sync', { cursori: {} }).dati.ambiti.includes('r:rpa02') && !ch('elena@aula.it', 'sync', { cursori: {} }).dati.ambiti.includes('r:rpa02'), 'poi con Giulia al posto di Elena: cambia subito per tutte e due');

  // cache vuota o scaduta: si ricostruisce da Drive e poi si torna veloci
  const att = ch('stefano@aula.it', 'sync', { cursori: {} }).dati;
  k.cache.scadi();
  x = letture(() => ch('stefano@aula.it', 'sync', { cursori: att.cursori, impronta: att.impronta }));
  ok(x.r.dati.uguale === true && x.r.dati.rev === att.rev && x.n >= 5 && x.n <= 5 + 8, 'cache vuota: risposta giusta, ricostruita leggendo i 5 file (più gli ambiti sporchi) [' + x.n + ']');
  x = letture(() => ch('stefano@aula.it', 'sync', { cursori: att.cursori, impronta: att.impronta }));
  ok(x.r.dati.uguale === true && x.n === 0, 'poi di nuovo zero letture');
  k.cache.scadi();
  ok(ch('elena@aula.it', 'sync', { invii: [voce('n9', 'nota', 'aula')] }).dati.esiti[0].ok, 'cache vuota e invio: va a buon fine');
  ok(ch('stefano@aula.it', 'sync', { cursori: att.cursori, impronta: att.impronta }).dati.voci.some((v) => v.id === 'n9'), 'e l\'altro riceve la nota');
  k.cache.put('stato1', '{non json', 100);
  ok(ch('stefano@aula.it', 'sync', { cursori: att.cursori }).ok, 'voce di cache rovinata: si ricostruisce');
  fs.rmSync(d4, { recursive: true, force: true });
}
{
  // senza cache (o con la cache che non legge né scrive) il custode funziona come prima
  const d5 = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-nocache-'));
  const rotta = { get: () => { throw new Error('cache giù'); }, put: () => { throw new Error('cache giù'); }, remove: () => {} };
  for (const [nome, cache] of [['senza cache', false], ['con la cache che dà errore', rotta]]) {
    const k = creaLocale(fs.mkdtempSync(path.join(d5, 'x-')), { proprietario: 'stefano@aula.it', cache });
    const ch = (email, azione, dati) => k.gestisci({ v: 1, token: 'dev:' + email, azione, dati });
    ch('stefano@aula.it', 'cifratura.imposta', { cifratura });
    const b = ch('stefano@aula.it', 'sync', { invii: [voce('gq', 'gruppo', 'aula')] });
    const z = ch('stefano@aula.it', 'sync', { cursori: b.dati ? b.dati.cursori : {}, impronta: b.dati && b.dati.impronta });
    ok(b.ok && z.ok && z.dati.uguale && z.dati.rev === 1, nome + ': invio e sync a riposo corretti');
  }
  // se la cache non riesce a togliere lo stato vecchio, NON si scrive: meglio un errore (l'app riprova)
  // che un «niente di nuovo» falso per ore
  const k2 = creaLocale(fs.mkdtempSync(path.join(d5, 'x-')), { proprietario: 'stefano@aula.it', cache: { get: () => null, put: () => {}, remove: () => { throw new Error('non riesco a svuotare'); } } });
  const r2 = k2.gestisci({ v: 1, token: 'dev:stefano@aula.it', azione: 'cifratura.imposta', dati: { cifratura } });
  ok(!r2.ok && r2.errore === 'interno' && k2.conta.scritture === 0, 'cache che non si svuota: la scrittura non parte (errore, l\'app riprova)');
  fs.rmSync(d5, { recursive: true, force: true });
}

// ---- salvataggio leggero: poche operazioni, stato.json solo quando serve ----
{
  const d6 = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-leggero-'));
  const k = creaLocale(d6, { proprietario: 'stefano@aula.it' });
  const ch = (email, azione, dati) => k.gestisci({ v: 1, token: 'dev:' + email, azione, dati });
  const unica = (i) => Object.assign(busta(), { iv: 'AAAAAAAAAAAA' + String(i).padStart(4, '0') });
  const letto = (p) => JSON.parse(fs.readFileSync(path.join(d6, p), 'utf8'));
  const prova = (fn) => { k.conta.letture = 0; k.conta.scritture = 0; k.conta.file = []; k.conta.scritti = []; return fn(); };
  ch('stefano@aula.it', 'cifratura.imposta', { cifratura });
  ch('stefano@aula.it', 'accessi.salva', { accessi: { utenti: { 'elena@aula.it': { nome: 'Elena', ruolo: 'admin' } } }, versioneBase: 0 });
  const salva = (email, id, ver, i, ambito = 'aula', tipo = 'seduta') => ch(email, 'sync', { invii: [Object.assign(voce(id, tipo, ambito, ver), { busta: unica(i) })] });
  const altro = ch('elena@aula.it', 'sync', { cursori: {} }).dati;

  // voce nuova: cambia l'indice, stato.json si riscrive (e l'ambito diventa «sporco»)
  let x = prova(() => salva('stefano@aula.it', 'sl1', 0, 0));
  ok(x.ok && x.dati.esiti[0].ok && k.conta.scritti.includes('_config/stato.json') && k.conta.scritti.includes('Dati/aula.json'), 'voce nuova: si scrivono stato.json e il file dell\'ambito');
  ok(letto('_config/stato.json').sporco.aula === true && letto('_config/stato.json').indice.sl1 === 'aula', 'stato.json segna l\'ambito come sporco e ha l\'indice');
  ok(x.fasi && typeof x.fasi === 'object' && x.fasi.nScritture >= 2 && Array.isArray(x.fasi.file) && x.fasi.file.some((f) => /^S aula:\d+$/.test(f)), 'la risposta dice le fasi (scritture e file)');
  // modifica di una voce che c'è: prima volta archivia la storia, ma stato.json non si riscrive
  x = prova(() => salva('stefano@aula.it', 'sl1', 1, 1));
  ok(x.dati.esiti[0].ok && !k.conta.scritti.includes('_config/stato.json') && k.conta.scritti.includes('Dati/aula.json') && k.conta.scritti.includes('Storia/aula.json'), 'seconda modifica: file dei dati e storia, non stato.json [' + k.conta.scritti + ']');
  // raffica: un solo file scritto, e la storia non si legge nemmeno
  const rev0 = x.dati.rev;
  for (let i = 2; i <= 5; i++) {
    x = prova(() => salva('stefano@aula.it', 'sl1', i, i));
    ok(x.dati.esiti[0].ok && k.conta.scritti.join() === 'Dati/aula.json' && k.conta.scritture === 1 && !k.conta.file.includes('Storia/aula.json') && k.conta.letture <= 1, 'raffica #' + i + ': una scrittura (il file dei dati) e al più una lettura [' + k.conta.scritti + ' | ' + k.conta.file + ']');
    ok(x.dati.rev === rev0 + i - 1, 'la revisione cresce di uno a ogni salvataggio (' + x.dati.rev + ')');
  }
  ok(x.fasi.nScritture === 1 && x.fasi.nLetture <= 1, 'le fasi lo confermano (' + x.fasi.nLetture + ' letture, ' + x.fasi.nScritture + ' scritture)');
  // stato.json su Drive è rimasto indietro, ma chi chiede riceve la revisione giusta e la novità
  ok(letto('_config/stato.json').rev < x.dati.rev, 'stato.json su disco è in ritardo (di proposito)');
  let o = ch('elena@aula.it', 'sync', { cursori: altro.cursori, impronta: altro.impronta });
  ok(o.dati.rev === x.dati.rev && o.dati.voci.some((v) => v.id === 'sl1' && v.version === 6) && o.dati.voci.every((v) => !('arch' in v)), 'l\'altro riceve l\'ultima versione, senza il promemoria interno');
  ok(!('arch' in (salva('stefano@aula.it', 'sl1', 0, 9).dati.esiti[0].extra.attuale)), 'nemmeno nei conflitti esce il promemoria');
  // la cache sparisce (scade, Google la svuota): le revisioni si ricostruiscono dai file, mai indietro
  k.cache.scadi();
  o = ch('elena@aula.it', 'sync', { cursori: altro.cursori, impronta: altro.impronta });
  ok(o.dati.rev === x.dati.rev && o.dati.voci.some((v) => v.id === 'sl1' && v.version === 6), 'cache vuota: stessa revisione e stessa novità');
  k.cache.scadi();
  x = salva('elena@aula.it', 'sl1', 6, 10);
  ok(x.dati.esiti[0].ok && x.dati.rev === o.dati.rev + 1, 'cache vuota e salvataggio: la revisione continua senza saltare indietro');
  ok(ch('stefano@aula.it', 'sync', { cursori: o.dati.cursori }).dati.voci.some((v) => v.id === 'sl1' && v.version === 7), 'e Stefano lo riceve');
  // anche il rev dell'ambito che gli altri vedono torna giusto dopo una cache vuota in mezzo a più salvataggi
  k.cache.scadi(); salva('elena@aula.it', 'sl1', 7, 11);
  k.cache.scadi(); const dopo = salva('stefano@aula.it', 'sl1', 8, 12);
  ok(dopo.dati.esiti[0].ok && dopo.dati.rev === x.dati.rev + 2, 'due cache vuote di fila: nessuna revisione ripetuta o persa');

  // un salvataggio interrotto a metà non lascia stati falsi
  const st1 = ch('elena@aula.it', 'sync', { cursori: {} }).dati;
  k.conta.guastoSu = 'Dati/aula.json';
  ok(salva('stefano@aula.it', 'sl1', 9, 13).errore === 'interno', 'scrittura leggera interrotta: errore, l\'app riprova');
  k.conta.guastoSu = null;
  const st2 = ch('elena@aula.it', 'sync', { cursori: st1.cursori, impronta: st1.impronta }).dati;
  ok(st2.rev === st1.rev && st2.voci.length === 0, 'dopo l\'interruzione nessuna novità falsa');
  ok(salva('stefano@aula.it', 'sl1', 9, 13).dati.esiti[0].ok && ch('elena@aula.it', 'sync', { cursori: st1.cursori }).dati.voci.some((v) => v.version === 10), 'il reinvio va a buon fine e arriva');

  // una voce scritta prima del promemoria (senza «arch») si comporta come prima
  const f = letto('Dati/aula.json'); delete f.voci.sl1.arch; fs.writeFileSync(path.join(d6, 'Dati/aula.json'), JSON.stringify(f)); k.cache.scadi();
  x = prova(() => salva('stefano@aula.it', 'sl1', 10, 14));
  ok(x.dati.esiti[0].ok && !k.conta.scritti.includes('Storia/aula.json'), 'voce vecchia, senza promemoria: la raffica si riconosce leggendo la storia');
  x = prova(() => salva('stefano@aula.it', 'sl1', 11, 15));
  ok(x.dati.esiti[0].ok && !k.conta.file.includes('Storia/aula.json') && k.conta.scritti.join() === 'Dati/aula.json', 'e dal salvataggio dopo il promemoria c\'è e la storia non si legge più');

  // nessun cambiamento: niente da riscrivere (conflitto, reinvio)
  x = prova(() => salva('stefano@aula.it', 'sl1', 3, 99));
  ok(x.dati.esiti[0].errore === 'conflitto' && k.conta.scritture === 0, 'un conflitto non riscrive niente');

  // una voce in un ambito nuovo (paziente) e poi le modifiche leggere lì
  x = prova(() => ch('stefano@aula.it', 'sync', { invii: [voce('rsl01', 'ragazzo', 'aula'), voce('rsl01s', 'scheda', 'r:rsl01')] }));
  ok(x.dati.esiti.every((e) => e.ok) && k.conta.scritti.includes('_config/stato.json') && k.conta.scritti.includes('_config/pazienti.json'), 'paziente nuovo: registro e stato.json');
  x = prova(() => salva('stefano@aula.it', 'rsl01s', 1, 20, 'r:rsl01', 'scheda'));
  ok(x.dati.esiti[0].ok && !k.conta.scritti.includes('_config/stato.json') && k.conta.scritti.includes('Dati/ragazzi/rsl01.json'), 'modifica della scheda: solo il suo file (e la storia)');
  x = prova(() => salva('stefano@aula.it', 'rsl01s', 2, 21, 'r:rsl01', 'scheda'));
  ok(k.conta.scritti.join() === 'Dati/ragazzi/rsl01.json', 'e in raffica solo il suo file [' + k.conta.scritti + ']');
  // una voce che cambia ambito: cambia l'indice e lo stato si riscrive, la lapide resta
  x = prova(() => salva('stefano@aula.it', 'sl1', 12, 30, 'r:rsl01', 'seduta'));
  ok(x.dati.esiti[0].ok && k.conta.scritti.includes('_config/stato.json'), 'cambio di ambito: stato.json si riscrive (indice)');
  ok(salva('stefano@aula.it', 'sl1', 13, 31, 'r:rsl01', 'seduta').dati.esiti[0].ok, 'e la voce si modifica ancora nel nuovo ambito');
  ok(ch('stefano@aula.it', 'voce.storia', { id: 'sl1', ambito: 'r:rsl01' }).ok, 'la storia si legge');

  // molti ambiti nuovi: l'elenco degli «sporchi» resta piccolo e la ricostruzione è giusta
  const molti = [];
  for (let i = 0; i < 14; i++) { const id = 'rm' + String(i).padStart(2, '0'); molti.push(voce(id, 'ragazzo', 'aula'), voce(id + 's', 'scheda', 'r:' + id)); }
  ch('stefano@aula.it', 'sync', { invii: molti });
  for (let i = 0; i < 14; i++) { const id = 'rm' + String(i).padStart(2, '0'); salva('stefano@aula.it', id + 's', 1, 40 + i, 'r:' + id, 'scheda'); salva('stefano@aula.it', id + 's', 2, 60 + i, 'r:' + id, 'scheda'); }
  ok(Object.keys(letto('_config/stato.json').sporco).length <= 8, 'gli ambiti sporchi non superano il massimo (' + Object.keys(letto('_config/stato.json').sporco).length + ')');
  const viva = ch('stefano@aula.it', 'sync', { cursori: {} }).dati;
  k.cache.scadi();
  const rico = ch('stefano@aula.it', 'sync', { cursori: {} }).dati;
  ok(rico.rev === viva.rev && JSON.stringify(rico.cursori) === JSON.stringify(viva.cursori), 'dopo la cache vuota revisione e cursori di ogni ambito sono quelli di prima');
  // una voce con 8 ambiti scritti insieme in un colpo
  const insieme = []; for (let i = 0; i < 12; i++) { const id = 'rm' + String(i).padStart(2, '0'); insieme.push(Object.assign(voce(id + 's', 'scheda', 'r:' + id, 3), { busta: unica(100 + i) })); }
  ok(ch('stefano@aula.it', 'sync', { invii: insieme }).dati.esiti.every((e) => e.ok), 'dodici ambiti in una richiesta sola');
  k.cache.scadi();
  const fine = ch('stefano@aula.it', 'sync', { cursori: {} }).dati;
  ok(fine.rev === viva.rev + 12 && fine.voci.filter((v) => v.version === 4).length === 12, 'tutti ricostruiti e visibili dopo la cache vuota');

  // senza cache non si usa la scrittura leggera (ogni salvataggio riscrive stato.json, come prima)
  const k2 = creaLocale(fs.mkdtempSync(path.join(d6, 'x-')), { proprietario: 'stefano@aula.it', cache: false });
  const c2 = (azione, dati) => k2.gestisci({ v: 1, token: 'dev:stefano@aula.it', azione, dati });
  c2('cifratura.imposta', { cifratura });
  c2('sync', { invii: [voce('a1', 'seduta', 'aula')] });
  k2.conta.scritti = [];
  c2('sync', { invii: [Object.assign(voce('a1', 'seduta', 'aula', 1), { busta: unica(1) })] });
  ok(k2.conta.scritti.includes('_config/stato.json') && c2('sync', { cursori: {} }).dati.rev === 2, 'senza cache: stato.json si riscrive a ogni salvataggio');
  fs.rmSync(d6, { recursive: true, force: true });
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${n - falliti}/${n} superati`);
process.exit(falliti ? 1 : 0);
