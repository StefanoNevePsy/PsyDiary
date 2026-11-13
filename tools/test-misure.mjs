import assert from 'node:assert/strict';
import { tipoDi, aggiungi, leggi, riepilogo, media, mediana, durata, giudizio, PER_TIPO } from '../src/lib/centro/misure.js';

// che cos'è una chiamata
assert.equal(tipoDi('sync', { cursori: {}, invii: [] }), 'controllo');
assert.equal(tipoDi('sync', { cursori: {} }), 'controllo');
assert.equal(tipoDi('sync', { invii: [{ id: 'a' }] }), 'salvataggio');
assert.equal(tipoDi('sync', { io: true, invii: [] }), 'altro');
assert.equal(tipoDi('dispositivo.chiave', {}), 'altro');

// si tengono le ultime PER_TIPO di ogni tipo, senza mescolarle
let l = [];
for (let i = 0; i < PER_TIPO + 20; i++) l = aggiungi(l, { t: i, tipo: 'controllo', totale: 100 + i, ms: 10 });
for (let i = 0; i < 3; i++) l = aggiungi(l, { t: 1000 + i, tipo: 'salvataggio', totale: 900, ms: null });
assert.equal(l.filter((m) => m.tipo === 'controllo').length, PER_TIPO);
assert.equal(l.filter((m) => m.tipo === 'salvataggio').length, 3);
assert.equal(l.find((m) => m.tipo === 'controllo').totale, 100 + 20, 'le più vecchie escono');
// valori strani: ripuliti
l = aggiungi([], { t: 5, tipo: 'boh', totale: -3, ms: 'x' });
assert.deepEqual(l, [{ t: 5, tipo: 'altro', totale: 0, ms: null }]);

// salvataggio e lettura
assert.deepEqual(leggi(JSON.stringify(l)), l);
for (const brutto of ['', 'non json', '{}', '[1,"a",null]', JSON.stringify([{ tipo: 'controllo', totale: 'x', t: 1 }])]) assert.deepEqual(leggi(brutto), []);

// numeri
assert.equal(media([]), null); assert.equal(media([1, 2, 6]), 3);
assert.equal(mediana([]), null); assert.equal(mediana([5, 1, 9]), 5); assert.equal(mediana([1, 2, 3, 10]), 2.5);
l = [];
[[400, 40], [600, 60], [3000, 100], [500, null]].forEach(([totale, ms], i) => { l = aggiungi(l, { t: i, tipo: 'controllo', totale, ms }); });
const r = riepilogo(l, 'controllo');
assert.equal(r.n, 4); assert.equal(r.mediana, 550); assert.equal(r.massimo, 3000); assert.equal(Math.round(r.media), 1125);
assert.equal(r.conCustode, 3); assert.equal(Math.round(r.custode), 67);
assert.equal(Math.round(r.custode + r.resto), Math.round((400 + 600 + 3000) / 3), 'custode + resto = totale delle misure che hanno il tempo del custode');
const v = riepilogo(l, 'salvataggio');
assert.equal(v.n, 0); assert.equal(v.media, null); assert.equal(v.custode, null);
assert.equal(riepilogo(aggiungi([], { t: 1, tipo: 'controllo', totale: 500, ms: null }), 'controllo').custode, null, 'un custode vecchio non dice il suo tempo');
assert.equal(riepilogo(aggiungi([], { t: 1, tipo: 'controllo', totale: 50, ms: 80 }), 'controllo').resto, 0, 'il resto non va sotto zero');

// parole
assert.equal(durata(null), '—'); assert.equal(durata(320.4), '320 ms'); assert.equal(durata(1400), '1,4 s'); assert.equal(durata(12400), '12 s');
assert.equal(giudizio(null), null); assert.equal(giudizio(300).livello, 'bene'); assert.equal(giudizio(1500).livello, 'medio'); assert.equal(giudizio(4000).livello, 'lento');
console.log('misure: ok');
