# Corsia veloce su Firestore — decisioni di progetto

Obiettivo: far arrivare in tempo reale a più dispositivi voci **cifrate end-to-end**, tenendo il custode (Apps Script + Drive) come base dati, archivio e riserva. Firestore è solo una strada più veloce: ogni voce passa sempre anche dal custode, che resta la fonte di verità.

Il progetto nasce nel Centro TICE (stesso schema, aule e bambini al posto di ambiti e voci) ed è stato adattato al modello di PsyDiary. La guida per chi la usa è `docs/firebase.md`; qui le scelte, perché sono state fatte e dove sono nel codice.

## Principi

1. **Firestore non vede mai dati in chiaro.** Le buste sono quelle del custode (AES-256-GCM con la chiave dell'aula, `aad` = `psy:<ambito>:<id>`). Le regole servono solo a decidere *chi riceve quali buste* e *chi può scriverle*.
2. **Fonte di verità dei permessi unica: il custode.** Le regole non possono leggere il Drive, quindi il custode scrive su Firestore una **copia degli accessi** (solo lui: via REST con `ScriptApp.getOAuthToken()` e scope `datastore`, che salta le regole; i client non hanno nessun permesso su quella raccolta). Il codice che la calcola (`copiaFirestore` in `custode/core.js`) usa `profiloDi()` e `vedeAmbito()`, **le stesse funzioni che il custode usa a ogni richiesta** (`utenteDa` è ora un involucro di `profiloDi`): i due modelli non possono divergere per costruzione, e i test lo verificano comunque (sotto).
3. **Le regole non sono filtri.** Ogni query dell'app deve essere dimostrabile dalle regole: si progetta dalle query verso le regole. Verificato con l'emulatore: `ambito == 'aula'` (chiunque sia abilitato) e `ambito in [≤30 ambiti]` (tutti presenti nella propria copia). Una query più larga di quanto garantito è negata per intero.
4. **Riserva automatica.** Qualunque errore (quota `resource-exhausted`, permessi, rete, libreria non caricata) spegne la corsia; il custode riceve sempre tutto. Quota: spenta fino alla mezzanotte locale. Il resto: nessun nuovo tentativo automatico per 5 minuti, poi al rientro nell'app dopo 10 minuti, quando torna la rete (se la causa era la rete) e col tasto «Riprova».
5. **Senza configurazione non esiste.** `CONFIG.firebase` nullo (`VITE_FIREBASE=off`) o incompleto → nessun codice di Firebase caricato, nessuna riga nell'interfaccia. Con la configurazione ma con un custode non aggiornato o non collegato a Firebase, la corsia resta spenta *prima* di toccare la rete («il custode va aggiornato»).

## Schema dei dati

Raccolta scritta **solo dal custode**:

| Documento | Campi |
|---|---|
| `accessi/{email}` | `email`, `attivo` (sempre true: chi non è abilitato non ha il documento), `ruolo` (`admin` = operatore, `tirocinante`), `proprietario`, `scadeIl` (timestamp: il giorno dopo la scadenza alle 00:00 UTC; 2100 se senza scadenza), `ambiti[]` (gli ambiti `r:<id>`, `g:<id>`, `p:<id>` che quella persona vede; «aula» non c'è: lo vede chiunque abbia il documento) |

`ambiti` è calcolato con `vedeAmbito(u, a)` per ogni ambito esistente (`stato.ambiti`): creatore, `condivisi`, «tutti» agli operatori, tirocinanti assegnati (`ragazzi[]`) e «tutti i pazienti» di un operatore (`tuttiDa`), pazienti «di prima» (senza riga nel registro) agli operatori, orfani al proprietario. Il proprietario è sempre operatore. Una persona con più di 12 000 ambiti non entra in un documento da 1 MiB: non avrebbe il documento (e quindi niente corsia veloce per lei); il custode funziona come sempre.

Raccolte scritte dai client (sempre con `scade` e campi vincolati dalle regole):

| Documento | Campi | Chi legge | Chi scrive |
|---|---|---|---|
| `modifiche/{id}` | `id`, `tipo`, `ambito`, `eliminato`, `v` (versione del custode), `da` (email), `disp`, `ts` (ora del server), `scade`, `n`, `creatoDa` | chi vede l'ambito | chi vede l'ambito e può scrivere quel tipo di voce |
| `buste/{id}` | gli stessi (senza `disp`/`n`) + `busta` (cifrata, identica a quella del custode; `{}` per le eliminazioni) | idem | idem |
| `richieste/{dispositivo}` | `email`, `nome`, `pubblica` (chiave pubblica RSA), `ts`, `scade` | gli operatori e chi l'ha fatta | solo a nome proprio |
| `consegne/{dispositivo}` | `email`, `kid`, `busta` (chiave dell'aula cifrata per quel dispositivo), `da`, `ts`, `scade` | **solo il richiedente** | un operatore, per una richiesta esistente, a una persona abilitata |

`{id}` è l'id della **voce** (paziente, scheda `<id>sc`, gruppo, seduta, nota, idea in sospeso, serie, programma): è unico in tutta l'aula (lo è anche nel custode). Quando una voce cambia ambito, il documento cambia il campo `ambito`.

### Cosa fanno le regole di scrittura (stesse regole di `sync` nel custode)

| Controllo del custode | Nelle regole |
|---|---|
| `vedeAmbito(u, ambito)` | `ambito == 'aula'` oppure `ambito in accessi.ambiti` |
| la voce esistente deve essere visibile (`vedeAmbito(u, dove)`) | `resource.data.ambito` visibile; il `tipo` non cambia |
| tirocinante: niente `SOLO_ADMIN` (ragazzo, scheda, gruppo, serie, programma) | solo `seduta`, `nota`, `sospeso` |
| tirocinante: modifica solo le **note** sue, elimina solo ciò che ha scritto | per `nota` ed `eliminato`: `creatoDa == mail()` e, se il documento esiste, il suo `creatoDa` è lo stesso |
| persona abilitata, non scaduta | `attivo` e `request.time < scadeIl` |
| consegna della chiave (`dispositivi.abilita`): operatore, persona abilitata | `ruolo == 'admin'`, `abilitata(accessi/<richiedente>)` |

`creatoDa` è l'email di chi ha creato la voce, come la conosce chi scrive: un'app la sa se la voce l'ha creata lei o se è arrivata dal custode dopo questo aggiornamento. Per i tirocinanti che toccano una nota o eliminano qualcosa è sempre *se stessi* (il custode ha già accettato: può farlo solo chi l'ha scritta). **Limite**: un documento scritto da un operatore che non conosceva il creatore (voce vecchia) non ha `creatoDa`, e per quel documento le regole non possono fermare un tirocinante malevolo; il custode sì, e al giro successivo le cose si raddrizzano. Un insider con la chiave dell'aula può comunque scrivere buste false nei limiti dei propri permessi: Firestore non verifica firme, è una strada di consegna, non l'archivio.

## Scelte

- **Un documento per voce** (ultima versione), non uno per modifica: la busta è lo stato completo, quindi basta l'ultima. Evita storici enormi e limita le letture all'avvio. Per questo `v` è la versione del custode.
- **Avviso e busta separati.** Si ascolta solo `modifiche` (piccolo); la busta (fino a centinaia di KB) si legge solo se la versione è più nuova di quella locale (`versioneLocale` e ambito). All'apertura dell'app non si scarica nulla di inutile.
- **Pubblicare dopo il custode, non prima.** Le stesse buste partono su Firestore *dopo* che il custode le ha accettate (`invia()` in `sync.svelte.js`, solo per le voci con esito ok): una voce rifiutata o in conflitto non può raggiungere gli altri con una versione falsa. Il prezzo è che la latenza totale è quella del custode (con Apps Script 1-3 secondi) più il tempo di Firestore; con il custode locale dei test, circa un secondo. Oltre 40 voci in una volta (condividere un gruppo, o tutto quello che c'è già sul dispositivo dopo la creazione della chiave) è un'operazione massiva: viaggia solo dal custode.
- **Ascolti per ambito, a gruppi stabili.** Un ascolto `ambito == 'aula'` e tanti `ambito in [≤30]` (`pianoAscolto`). Un ambito nuovo apre un ascolto a parte, e un ambito tolto rifà solo il suo gruppo: ogni documento letto all'avvio di un ascolto si paga, e non si vuole riscaricare tutto a ogni nuovo paziente. Se i gruppi diventano troppi si rifà il piano da capo.
- **Niente `orderBy`/intervalli**: solo uguaglianze e `in`, quindi nessun indice composito da creare.
- **La mia copia degli accessi come campanello.** Ogni dispositivo ascolta il proprio `accessi/{email}`: se cambia (un paziente condiviso con me, o tolto; un ruolo; una scadenza) il custode ha qualcosa da dire, e l'app fa subito un giro con il custode (gli ambiti visibili e i dati nuovi arrivano da lì, poi si aggiorna il piano degli ascolti). Costa una lettura a ogni cambiamento di quella persona. Se la copia sparisce la corsia si spegne.
- **Pulizia**: `scade` = 3 giorni (richieste e consegne 2). Il custode cancella le scadute al risveglio (`pulisciFirestore`, ogni 10 minuti nelle ore di lavoro) e si può aggiungere un criterio TTL di Firestore sul campo `scade`. Chi manca da più di 3 giorni si allinea dal custode (come sempre).
- **Letture** (ogni `get()` delle regole conta): una query per ambito costa 1 lettura di `accessi`; scrivere una voce costa 1 per documento (2 per la coppia avviso+busta, la regola legge `accessi` una volta per documento). Il documento `accessi` della persona è letto una sola volta per valutazione.
- **Identità**: `request.auth.token.email` (minuscolo) con `email_verified == true` e provider `google.com`. Firebase Auth si collega con `signInWithCredential(GoogleAuthProvider.credential(idToken))` usando lo stesso ID token Google che l'app già ottiene per il custode (`idTokenGoogle()` in `accesso.js`): nessun secondo accesso visibile. Senza popup né redirect (`initializeAuth` con la sola persistenza IndexedDB): nessuna pagina di Google aggiuntiva. Una volta collegato, Firebase ricorda la persona (token di aggiornamento): serve un ID token Google fresco solo la prima volta o dopo un'uscita; per i dispositivi già collegati c'è il tasto «Attiva la corsia veloce» (Impostazioni), che chiede un accesso Google al volo. Se il client OAuth dell'app sta nello stesso progetto Cloud di Firebase non serve nessuna whitelist (vedi `docs/firebase.md`).
- **Chiave**: il dispositivo nuovo scrive la richiesta con la sua chiave pubblica RSA; un operatore con l'app aperta e la chiave **esportabile** (gli operatori la ricevono sempre così; i tirocinanti no) la riceve in tempo reale, controlla che la persona sia tra gli accessi abilitati e consegna la chiave cifrata per quel dispositivo. **Codice di verifica a 6 cifre** = primi 4 byte dello SHA-256 della chiave pubblica, modulo 10⁶, mostrato su entrambi i dispositivi: se un intermediario sostituisse la chiave pubblica i due codici sarebbero diversi. Ogni operatore sceglie per il proprio dispositivo se consegnare da solo o con un tocco («Consegna la chiave solo quando tocco “Consegna”»): in questo modo il giro con il custode non la consegna da solo (resta il tasto «Consegna la chiave a chi la aspetta», senza codice, perché serve anche quando la corsia è spenta). Richiesta e consegna si cancellano dopo l'uso; il custode viene comunque allineato con `dispositivi.abilita`. Il percorso via custode resta com'era.
- **Applicazione delle voci**: la busta ricevuta passa dalla stessa logica di `ricevi()` del custode (`applicaLive` in `sync.svelte.js`: apre con `aad = psy:<ambito>:<id>`, unisce a tre vie con `unisci()`, aggiorna `version` e `base`). Si applica solo se `v` è più nuova della versione locale o cambia l'ambito; le proprie voci (`disp`) si ignorano; una voce eliminata si toglie senza leggere la busta; un ambito che il custode non mi ha ancora detto di vedere non si applica (ci pensa il giro con il custode). Con la corsia attiva il controllo periodico del custode si dirada a 5 minuti e l'invio parte dopo 0,7 s invece di 1 s.
- **Documenti troppo grandi** (busta > 900 000 caratteri, il limite è 1 MiB): non si pubblicano, restano sul custode.
- **Libreria**: pacchetto npm `firebase` alla versione esatta `13.1.0` (pubblicata il 21 ottobre 2026), importata in modo pigro (`import('./firebase-sdk.js')`, un pezzo a parte del sito di circa 670 kB, 170 kB compressi, scaricato solo dopo l'accesso e solo con la configurazione). Si è preferito npm a gstatic perché: la CSP non deve ammettere script di terzi (`script-src` resta `'self'`), la versione è bloccata dal `package-lock.json` con la sua impronta, il pezzo fa parte del precache della PWA (stessa versione dell'app, funziona anche se si apre l'app senza rete) e le prove usano esattamente la stessa libreria. Il costo è il precache: +0,67 MB su 8,4 (circa +8 %). `firebase-sdk.js` importa per nome solo ciò che serve, così la libreria si riduce a quello.
- **CSP**: `connect-src` ammette `firestore.googleapis.com`, `identitytoolkit.googleapis.com` e `securetoken.googleapis.com` (`vite.config.js`). Se aggiungi altre chiamate, aggiorna la CSP: in produzione, a differenza di `npm run dev`, fallirebbe in silenzio.

## Cosa serve lato servizi

Firestore (modalità produzione, regione UE), Authentication con provider Google, Apps Script collegato allo *stesso* progetto Cloud (scope `https://www.googleapis.com/auth/datastore`, proprietà `FIREBASE_PROJECT_ID` impostata da `configuraFirebase`). Passi in ordine: `docs/firebase.md`.

## Come si prova

- `npm test` (senza emulatori): `tools/test-veloce.mjs` prova la logica con un backend finto **e** confronta, per ogni persona, la copia degli accessi con ciò che il custode risponde a `sync`/`io` (ruoli, assegnazioni, «tutti i pazienti», condivisioni, orfani, disattivati, scaduti, cambio di giorno, Firestore che non risponde); `tools/test-appsscript.cjs` prova il collegamento in `Codice.gs` (token OAuth, REST, risveglio, `configuraFirebase`).
- `sh tools/test-firebase.sh` (emulatori; Java e Node): `tools/test-firebase.cjs` prova le regole contro il custode vero — per ogni persona e ambito le voci che ricevono sono **esattamente** quelle di `sync`; per ogni persona × ambito × tipo (640 confronti per le voci nuove, 72 per modifiche ed eliminazioni) le regole lasciano scrivere **esattamente** ciò che il custode lascerebbe scrivere — e `tools/test-firebase-browser.cjs` prova tre browser con l'app vera, il custode locale e gli emulatori: consegna della chiave (automatica e col codice), voci in tempo reale in entrambe le direzioni, ambiti riservati che non arrivano e arrivano quando condivisi, riserva.

## Limiti noti

- Il piano gratuito ha una quota giornaliera (50k letture / 20k scritture): oltre, la corsia si spegne fino a mezzanotte e va tutto col custode. All'avvio di ogni ascolto si leggono i documenti degli ultimi 3 giorni: con molti dispositivi che si riaprono spesso conviene accorciare `RITENZIONE_MS` (`veloce.js`, e `scade` nelle regole).
- La visibilità di chi dipende dalla scadenza *di un altro* (i tirocinanti con «tutti i pazienti» di un operatore, il proprietario con gli orfani di una persona scaduta) cambia con il cambio di giorno: il custode rifà la copia alla prima richiesta del giorno e dal risveglio delle 7; fino ad allora Firestore può mostrare, per quella persona, qualche voce che il custode già non darebbe più. La scadenza della persona stessa è invece controllata dalle regole con l'ora del server.
- Una persona con più di 12 000 ambiti non ha la corsia veloce.
- Una modifica fatta offline parte quando torna la rete; il documento Firestore non è un archivio: la verità è il custode.
- Le voci eliminate viaggiano come «eliminato» senza lapide; chi non è collegato le riceve dal custode, come prima.
- Nessun App Check; la chiave `apiKey` della configurazione web non è segreta.
- Le immagini non passano da Firestore (restano sul custode, caricate prima della voce che le cita e lette solo quando servono).
