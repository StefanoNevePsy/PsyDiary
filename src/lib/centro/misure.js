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

// ---- dettaglio per fasi dei salvataggi ----
// Il custode manda in ogni risposta «fasi» (vedi `chiudiFasi` in custode/core.js): attesaLock, tenutoLock,
// letture/nLetture, scritture/nScritture, cache/nCache, altro (millisecondi o conteggi), file (["L aula:120"…]) e,
// su Apps Script, ops (nome dell'operazione → [quante, millisecondi]). Si tengono le ultime FASI_TENUTE dei salvataggi.

export const CHIAVE_FASI = 'psy:fasi';
export const FASI_TENUTE = 5;
const CAMPI_FASI = ['attesaLock', 'tenutoLock', 'letture', 'nLetture', 'scritture', 'nScritture', 'cache', 'nCache', 'altro'];
// operazioni che non sono lavoro su Drive (cache di Apps Script, proprietà dello script, richieste a Google)
const NON_DRIVE = ['cache', 'prop', 'fetch'];

/** Ripulisce le fasi arrivate dalla rete; null se non sono fasi. */
export function pulisciFasi(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const o = {};
  for (const k of CAMPI_FASI) if (Number.isFinite(f[k]) && f[k] >= 0) o[k] = Math.round(f[k]);
  if (Array.isArray(f.file)) o.file = f.file.filter((x) => typeof x === 'string').slice(0, 14).map((x) => x.slice(0, 80));
  if (f.ops && typeof f.ops === 'object' && !Array.isArray(f.ops)) {
    const ops = {};
    for (const k of Object.keys(f.ops).slice(0, 20)) {
      const v = f.ops[k];
      if (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1])) ops[k.slice(0, 30)] = [Math.round(v[0]), Math.round(v[1])];
    }
    if (Object.keys(ops).length) o.ops = ops;
  }
  return o;
}

/** Aggiunge le fasi di un salvataggio ({ t, tipo, totale, ms, fasi }) tenendo le ultime FASI_TENUTE. */
export function aggiungiFasi(lista, m) {
  const f = pulisciFasi(m.fasi);
  if (!f || m.tipo !== 'salvataggio') return lista;
  const x = { t: Number.isFinite(m.t) ? m.t : Date.now(), tipo: 'salvataggio', totale: Math.max(0, Math.round(Number(m.totale) || 0)),
    ms: Number.isFinite(m.ms) && m.ms >= 0 ? Math.round(m.ms) : null, fasi: f };
  return [...lista, x].slice(-FASI_TENUTE);
}

export function leggiFasi(testo) {
  try {
    const l = JSON.parse(testo);
    if (!Array.isArray(l)) return [];
    const out = [];
    for (const m of l) {
      if (!m || typeof m !== 'object' || !Number.isFinite(m.t) || !Number.isFinite(m.totale)) continue;
      const f = pulisciFasi(m.fasi);
      if (f) out.push({ t: m.t, tipo: 'salvataggio', totale: m.totale, ms: Number.isFinite(m.ms) ? m.ms : null, fasi: f });
    }
    return out.slice(-FASI_TENUTE);
  } catch { return []; }
}

/** Quante operazioni su Drive ha fatto il custode (0 se non lo dice). */
export function operazioniDrive(f) {
  if (!f || !f.ops) return 0;
  return Object.keys(f.ops).filter((k) => !NON_DRIVE.includes(k)).reduce((a, k) => a + f.ops[k][0], 0);
}

/** Le righe da mostrare per un salvataggio: [etichetta, testo]. Solo ciò che il custode ha detto. */
export function righeFasi(f) {
  if (!f) return [];
  const r = [];
  const con = (n, ms) => `${n} · ${durata(ms || 0)}`;   // quante · quanto
  // il custode non manda i valori a zero: qui si mostrano comunque
  r.push(['Attesa del lucchetto', durata(f.attesaLock || 0)]);
  r.push(['Lucchetto tenuto', durata(f.tenutoLock || 0)]);
  r.push(['Letture di file', con(f.nLetture || 0, f.letture)]);
  r.push(['Scritture di file', con(f.nScritture || 0, f.scritture)]);
  r.push(['Stato in cache', con(f.nCache || 0, f.cache)]);
  r.push(['Altro (accesso, elaborazione)', durata(f.altro || 0)]);
  if (f.ops) {
    const nomi = Object.keys(f.ops).sort((a, b) => f.ops[b][1] - f.ops[a][1]);
    r.push(['Operazioni su Drive', String(operazioniDrive(f))]);
    r.push(['Servizi di Google', nomi.map((k) => `${k} ×${f.ops[k][0]} ${durata(f.ops[k][1])}`).join(' · ')]);
  }
  if (f.file && f.file.length) r.push(['File', f.file.map((x) => { const i = x.lastIndexOf(':'); return i > 0 ? `${x.slice(0, i)} ${durata(Number(x.slice(i + 1)))}` : x; }).join(' · ')]);
  return r;
}
