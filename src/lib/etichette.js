// Etichette dei pazienti: per riconoscere a colpo d'occhio il tipo di
// paziente (dell'aula, esterno, privato…) e filtrare l'elenco. Testo libero;
// queste sono solo le proposte iniziali, poi si propongono quelle già usate.
export const PREDEFINITE = ['aula', 'esterno', 'privato', 'inviato dai servizi', 'scuola', 'valutazione', 'follow-up'];
export const MAX = 8;

export const pulisci = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 30);

/** Aggiunge un'etichetta (senza doppioni e fino a MAX). */
export function aggiungi(elenco, t) {
  const e = pulisci(t);
  const l = (elenco || []).map(pulisci).filter(Boolean);
  if (!e || l.includes(e) || l.length >= MAX) return l;
  return [...l, e];
}

/** Tutte le etichette in uso, dalle più usate, poi le predefinite mai usate. */
export function inUso(pazienti) {
  const n = new Map();
  for (const r of pazienti || []) for (const t of r.etichette || []) n.set(t, (n.get(t) || 0) + 1);
  const usate = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).map((x) => x[0]);
  return [...usate, ...PREDEFINITE.filter((p) => !n.has(p))];
}

/** Una tinta stabile per ogni etichetta (la stessa parola, lo stesso colore). */
export function tinta(t) {
  let h = 0;
  for (const c of pulisci(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const TINTE = [25, 55, 95, 150, 190, 230, 280, 320, 0, 120];
  return TINTE[h % TINTE.length];
}
