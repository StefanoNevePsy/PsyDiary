// Il prompt da dare a un modello di IA per trasformare un documento (manuale,
// protocollo) nel formato che "Da un documento…" sa leggere (programmi.js → daTesto).
export const PROMPT_PROGRAMMA = `Trasforma il documento allegato (un programma o protocollo di intervento psicologico/educativo) in un testo strutturato da importare in un'app. Rispondi SOLO con il testo finale, in un unico blocco di codice, senza commenti prima o dopo.

FORMATO (rispettalo alla lettera: l'app lo legge riga per riga)

1. Righe iniziali, prima di qualsiasi titolo: una breve descrizione del programma (a chi è rivolto, scopo, fonte/autori/manuale se indicati). Massimo 4 righe. Niente titolo qui.

2. Ogni MODULO (area tematica, fase, capitolo) inizia con una riga:
# Nome del modulo
   - Usa nomi brevi (1–4 parole), es. "# Problem solving".
   - Se il documento non ha moduli ma solo una sequenza di incontri, usa un solo modulo con un nome adatto.

3. Ogni UNITÀ (incontro, seduta, lezione) dentro il modulo inizia con una riga:
## Titolo dell'unità
   - Titolo breve e concreto (max 8 parole), senza numerazione ("Incontro 3:" va tolto).
   - Se l'unità è opzionale o di approfondimento, aggiungi in fondo al titolo: (facoltativa)

4. Subito sotto il titolo dell'unità, se le informazioni ci sono, in quest'ordine e una sola volta:
Obiettivi: frase unica con gli obiettivi dell'unità
Durata: solo il numero di minuti (es. "Durata: 60")
   Se il documento non li indica, ometti la riga (non inventare).

5. Poi le ATTIVITÀ dell'unità, una per riga come lista da spuntare:
- [ ] Nome dell'attività: istruzione breve (cosa fa il conduttore, cosa fanno i partecipanti)
   - Mantieni l'ordine del documento.
   - Materiali, consegne o varianti utili: righe normali o elenchi "- " sotto l'attività.
   - Puoi usare **grassetto** per le parole chiave; niente tabelle, niente immagini, niente link.

6. Le attività NON legate a un incontro preciso (giochi di riscaldamento, attività di riserva, energizer, attività per imprevisti) vanno alla fine in una sezione:
# Attività libere
## Nome dell'attività
Descrizione breve di come si fa e a cosa serve.

REGOLE
- Usa solo "#" e "##" per i titoli: mai "###" o più, mai titoli in grassetto al posto di "#".
- Non scrivere "Obiettivi:" o "Durata:" fuori dalle unità.
- Riassumi senza perdere contenuti operativi; togli premesse teoriche lunghe, bibliografia, indici e numeri di pagina.
- Scrivi in italiano, anche se il documento è in un'altra lingua.
- Non inventare attività, obiettivi o durate che il documento non contiene.
- Non includere dati di persone reali (nomi di pazienti, alunni, casi).

ESEMPIO DI OUTPUT

Percorso di life skills per le scuole medie, in tre moduli da 2–3 incontri. Tratto da: (fonte del documento).

# Problem solving
## Il problema in tre parole
Obiettivi: riconoscere e nominare un problema
Durata: 60
- [ ] Cerchio iniziale: ognuno dice una cosa che oggi non va
- [ ] Scenette a coppie: descrivere il problema in tre parole
- [ ] Cartellone dei problemi della classe
## Tante soluzioni
Obiettivi: generare alternative senza giudicarle
- [ ] Brainstorming a gruppi: vale tutto, si scrive ogni idea
## Approfondimento con i genitori (facoltativa)
- [ ] Scheda da portare a casa

# Emozioni
## Il termometro delle emozioni
Obiettivi: dare un nome e un'intensità alle emozioni
- [ ] Termometro alla lavagna: ognuno si posiziona

# Attività libere
## Gioco del gomitolo
Ognuno lancia il gomitolo e dice una cosa bella di chi lo riceve. Utile per sciogliere il clima.

DOCUMENTO:
[incolla qui il testo, o allega il file]
`;

/** Copia il prompt negli appunti (con un ripiego per i browser senza permesso). */
export async function copiaPrompt() {
  try { await navigator.clipboard.writeText(PROMPT_PROGRAMMA); return true; } catch (e) { /* sotto */ }
  const t = document.createElement('textarea');
  t.value = PROMPT_PROGRAMMA; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  t.remove();
  return ok;
}
