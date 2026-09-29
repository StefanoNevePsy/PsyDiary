// Date come stringhe locali "AAAA-MM-GG": niente sorprese di fuso orario.

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const due = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
export const daIso = (s) => { const [a, m, g] = s.split('-').map(Number); return new Date(a, m - 1, g); };
export const oggi = () => iso(new Date());
export function piu(s, giorni) { const d = daIso(s); d.setDate(d.getDate() + giorni); return iso(d); }
/** lunedì della settimana di s */
export function lunedi(s) { const d = daIso(s); const g = (d.getDay() + 6) % 7; d.setDate(d.getDate() - g); return iso(d); }
/** 1 = lunedì … 7 = domenica */
export const giornoSettimana = (s) => ((daIso(s).getDay() + 6) % 7) + 1;
export function primoDelMese(s) { const d = daIso(s); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); }
export function meseDopo(s, n) { const d = daIso(s); return iso(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
export function numeroSettimana(s) {
  const d = daIso(s); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const g = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - g);
  const inizio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - inizio) / 86400000 + 1) / 7);
}
export const nomeGiorno = (s) => GIORNI[daIso(s).getDay()];
export const nomeGiornoBreve = (s) => GIORNI_BREVI[daIso(s).getDay()];
export const nomeMese = (s) => MESI[daIso(s).getMonth()];
export const numeroGiorno = (s) => daIso(s).getDate();
export const anno = (s) => daIso(s).getFullYear();
/** "martedì 6 ottobre" (+ anno se non è quello corrente) */
export function lunga(s, conAnno) {
  const d = daIso(s);
  const a = conAnno || d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}${a}`;
}
/** "6 ott" */
export function breve(s) { const d = daIso(s); return `${d.getDate()} ${MESI_BREVI[d.getMonth()]}`; }
export function breveAnno(s) { const d = daIso(s); return `${d.getDate()} ${MESI_BREVI[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; }
export function relativa(s) {
  const n = Math.round((daIso(s) - daIso(oggi())) / 86400000);
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  if (n > 1 && n < 7) return 'tra ' + n + ' giorni';
  if (n < -1 && n > -7) return n * -1 + ' giorni fa';
  return breve(s);
}
export function eta(nascita) {
  if (!nascita) return null;
  const n = daIso(nascita), o = new Date();
  let a = o.getFullYear() - n.getFullYear();
  if (o.getMonth() < n.getMonth() || (o.getMonth() === n.getMonth() && o.getDate() < n.getDate())) a--;
  return a;
}
export function fineOra(ora, minuti) {
  const [h, m] = ora.split(':').map(Number); const t = h * 60 + m + (minuti || 60);
  return `${due(Math.floor(t / 60) % 24)}:${due(t % 60)}`;
}

/**
 * Interpreta date scritte a mano, per la ricerca: "oggi", "ieri", "domani",
 * "12/3", "12/03/2026", "12 marzo", "12 mar 2026", "marzo", "marzo 2026".
 * Restituisce { giorno } oppure { mese: 'AAAA-MM-01' } oppure null.
 */
export function leggiData(testo) {
  const t = testo.trim().toLowerCase();
  if (!t) return null;
  if (t === 'oggi') return { giorno: oggi() };
  if (t === 'ieri') return { giorno: piu(oggi(), -1) };
  if (t === 'domani') return { giorno: piu(oggi(), 1) };
  const annoCorrente = new Date().getFullYear();
  let m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
  if (m) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : annoCorrente;
    const d = new Date(a, +m[2] - 1, +m[1]);
    if (d.getMonth() === +m[2] - 1) return { giorno: iso(d) };
  }
  const trovaMese = (p) => MESI.findIndex((x) => x.startsWith(p.slice(0, 3)) && p.length >= 3);
  m = /^(\d{1,2})\s+([a-zà-ù]+)(?:\s+(\d{4}))?$/.exec(t);
  if (m) {
    const mi = trovaMese(m[2]);
    if (mi >= 0) return { giorno: iso(new Date(m[3] ? +m[3] : annoCorrente, mi, +m[1])) };
  }
  m = /^([a-zà-ù]+)(?:\s+(\d{4}))?$/.exec(t);
  if (m) {
    const mi = trovaMese(m[1]);
    if (mi >= 0 && MESI[mi].startsWith(m[1].slice(0, Math.max(3, m[1].length)))) return { mese: iso(new Date(m[2] ? +m[2] : annoCorrente, mi, 1)) };
  }
  return null;
}
