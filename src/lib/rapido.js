// Nota veloce: dalle pagine e dagli elenchi si va dritti all'editor, senza passare dal «Cosa scrivi?».
import { salva, nuovoId, io, dati } from './dati.svelte.js';
import { vai } from './rotta.svelte.js';
import { oggi } from './date.js';

export async function notaVeloce({ ragazzoId, gruppoId } = {}) {
  const n = { id: nuovoId('n'), data: oggi(), titolo: '', categoria: gruppoId ? 'gruppo' : 'osservazione', testo: '', autore: io().nome };
  if (gruppoId) n.gruppoId = gruppoId;
  if (ragazzoId) n.ragazzoId = ragazzoId;
  await salva('note', n);
  vai('nota/' + n.id);
}

/** Le cartelle in uso (per pazienti o gruppi), in ordine alfabetico. */
export const cartelleDi = (elenco) => [...new Set((elenco || []).map((x) => String(x.cartella || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));

/** Sposta pazienti o gruppi in una cartella ('' = nessuna). */
export async function spostaInCartella(tabella, oggetti, cartella) {
  for (const o of oggetti) if (String(o.cartella || '') !== cartella) await salva(tabella, { ...o, cartella });
}

/** Rinomina una cartella per tutti quelli che ci stanno dentro. */
export async function rinominaCartella(tabella, vecchia, nuova) {
  await spostaInCartella(tabella, dati[tabella].filter((x) => String(x.cartella || '').trim() === vecchia), nuova);
}

/** L'anno scolastico di un gruppo o di una classe (da settembre ad agosto), dalla prima seduta o dalla creazione. */
export function annoScolastico(g) {
  const prime = [...dati.sedute.filter((s) => s.gruppoId === g.id && !s.annullata).map((s) => s.data), ...(dati.serie || []).filter((x) => x.gruppoId === g.id && x.dal).map((x) => x.dal)];
  const d = prime.length ? prime.sort()[0] : String(g.creato || '').slice(0, 10);
  if (!/^\d{4}-\d{2}/.test(d)) return '';
  const y = +d.slice(0, 4), inizio = +d.slice(5, 7) >= 9 ? y : y - 1;
  return inizio + '/' + String(inizio + 1).slice(2);
}
