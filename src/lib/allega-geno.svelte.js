// Un genogramma di GenoGram Creator come allegato dell'anagrafica: salvato
// (e poi cifrato e sincronizzato) come un file .json. Lo stesso genogramma,
// riconosciuto dall'id di GenoGram, si aggiorna al posto suo invece di
// duplicarsi.
import { salvaAllegato, togliImmagine } from './immagini.js';
import { dati, salva } from './dati.svelte.js';

/** Il nuovo elenco di allegati con il genogramma g aggiunto o aggiornato. */
export async function conGenogramma(elenco, g) {
  const nuovo = [...(elenco || [])];
  const file = new File([JSON.stringify({ id: g.id, title: g.titolo, lastModified: g.modificato, data: g.data })], g.titolo + '.genogramma.json', { type: 'application/json' });
  const a = { ...(await salvaAllegato(file)), nome: g.titolo, genogramma: { id: g.id, titolo: g.titolo, modificato: g.modificato } };
  const k = nuovo.findIndex((x) => x.genogramma?.id === g.id);
  if (k >= 0) { togliImmagine(nuovo[k].id); nuovo[k] = { ...a, nome: nuovo[k].nome }; } else nuovo.push(a);
  return nuovo;
}

/** Dove è già allegato il genogramma con questo id (di GenoGram Creator). */
export function doveAllegato(idGeno) {
  return dati.ragazzi.filter((r) => (r.allegati || []).some((a) => a.genogramma?.id === idGeno));
}

/** Allega (o aggiorna) il genogramma nell'anagrafica del paziente e salva. */
export async function allegaA(rid, g) {
  const r = dati.ragazzi.find((x) => x.id === rid);
  if (!r) throw new Error('Paziente non trovato.');
  const allegati = await conGenogramma(r.allegati, g);
  await salva('ragazzi', { ...$state.snapshot(r), allegati });
}
