# Messa in servizio di PsyDiary

Questa guida porta PsyDiary dal prototipo alla versione vera: accesso con
Google, dati cifrati sul tuo Google Drive, sincronizzazione tra computer e
telefoni. Ci vogliono circa 30–40 minuti, una volta sola. Tutto il resto
(pubblicazione del sito, aggiornamenti, consegna della chiave ai dispositivi)
è automatico.

## Come funziona, in breve

```
 telefono / computer                       il tuo Google Drive
 ┌──────────────────┐   dati cifrati     ┌──────────────────────────────┐
 │ PsyDiary (sito)  │ ─────────────────▶ │ custode (Google Apps Script) │
 │ lavora anche     │ ◀───────────────── │ └─ "PsyDiary · dati cifrati" │
 │ senza rete       │   solo ciò che     │    file illeggibili          │
 └──────────────────┘   puoi vedere      └──────────────────────────────┘
```

- **Il sito** (GitHub Pages) è l'app: si apre dal browser e si installa come
  app su telefono e computer. Lavora in locale e funziona anche offline.
- **Il custode** è un piccolo programma che gira sul *tuo* account Google
  (Apps Script). Tiene i file nel tuo Drive e decide chi può leggere cosa.
- **I dati partono già cifrati** con la *chiave dell'aula*: sul Drive ci sono
  solo file illeggibili, anche per Google e per chi aprisse la cartella. La
  chiave la conoscete solo tu e gli operatori; agli altri dispositivi arriva
  cifrata per loro, e la usano senza poterla vedere.
- **Ogni paziente è di chi lo crea.** Un paziente nuovo lo vede solo
  l'operatore che l'ha creato: agli altri non arriva niente, nemmeno il nome
  cifrato. Lo condivide lui con le persone che sceglie, oppure lo apre a tutti
  gli operatori dell'aula (come i pazienti dei gruppi). Così PsyDiary si può
  usare anche per pazienti esterni all'aula. I pazienti inseriti prima di
  questa regola restano di tutta l'aula, finché chi li ha creati non li rende
  riservati.
- **I tirocinanti** ricevono sul loro dispositivo solo quello che possono
  vedere: dei pazienti non condivisi con loro non arriva nulla di personale,
  nemmeno cifrato.
- **Tu sei il proprietario**: l'account che installa il custode è sempre
  operatore e nessuno può chiuderlo fuori.

Ti servono: l'account Google con cui vuoi tenere i dati (quello dell'aula o il
tuo), e l'accesso al repository `StefanoNevePsy/PsyDiary` su GitHub.

**Riepilogo dei passi**

| | Passo | Tempo | Stato |
|---|---|---|---|
| 1 | GitHub Pages | 2 min | ✅ già fatto: il sito è online |
| 2 | Client ID di Google | 10 min | da fare |
| 3 | Custode su Apps Script | 10 min | da fare |
| 4 | Collegare il sito al custode (2 variabili su GitHub) | 3 min | da fare (automatico con la strada 3A + `gh`) |
| 5 | Primo accesso e chiave dell'aula | 5 min | da fare |
| 6 | Collega e tirocinanti | 5 min | da fare |

---

## Passo 1 · GitHub Pages ✅ (già fatto)

Pages è attivo e l'Action pubblica il sito a ogni modifica. Il sito è su
**https://stefanonevepsy.github.io/PsyDiary/** (con le maiuscole: l'indirizzo
segue il nome del repository).

Se un giorno servisse rifarlo: repository → **Settings → Pages** → *Source*:
**GitHub Actions**, poi **Actions → Pubblica PsyDiary → Run workflow**.
Per ora è la **demo** con dati inventati: si può già mostrare a chi vuoi. Diventa
la versione vera al passo 4, e la demo resta sempre disponibile dal pulsante
**Guarda la demo** nella pagina d'ingresso, o con il link
**https://stefanonevepsy.github.io/PsyDiary/?demo**. La demo usa un archivio a
parte nel browser e non tocca mai i dati dell'aula.

> Il sito si pubblica dal ramo principale del repository (ora
> `claude/prototipo`). Se preferisci chiamarlo `main`: Settings → Branches →
> matita accanto al nome → rinomina. L'Action segue da sola il ramo principale.

## Passo 2 · Il client ID di Google (10 minuti)

