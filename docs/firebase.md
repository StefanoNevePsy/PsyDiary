# Corsia veloce (Firebase) — guida passo per passo

La corsia veloce è un **extra facoltativo**: le modifiche degli altri arrivano in circa un secondo (con Apps Script, il tempo che il custode impiega a salvare più un attimo), e un dispositivo nuovo riceve la chiave dell'aula in pochi secondi. Il custode (Apps Script + Drive) resta la base dei dati, l'archivio con le versioni precedenti e la **riserva automatica**: se la corsia veloce non funziona (limite giornaliero, rete, errore) l'app si comporta esattamente come prima e non si perde niente.

I dati su Firebase sono **sempre cifrati** con la chiave dell'aula, come sul Drive: Google non può leggerli. Vedono chi può leggere cosa le regole di Firestore, che copiano esattamente i permessi del custode (operatori e tirocinanti, pazienti e gruppi riservati, condivisioni, assegnazioni, accessi a tempo).

Il progetto Firebase di PsyDiary è `psydiary-510307` (numero `838795760240`). Il sito è già pronto: se il custode non è collegato la riga «Corsia veloce» in Impostazioni dice «spenta (il custode va aggiornato)» e tutto funziona come prima. Restano questi passi, **nell'ordine**.

## 0. Cosa deve già esserci nel progetto

Nella console Firebase del progetto:
- **Firestore Database** creato, in **modalità produzione**, in una regione europea.
- **Authentication** › **Metodo di accesso** › **Google** abilitato.
- Se hai messo delle restrizioni alla chiave API (console Google Cloud › API e servizi › Credenziali), il sito `https://stefanonevepsy.github.io/*` deve poterla usare e l'API «Identity Toolkit» deve essere ammessa.

## 1. Pubblica le regole

1. Console Firebase › **Firestore Database** › scheda **Regole**.
2. Cancella tutto, incolla il contenuto del file `firestore.rules` del repository, premi **Pubblica**.

Le regole fanno vedere a ciascuno solo le voci che il custode gli farebbe vedere e lasciano scrivere solo ciò che il custode lascerebbe scrivere.

## 2. Il client Google dell'app: controllo (di solito non serve fare niente)

L'app entra in Firebase con lo stesso accesso Google che usa per il custode. Firebase si fida degli accessi dei client OAuth che stanno **nello stesso progetto Cloud**. Controlla:

1. Il client ID di PsyDiary (quello della variabile GitHub `GOOGLE_CLIENT_ID`) deve cominciare con **`838795760240-`** (il numero del progetto).
2. Se è così, non fare altro.
3. Se è un altro numero, il client sta in un altro progetto: console Firebase › **Authentication** › **Metodo di accesso** › **Google** › **Configurazione SDK web** › «ID client da progetti esterni» (in inglese *Whitelist client IDs from external projects*) › aggiungi il client ID completo › Salva. Senza questo passo la corsia resta spenta con «accesso a Firebase non riuscito».

## 3. Aggiorna il custode e collegalo al progetto

Fai tutto con **l'account che ospita il custode** (il proprietario). L'ordine conta, così l'autorizzazione si chiede una volta sola.

1. **Prendi il codice nuovo.** In una cartella del progetto: `npm run custode` e apri `custode-pronto/custode-completo.gs`; oppure, su GitHub, Actions › ultima esecuzione di «Pubblica PsyDiary» › in fondo, *Artifacts* › `custode-apps-script`. (Se hai configurato `SCRIPT_ID` e `CLASPRC_JSON`, il job `custode` lo carica da solo: salta al punto 3.)
2. **Incolla.** Apri il progetto «PsyDiary · custode» su script.google.com. In `Codice.gs` cancella tutto e incolla `custode-completo.gs`.
3. **Permessi.** ⚙️ *Impostazioni progetto* › spunta «Mostra il file manifest appsscript.json» › nell'editor apri `appsscript.json` e sostituisci il contenuto con quello di `custode/appsscript.json` (o di `custode-pronto/appsscript.json`): aggiunge il permesso `https://www.googleapis.com/auth/datastore`.
4. **Collega il progetto Cloud.** ⚙️ *Impostazioni progetto* › **Progetto Google Cloud Platform** › **Cambia progetto** › scrivi il numero **838795760240** › Imposta progetto. Serve perché lo script possa scrivere su Firestore (deve essere lo *stesso* progetto).
5. **Schermata di consenso OAuth** di quel progetto (console Google Cloud › API e servizi › Schermata consenso OAuth):
   - se il tuo account è **Google Workspace**, scegli tipo **Interno**;
   - altrimenti pubblica l'app **«In produzione»**. Non lasciarla in «Test»: in Test le autorizzazioni scadono ogni 7 giorni e la corsia si spegnerebbe.
