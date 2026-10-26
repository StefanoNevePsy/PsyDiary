// Nota veloce: dalle pagine e dagli elenchi si va dritti all'editor, senza passare dal «Cosa scrivi?».
import { salva, nuovoId, io } from './dati.svelte.js';
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
