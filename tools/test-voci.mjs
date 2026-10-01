// Test di voci.js: ambiti, divisione dei ragazzi, unione dei conflitti.
import { vociDi, applica, unisci, ambitoDi, immaginiDi, idVociDi, destinazione } from '../src/lib/centro/voci.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'ok  ' : 'NO  ') + m); };

const luca = { id: 'rluca01', nome: 'Luca', cognome: 'M', diagnosi: 'DSA', genitori: [{ nome: 'Paola' }], foto: 'i123' };
const [pub, sch] = vociDi('ragazzi', luca);
ok(pub.ambito === 'aula' && pub.dati.nome === 'Luca' && !('diagnosi' in pub.dati) && pub.dati.foto === 'i123', 'nel pubblico solo nome, foto, classe…');
ok(sch.ambito === 'r:rluca01' && sch.dati.diagnosi === 'DSA' && !('nome' in sch.dati), 'l\'anagrafica va nell\'ambito del ragazzo');
ok(JSON.stringify(applica(sch, applica(pub, null, pub.dati), sch.dati)) === JSON.stringify({ ...sch.dati, ...pub.dati, id: 'rluca01' }), 'ricomposto uguale all\'originale');
ok(JSON.stringify(applica({ tipo: 'scheda', eliminato: true }, luca, null)) === JSON.stringify({ id: 'rluca01', nome: 'Luca', cognome: 'M', foto: 'i123' }), 'scheda revocata: restano solo nome e foto');
ok(ambitoDi('sedute', { tipo: 'gruppo', gruppoId: 'g1' }) === 'aula' && ambitoDi('sedute', { tipo: 'individuale', ragazzoId: 'r1' }) === 'r:r1', 'sedute: gruppo in aula, individuali nel ragazzo');
ok(ambitoDi('note', { ragazzoId: 'r1', categoria: 'gruppo' }) === 'aula' && ambitoDi('note', { ragazzoId: 'r1', categoria: 'scuola' }) === 'r:r1', 'note: "nel gruppo" in aula, le altre nel ragazzo');
ok(ambitoDi('sospesi', { ragazzoId: 'r1' }) === 'r:r1' && ambitoDi('sospesi', { gruppoId: 'g' }) === 'aula', 'idee in sospeso');
ok(idVociDi('ragazzi', 'r1').join() === 'r1,r1sc' && destinazione({ tipo: 'scheda', id: 'r1sc' }).id === 'r1', 'id delle voci del ragazzo');
ok(vociDi('persone', { id: 'x' }).length === 0, 'le persone non viaggiano come voci');
ok(ambitoDi('serie', { tipo: 'gruppo', gruppoId: 'g' }) === 'aula' && ambitoDi('serie', { tipo: 'genitori', ragazzoId: 'r1' }) === 'r:r1', 'serie: di gruppo in aula, del ragazzo nel suo ambito');

const base = { resoconto: 'Inizio.', presenze: { a: false }, argomento: 'x' };
ok(unisci(base, { ...base, argomento: 'mio' }, { ...base, resoconto: 'Inizio. Loro.' }).argomento === 'mio', 'campi diversi: tutti e due');
ok(unisci(base, { ...base, argomento: 'mio' }, { ...base, resoconto: 'Inizio. Loro.' }).resoconto === 'Inizio. Loro.', '…anche il loro');
const u = unisci(base, { ...base, resoconto: 'Inizio. Mio.' }, { ...base, resoconto: 'Inizio. Loro.' });
ok(u.resoconto.includes('Mio.') && u.resoconto.includes('Loro.'), 'stesso testo cambiato da due: non si perde niente');
const u2 = unisci({ t: 'A' }, { t: 'B completamente' }, { t: 'C diverso' }, 'Elena');
ok(u2.t.includes('B completamente') && u2.t.includes('C diverso') && u2.t.includes('Elena'), 'riscritture diverse: tutte e due, con chi');
ok(JSON.stringify(unisci(base, { ...base, presenze: { a: false, b: false } }, { ...base, presenze: {} }).presenze) === JSON.stringify({ b: false }), 'presenze unite campo per campo');
ok(immaginiDi({ foto: 'i111', testo: 'x ![](img:i2222) y', copertina: 'i333' }).sort().join() === 'i111,i2222,i333', 'immagini citate');
// la mia aggiunta e' gia' dentro la loro (l'altro ha unito prima, o la mia risposta si era persa)
const b3 = { t: 'Resoconto.' };
ok(unisci(b3, { t: 'Resoconto.\nStefano.' }, { t: 'Resoconto.\nElena.\nStefano.' }).t === 'Resoconto.\nElena.\nStefano.', 'aggiunte gia\' unite dall\'altra parte: non si ripetono');
ok(unisci(b3, { t: 'Resoconto.\nElena.\nStefano.' }, { t: 'Resoconto.\nStefano.' }).t === 'Resoconto.\nElena.\nStefano.', '…in tutte e due le direzioni');
ok(unisci(b3, { t: 'Resoconto.\nStefano.' }, { t: 'Resoconto.\nStefano.\nElena.' }).t === 'Resoconto.\nStefano.\nElena.', '…anche nell\'ordine inverso');
ok(unisci(b3, { t: 'Resoconto.\nStefano.\nMarco.' }, { t: 'Resoconto.\nElena.\nStefano.' }).t === 'Resoconto.\nStefano.\nMarco.\nElena.', 'aggiunte in parte comuni: le comuni una volta sola');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