6. **Esegui la configurazione.** Nell'editor di Apps Script scegli la funzione **`configuraFirebase`** nel menu in alto e premi **Esegui**. Alla prima esecuzione Google chiede di **riautorizzare** il progetto (compare «Cloud Datastore» tra i permessi, oltre a Drive e richieste esterne): accetta. La funzione imposta il progetto Firebase (`psydiary-510307`) e copia su Firestore gli accessi e gli ambiti di ciascuno: nel registro (*Visualizza › Registro di esecuzione*) vedrai «Corsia veloce attiva sul progetto psydiary-510307: N documenti scritti…».
7. **Pubblica.** **Distribuisci › Gestisci distribuzioni › ✏️ › Versione: «Nuova versione» › Distribuisci.** L'indirizzo `/exec` non cambia, l'app non va toccata.

Da quel momento il custode aggiorna da solo la copia degli accessi a ogni cambiamento (persone, assegnazioni, condivisioni, nuovi pazienti e gruppi, scadenze).

Altre funzioni, da eseguire dall'editor solo se servono:
- **`riallineaFirebase`**: riscrive tutta la copia (dopo aver svuotato Firestore, o per riparare);
- **`disattivaFirebase`**: spegne la corsia dal lato del custode (le app tornano a usare solo il custode);
- **`impostaFirebase('altro-id-progetto')`**: come `configuraFirebase` ma con un altro progetto.

> Il «risveglio» facoltativo del custode (`attivaRisveglio`, vedi la guida di messa in servizio) rifà ogni 10 minuti (dalle 7 alle 21) la copia e **cancella le modifiche scadute di Firebase**; se non lo usi, vedi il passo 4.

## 4. Pulizia automatica (facoltativa ma consigliata)

Le voci su Firebase durano **3 giorni** e poi vanno cancellate (chi manca da più tempo si allinea dal custode). Due strade, anche tutte e due:

- **Automatica di Firebase (TTL)**: console Firebase › Firestore › **Dati** › scheda **TTL** (Criteri di durata) › **Crea criterio**, per ciascuna di queste quattro raccolte, campo `scade`: `modifiche`, `buste`, `richieste`, `consegne`.
- **Dal custode**: se hai attivato il risveglio (`attivaRisveglio`), cancella da solo ciò che è scaduto.

## 5. Come verificare che funzioni

