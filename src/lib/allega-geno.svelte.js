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

const ha = (o, idGeno) => (o.allegati || []).some((a) => a.genogramma?.id === idGeno);
/**
 * Dove è già allegato il genogramma con questo id (di GenoGram Creator):
 * chiavi "r:<id>" (pazienti) e "g:<id>" (gruppi e classi).
 */
export function doveAllegato(idGeno) {
  return [...dati.ragazzi.filter((r) => ha(r, idGeno)).map((r) => 'r:' + r.id), ...dati.gruppi.filter((g) => ha(g, idGeno)).map((g) => 'g:' + g.id)];
}

/** Allega (o aggiorna) il genogramma al paziente ("r:<id>") o al gruppo ("g:<id>") e salva. */
export async function allegaA(chiave, g) {
  const [k, id] = [chiave.slice(0, 1), chiave.slice(2)];
  const tabella = k === 'g' ? 'gruppi' : 'ragazzi';
  const o = dati[tabella].find((x) => x.id === id);
  if (!o) throw new Error(k === 'g' ? 'Gruppo non trovato.' : 'Paziente non trovato.');
  const allegati = await conGenogramma(o.allegati, g);
  await salva(tabella, { ...$state.snapshot(o), allegati });
}
