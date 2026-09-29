# Product

## Register

product

## Users

Operatori di un'aula del Centro TICE dove si lavora con gruppi di ragazzi più grandi
(preadolescenti e adolescenti). Due amministratori (lo psicologo che gestisce l'aula e
una collega) e i tirocinanti che li affiancano. I ragazzi non usano l'app.

- **Dove e quando**: le note si scrivono soprattutto al computer, a fine seduta o a fine
  giornata, con calma e con la tastiera. Si consultano sia al computer sia dal telefono
  (prima di entrare in aula, durante una riunione, per ricordare cosa si era deciso). Dal
  telefono si deve anche poter scrivere comodamente.
- **Il lavoro da fare**: tenere traccia di cosa succede nei gruppi e nei percorsi dei
  singoli ragazzi, e ritrovarlo. Preparare la seduta successiva ("cosa voglio fare la
  prossima volta"). Portare il materiale in riunione d'équipe e nelle relazioni.
- **Stato d'animo**: concentrato, riflessivo; spesso stanco a fine giornata. L'app non
  deve chiedere sforzo: aprire, scrivere, ritrovare.

## Product Purpose

PsyDiary è il diario clinico dell'aula. Contiene:
- **gruppi**, organizzati nel tempo in un calendario;
- **anagrafiche dei ragazzi**;
- **note**: di seduta di gruppo, sui singoli partecipanti di quella seduta, di sedute
  individuali, di incontri con i genitori.

Ogni nota è taggata, filtrabile e ricercabile per data e per contenuto. Per ogni
seduta, già avvenuta o futura, si segna l'argomento, in modo libero: la seduta futura
diventa un promemoria di cosa si vuole fare.

Si vede lo storico di ogni gruppo e il diario completo di ogni ragazzo. L'editor è
markdown completo con resa in tempo reale e scorciatoie da tastiera.

È un sistema separato dall'app della presa dati del centro: altra aula, altri accessi,
altro Drive, altra chiave, altra identità visiva. Riusa però le fondamenta tecniche
collaudate lì: custode, cifratura con chiave consegnata ai dispositivi, sincronizzazione
offline con fusione, accesso Google, PWA.

**Successo**: gli operatori smettono di usare quaderni, documenti sparsi e chat per le
note dell'aula. Prima di una seduta ritrovano in pochi secondi cosa era successo e cosa
si erano ripromessi. In riunione esportano il diario di un ragazzo senza rielaborarlo.

## Brand Personality

**Autorevole, intima, artigianale.** Un quaderno professionale di pregio: serio sul
contenuto, caldo nel tono, fatto a mano nei dettagli.

Riferimenti estetici indicati dall'utente:
- incrocio tra **brutalismo** (struttura e griglia a vista, bordi netti, niente
  decorazione finta), **luxury typography** (serif ad alto contrasto, scale
  tipografiche ampie, respiro) e **conceptual sketch** (segni a mano, annotazioni,
  tratto a matita);
- tipografia che mescola serif/script e sans;
- aspetto pulito, ma con **texture tattili, da carta e da stampa** (grana, duotone,
  inchiostro).

Voce italiana, diretta, sobria: parla come un collega esperto, non come un software.

## Anti-references

- **Gestionale sanitario**: tabelle grigie, moduli, icone da cartella clinica
  ospedaliera, colori "medicali".
- **App di produttività generica**: lo stile Notion/SaaS con fondo bianco, accento blu,
  card arrotondate tutte uguali, dashboard a riquadri.
- Anche se non vietati esplicitamente: niente diario infantile (pastelli, illustrazioni
  carine). E niente estetica che rallenta: le texture e la tipografia non devono mai
  costare leggibilità o velocità di scrittura.

## Design Principles

1. **La scrittura prima di tutto.** L'editor è il cuore: si apre subito, si scrive
   senza attrito, le scorciatoie funzionano come ci si aspetta. Il resto dell'interfaccia
   si fa da parte quando si scrive.
2. **Ritrovare in pochi secondi.** Tag, date, ricerca e filtri sono sempre a portata e
   si combinano. Il tempo (calendario, linea del tempo) è l'asse principale dell'app.
3. **Carattere senza attrito.** La personalità (tipografia di pregio, texture da stampa,
   segni a mano) vive nelle superfici e nei momenti giusti. Non entra mai nei controlli
   o nel testo delle note, dove servono chiarezza e familiarità.
4. **Il futuro è una nota come le altre.** Pianificare una seduta e ricordarla usano lo
   stesso gesto: un argomento libero su una data, che poi diventa il resoconto.
5. **Riservatezza silenziosa.** I dati sono clinici e cifrati. La sicurezza si sente
   come fiducia, non come burocrazia: niente avvisi continui, ruoli chiari.

## Accessibility & Inclusion

- WCAG 2.2 AA: contrasti rispettati anche su texture e duotone, in tema chiaro e scuro.
- Testo ingrandibile senza rompere il layout; tutto usabile da tastiera, con focus
  visibile.
- `prefers-reduced-motion` rispettato; `prefers-color-scheme` per il tema, con scelta
  manuale.
- Stampa ed esportazione (PDF e Word) pulite e leggibili, coerenti con lo stile "da
  stampa".