1. Apri PsyDiary su due dispositivi con due persone diverse. Su ciascuno: **Impostazioni › Corsia veloce**: la riga dice **«Corsia veloce: attiva»**.
2. Su un dispositivo scrivi una nota o una seduta: sull'altro compare in circa un secondo (con il custode vero, il tempo che Apps Script impiega a salvare, poi subito).
3. Accedi da un dispositivo nuovo mentre un operatore ha l'app aperta: la chiave arriva in pochi secondi e il dispositivo nuovo mostra un **codice di verifica a 6 cifre**. In **Impostazioni › Persone e accessi › Dispositivi** l'operatore può scegliere «Consegna la chiave solo quando tocco “Consegna”»: allora vede la richiesta con lo stesso codice e controlla che coincida prima di toccare.
4. Se la riga dice **«spenta (motivo)»**, il motivo spiega cosa manca:
   - «il custode va aggiornato»: passo 3 (il custode non sa della corsia veloce);
   - «il custode usa un altro progetto Firebase»: il progetto del custode non è `psydiary-510307`: rieseguilo con `configuraFirebase`;
   - «il custode non ha ancora copiato gli accessi su Firebase»: esegui `configuraFirebase` (o `riallineaFirebase`) nell'editor, passo 3.6;
   - «accesso a Firebase non riuscito» / «serve un nuovo accesso con Google»: passo 2, oppure tocca **Attiva la corsia veloce** (chiede un accesso Google al volo, senza uscire dall'app). I dispositivi già collegati la attivano da soli al prossimo accesso con Google. Se compare «API key not valid», vedi sotto;
   - «permessi non concessi da Firebase»: le regole (passo 1) o la copia degli accessi non sono aggiornate: `riallineaFirebase`;
   - «limite giornaliero raggiunto»: il piano gratuito ha 50.000 letture e 20.000 scritture al giorno; la corsia riparte il giorno dopo e intanto va tutto col custode;
   - «nessuna connessione con Firebase»: tocca **Riprova**, o riparte da sola quando torna la rete.

## Se «API key not valid»: controlla la chiave

La configurazione web del progetto (`apiKey`, `authDomain`, `projectId`, `appId`…) sta in `src/lib/centro/config.js` (o nelle variabili `VITE_FIREBASE_*` della build). Non è segreta: protegge i dati la regola, non la chiave. **La `apiKey` è stata trascritta da una schermata**: il carattere subito dopo `AIzaSyDK` potrebbe essere una «I» maiuscola o una «l» minuscola, e «Bls» potrebbe essere «BIs». Se l'accesso a Firebase dà «API key not valid», confrontala con quella della console: Impostazioni progetto › Generali › *Le tue app* › app web › **Configurazione SDK** › `apiKey`, correggila in `config.js` (o imposta `VITE_FIREBASE_API_KEY`) e ripubblica.

Per spegnere la corsia nel sito pubblicato basta la variabile di build `VITE_FIREBASE=off`; per cambiare progetto, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_STORAGE_BUCKET`.

## Provare tutto in locale (per chi sviluppa)

Serve Java e Node. Le librerie di prova (`firebase-tools`, `@firebase/rules-unit-testing`) si installano una volta fuori dal repository:

```
sh tools/test-firebase.sh            # oppure: npm run firebase:prova  (usa ~/.cache/psydiary-firebase, o FB_DIR=<cartella>)
```
Avvia gli emulatori di Firestore e Auth, prova le regole contro il custode vero (chi vede cosa per ogni persona; chi può scrivere cosa; nessuno scrive la copia degli accessi; richiesta e consegna della chiave) e, se c'è Playwright (`/opt/node22/lib/node_modules`, o `PLAYWRIGHT_DIR`), tre browser con l'app vera: consegna della chiave (automatica e col codice di verifica), voci in tempo reale, ambiti riservati, riserva. **Non fa mai chiamate al progetto vero**: gli script rifiutano progetti che non si chiamano `demo-…` e il custode locale parla solo con un emulatore su 127.0.0.1.

`npm test` (senza emulatori) prova già la logica della corsia e che la copia degli accessi coincida con quello che il custode fa vedere a ciascuno (`tools/test-veloce.mjs`) e il collegamento in `Codice.gs` (`tools/test-appsscript.cjs`).

Per provare a mano, con gli emulatori accesi (`npx firebase emulators:start --only firestore,auth --project demo-psydiary`):
```
FIRESTORE=127.0.0.1:8085 PROGETTO=demo-psydiary npm run custode:locale
VITE_CUSTODE_URL=http://localhost:8787 VITE_ACCESSO_DEV=1 VITE_FIREBASE_PROJECT_ID=demo-psydiary \
  VITE_FIREBASE_EMULATORE=127.0.0.1:8085,127.0.0.1:9099 npx vite
```
(l'accesso di prova e gli emulatori valgono solo con `VITE_ACCESSO_DEV=1`: una build vera non può essere rediretta).
