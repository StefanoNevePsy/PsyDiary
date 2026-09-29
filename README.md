# PsyDiary

Diario clinico dell'aula: gruppi in calendario, sedute di gruppo, individuali,
con i genitori e colloqui di conoscenza, note sui singoli ragazzi, idee in
sospeso. Editor come un normale programma di scrittura (sotto, markdown),
immagini in bicromia, esportazione in Word e PDF. Funziona su computer e
telefono, anche senza rete, e si installa come app.

- **Senza configurazione** è un prototipo con dati di prova inventati.
- **Collegato al custode** (Google Apps Script sul tuo Drive) diventa la
  versione vera: accesso con Google, dati cifrati end-to-end con la chiave
  dell'aula, sincronizzazione tra dispositivi, permessi per operatori e
  tirocinanti applicati dal custode.

➡️ **Messa in servizio: [docs/messa-in-servizio.md](docs/messa-in-servizio.md)**

```sh
npm ci
npm run dev            # prototipo
npm test               # test del custode e della sincronizzazione
npm run build          # sito statico in dist/
```

| Cartella | Cosa c'è |
|---|---|
| `src/` | l'app (Svelte 5) |
| `src/lib/centro/` | accesso Google, cifratura, sincronizzazione con il custode |
| `custode/` | il custode per Google Apps Script (`core.js` è la logica, testata in locale) |
| `tools/` | composizione e installazione del custode, custode locale, test |
| `.github/workflows/pubblica.yml` | test, pubblicazione su GitHub Pages, aggiornamento del custode |

Direzione di prodotto e principi di design: [PRODUCT.md](PRODUCT.md).
