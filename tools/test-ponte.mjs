// Ponte con GenoGram Creator: chi può mandare cosa (node tools/test-ponte.mjs)
import { messaggioValido, genogrammaDa, ORIGINE_GENOGRAM, PROTOCOLLO } from '../src/lib/ponte-geno.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('NO  ' + m); } else console.log('ok  ' + m); };
const fin = {}, altra = {};
const m = { protocollo: PROTOCOLLO, v: 1, nonce: 'c0de', tipo: 'genogramma', genogramma: { id: 'g1', title: 'Famiglia', lastModified: 5, data: { nodes: [], edges: [] } } };
const ev = (x = {}) => ({ origin: ORIGINE_GENOGRAM, source: fin, data: m, ...x });
const att = { finestra: fin, codice: 'c0de' };

ok(ORIGINE_GENOGRAM === 'https://stefanonevepsy.github.io', 'senza configurazione: GenoGram Creator su GitHub Pages');
ok(messaggioValido(ev(), att) === m, 'messaggio giusto: accettato');
ok(messaggioValido(ev({ origin: 'https://stefanonevepsy.github.io.evil.example' }), att) === null, 'origine simile ma diversa: rifiutato');
ok(messaggioValido(ev({ origin: 'http://stefanonevepsy.github.io' }), att) === null, 'http invece di https: rifiutato');
ok(messaggioValido(ev({ source: altra }), att) === null, 'da un\'altra finestra: rifiutato');
ok(messaggioValido(ev({ data: { ...m, nonce: 'altro' } }), att) === null, 'codice sbagliato: rifiutato');
ok(messaggioValido(ev({ data: { ...m, nonce: undefined } }), { finestra: fin, codice: undefined }) === null, 'senza codice: rifiutato');
ok(messaggioValido(ev({ data: { ...m, protocollo: 'altro' } }), att) === null && messaggioValido(ev({ data: { ...m, v: 2 } }), att) === null, 'protocollo o versione diversi: rifiutato');
ok(messaggioValido(ev({ data: 'testo' }), att) === null && messaggioValido(ev({ data: null }), att) === null, 'dati non oggetto: rifiutato');

const g = genogrammaDa(m);
ok(g && g.id === 'g1' && g.titolo === 'Famiglia' && g.modificato === 5, 'il genogramma ricevuto si legge come un file importato');
ok(genogrammaDa({ ...m, genogramma: { id: 'x', data: { nodes: 'no' } } }) === null, 'dati non validi: niente');
ok(genogrammaDa({ ...m, tipo: 'pronto' }) === null, 'un messaggio che non è un genogramma: niente');
const grosso = { ...m, genogramma: { ...m.genogramma, data: { nodes: [{ id: 'a', name: 'x'.repeat(5 * 1024 * 1024) }], edges: [] } } };
ok(genogrammaDa(grosso) === null, 'oltre 4 MB: rifiutato');

console.log(`\n${n - f}/${n} controlli passati`);
if (f) process.exit(1);
