// Test delle serie di appuntamenti (src/lib/serie.js)
import { occorrenze, descrivi, ultima, posizioneNelMese, fine } from '../src/lib/serie.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'ok  ' : 'NO  ') + m); };
const sett = (giorni, ogni = 1, extra = {}) => ({ ora: '14:30', dal: '2026-09-01', ripeti: { come: 'settimane', ogni, giorni }, ...extra });

// 1 set 2026 è martedì
ok(occorrenze(sett([2]), '2026-09-01', '2026-09-30').join() === '2026-09-01,2026-09-08,2026-09-15,2026-09-22,2026-09-29', 'ogni martedì');
ok(occorrenze(sett([2, 4]), '2026-09-01', '2026-09-10').join() === '2026-09-01,2026-09-03,2026-09-08,2026-09-10', 'martedì e giovedì');
ok(occorrenze(sett([2], 2), '2026-09-01', '2026-09-30').join() === '2026-09-01,2026-09-15,2026-09-29', 'ogni due settimane');
ok(occorrenze(sett([2], 2), '2026-09-10', '2026-09-30').join() === '2026-09-15,2026-09-29', 'ogni due settimane anche guardando da metà mese');
ok(occorrenze(sett([5], 3, { dal: '2026-09-04' }), '2026-09-01', '2026-10-31').join() === '2026-09-04,2026-09-25,2026-10-16', 'ogni tre settimane');
ok(occorrenze(sett([2], 1, { al: '2026-09-15' }), '2026-09-01', '2026-12-31').length === 3, 'fino al: si ferma');
ok(occorrenze(sett([2], 1, { volte: 4 }), '2026-09-01', '2026-12-31').length === 4, 'dopo 4 volte: si ferma');
ok(occorrenze(sett([2], 1, { volte: 4 }), '2026-09-20', '2026-12-31').join() === '2026-09-22', '…anche guardando da metà (conta dall\'inizio)');
ok(occorrenze(sett([2], 1, { eccezioni: { '2026-09-08': 'saltata' } }), '2026-09-01', '2026-09-15').join() === '2026-09-01,2026-09-15', 'una data saltata');
ok(occorrenze(sett([2]), '2026-08-01', '2026-08-31').length === 0, 'prima dell\'inizio: niente');
// mensile
const mese = (settimana, giorno) => ({ ora: '17:00', dal: '2026-09-01', ripeti: { come: 'mese', settimana, giorno } });
ok(occorrenze(mese(1, 4), '2026-09-01', '2026-11-30').join() === '2026-09-03,2026-10-01,2026-11-05', 'il primo giovedì del mese');
ok(occorrenze(mese(-1, 5), '2026-09-01', '2026-11-30').join() === '2026-09-25,2026-10-30,2026-11-27', 'l\'ultimo venerdì del mese');
ok(occorrenze(mese(2, 1), '2026-09-01', '2026-10-31').join() === '2026-09-14,2026-10-12', 'il secondo lunedì');
ok(JSON.stringify(posizioneNelMese('2026-10-01')) === JSON.stringify({ settimana: 1, giorno: 4 }) && posizioneNelMese('2026-10-30').settimana === -1, 'posizione nel mese di una data');
// testi
ok(descrivi(sett([2])) === 'ogni martedì alle 14:30', descrivi(sett([2])));
ok(descrivi(sett([2, 4])) === 'ogni martedì e giovedì alle 14:30', descrivi(sett([2, 4])));
ok(descrivi(sett([5], 2)) === 'ogni 2 settimane, venerdì alle 14:30', descrivi(sett([5], 2)));
ok(descrivi(mese(1, 4)) === 'il primo giovedì del mese alle 17:00', descrivi(mese(1, 4)));
ok(ultima(sett([2], 1, { volte: 3 })) === '2026-09-15' && fine(sett([2], 1, { volte: 3 })) === '3 volte', 'ultima data e testo della fine');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
