// Dati di prova, tutti inventati, attorno alla data di oggi.
import { oggi, piu, lunedi, giornoSettimana } from './date.js';
import { daTesto } from './programmi.js';

// un programma di esempio per la biblioteca
const LIFE_SKILLS = `Percorso di life skills per le scuole medie: otto incontri in tre moduli, più qualche attività libera per i momenti in cui serve altro.

# Problem solving
## Il problema in tre parole
Obiettivi: riconoscere e nominare un problema
Durata: 60
- [ ] Cerchio: una cosa che oggi non va
- [ ] Scenette a coppie: il problema in tre parole
- [ ] Cartellone dei problemi della classe
## Tante soluzioni
Obiettivi: generare alternative senza giudicarle
- [ ] Brainstorming a gruppi (vale tutto)
- [ ] Ogni gruppo sceglie le tre soluzioni più strane
## Provare e valutare
Obiettivi: scegliere una soluzione e verificarla
- [ ] Gioco di ruolo con la soluzione scelta
- [ ] Cosa ha funzionato? Cosa cambierei?

# Emozioni
## Il termometro delle emozioni
Obiettivi: dare un nome e un'intensità alle emozioni
- [ ] Termometro alla lavagna
- [ ] Ognuno si posiziona: com'è oggi?
## La rabbia
Obiettivi: riconoscere i segnali della rabbia nel corpo
- [ ] Sagoma del corpo: dove sento la rabbia
- [ ] Tre modi per abbassare il termometro
## Le emozioni degli altri
Obiettivi: empatia
- [ ] Indovina l'emozione (mimo)

# Decision making
## Pro e contro
Obiettivi: valutare le conseguenze
- [ ] Bilancia dei pro e contro su una scelta vera della classe
## Decidere insieme
Obiettivi: prendere una decisione di gruppo
- [ ] Assemblea di classe con regole di parola

# Attività libere
## Gioco del gomitolo
Per sciogliere il clima: ognuno lancia il gomitolo e dice una cosa bella di chi lo riceve.
## Silent ball
Per ritrovare la concentrazione.`;

const PERSONE = [
  { id: 'stefano', nome: 'Stefano', ruolo: 'admin' },
  { id: 'elena', nome: 'Elena', ruolo: 'admin' },
  { id: 'giulia', nome: 'Giulia', ruolo: 'tirocinante', ragazzi: ['rluca01', 'rsara02', 'romar03'] },
  { id: 'marco', nome: 'Marco', ruolo: 'tirocinante', ragazzi: [] },
];

let seme = 7;
const caso = () => { seme = (seme * 16807) % 2147483647; return (seme - 1) / 2147483646; };
const uno = (a) => a[Math.floor(caso() * a.length)];
const m = (r) => `@[${r.nome} ${r.cognome[0]}.](r:${r.id})`;

