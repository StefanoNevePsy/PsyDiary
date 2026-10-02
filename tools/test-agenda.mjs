// Agenda del calendario (node tools/test-agenda.mjs)
import { minuti, ora, intervallo, disponi, spazi, durata } from '../src/lib/agenda.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('NO  ' + m); } else console.log('ok  ' + m); };
const S = (o, d) => ({ ora: o, durata: d });
ok(minuti('16:30') === 990 && ora(990) === '16:30', 'ore e minuti');
ok(JSON.stringify(intervallo([])) === JSON.stringify({ da: 480, a: 1140 }), 'senza sedute: 8–19');
ok(JSON.stringify(intervallo([S('07:30', 45), S('19:15', 100)])) === JSON.stringify({ da: 360, a: 1320 }), 'un\'ora prima della prima e dopo l\'ultima, a ore intere');
ok(JSON.stringify(intervallo([S('15:00', 90), S('16:30', 60)])) === JSON.stringify({ da: 840, a: 1200 }), 'pomeriggio: almeno sei ore visibili (14–20)');
const d = disponi([S('15:00', 90), S('16:00', 60), S('16:30', 30), S('18:00', 60)]);
ok(d.find((v) => v.s.ora === '15:00').colonne === 2 && d.find((v) => v.s.ora === '16:00').colonna === 1, 'sovrapposte in colonne affiancate');
ok(d.find((v) => v.s.ora === '16:30').colonna === 0, 'una colonna libera si riusa (16:30 dopo la fine delle 15:00)');
ok(d.find((v) => v.s.ora === '18:00').colonne === 1, 'chi non si sovrappone ha tutta la larghezza');
const sp = spazi([S('14:00', 60), S('15:45', 60), S('16:30', 60)]);
ok(sp[0].minuti === 45 && sp[1].minuti === -15, 'spazio libero e sovrapposizione');
ok(durata(45) === '45 min' && durata(60) === '1 h' && durata(90) === '1 h 30', 'durate leggibili');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
