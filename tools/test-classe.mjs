// Alunni delle classi (node tools/test-classe.mjs)
import { daElenco, conteggio, genogrammaDiClasse, nuovoAlunno } from '../src/lib/classe.js';
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('NO  ' + m); } else console.log('ok  ' + m); };

const l = daElenco('Rossi Giulia F\n  Bianchi Marco (M)\nVerdi Ada - f\n\nNeri Luca\nFumagalli Teo,M\nMaria Fernanda');
ok(l.map((a) => a.nome).join('|') === 'Rossi Giulia|Bianchi Marco|Verdi Ada|Neri Luca|Fumagalli Teo|Maria Fernanda', 'nomi dall\'elenco incollato, righe vuote saltate');
ok(l.map((a) => a.sesso).join(',') === 'F,M,F,,M,', 'sesso in fondo alla riga: ' + l.map((a) => a.sesso || '-').join(','));
ok(new Set(l.map((a) => a.id)).size === l.length && l.every((a) => /^al[a-z0-9]{3,}$/.test(a.id)), 'ognuno ha il suo id');
ok(conteggio(l) === '6 alunni · 2 F · 2 M' && conteggio([nuovoAlunno('Ugo')]) === '1 alunno', 'conteggio: ' + conteggio(l));
const g = genogrammaDiClasse({ id: 'gcla', nome: '3B', alunni: l });
ok(g.id === 'classe_gcla' && g.titolo === 'Relazioni · 3B', 'genogramma della classe collegato alla classe');
ok(g.data.nodes.length === 6 && g.data.edges.length === 0, 'un nodo per alunno, nessuna relazione');
ok(g.data.nodes.find((x) => x.name === 'Rossi Giulia').gender === 'F' && g.data.nodes.find((x) => x.name === 'Neri Luca').gender === 'Unknown', 'sesso come simbolo');
const pos = new Set(g.data.nodes.map((x) => x.x + ',' + x.y));
ok(pos.size === 6, 'nessun alunno sovrapposto');
console.log(`\n${n - f}/${n} superati`);
process.exit(f ? 1 : 0);