export function creaDemo() {
  seme = 7;
  const O = oggi();
  const L = lunedi(O);
  const t = new Date().toISOString();
  const autore = 'Stefano';

  const R = (id, nome, cognome, nascita, scuola, classe, genitori, extra = {}) => ({
    id, nome, cognome, nascita, scuola, classe, genitori, invio: extra.invio || 'Neuropsichiatria infantile ASL',
    inizio: extra.inizio || piu(L, -120), stato: 'attivo', noteStabili: extra.note || '', ricorrenza: extra.ric || null,
    creato: t, modificato: t,
  });
  const ragazzi = [
    R('rluca01', 'Luca', 'Martini', '2012-03-14', 'IC Manzoni', '2ª media', [{ nome: 'Paola Martini', relazione: 'madre', telefono: '333 111 2233' }],
      { note: 'Preferisce essere avvisato prima dei cambi di attività. #regolazione', ric: { giorni: [2], ora: '16:30', durata: 60, dal: piu(L, -84) } }),
    R('rsara02', 'Sara', 'Bianchi', '2011-07-02', 'IC Manzoni', '3ª media', [{ nome: 'Marco Bianchi', relazione: 'padre', telefono: '347 222 3344' }, { nome: 'Anna Rossi', relazione: 'madre' }]),
    R('romar03', 'Omar', 'Khalil', '2012-11-20', 'IC Da Vinci', '2ª media', [{ nome: 'Samira Khalil', relazione: 'madre', telefono: '320 555 1212' }]),
    R('rgiul04', 'Giulia', 'Testa', '2011-01-28', 'IC Da Vinci', '3ª media', [{ nome: 'Luisa Testa', relazione: 'madre' }]),
    R('rdavi05', 'Davide', 'Pellegrini', '2012-05-09', 'IC Manzoni', '2ª media', [{ nome: 'Carlo Pellegrini', relazione: 'padre' }]),
    R('rnico06', 'Nicolò', 'Ferri', '2011-09-17', 'IC Pascoli', '3ª media', [{ nome: 'Elisa Ferri', relazione: 'madre' }]),
    R('rmart07', 'Martina', 'Russo', '2009-04-22', 'Liceo Artistico', '2ª superiore', [{ nome: 'Giorgio Russo', relazione: 'padre' }],
      { ric: { giorni: [5], ora: '14:00', durata: 60, dal: piu(L, -70), ogni: 2 }, invio: 'Consultorio familiare' }),
    R('rtomm08', 'Tommaso', 'Greco', '2009-12-01', 'ITIS Fermi', '2ª superiore', [{ nome: 'Rita Greco', relazione: 'madre' }]),
    R('rale09', 'Alessia', 'Conti', '2010-02-15', 'ITIS Fermi', '1ª superiore', [{ nome: 'Franco Conti', relazione: 'padre' }]),
    R('rmatt10', 'Matteo', 'Galli', '2009-08-30', 'Liceo Scientifico', '2ª superiore', [{ nome: 'Chiara Galli', relazione: 'madre' }]),
    R('rchia11', 'Chiara', 'Moretti', '2010-06-11', 'Liceo Linguistico', '1ª superiore', [{ nome: 'Sergio Moretti', relazione: 'padre' }]),
    R('ryous12', 'Youssef', 'Amrani', '2008-10-05', 'IPSIA', '3ª superiore', [{ nome: 'Fatima Amrani', relazione: 'madre' }]),
    R('rirene13', 'Irene', 'Sala', '2008-03-19', 'Liceo Artistico', '3ª superiore', [{ nome: 'Paolo Sala', relazione: 'padre' }]),
  ];
  const r = Object.fromEntries(ragazzi.map((x) => [x.id, x]));
  Object.assign(r.rluca01, {
    luogoNascita: 'Bologna', genere: 'M', cittadinanza: 'italiana', lingue: 'italiano', indirizzo: 'Via dei Mille 12', comune: 'Bologna',
    insegnante: 'prof.ssa Ferraro (lettere)', certificazioni: 'dsa', diagnosi: 'DSA (dislessia); difficoltà di regolazione emotiva',
    servizi: 'NPI ASL, logopedia fino al 2023', pediatra: 'dott. Neri', consensoPrivacy: piu(L, -126), consensoFoto: 'sì', consensoScuola: 'sì',
    motivoInvio: 'Scatti di rabbia a scuola e a casa, fatica a gestire le frustrazioni. La scuola segnala litigi frequenti.',
    noteFamiglia: 'Vive con la madre e la sorella di 9 anni. Il padre vive in un\'altra città, lo vede nel fine settimana.',
    interessi: 'Calcio (portiere), Minecraft, disegnare fumetti', puntiForza: 'Generoso con i più piccoli; molto bravo nel disegno',
    bisogni: 'Riconoscere la rabbia prima che esploda; tollerare la frustrazione', obiettivi: 'Meno litigi a scuola entro fine quadrimestre',
    strategie: 'Preavvisare i cambi di attività; pausa disegno quando sale la tensione', attenzioni: 'Non riprenderlo davanti ai compagni',
  });
  r.rluca01.genitori.push({ nome: 'Andrea Martini', relazione: 'padre', telefono: '335 444 7788' });
  Object.assign(r.rmart07, {
    luogoNascita: 'Modena', genere: 'F', cittadinanza: 'italiana', comune: 'Bologna', insegnante: 'prof. Riva (coordinatore)', certificazioni: 'nessuna',
    motivoInvio: 'Ansia legata al cambio di scuola, isolamento nel nuovo gruppo classe.', consensoPrivacy: piu(L, -80), consensoFoto: 'no', consensoScuola: 'sì',
  });
  for (const x of ragazzi) if (!x.consensoPrivacy) x.consensoPrivacy = x.inizio;

  const G = (id, nome, tema, giorno, ora, dal, membri, obiettivi) => ({
    id, nome, tema, ricorrenza: { giorni: [giorno], ora, durata: 90, dal }, obiettivi,
    membri: membri.map((x) => ({ ragazzoId: x, dal })), creato: t, modificato: t,
  });
  // la penultima seduta di ogni gruppo cade in questa settimana, l'ultima nella prossima
  const dalMar = piu(L, 1 - 7 * 5), dalGio = piu(L, 3 - 7 * 6), dalVen = piu(L, 4 - 7 * 2);
  const gruppi = [
    G('gmart', 'Gruppo del martedì', 'Emozioni', 2, '14:30', dalMar, ['rluca01', 'rsara02', 'romar03', 'rgiul04', 'rdavi05', 'rnico06'],
      'Riconoscere e nominare le emozioni; regolare la rabbia; chiedere aiuto al gruppo.'),
    G('ggiov', 'Gruppo del giovedì', 'Abilità sociali', 4, '15:00', dalGio, ['rtomm08', 'rale09', 'rmatt10', 'rchia11', 'ryous12'],
      'Conversazione, turni, gestione dei conflitti tra pari; fiducia nelle proprie risorse.'),
    G('gvene', 'Laboratorio del venerdì', 'Progetti e autonomie', 5, '16:00', dalVen, ['rmart07', 'rirene13', 'ryous12', 'rtomm08'],
      'Progettare e portare a termine un lavoro comune; organizzazione e autonomia.'),
  ];
  // Irene entra nel laboratorio una settimana dopo
  gruppi[2].membri[1].dal = piu(dalVen, 7);

  const TEMI = {
    gmart: [
      ['Presentazioni e patto del gruppo', 'Ci siamo presentati con l\'oggetto portato da casa. Patto del gruppo scritto insieme: si parla uno alla volta, si può dire «passo».'],
      ['Le emozioni di base: il cerchio dei volti', 'Buona energia. Il cerchio dei volti è piaciuto; fatica a distinguere **paura** e **rabbia**.'],
      ['La paura: cosa succede nel corpo', 'Molto coinvolti nella mappa del corpo. Emersi temi legati alla scuola #scuola e alle verifiche.'],
      ['La rabbia: il termometro', 'Il termometro ha funzionato meglio a coppie che in cerchio. Il gioco dei ruoli si è acceso presto: da riprendere con regole più chiare sui turni. #turni'],
      ['Chiedere aiuto: a chi e come', 'Clima più calmo. Hanno costruito la «mappa delle persone a cui chiedere». #risorse'],
      ['Gioco dei ruoli: «mi hanno preso il posto»', 'Scene brevi, poi discussione. Qualche tensione tra due ragazzi, gestita dal gruppo stesso. #conflitto'],
      ['Tristezza e perdita: la scatola dei ricordi', 'Momento intenso. Alcuni hanno portato ricordi legati ai nonni. Chiusura con il cerchio. #famiglia'],
      ['Ripasso: il mio termometro personale', ''],
    ],
    ggiov: [
      ['Conoscersi: intervista a coppie', 'Interviste a coppie, poi presentazione del compagno. Ottimo clima di partenza.'],
      ['Ascoltare davvero', 'Esercizio dell\'eco: ripetere quello che ha detto l\'altro prima di rispondere. Difficile per chi tende a interrompere. #turni'],
      ['Entrare in una conversazione', 'Simulazioni al bar e in classe. Emersa molta ansia sociale nel rompere il ghiaccio. #ansia'],
      ['Dire di no senza litigare', 'Tecnica del disco rotto. Divertente, molto partecipato. #autostima'],
      ['Critiche e complimenti', 'Giro dei complimenti: c\'è chi fatica ad accettarli. #autostima'],
      ['Conflitti tra amici: scenette', 'Scenette in tre: chi litiga, chi media. Bravi i più grandi nel ruolo di mediatori. #conflitto #collaborazione'],
      ['Social e amicizie', 'Discussione sui gruppi WhatsApp di classe; esclusioni e prese in giro. #amicizie #scuola'],
      ['Chiedere aiuto: scenette', ''],
    ],
    gvene: [
      ['Scegliere il progetto: la fanzine del centro', 'Scelto il progetto: una fanzine. Ruoli assegnati: redazione, disegni, impaginazione. #collaborazione'],
      ['Scalette e scadenze', 'Hanno costruito una tabella di marcia. Qualcuno si scoraggia davanti alle scadenze. #organizzazione'],
      ['Prime pagine', 'Lavoro concentrato, ottima collaborazione tra i più grandi. #collaborazione'],
      ['Revisione e stampa', ''],
    ],
  };
  const PART = [
    (x) => `Ha preso la parola per primo, cosa rara. Da valorizzare. #risorse`,
    (x) => `Si è chiuso quando si è parlato di scuola. Da riprendere in individuale. #scuola #da-riprendere`,
    (x) => `Ha lasciato il gruppo per due minuti, è rientrato da solo. #regolazione`,
    (x) => `Molto collaborativo con i più piccoli, ruolo di aiutante. #risorse #collaborazione`,
    (x) => `Ha raccontato per la prima volta un episodio di casa. #famiglia #da-riprendere`,
    (x) => `Tende a interrompere; con il segnale concordato si ferma. #turni`,
    (x) => `Scontro verbale con un compagno, poi chiarito nel cerchio finale. #conflitto`,
    (x) => `Stanco, poco presente. Riferisce di dormire poco. #da-riprendere`,
  ];

  const sedute = [];
  for (const g of gruppi) {
    const temi = TEMI[g.id];
    const giorno = g.ricorrenza.giorni[0];
    let d = g.ricorrenza.dal, i = 0;
    while (giornoSettimana(d) !== giorno) d = piu(d, 1);
    for (; i < temi.length; d = piu(d, 7), i++) {
      const [argomento, resoconto] = temi[i];
      const passata = d < O;
      const membri = g.membri.filter((x) => x.dal <= d).map((x) => x.ragazzoId);
      const presenze = {};
      const partecipanti = {};
      if (passata && resoconto) {
        const assente = caso() < 0.5 ? uno(membri) : null;
        if (assente) presenze[assente] = false;
        const scelti = membri.filter((x) => x !== assente).sort(() => caso() - 0.5).slice(0, 2 + Math.floor(caso() * 2));
        for (const x of scelti) partecipanti[x] = uno(PART)(r[x]);
      }
      let res = passata ? resoconto : '';
      if (g.id === 'gvene' && i === 1) res = ''; // una seduta ancora da scrivere
      if (res && g.id === 'gmart' && i === 3) res += `\n\n${m(r.romar03)} e ${m(r.rgiul04)} hanno aiutato gli altri a dare un numero.`;
      const prossimaTema = temi[i + 1] ? temi[i + 1][0] : '';
      sedute.push({
        id: `s${g.id}${i}`, tipo: 'gruppo', gruppoId: g.id, data: d, ora: g.ricorrenza.ora, durata: 90,
        argomento: argomentoDi(argomento, g.id, i),
        resoconto: res, prossima: passata && res && prossimaTema ? prossimaDi(prossimaTema) : '',
        presenze, partecipanti, autori: res ? { resoconto: i % 3 === 2 ? 'Elena' : autore, argomento: autore } : { argomento: autore },
        creato: t, modificato: t,
      });
    }
  }
  // Seduta passata senza resoconto (da scrivere): l'ultima del venerdì se è già passata
  for (const s of sedute) if (s.data < O && !s.resoconto) s.prossima = '';

  // Individuali
  const ind = (id, rid, data, ora, argomento, resoconto, prossima = '') => ({
    id, tipo: 'individuale', ragazzoId: rid, data, ora, durata: 60, argomento, resoconto, prossima, autori: { resoconto: autore, argomento: autore }, creato: t, modificato: t,
  });
  sedute.push(
    ind('sind1', 'rluca01', piu(L, -41), '16:30', 'Come va il gruppo?', 'Dice che il gruppo gli piace ma «ci sono troppe regole». Lavoriamo sui segnali del corpo prima della rabbia. #regolazione', 'Proporre il quaderno dei segnali'),
    ind('sind2', 'rluca01', piu(L, -34), '16:30', '- [x] Proporre il quaderno dei segnali\n- [ ] Parlare della gita', 'Accetta il quaderno. Racconta un litigio in classe con un compagno. #scuola #conflitto', 'Ripresa dopo la gita'),
    ind('sind3', 'rluca01', piu(L, -6), '16:30', 'Ripresa dopo la gita', 'La gita è andata meglio del previsto: ha usato il quaderno due volte. **Molto orgoglioso.** #risorse', '- [ ] Rivedere il quaderno insieme\n- [ ] Accennare al colloquio con la mamma'),
    ind('sind4', 'rmart07', piu(L, -24), '14:00', 'Primo incontro: cosa ti porta qui', 'Racconta la fatica nel nuovo gruppo classe. Molto lucida. #scuola #amicizie #ansia', 'Mappa delle relazioni in classe'),
    ind('sind5', 'rmart07', piu(L, -10), '14:00', '- [x] Mappa delle relazioni in classe', 'Mappa fatta: si sente «in mezzo» tra due gruppi. #amicizie', '- [ ] Situazioni in cui si è sentita a suo agio'),
  );
  // Genitori
  const gen = (id, rid, data, ora, argomento, resoconto, chi) => ({
    id, tipo: 'genitori', ragazzoId: rid, data, ora, durata: 60, argomento, resoconto, chi, prossima: '', autori: { resoconto: autore }, creato: t, modificato: t,
  });
  sedute.push(
    gen('sgen1', 'rsara02', piu(L, -20), '17:30', 'Restituzione dopo il primo mese', 'Presenti entrambi i genitori. Riferiscono tensioni con la sorella maggiore. Concordato di sentirci tra un mese. #famiglia', 'madre e padre'),
    gen('sgen2', 'rluca01', piu(L, -13), '17:30', 'Andamento scolastico', 'La mamma riporta miglioramenti nei compiti ma fatica al mattino. #scuola #famiglia', 'madre'),
    gen('sgen3', 'rsara02', piu(O, 2) > piu(L, 4) ? piu(L, 9) : piu(O, 2), '17:00', '- [ ] Restituzione primo trimestre\n- [ ] Portare la scheda di sintesi\n- [ ] Chiedere dei rapporti con la sorella', '', 'madre e padre'),
  );

  // Colloqui di conoscenza, prima dell'inizio
  const con = (id, rid, data, ora, chi, argomento, resoconto) => ({
    id, tipo: 'conoscenza', ragazzoId: rid, data, ora, durata: 60, chi, argomento, resoconto, prossima: '', autori: { resoconto: autore, argomento: autore }, creato: t, modificato: t,
  });
  sedute.push(
    con('sco1', 'rluca01', piu(L, -125), '17:00', 'la madre', 'Primo colloquio con la mamma',
      'La madre racconta di scatti di rabbia sempre più frequenti, soprattutto **dopo la scuola**. Sente di non riuscire a «prenderlo». #famiglia #regolazione\n\n- Sviluppo nella norma, DSA diagnosticato in 3ª elementare\n- Buon rapporto con la sorella\n- Il papà è disponibile a venire a un incontro'),
    con('sco2', 'rluca01', piu(L, -118), '16:30', 'Luca', 'Conoscerci: cosa ti piace, cosa no',
      'Inizialmente sulla difensiva, si scioglie parlando di calcio e videogiochi. Sul perché è qui: «perché mi arrabbio, ma è colpa degli altri». Accetta di provare il gruppo. #risorse'),
    con('sco3', 'rmart07', piu(L, -76), '14:00', 'Martina e il padre', 'Conoscenza e richiesta',
      'Il padre porta la richiesta, Martina ascolta e poi corregge: «non è che sto male, è che non conosco nessuno». Molto lucida. #scuola #amicizie #ansia'),
  );

  const note = [
    { id: 'n4', ragazzoId: 'rluca01', categoria: 'scuola', data: piu(L, -18), titolo: 'Colloquio con l\'insegnante', testo: 'Sentita la prof.ssa Ferraro: in classe **meno litigi** nell\'ultimo mese, ma fatica ancora nelle verifiche orali. Propone di usare il quaderno dei segnali anche in classe. #scuola #regolazione', autore, creato: t, modificato: t },
    { id: 'n5', ragazzoId: 'rmart07', categoria: 'gruppo', data: piu(L, -4), titolo: 'In laboratorio', testo: 'Ha preso l\'iniziativa sull\'impaginazione della fanzine e ha coinvolto @[Irene S.](r:rirene13). Più sciolta rispetto alle prime volte. #collaborazione #risorse', autore: 'Elena', creato: t, modificato: t },
    { id: 'n1', categoria: 'scuola', ragazzoId: 'romar03', data: piu(L, -15), titolo: 'Telefonata con la scuola', testo: 'La professoressa di lettere segnala che Omar in classe **aiuta i compagni in difficoltà**. Da riportare al gruppo come risorsa. #scuola #risorse', autore, creato: t, modificato: t },
    { id: 'n2', categoria: 'osservazione', ragazzoId: 'rsara02', data: piu(L, -8), titolo: 'Osservazione', testo: 'Arrivata in anticipo, ha chiacchierato con Giulia fuori dalla stanza: sembra aver trovato un\'alleata nel gruppo. #amicizie', autore: 'Elena', creato: t, modificato: t },
    { id: 'n3', categoria: 'altro', gruppoId: 'ggiov', data: piu(L, -3), titolo: 'Idea per il gruppo', testo: 'Per il giovedì provare un role-play registrato con il telefono, da riguardare insieme. Chiedere prima il consenso a tutti. #idee', autore, creato: t, modificato: t },
  ];
  const sospesi = [
    { id: 'q1', gruppoId: 'gmart', testo: 'Lettera a un\'emozione', autore, creato: t },
    { id: 'q2', gruppoId: 'gmart', testo: 'Invitare un ex-partecipante a raccontare', autore, creato: t },
    { id: 'q3', gruppoId: 'gmart', testo: 'Film breve «Inside Out», scena della rabbia', autore: 'Elena', creato: t },
    { id: 'q4', gruppoId: 'ggiov', testo: 'Role-play registrato col telefono (consenso!)', autore, creato: t },
    { id: 'q5', gruppoId: 'ggiov', testo: 'Uscita al bar: ordinare da soli', autore, creato: t },
    { id: 'q6', ragazzoId: 'rluca01', testo: 'Parlare del rapporto con il papà', autore, creato: t },
  ];
  const programmi = [{ ...daTesto(LIFE_SKILLS, 'Life skills a scuola'), id: 'plifeskills', destinatari: ['classe', 'gruppo'], creato: t, modificato: t }];
  return { ragazzi, gruppi, sedute, note, sospesi, persone: structuredClone(PERSONE), programmi };
}

function argomentoDi(titolo, gid, i) {
  if (gid === 'gmart' && i === 3) return 'La rabbia: dove la sento, quanto è forte.\n- [x] Termometro delle emozioni, a coppie\n- [x] Gioco dei ruoli: «mi hanno preso il posto»\n- [ ] Chiudere con il cerchio';
  return titolo;
}
function prossimaDi(tema) {
  return `- [ ] ${tema}`;
}
