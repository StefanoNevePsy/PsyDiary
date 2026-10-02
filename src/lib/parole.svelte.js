// Come si chiamano le persone seguite: "pazienti" (predefinito) o "utenti".
// Scelta per dispositivo, in Impostazioni. Le parole sono già accordate
// (il paziente / l'utente, i pazienti / gli utenti): nel testo si scrive
// T('il'), T('tanti')... e si aggiornano da sole quando cambia la scelta.
const PAROLE = {
  pazienti: {
    uno: 'paziente', tanti: 'pazienti', un: 'un paziente', il: 'il paziente', del: 'del paziente', al: 'al paziente',
    i: 'i pazienti', dei: 'dei pazienti', questo: 'questo paziente', nessuno: 'nessun paziente',
  },
  utenti: {
    uno: 'utente', tanti: 'utenti', un: 'un utente', il: "l'utente", del: "dell'utente", al: "all'utente",
    i: 'gli utenti', dei: 'degli utenti', questo: 'questo utente', nessuno: 'nessun utente',
  },
};
export const SCELTE = [{ valore: 'pazienti', etichetta: 'Pazienti' }, { valore: 'utenti', etichetta: 'Utenti' }];
const iniziale = (() => { try { const v = localStorage.getItem('psy:parole'); return PAROLE[v] ? v : 'pazienti'; } catch (e) { return 'pazienti'; } })();
export const parole = $state({ tipo: iniziale });
export function scegliParole(v) {
  if (!PAROLE[v]) return;
  parole.tipo = v;
  try { localStorage.setItem('psy:parole', v); } catch (e) { /* niente */ }
}
/** La parola accordata: T('il') → "il paziente" / "l'utente". */
export const T = (k) => PAROLE[parole.tipo][k] ?? k;
/** Con la maiuscola: M('tanti') → "Pazienti". */
export const M = (k) => { const s = T(k); return s.charAt(0).toUpperCase() + s.slice(1); };