Serve perché "Accedi con Google" funzioni sul tuo sito. PsyDiary chiede a
Google solo *chi sei* (nome ed email): niente posta, niente Drive di chi entra.

1. Apri **https://console.cloud.google.com/** con l'account Google che userai
   per PsyDiary.
2. In alto: **Seleziona un progetto → Nuovo progetto** → nome `PsyDiary` → Crea.
3. Menu ☰ → **API e servizi → Schermata consenso OAuth** (o *Google Auth
   Platform → Branding*):
   - tipo **Esterno**, nome app `PsyDiary`, la tua email come assistenza e
     contatto;
   - ambiti: non aggiungere nulla (bastano quelli di base);
   - in *Pubblico* (Audience) premi **Pubblica app** / *Publish app* così
     possono entrare tutti gli account che abiliterai, senza limite di "utenti
     di prova". Non serve la verifica di Google: PsyDiary usa solo nome ed email.
4. **API e servizi → Credenziali → Crea credenziali → ID client OAuth**:
   - tipo di applicazione: **Applicazione web**, nome `PsyDiary sito`;
   - **Origini JavaScript autorizzate**: aggiungi
     `https://stefanonevepsy.github.io`
     (e, se vuoi provare in locale, `http://localhost:5173`);
   - *URI di reindirizzamento*: lascia vuoto.
5. Crea e copia il **Client ID** (finisce con `.apps.googleusercontent.com`).
   Non è un segreto: può stare nel sito.

## Passo 3 · Installa il custode (10 minuti)

Due strade: la **A** fa quasi tutto da sola ma usa il terminale; la **B** si
fa tutta dal browser.

### A · Con un comando (consigliata se hai Node.js sul computer)

