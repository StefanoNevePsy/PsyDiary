// Diagnosi multiple: ognuna con il suo codice (facoltativo). Il campo di testo
// `diagnosi` resta come riepilogo, così ricerca, esportazioni e prompt continuano a leggerlo.

/** Le diagnosi del paziente; quelle scritte prima nel campo unico diventano la prima voce. */
export function diagnosiDi(r) {
  if (Array.isArray(r?.diagnosiElenco)) return r.diagnosiElenco;
  const t = String(r?.diagnosi || '').trim();
  return t ? [{ testo: t, codice: '' }] : [];
}

/** Riepilogo in una riga: «Dislessia (F81.0); ADHD (F90.0)». */
export const riepilogoDiagnosi = (elenco) =>
  (elenco || []).filter((d) => String(d.testo || '').trim() || String(d.codice || '').trim())
    .map((d) => (String(d.testo || '').trim() || 'Diagnosi') + (String(d.codice || '').trim() ? ` (${String(d.codice).trim()})` : ''))
    .join('; ');

// Suggerimenti frequenti in età evolutiva, con il codice ICD-10: si possono scrivere anche diagnosi e codici diversi
export const DIAGNOSI_COMUNI = [
  ['Disturbo specifico della lettura (dislessia)', 'F81.0'],
  ['Disturbo specifico della scrittura (disortografia)', 'F81.1'],
  ['Disturbo specifico delle abilità aritmetiche (discalculia)', 'F81.2'],
  ['Disturbo misto delle abilità scolastiche', 'F81.3'],
  ['Disgrafia', 'F81.8'],
  ['Disturbo dello spettro autistico', 'F84.0'],
  ['Disturbo da deficit di attenzione e iperattività (ADHD)', 'F90.0'],
  ['Disturbo oppositivo provocatorio', 'F91.3'],
  ['Disturbo del linguaggio espressivo', 'F80.1'],
  ['Disturbo della comprensione del linguaggio', 'F80.2'],
  ['Disturbo dell\'articolazione dell\'eloquio', 'F80.0'],
  ['Disturbo della coordinazione motoria (disprassia)', 'F82'],
  ['Disabilità intellettiva lieve', 'F70'],
  ['Funzionamento intellettivo limite', 'R41.83'],
  ['Disturbo d\'ansia da separazione', 'F93.0'],
  ['Disturbo d\'ansia generalizzato', 'F41.1'],
  ['Disturbo depressivo', 'F32'],
  ['Disturbo di Tourette', 'F95.2'],
  ['Enuresi', 'F98.0'],
];
