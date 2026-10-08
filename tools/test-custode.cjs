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

// pazienti riservati: di chi li crea, visibili ad altri solo se condivisi
{
  // tutto quello creato sopra fa da "pazienti di prima" (custode senza registro)
  fs.rmSync(path.join(dir, '_config/pazienti.json'), { force: true });
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

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${n - falliti}/${n} superati`);
process.exit(falliti ? 1 : 0);
