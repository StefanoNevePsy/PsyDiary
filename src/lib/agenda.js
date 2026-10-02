// Agenda: le sedute di un giorno nel loro orario, per vedere ordine, durata e
// spazi liberi. Funzioni pure (si provano in Node: tools/test-agenda.mjs).

/** "16:30" → 990 */
export const minuti = (ora) => { const [h, m] = String(ora || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** 990 → "16:30" */
export const ora = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const fine = (s) => minuti(s.ora) + (s.durata || 60);

/**
 * Le ore da mostrare (a ore intere): un'ora prima della prima seduta e un'ora
 * dopo l'ultima, con almeno `minimo` ore visibili; senza sedute 8–19.
 */
export function intervallo(sedute, minimo = 6) {
  if (!sedute.length) return { da: 8 * 60, a: 19 * 60 };
  let a = Infinity, b = -Infinity;
  for (const s of sedute) { a = Math.min(a, minuti(s.ora)); b = Math.max(b, fine(s)); }
  let da = Math.max(0, Math.floor((a - 60) / 60) * 60), al = Math.min(24 * 60, Math.ceil((b + 60) / 60) * 60);
  while (al - da < minimo * 60) { if (al < 21 * 60) al += 60; else if (da > 0) da -= 60; else break; }
  return { da, a: al };
}

/**
 * Disposizione delle sedute di un giorno: chi si sovrappone va in colonne
 * affiancate dentro il suo gruppo di sovrapposizioni.
 * → [{ s, inizio, fine, colonna, colonne }]
 */
export function disponi(sedute) {
  const voci = sedute.map((s) => ({ s, inizio: minuti(s.ora), fine: fine(s) })).sort((x, y) => x.inizio - y.inizio || y.fine - x.fine);
  const out = [];
  let gruppo = [], colonneFini = [], fineGruppo = -1;
  const chiudi = () => { const n = colonneFini.length; gruppo.forEach((v) => (v.colonne = n)); out.push(...gruppo); gruppo = []; colonneFini = []; };
  for (const v of voci) {
    if (gruppo.length && v.inizio >= fineGruppo) chiudi();
    let c = colonneFini.findIndex((f) => f <= v.inizio);
    if (c < 0) { c = colonneFini.length; colonneFini.push(v.fine); } else colonneFini[c] = v.fine;
    v.colonna = c;
    gruppo.push(v);
    fineGruppo = Math.max(fineGruppo, v.fine);
  }
  if (gruppo.length) chiudi();
  return out;
}

/**
 * Tra una seduta e la successiva (già in ordine di orario): lo spazio libero
 * in minuti (negativo se si sovrappongono). → [{ dopo: indice, minuti }]
 */
export function spazi(sedute) {
  const out = [];
  let finora = null;
  sedute.forEach((s, i) => {
    if (finora !== null) out.push({ prima: i, minuti: minuti(s.ora) - finora });
    finora = finora === null ? fine(s) : Math.max(finora, fine(s));
  });
  return out;
}
/** "45 min", "1 h", "1 h 30" */
export function durata(m) {
  const h = Math.floor(Math.abs(m) / 60), r = Math.abs(m) % 60;
  return h ? `${h} h${r ? ' ' + r : ''}` : `${r} min`;
}
