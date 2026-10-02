// Genogrammi di GenoGram Creator ridisegnati da PsyDiary (node tools/test-genogramma.mjs)
import { leggiGenogrammi, disegna, famiglia, eta, LEGAMI, campione, scheda } from '../src/lib/genogramma.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('NO  ' + m); } else console.log('ok  ' + m); };
const N = (id, x, y, gender, name, extra = {}) => ({ id, x, y, gender, name, birthDate: '', deceased: false, indexPerson: false, notes: [], ...extra });
const E = (id, fromId, toId, type, extra = {}) => ({ id, fromId, toId, type, label: '', notes: [], ...extra });
const data = {
  nodes: [N('p', 4000, 4000, 'M', 'Paolo', { birthDate: '1972', substanceAbuse: true }), N('m', 4160, 4000, 'F', 'Anna', { mentalIssue: true }), N('f', 4080, 4160, 'M', 'Luca', { indexPerson: true, birthDate: '10/05/2014' })],
  edges: [E('e1', 'p', 'm', 'divorce'), E('e2', 'p', 'f', 'child-bio'), E('e3', 'm', 'f', 'violence-sexual'), E('e4', 'p', 'm', 'preset_1')],
  groups: [{ id: 'g1', memberIds: ['m', 'f'], label: 'Casa', color: '#008080', notes: [] }],
  presets: [{ id: 'preset_1', name: 'Mio legame', type: 'relationship', config: { color: '#008000', lineStyle: 'dashed', renderType: 'standard', decorator: 'none' } }],
};
const g = { id: 'x1', title: 'Famiglia', lastModified: 1, data };

ok(leggiGenogrammi(JSON.stringify(g)).length === 1, 'un genogramma esportato');
ok(leggiGenogrammi(JSON.stringify([g, { ...g, id: 'x2', title: 'Altro' }])).map((x) => x.titolo).join() === 'Famiglia,Altro', 'il backup con più genogrammi');
ok(leggiGenogrammi(JSON.stringify(data)).length === 1, 'anche solo i dati');
ok(leggiGenogrammi('{"a":1}').length === 0 && leggiGenogrammi('non json').length === 0, 'un JSON qualsiasi non è un genogramma');

ok(['#008000', '#FF0000', '#800000', '#FF0080', '#808080', '#008080', '#FFD700', '#0000FF', '#800080', '#000000'].map(famiglia).join() === 'verde,rosso,bordeaux,rosa,grigio,ottanio,oro,blu,viola,nero', 'i colori dello standard restano nella loro famiglia');
ok(eta('10/05/2014', new Date('2026-10-02')) === '12' && eta('1972', new Date('2026-10-02')) === '54' && eta('35') === '35', 'età come in GenoGram Creator');

const d = disegna(data, { oggi: new Date('2026-10-02') });
ok(d.livelli.persone.length === 3 && d.livelli.legami.length === 4 && d.livelli.nuclei.length === 2, 'persone, legami, nucleo con etichetta');
ok(d.vista.x < 4000 && d.vista.x + d.vista.w > 4200 && d.vista.y < 3980, 'la vista contiene tutto il disegno');
const testi = JSON.stringify(d.livelli);
ok(!/#[0-9a-f]{6}/i.test(testi.replace(/"(stroke|fill)":"#/g, '')) && testi.includes('var(--g-'), 'colori presi dal tema, non fissi');
// figlio: parte dalla barra della coppia
const figlio = d.livelli.legami[1].testo[0].a.d;
ok(figlio.startsWith(`M ${(4000 + 4160 + 40) / 2} ${4000 + 60}`), 'la linea del figlio parte dalla barra della coppia');
// divorzio: due tacche oblique sulla barra
ok(d.livelli.legami[0].testo.filter((p) => p.el === 'g').flatMap((g) => g.testo).filter((p) => p.el === 'line').length === 2, 'divorzio con le due barre oblique');
// violenza sessuale: tre linee, zig-zag e freccia
ok(d.livelli.legami[2].testo.some((p) => p.el === 'polygon') && d.livelli.legami[2].testo.filter((p) => p.el === 'path').length === 4, 'violenza sessuale: linee, zig-zag e freccia');
ok(d.usati.some((u) => u.cfg[0] === 'Mio legame'), 'i legami personalizzati con il loro nome');
// persona: paziente designato con doppio contorno, segni clinici, età
const luca = JSON.stringify(d.livelli.persone[2]);
ok(luca.includes('"testo":"12"') && (luca.match(/"rect"/g) || []).length >= 2, 'paziente designato: doppio contorno ed età');
ok(JSON.stringify(d.livelli.persone[0]).includes('var(--g-arancio)') && JSON.stringify(d.livelli.persone[1]).includes('var(--g-viola)'), 'uso di sostanze e salute mentale con i loro colori');
ok(Object.values(LEGAMI).every(([, , , tipo]) => campione('x', ['', '#000', 'solid', tipo]).length >= 1), 'ogni tipo di legame si disegna in legenda');
ok(scheda(data.nodes[0], new Date('2026-10-02')).segni.includes('uso di sostanze'), 'la scheda di una persona');
// i simboli sul centro ruotano con la linea
const obl = disegna({ nodes: [N('a', 0, 0, 'M', 'A'), N('b', 200, 200, 'F', 'B')], edges: [E('x', 'a', 'b', 'cutoff'), E('y', 'a', 'b', 'twin-monozygotic')] });
const rot = (l) => l.testo.find((p) => p.el === 'g' && /rotate\((4[0-9][.\d]*)\)/.test(p.a.transform));
ok(rot(obl.livelli.legami[0]) && rot(obl.livelli.legami[1]), 'taglio e barra dei gemelli ruotano con la linea (45°)');
const ant = disegna({ nodes: [N('a', 0, 0, 'M', 'A'), N('b', 200, 0, 'F', 'B')], edges: [E('x', 'a', 'b', 'dislike'), E('y', 'a', 'b', 'hostile')] });
const [pa, po] = ant.livelli.legami.map((l) => l.testo[0].a);
ok(pa['stroke-dasharray'] && !po['stroke-dasharray'] && pa.d.includes(' L ') && LEGAMI.dislike[0].startsWith('Antipatia'), 'antipatia: zig-zag più basso e tratteggiato, distinto da ostile');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
