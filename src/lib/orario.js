// Date e ore come le si scrive in Italia, qualunque sia la lingua del
// dispositivo: le date gg/mm/aaaa, le ore a 24 ore o (se scelto nelle
// impostazioni) a 12 ore. I dati restano "AAAA-MM-GG" e "HH:MM".

const due = (n) => String(n).padStart(2, '0');
const CHIAVE = 'psy:ore12';
let ore12 = (() => { try { return localStorage.getItem(CHIAVE) === '1'; } catch (e) { return false; } })();

export const usaOre12 = () => ore12;
export function impostaOre12(v) {
  ore12 = !!v;
  try { localStorage.setItem(CHIAVE, ore12 ? '1' : '0'); } catch (e) { /* resta per questa sessione */ }
}

/** "16:30" → "16:30" oppure "4:30 pm" */
export function oraTesto(hhmm, opz = {}) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return String(hhmm);
  const dodici = opz.ore12 ?? ore12;
  if (!dodici) return `${due(h)}:${due(m || 0)}`;
  const s = h < 12 ? 'am' : 'pm';
  return `${h % 12 || 12}${m || !opz.corta ? ':' + due(m || 0) : ''} ${s}`;
}

/** "AAAA-MM-GG" → "gg/mm/aaaa" */
export function dataEuropea(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
/** "6/10/26", "06.10.2026", "6-10" → "AAAA-MM-GG"; "" se vuoto, null se non è una data */
export function leggiDataEuropea(testo, oggi = new Date()) {
  const t = String(testo || '').trim();
  if (!t) return '';
  let m = /^(\d{1,2})[/.\-\s](\d{1,2})(?:[/.\-\s](\d{2}|\d{4}))?$/.exec(t);
  if (!m && /^\d{8}$/.test(t)) m = [t, t.slice(0, 2), t.slice(2, 4), t.slice(4)];
  if (!m && /^\d{6}$/.test(t)) m = [t, t.slice(0, 2), t.slice(2, 4), t.slice(4)];
  if (!m) return null;
  const a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : oggi.getFullYear();
  const d = new Date(a, +m[2] - 1, +m[1]);
  if (d.getFullYear() !== a || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) return null;
  return `${a}-${due(+m[2])}-${due(+m[1])}`;
}
/**
 * "1630", "16.30", "16:30", "9", "4:30 pm", "4pm" → "HH:MM"; "" se vuoto, null se non è un'ora.
 * pm: per il campo a 12 ore, se il testo non dice am/pm.
 */
export function leggiOra(testo, opz = {}) {
  let t = String(testo || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return '';
  let suffisso = null;
  const s = /(a\.?m\.?|p\.?m\.?)$/.exec(t);
  if (s) { suffisso = s[1][0] === 'p' ? 'pm' : 'am'; t = t.slice(0, -s[1].length); }
  let h, m;
  let x = /^(\d{1,2})[:.,h]?(\d{2})?$/.exec(t);
  if (x) { h = +x[1]; m = x[2] ? +x[2] : 0; }
  else if ((x = /^(\d)(\d{2})$/.exec(t))) { h = +x[1]; m = +x[2]; }
  else return null;
  if (suffisso == null && opz.ore12 && opz.pm != null) suffisso = opz.pm ? 'pm' : 'am';
  if (suffisso) { if (h < 1 || h > 12) return null; h = (h % 12) + (suffisso === 'pm' ? 12 : 0); }
  if (h > 23 || m > 59) return null;
  return `${due(h)}:${due(m)}`;
}
