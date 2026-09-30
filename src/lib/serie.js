// Appuntamenti che si ripetono ("serie"): un gruppo il martedì, le individuali
// ogni due settimane, i genitori il primo giovedì del mese…
// Le sedute di una serie esistono solo "sulla carta" finché qualcuno non ci
// scrive: nessuna seduta da aggiungere a mano ogni volta.
//
// serie = {
//   id, tipo: 'gruppo' | 'individuale' | 'genitori' | 'conoscenza',
//   gruppoId | ragazzoId, ora: 'HH:MM', durata: minuti, chi?,
//   ripeti: { come: 'settimane', ogni: 1..4, giorni: [1..7] }        // 1 = lunedì
//         | { come: 'mese', settimana: 1..4 | -1, giorno: 1..7 },       // es. primo martedì, ultimo venerdì
//   dal: 'AAAA-MM-GG', al?: 'AAAA-MM-GG', volte?: n,
//   eccezioni?: { 'AAAA-MM-GG': 'saltata' | 'spostata' }
// }
// Funzioni pure: si provano in Node (tools/test-serie.mjs).
import { piu, lunedi, giornoSettimana, daIso, iso, nomeGiorno } from './date.js';

const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const GIORNI_PL = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabati', 'domeniche'];
const ORDINALI = { 1: 'primo', 2: 'secondo', 3: 'terzo', 4: 'quarto', '-1': 'ultimo' };

/** La data cade nel ritmo della serie (senza guardare inizio, fine, eccezioni)? */
function nelRitmo(s, d) {
  const r = s.ripeti || {};
  if (r.come === 'mese') {
    if (giornoSettimana(d) !== r.giorno) return false;
    const g = daIso(d).getDate();
    if (r.settimana === -1) return daIso(piu(d, 7)).getMonth() !== daIso(d).getMonth();
    return Math.ceil(g / 7) === r.settimana;
  }
  if (!(r.giorni || []).includes(giornoSettimana(d))) return false;
  const ogni = r.ogni || 1;
  if (ogni === 1) return true;
  const sett = Math.round((daIso(lunedi(d)) - daIso(lunedi(s.dal))) / (7 * 86400000));
  return sett % ogni === 0;
}

/** Le date della serie tra da e a (comprese), già senza le eccezioni. */
export function occorrenze(s, da, a) {
  if (!s || !s.dal) return [];
  const inizio = da > s.dal ? da : s.dal;
  let fine = s.al && s.al < a ? s.al : a;
  if (inizio > fine) return [];
  const out = [];
  // "dopo N volte": si contano dall'inizio della serie
  if (s.volte) {
    let n = 0;
    for (let d = s.dal; d <= fine && n < s.volte; d = piu(d, 1)) {
      if (!nelRitmo(s, d)) continue;
      n++;
      if (d >= inizio && !(s.eccezioni && s.eccezioni[d])) out.push(d);
    }
    return out;
  }
  for (let d = inizio; d <= fine; d = piu(d, 1)) if (nelRitmo(s, d) && !(s.eccezioni && s.eccezioni[d])) out.push(d);
  return out;
}

/** L'ultima data della serie, se ha una fine. */
export function ultima(s) {
  if (s.al) { const o = occorrenze({ ...s, eccezioni: null }, s.dal, s.al); return o[o.length - 1] || null; }
  if (s.volte) { const o = occorrenze({ ...s, eccezioni: null }, s.dal, piu(s.dal, 7 * 4 * s.volte + 31)); return o[o.length - 1] || null; }
  return null;
}

/** "ogni martedì e giovedì alle 14:30", "ogni 2 settimane il venerdì", "il primo giovedì del mese" */
export function descrivi(s) {
  const r = s.ripeti || {};
  let t;
  if (r.come === 'mese') t = `${r.settimana === -1 ? "l'ultimo" : 'il ' + (ORDINALI[r.settimana] || '')} ${GIORNI[r.giorno]} del mese`;
  else {
    const g = (r.giorni || []).slice().sort();
    const elenco = g.map((x) => GIORNI_PL[x]);
    const giorni = elenco.length > 1 ? elenco.slice(0, -1).join(', ') + ' e ' + elenco[elenco.length - 1] : elenco[0] || '';
    t = (r.ogni || 1) === 1 ? `ogni ${giorni}` : `ogni ${r.ogni} settimane, ${giorni.startsWith('sab') || giorni.startsWith('dom') ? 'il ' + giorni : giorni}`;
    if ((r.ogni || 1) === 1 && g.some((x) => x >= 6)) t = 'ogni ' + g.map((x) => GIORNI[x]).join(' e ');
  }
  return `${t} alle ${s.ora}`;
}
/** "fino al 20 dicembre", "10 volte", "" */
export function fine(s, formato = (d) => d) {
  if (s.al) return 'fino al ' + formato(s.al);
  if (s.volte) return s.volte + (s.volte === 1 ? ' volta' : ' volte');
  return '';
}

/** Ripetizione proposta per una data: stesso giorno della settimana, ogni settimana. */
export function predefinita(data) {
  return { come: 'settimane', ogni: 1, giorni: [giornoSettimana(data)] };
}
/** Il "primo/secondo/…/ultimo" giorno della settimana del mese di una data. */
export function posizioneNelMese(data) {
  const g = daIso(data).getDate();
  const ultimo = daIso(piu(data, 7)).getMonth() !== daIso(data).getMonth();
  return { settimana: g > 28 || (ultimo && g > 21) ? -1 : Math.ceil(g / 7), giorno: giornoSettimana(data) };
}
export const ETICHETTE_ORDINALI = ORDINALI;
export { GIORNI as NOMI_GIORNI };
