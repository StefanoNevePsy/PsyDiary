// Programmi e protocolli (node tools/test-programmi.mjs)
import { nuovoProgramma, nuovoModulo, nuovaUnita, assegna, unitaInOrdine, statoUnita, prossima, avanzamento, anticipa, aggiornaDa, daAggiornare, pianoDi, daTesto, aTesto, sedutaFatta, adatto } from '../src/lib/programmi.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('NO  ' + m); } else console.log('ok  ' + m); };

const doc = `Un percorso di life skills per le medie.

# Problem solving
## Il problema in tre parole
Obiettivi: riconoscere un problema
Durata: 50
- [ ] cerchio iniziale
- [ ] scenette
## Le soluzioni possibili
Brainstorming a gruppi.
# Emozioni
## Il termometro delle emozioni
## La rabbia
# Decision making
## Pro e contro
## Decidere insieme
# Attività libere
## Gioco del gomitolo
Per sciogliere il clima.
## Silent ball`;
const p = daTesto(doc, 'Life skills');
ok(p.nome === 'Life skills' && p.descrizione.startsWith('Un percorso'), 'dal documento: nome e descrizione');
ok(p.moduli.map((m) => m.nome).join('|') === 'Problem solving|Emozioni|Decision making', 'tre moduli');
ok(p.moduli[0].unita.length === 2 && p.moduli[0].unita[0].obiettivi === 'riconoscere un problema' && p.moduli[0].unita[0].durata === 50, 'unità con obiettivi e durata');
ok(p.moduli[0].unita[0].attivita.includes('- [ ] scenette') && !p.moduli[0].unita[0].attivita.startsWith('\n'), 'attività come lista da spuntare');
ok(p.libere.map((l) => l.titolo).join('|') === 'Gioco del gomitolo|Silent ball', 'menù di attività libere');
const p2 = daTesto(aTesto(p), 'Life skills');
ok(JSON.stringify(p2.moduli.map((m) => [m.nome, m.unita.map((u) => [u.titolo, u.obiettivi, u.durata])])) === JSON.stringify(p.moduli.map((m) => [m.nome, m.unita.map((u) => [u.titolo, u.obiettivi, u.durata])])), 'aTesto e daTesto si rileggono');
ok(daTesto('## A\n## B').moduli.length === 1 && daTesto('## A\n## B').moduli[0].unita.length === 2, 'senza moduli: uno solo');
ok(adatto({ destinatari: ['classe'] }, 'classe') && !adatto({ destinatari: ['classe'] }, 'individuale'), 'destinatari');

