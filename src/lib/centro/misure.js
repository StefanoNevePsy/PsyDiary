// Misure dei tempi di risposta del custode: logica pura (niente Svelte), provata in tools/test-misure.mjs.
//
// Ogni chiamata riuscita lascia una misura { t, tipo, totale, ms }:
//   t       quando (millisecondi dal 1970)
//   tipo    'controllo' (c'è qualcosa di nuovo?), 'salvataggio' (invio di modifiche) o 'altro'
//   totale  quanto ha aspettato l'app, dall'invio alla risposta letta
//   ms      quanto ha impiegato il custode dentro la sua esecuzione (null se il custode non lo dice)
// La differenza è il viaggio dei dati più l'avvio di Apps Script, che il custode non vede.
// Si tengono le ultime PER_TIPO di ogni tipo.

export const PER_TIPO = 50;
export const CHIAVE_MISURE = 'psy:misure';
export const TIPI_MISURA = ['controllo', 'salvataggio', 'altro'];

/** Che cosa è, per chi guarda i tempi, una chiamata al custode. */
export function tipoDi(azione, dati) {
  if (azione !== 'sync') return 'altro';
  if (dati && Array.isArray(dati.invii) && dati.invii.length) return 'salvataggio';
  // l'avvio porta anche il profilo: non è un controllo come gli altri
  if (dati && dati.io === true) return 'altro';
  return 'controllo';
}

/** Aggiunge una misura tenendo le ultime PER_TIPO di quel tipo. Restituisce una lista nuova. */
export function aggiungi(lista, m) {
  const x = {
    t: Number.isFinite(m.t) ? m.t : Date.now(), tipo: TIPI_MISURA.includes(m.tipo) ? m.tipo : 'altro',
    totale: Math.max(0, Math.round(Number(m.totale) || 0)),
    ms: Number.isFinite(m.ms) && m.ms >= 0 ? Math.round(m.ms) : null,
  };
  const altre = lista.filter((y) => y.tipo !== x.tipo), stesse = lista.filter((y) => y.tipo === x.tipo);
  stesse.push(x);
  return [...altre, ...stesse.slice(-PER_TIPO)].sort((a, b) => a.t - b.t);
}

/** Legge quanto era stato salvato; qualunque cosa strana diventa una lista vuota. */
export function leggi(testo) {
  try {
    const l = JSON.parse(testo);
    if (!Array.isArray(l)) return [];
    return l.filter((m) => m && typeof m === 'object' && TIPI_MISURA.includes(m.tipo) && Number.isFinite(m.totale) && Number.isFinite(m.t))
      .map((m) => ({ t: m.t, tipo: m.tipo, totale: m.totale, ms: Number.isFinite(m.ms) ? m.ms : null })).slice(-PER_TIPO * TIPI_MISURA.length);
  } catch { return []; }
}

const somma = (l) => l.reduce((a, b) => a + b, 0);
export const media = (l) => (l.length ? somma(l) / l.length : null);
export function mediana(l) {
  if (!l.length) return null;
  const s = [...l].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Riassunto di un tipo di chiamata:
 *   n, media, mediana, massimo (del tempo totale);
 *   custode (tempo medio del custode) e resto (viaggio + avvio) calcolati sulle sole misure in cui il
 *   custode dice il proprio tempo, così i due pezzi sommano al totale di quelle misure; null se nessuna lo dice.
 */
export function riepilogo(lista, tipo) {
  const v = lista.filter((m) => m.tipo === tipo);
  const tot = v.map((m) => m.totale);
  const con = v.filter((m) => m.ms !== null);
  const cust = con.length ? media(con.map((m) => Math.min(m.ms, m.totale))) : null;
  const totCon = con.length ? media(con.map((m) => m.totale)) : null;
  return {
    n: v.length, media: media(tot), mediana: mediana(tot), massimo: tot.length ? Math.max(...tot) : null,
    conCustode: con.length, custode: cust, resto: cust === null ? null : Math.max(0, totCon - cust),
  };
}

/** «320 ms», «1,4 s», «12 s» */
export function durata(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return Math.round(ms) + ' ms';
  const s = ms / 1000;
  return (s < 10 ? s.toFixed(1).replace('.', ',') : String(Math.round(s))) + ' s';
}

/** Un giudizio in parole semplici sul tempo tipico di un controllo o di un salvataggio. */
export function giudizio(mediana) {
  if (mediana === null) return null;
  if (mediana < 1000) return { livello: 'bene', testo: 'Veloce' };
  if (mediana < 2500) return { livello: 'medio', testo: 'Nella norma' };
  return { livello: 'lento', testo: 'Lento' };
}
