// Esportazione completa (node tools/test-esporta.mjs)
import { componi, csv, mdPulito, mdHtml, nomeFile } from '../src/lib/esporta-tutto.js';
import { creaZip } from '../src/lib/zip-esporta.js';
import { ZipReader, BlobReader, TextWriter } from '@zip.js/zip.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('NO  ' + m); } else console.log('ok  ' + m); };

const dati = {
  ragazzi: [
    { id: 'rluca', nome: 'Luca', cognome: 'Martini', nascita: '2012-05-10', diagnosi: 'DSA; "lettura"', genere: 'M', etichette: ['esterno'], genitori: [{ nome: 'Anna', relazione: 'madre', telefono: '333' }], noteStabili: 'Ama **disegnare**', foto: 'imfoto', allegati: [{ id: 'aggeno', nome: 'Famiglia', genogramma: { id: 'g1' } }, { id: 'apdf', nome: 'relazione.pdf', tipo: 'application/pdf' }], campoNuovo: 'x' },
    { id: 'rluca2', nome: 'Luca', cognome: 'Martini' },
  ],
  gruppi: [{ id: 'gcla', tipo: 'classe', nome: '3ªB/Manzoni', alunni: [{ id: 'al1', nome: 'Rossi Giulia', sesso: 'F', nota: 'timida' }], membri: [{ ragazzoId: 'rluca', dal: '2026-09-01' }] }],
  sedute: [
    { id: 's1', tipo: 'individuale', ragazzoId: 'rluca', data: '2026-09-10', ora: '15:00', durata: 50, resoconto: 'Parla con @[Anna](r:rxx). ![disegno](img:imdis)' },
    { id: 's2', tipo: 'gruppo', gruppoId: 'gcla', data: '2026-09-11', ora: '10:00', argomento: '- [x] cerchio', presenze: { rluca: false }, partecipanti: {} },
  ],
  note: [{ id: 'n1', data: '2026-09-12', categoria: 'scuola', titolo: 'Colloquio', testo: 'Insegnante;\nnuova riga', ragazzoId: 'rluca', autore: 'Stefano' }, { id: 'n2', data: '2026-09-13', testo: 'Riunione', autore: 'Elena' }],
  sospesi: [], serie: [{ id: 'se1', tipo: 'individuale', ragazzoId: 'rluca', ora: '15:00', dal: '2026-09-01', ripeti: { come: 'settimane', ogni: 1, giorni: [3] } }],
};
dati.programmi = [{ id: 'plife', nome: 'Life skills', destinatari: ['classe'], moduli: [{ id: 'm1', nome: 'Emozioni', immagine: 'imfoto', unita: [{ id: 'u1', titolo: 'Il termometro', attivita: '- [ ] lavagna' }] }], libere: [] }];
dati.gruppi[0].programmi = [{ id: 'as1', programmaId: 'plife', nome: 'Life skills', moduli: dati.programmi[0].moduli, libere: [], saltate: [] }];
dati.sedute[1].programma = { assegnazione: 'as1', unita: 'u1' };
const file = new Map([['imfoto', new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: 'image/jpeg' })], ['aggeno', new Blob(['{"id":"g1"}'], { type: 'application/json' })], ['imdis', new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' })]]);
const { voci, riepilogo } = componi(dati, file, { da: 'Stefano', il: '2026-10-02T10:00:00Z' });
const P = (p) => voci.find((v) => v.percorso === p);
const percorsi = voci.map((v) => v.percorso);

ok(P('indice.html') && P('LEGGIMI.txt') && P('psydiary.json'), 'indice, istruzioni e JSON completo');
ok(P('pazienti/Martini Luca/scheda.html') && P('pazienti/Martini Luca (rluca2)/scheda.html'), 'una cartella per paziente, anche con lo stesso nome: ' + percorsi.filter((p) => p.endsWith('scheda.html')).join(', '));
ok(percorsi.some((p) => p.startsWith('gruppi/Classe 3ªB Manzoni/')), 'nomi di cartella senza caratteri vietati (la "/" del nome)');
const j = JSON.parse(P('psydiary.json').testo);
ok(j.formato === 'psydiary-esportazione' && j.tabelle.pazienti.length === 2 && j.tabelle.sedute.length === 2 && j.tabelle.pazienti[0].campoNuovo === 'x', 'il JSON ha tutto, anche i campi nuovi');
const scheda = P('pazienti/Martini Luca/scheda.html').testo;
ok(scheda.includes('Diagnosi o ipotesi') && scheda.includes('DSA; &quot;lettura&quot;') && scheda.includes('madre') && scheda.includes('<b>disegnare</b>'), 'scheda leggibile, con etichette dei campi e testo protetto');
ok(scheda.includes('campoNuovo'), 'i campi che la scheda non conosce finiscono in "Altri campi"');
ok(scheda.includes('allegati/Famiglia.genogramma.json') && scheda.includes('relazione.pdf (file non disponibile)'), 'allegati collegati, quelli mancanti segnalati');
ok(percorsi.includes('pazienti/Martini Luca/allegati/Famiglia.genogramma.json') && percorsi.includes('pazienti/Martini Luca/allegati/foto.jpg'), 'i file nella cartella del paziente');
const diario = P('pazienti/Martini Luca/diario.md').testo;
ok(diario.includes('@Anna') && diario.includes('![disegno](allegati/') && !diario.includes('img:'), 'diario.md: menzioni come testo, immagini come file');
ok(diario.indexOf('10/09/2026') < diario.indexOf('12/09/2026'), 'in ordine di data');
const classe = P('gruppi/Classe 3ªB Manzoni/classe.html').testo;
ok(classe.includes('Rossi Giulia') && classe.includes('timida') && classe.includes('Martini Luca'), 'la classe con alunni e pazienti seguiti');
ok(P('aula/diario.md')?.testo.includes('Riunione'), 'le note sull\'aula hanno la loro cartella');
const pres = P('tabelle/presenze.csv').testo;
ok(pres.startsWith('﻿') && pres.includes('s2;') && pres.includes(';no;'), 'presenze in tabella (assente: no)');
const note = P('tabelle/note.csv').testo;
ok(note.includes('"Insegnante;\nnuova riga"'), 'CSV: punto e virgola e a capo dentro le virgolette');
ok(csv(['a'], [{ a: 'x"y' }]).includes('"x""y"'), 'CSV: virgolette raddoppiate');
ok(riepilogo.pazienti === 2 && riepilogo.mancanti.includes('apdf'), 'riepilogo con i file mancanti');
ok(nomeFile('  CON:..  ') === 'CON' && nomeFile('') === 'senza nome', 'nomi di file sicuri');
ok(mdHtml('# T\n- a\n- [ ] b\n\ntesto <script>').includes('&lt;script&gt;'), 'HTML protetto da testo che sembra codice');
ok(mdPulito('![x](img:zz)', () => null).includes('immagine non disponibile'), 'immagine mancante segnalata');

ok(P('programmi/Life skills/programma.md')?.testo.includes('## Il termometro') && P('programmi/Life skills/programma.html').testo.includes('allegati/Emozioni'), 'i programmi con le immagini dei moduli');
ok(P('gruppi/Classe 3ªB Manzoni/diario.md').testo.includes('*Programma: Life skills · Emozioni · Il termometro*'), 'nel diario la seduta dice quale unità era');
ok(P('tabelle/programmi-assegnati.csv').testo.includes('Life skills;3ªB/Manzoni;classe'), 'tabella dei programmi assegnati');
ok(JSON.parse(P('psydiary.json').testo).tabelle.programmi.length === 1, 'e nel JSON');

// lo zip, cifrato
const zip = await creaZip(voci, { password: 'FRASE-DI-PROVA' });
const sbagliato = await new ZipReader(new BlobReader(zip), { password: 'altra' }).getEntries();
let rifiuta = false;
try { await sbagliato.find((e) => e.filename.endsWith('LEGGIMI.txt')).getData(new TextWriter()); } catch (e) { rifiuta = true; }
ok(rifiuta, 'con la password sbagliata non si apre');
const giusto = await new ZipReader(new BlobReader(zip), { password: 'FRASE-DI-PROVA' }).getEntries();
const leggimi = await giusto.find((e) => e.filename === 'PsyDiary/LEGGIMI.txt').getData(new TextWriter());
ok(leggimi.includes('2 pazienti') && giusto.every((e) => e.directory || e.encrypted), 'con quella giusta sì, e ogni file è cifrato');
ok(giusto.length >= voci.length, 'nello zip ci sono tutti i file: ' + giusto.length);
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