const as = assegna({ ...p, modificato: 'v1' }, '2026-10-01');
ok(as.moduli !== p.moduli && as.moduli[0].unita[0].id === p.moduli[0].unita[0].id, 'l\'assegnazione è una copia con gli stessi id');
const U = unitaInOrdine(as);
ok(U.length === 6 && U[0].unita.titolo === 'Il problema in tre parole', 'sei unità in ordine');
const sed = (id, data, unita, extra = {}) => ({ id, data, ora: '10:00', tipo: 'gruppo', programma: { assegnazione: as.id, unita }, ...extra });
let sedute = [];
ok(prossima(as, sedute).unita.titolo === 'Il problema in tre parole', 'all\'inizio si propone la prima unità');
sedute.push(sed('s1', '2026-10-01', U[0].unita.id, { resoconto: 'Bene' }));
ok(sedutaFatta(sedute[0]) && statoUnita(as, sedute).get(U[0].unita.id).stato === 'fatta', 'con il resoconto è fatta');
ok(prossima(as, sedute).unita.titolo === 'Le soluzioni possibili', 'si passa alla seconda');
sedute.push(sed('s2', '2026-10-08', U[1].unita.id));
ok(statoUnita(as, sedute).get(U[1].unita.id).stato === 'prevista', 'messa in una seduta futura: prevista');
ok(prossima(as, sedute).unita.titolo === 'Il termometro delle emozioni', 'e per la seduta dopo si propone la successiva');
ok(prossima(as, sedute, 's2').unita.titolo === 'Le soluzioni possibili', 'nella sua seduta stessa resta proposta');
sedute[1] = { ...sedute[1], annullata: true };
ok(prossima(as, sedute).unita.titolo === 'Le soluzioni possibili', 'seduta annullata: l\'unità torna da fare (ritmo per sedute)');
sedute[1] = { ...sed('s2', '2026-10-08', U[1].unita.id, { resoconto: 'fatto altro' }), programma: { assegnazione: as.id, unita: U[1].unita.id, esito: 'non-fatta' } };
ok(!sedutaFatta(sedute[1]) && statoUnita(as, sedute).get(U[1].unita.id).stato === 'da-fare', 'segnata "non fatta" anche con il resoconto: resta da fare');
ok(avanzamento(as, sedute).fatte === 1 && avanzamento(as, sedute).totale === 6, 'avanzamento 1 di 6');
// alla seconda lezione serve subito decision making
const dm = as.moduli.find((m) => m.nome === 'Decision making');
const nuovo = { ...as, moduli: anticipa(as, dm.id, sedute) };
ok(nuovo.moduli.map((m) => m.nome).join('|') === 'Decision making|Problem solving|Emozioni', 'anticipa: decision making diventa il prossimo (problem solving a metà si riprende dopo)');
ok(prossima(nuovo, sedute).unita.titolo === 'Pro e contro', 'e la proposta segue il nuovo ordine');
ok(p.moduli.map((m) => m.nome).join('|') === 'Problem solving|Emozioni|Decision making', 'la biblioteca non cambia');
const salt = { ...as, saltate: [U[1].unita.id] };
ok(prossima(salt, []).unita.titolo === 'Il problema in tre parole' && prossima(salt, [sedute[0]]).unita.titolo === 'Il termometro delle emozioni', 'un\'unità saltata non si propone');
// unità facoltativa
const asf = assegna({ moduli: [{ id: 'm1', nome: 'M', unita: [{ id: 'u1', titolo: 'Fac', facoltativa: true }, { id: 'u2', titolo: 'Obb' }] }] });
ok(prossima(asf, []).unita.titolo === 'Obb' && avanzamento(asf, []).totale === 1, 'le facoltative non si propongono e non contano');
// aggiornamento dalla biblioteca
const pNuovo = JSON.parse(JSON.stringify(p)); pNuovo.modificato = 'v2';
pNuovo.moduli[0].unita[0].titolo = 'Il problema (nuovo titolo)';
pNuovo.moduli.push(nuovoModulo('Comunicazione')); pNuovo.moduli[3].unita.push(nuovaUnita('Ascolto attivo'));
pNuovo.moduli[1].unita.splice(1, 1);
ok(daAggiornare(nuovo, pNuovo) && !daAggiornare(aggiornaDa(nuovo, pNuovo), pNuovo), 'si accorge della versione nuova');
const agg = aggiornaDa(nuovo, pNuovo);
ok(agg.moduli.map((m) => m.nome).join('|') === 'Decision making|Problem solving|Emozioni|Comunicazione', 'aggiornata: resta l\'ordine scelto, il modulo nuovo in fondo');
ok(agg.moduli[1].unita[0].titolo === 'Il problema (nuovo titolo)' && agg.moduli[2].unita.length === 1, 'contenuti nuovi, unità tolte');
ok(statoUnita(agg, sedute).get(U[0].unita.id).stato === 'fatta', 'e quello che era fatto resta fatto');
const piano = pianoDi(as, U[0].unita.id);
ok(piano.startsWith('### Problem solving · Il problema in tre parole') && piano.includes('**Obiettivi:** riconoscere') && piano.includes('- [ ] scenette'), 'il piano della seduta: titolo, obiettivi, attività');
ok(pianoDi(as, as.libere[0].id).includes('Gioco del gomitolo'), 'anche per le attività libere');
ok(nuovoProgramma().moduli.length === 1, 'programma nuovo con un modulo');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
