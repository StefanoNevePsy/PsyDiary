// I campi dell'anagrafica del paziente, in sezioni: [chiave, etichetta, tipo, opzioni, larga, suggerimento].
// Li usano la pagina del paziente e l'esportazione completa.
const SI_NO = [['', '—'], ['sì', 'sì'], ['no', 'no']];
export const SEZIONI = [
  { titolo: 'Dati personali', campi: [
    ['nome', 'Nome'], ['cognome', 'Cognome'], ['nascita', 'Data di nascita', 'date'], ['luogoNascita', 'Luogo di nascita'],
    ['genere', 'Genere', 'select', [['', '—'], ['F', 'femmina'], ['M', 'maschio'], ['altro', 'altro']]], ['cf', 'Codice fiscale'],
    ['cittadinanza', 'Cittadinanza'], ['lingue', 'Lingue parlate a casa'],
    ['indirizzo', 'Indirizzo'], ['comune', 'Comune'], ['telefono', 'Telefono', 'tel'], ['email', 'Email', 'email'],
  ] },
  { titolo: 'Scuola', campi: [
    ['scuola', 'Scuola'], ['classe', 'Classe'], ['insegnante', 'Insegnante di riferimento'],
    ['certificazioni', 'Certificazioni', 'select', [['', '—'], ['nessuna', 'nessuna'], ['104', 'L. 104 · PEI'], ['dsa', 'DSA · PDP'], ['bes', 'BES']]],
  ] },
  { titolo: 'Profilo', nota: 'Si vede a colpo d\'occhio in "In breve", in cima alla scheda.', campi: [
    ['interessi', 'Interessi e passioni', 'area', null, false, 'giochi, sport, personaggi, materie preferite'],
    ['puntiForza', 'Punti di forza e risorse', 'area', null, false, 'cosa sa fare bene, chi lo sostiene'],
    ['bisogni', 'Bisogni principali', 'area', null, false, 'su cosa lavorare per primo'],
    ['obiettivi', 'Obiettivi del percorso', 'area', null, false, 'cosa ci si aspetta di raggiungere'],
    ['strategie', 'Strategie che funzionano', 'area', null, false, 'rinforzi, modi di proporre, cosa lo aiuta'],
    ['attenzioni', 'Attenzioni', 'area', null, false, 'cosa evitare, segnali di disagio, allergie'],
  ] },
  { titolo: 'Invio e servizi', campi: [
    ['invio', 'Inviato da'], ['diagnosi', 'Diagnosi o ipotesi'], ['servizi', 'Altri servizi coinvolti'], ['pediatra', 'Pediatra o medico'],
    ['motivoInvio', "Motivo dell'invio", 'area', null, true],
    ['inizio', 'In carico dal', 'date'], ['stato', 'Percorso', 'select', [['attivo', 'in corso'], ['concluso', 'concluso']]],
  ] },
  { titolo: 'Consensi', campi: [
    ['consensoPrivacy', 'Informativa firmata il', 'date'], ['consensoFoto', 'Consenso alle immagini', 'select', SI_NO],
    ['consensoScuola', 'Consenso a sentire la scuola', 'select', SI_NO],
  ] },
];

/** I campi del profilo, per il riepilogo "In breve": [chiave, etichetta]. */
export const PROFILO = SEZIONI.find((x) => x.titolo === 'Profilo').campi.map(([k, n]) => [k, n]);