Serve Node.js 20 o più recente (https://nodejs.org) e, facoltativa ma comoda,
la CLI di GitHub già collegata (`gh auth login`).

1. Una volta sola: apri **https://script.google.com/home/usersettings** e
   attiva **Google Apps Script API**.
2. Nel terminale:
   ```sh
   git clone https://github.com/StefanoNevePsy/PsyDiary.git
   cd PsyDiary
   npm ci
   npm run custode:installa -- IL-TUO-CLIENT-ID.apps.googleusercontent.com
   ```
   Si apre il browser per l'accesso a Google (accetta). Lo script crea il
   progetto Apps Script, carica il codice, lo distribuisce come app web e ti
   stampa l'indirizzo del custode. Se sul computer c'è la CLI di GitHub (`gh`)
   già collegata, imposta anche le variabili del passo 4 **da solo**, compreso
   il segreto per gli aggiornamenti automatici del custode.
3. Apri il link del progetto che ti stampa, scegli la funzione **configura**
   nel menu in alto e premi **▶ Esegui**. Google chiede di autorizzare
   l'accesso al tuo Drive: **Rivedi autorizzazioni → il tuo account →
   Avanzate → Vai a PsyDiary · custode (non sicuro) → Consenti**.
   ("Non sicuro" vuol dire solo che lo script è tuo e non è stato revisionato
   da Google.) La funzione crea nel tuo Drive la cartella
   **PsyDiary · dati cifrati**.

### B · Solo dal browser

1. Prendi il custode pronto: su GitHub → **Actions** → l'ultima esecuzione di
   *Pubblica PsyDiary* → in fondo, *Artifacts* → **custode-apps-script**
   (è uno zip). Dentro c'è `custode-completo.gs`.
   (Se al passo 4 hai già impostato `GOOGLE_CLIENT_ID`, il client ID è già
   dentro il file; altrimenti lo aggiungi al punto 5.)
2. Apri **https://script.google.com** → **Nuovo progetto**. Rinominalo
   `PsyDiary · custode`.
3. Nel file `Codice.gs` cancella tutto e incolla il contenuto di
   `custode-completo.gs`. Salva (💾).
4. ⚙️ **Impostazioni progetto** → spunta **Mostra il file manifest
   "appsscript.json"**. Torna all'editor, apri `appsscript.json` e sostituiscilo
   con quello dello zip. Salva.
5. Solo se il client ID non era nel file: ⚙️ Impostazioni progetto →
   **Proprietà dello script** → aggiungi `GOOGLE_CLIENT_ID` = il client ID.
6. Nell'editor scegli la funzione **configura** → **▶ Esegui** → autorizza
   come descritto sopra (A.3).
7. **Distribuisci → Nuova distribuzione** → ⚙️ tipo **App web**:
   *Esegui come*: **Me**; *Chi ha accesso*: **Chiunque** → Distribuisci.
   Copia l'**URL dell'app web** (finisce con `/exec`).

   *Chiunque* è necessario perché l'app possa parlare con il custode; non
   espone niente: il custode risponde solo alle persone che abiliti tu, e solo
   con dati cifrati.

Prova: apri l'URL `/exec` nel browser. Deve rispondere
`{"ok":true,"servizio":"custode PsyDiary",...,"configurato":true}`.

## Passo 4 · Collega il sito al custode (3 minuti)

Se la strada A ha trovato `gh`, è già fatto: salta al passo 5.

Su GitHub: repository → **Settings → Secrets and variables → Actions**.

Scheda **Variables** → *New repository variable*:

| Nome | Valore |
|---|---|
| `CUSTODE_URL` | l'URL del custode, `https://script.google.com/macros/s/…/exec` |
| `GOOGLE_CLIENT_ID` | il client ID del passo 2 |

Facoltative, per aggiornare il custode automaticamente a ogni modifica (le
imposta da solo `npm run custode:installa`):

| Nome | Dove si trova |
|---|---|
| variabile `SCRIPT_ID` | Apps Script → ⚙️ Impostazioni progetto → *ID script* |
| variabile `CUSTODE_DEPLOYMENT_ID` | Distribuisci → Gestisci distribuzioni → *ID distribuzione* |
| segreto `CLASPRC_JSON` | il contenuto del file `~/.clasprc.json` creato da `npx @google/clasp@2.4.2 login` |

Poi **Actions → Pubblica PsyDiary → Run workflow**. Nel riepilogo
dell'esecuzione deve comparire "Versione collegata al custode".

## Passo 5 · Il primo accesso e la chiave dell'aula (5 minuti)

1. Apri **https://stefanonevepsy.github.io/PsyDiary/** ed entra con **lo
   stesso account Google che ha installato il custode**.
2. PsyDiary ti propone la **chiave dell'aula**: 25 caratteri in 5 gruppi.
   **Stampala** (pulsante *Stampa*) e conservala in un posto sicuro (un
   cassetto chiuso, un gestore di password). Poi spunta *L'ho conservata* e
   premi **Crea la chiave e inizia**.

   > La chiave non la conosce nessun altro, nemmeno Google. Serve solo se si
   > perdono **tutti** i dispositivi degli operatori: senza, i dati sul Drive
   > restano illeggibili per sempre. Da qualunque tuo dispositivo la rivedi in
   > *Impostazioni → Chiave dell'aula*.
3. Installa PsyDiary come app:
   - **computer (Chrome/Edge)**: icona ⊕ *Installa* nella barra dell'indirizzo;
   - **iPhone/iPad**: Safari → Condividi → *Aggiungi alla schermata Home*;
   - **Android**: Chrome → ⋮ → *Installa app*.
4. Crea gruppi e ragazzi (Gruppi → *Nuovo gruppo*, Ragazzi → *Nuovo ragazzo*)
   e i loro **appuntamenti ricorrenti** (nella scheda del gruppo o del ragazzo,
   o dal calendario con *+ Seduta → Si ripete*): da lì in poi le sedute
   compaiono da sole nel calendario, pronte per gli appunti.

## Passo 6 · Aggiungi la collega e i tirocinanti

In PsyDiary: **Impostazioni → Persone e accessi**.

1. Aggiungi la collega con la sua email Google e ruolo **operatore**.
2. Aggiungi ogni tirocinante con ruolo **tirocinante**. Con il pulsante
   *solo gruppi / N condivisi* scegli i ragazzi che vede per intero (anche un
   gruppo intero in un tocco). Puoi mettere una data di fine accesso: dopo
   quella data non entra più e i dati spariscono dal suo dispositivo.
3. Premi **Salva gli accessi**.
4. Chi vede ogni paziente si sceglie dalla sua pagina, sotto il nome:
   *Chi lo vede* (lo decide chi l'ha creato). Un paziente che metti in un
   gruppo va aperto a tutti gli operatori, altrimenti chi lavora nel gruppo
   non ne vede il nome: PsyDiary te lo propone quando lo aggiungi. Se un
   operatore lascia l'aula, i suoi pazienti passano a te (proprietario), che
   puoi prenderli in carico.
5. Manda loro il link del sito. Entrano con Google; al primo accesso il loro
   dispositivo "aspetta la chiave": arriva **da sola** entro un minuto, purché
   PsyDiary sia aperto su un dispositivo di un operatore. La collega operatrice
   può anche inserire la chiave dell'aula a mano.

Togliere qualcuno: *Persone e accessi* → 🗑 → Salva. Alla sua prossima
apertura PsyDiary cancella i dati dell'aula dal suo dispositivo, e i suoi
dispositivi perdono la chiave.

---

## Dopo: cosa succede da solo

- **Aggiornamenti del sito**: ogni modifica al repository ripubblica il sito.
  Sui dispositivi compare "C'è una nuova versione di PsyDiary → Aggiorna"
  (mai a metà di una nota).
- **Aggiornamenti del custode**: automatici se hai impostato `SCRIPT_ID`,
  `CUSTODE_DEPLOYMENT_ID` e `CLASPRC_JSON`. Altrimenti, quando te lo dico, si
  ripete il passo 3B punti 1–3 e poi *Distribuisci → Gestisci distribuzioni →
  ✏️ → Versione: Nuova versione → Distribuisci* (così l'indirizzo non cambia).
- **Sincronizzazione**: ogni modifica parte dopo un secondo e mezzo; gli
  aggiornamenti degli altri arrivano ogni minuto e quando riapri l'app. Il
  pallino in alto dice lo stato (verde: tutto salvato; giallo: da inviare;
  grigio: senza rete, lavori sul dispositivo). Se due persone scrivono insieme
  sulla stessa nota, le due versioni si uniscono senza perdere niente.
- **Storia**: per ogni voce il custode tiene le ultime 15 versioni (per ora si
  recuperano su richiesta, non ancora dall'app). Drive tiene inoltre la
  cronologia delle versioni dei file.

## Sicurezza, in chiaro

- Sul Drive: solo buste cifrate (AES-256-GCM) più pochi dati tecnici (numero di
  versione, chi e quando ha salvato, email e ruoli di chi ha accesso, gli
  identificativi dei pazienti condivisi, chi ha creato ogni paziente e con chi
  lo ha condiviso). **Nessun nome, nessun testo.**
- Non spostare, rinominare o modificare i file nella cartella *PsyDiary · dati
  cifrati*, e non condividerla: non serve a nessuno per usare l'app.
- Il custode gira come *te*: se chiudi o cambi l'account Google proprietario,
  prima parliamone per trasferirlo.
- Sui dispositivi i dati stanno nel browser/app, protetti dal blocco del
  dispositivo. Mettete un codice di sblocco su telefoni e computer.

## Se qualcosa non va

| Sintomo | Cosa fare |
|---|---|
| Il pulsante "Accedi con Google" non compare, o dà errore di origine | Passo 2.4: l'origine deve essere esattamente `https://stefanonevepsy.github.io` (senza `/PsyDiary`). Le modifiche possono richiedere qualche minuto. |
| "L'account … non è abilitato" | Aggiungilo in *Persone e accessi* e salva. |
| "Il custode non risponde" | La distribuzione deve essere *App web*, *Esegui come: Me*, *Chi ha accesso: Chiunque*. Apri l'URL `/exec`: deve rispondere `ok`. |
| "configurato": false | Esegui di nuovo *configura* dall'editor; controlla il client ID (file o proprietà dello script). |
| Un dispositivo resta "in attesa della chiave" | Apri PsyDiary su un dispositivo di un operatore e aspetta un minuto (o tocca il pallino in alto). |
| Il sito è ancora la demo | Mancano le variabili del passo 4, o non è ripartita l'Action dopo averle impostate. |

## Provare in locale (facoltativo, per sviluppo)

```sh
npm ci
npm run custode:locale        # custode finto su http://localhost:8787, dati in .custode-locale/
npm run dev:reale             # app collegata, con accesso di prova "dev:email"
PROPRIETARIO=tua@email npm run custode:locale   # per scegliere chi è il proprietario
npm test                      # test del custode, del collegamento ad Apps Script e della sincronizzazione
```
