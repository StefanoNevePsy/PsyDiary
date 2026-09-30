// Stato dell'app e regole del dominio.
import * as A from './archivio.js';
import { oggi, piu, giornoSettimana, daIso } from './date.js';
import { tagDi, menzioniDi, semplice, daFare } from './testo.js';
import { REALE } from './centro/config.js';
import { occorrenze } from './serie.js';

export const dati = $state({ pronto: false, ragazzi: [], gruppi: [], sedute: [], note: [], sospesi: [], persone: [], serie: [] });

// Chi usa l'app. Nel prototipo si può cambiare da Impostazioni per provare i ruoli.
export const PERSONE_INIZIALI = [
  { id: 'stefano', nome: 'Stefano', ruolo: 'admin' },
  { id: 'elena', nome: 'Elena', ruolo: 'admin' },
  { id: 'giulia', nome: 'Giulia', ruolo: 'tirocinante', ragazzi: ['rluca01', 'rsara02', 'romar03'] },
  { id: 'marco', nome: 'Marco', ruolo: 'tirocinante', ragazzi: [] },
];
const OSPITE = { id: '?', nome: '?', ruolo: 'tirocinante', ragazzi: [] };
export const sessione = $state({ utenteId: 'stefano', tema: 'auto' });
// Con il custode, chi sei lo dice lui (sync.svelte.js scrive qui)
export const centro = $state({ io: null });
/** La persona che sta usando l'app (sempre aggiornata con i permessi). */
export function io() {
  if (REALE) {
    const c = centro.io;
    return c ? { id: c.email, email: c.email, nome: c.nome, ruolo: c.ruolo, ragazzi: c.ragazzi || [] } : OSPITE;
  }
  return dati.persone.find((p) => p.id === sessione.utenteId) || dati.persone[0] || OSPITE;
}
/** Chiamato a ogni modifica fatta da qui (non a quelle arrivate dal custode). */
export const ganci = { alCambio: null };
export function cambiaUtente(id) {
  sessione.utenteId = id;
  try { localStorage.setItem('psy:utente', id); } catch (e) { /* niente */ }
}
export function impostaTema(t) {
  sessione.tema = t;
  if (t === 'auto') delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = t;
  try { if (t === 'auto') localStorage.removeItem('psy:tema'); else localStorage.setItem('psy:tema', t); } catch (e) { /* niente */ }
}
export const eAdmin = () => io().ruolo === 'admin';
/** Tirocinanti: scrivono note, ma non gestiscono ragazzi, gruppi, anagrafiche. */
export const puoGestire = () => eAdmin();
/** Un testo si modifica se è vuoto, se l'ho scritto io, o se sono admin. */
export function puoModificare(autore, testo) {
  return eAdmin() || !testo || !autore || autore === io().nome;
}
/**
 * Ragazzi condivisi: chi è admin li vede tutti; un tirocinante vede tutto dei
 * ragazzi condivisi con lui, degli altri solo quello che succede nei gruppi.
 */
export const condiviso = (rid) => eAdmin() || (io().ragazzi || []).includes(rid);
export const TIPI_PERSONALI = ['individuale', 'genitori', 'conoscenza'];
export const visibileSeduta = (s) => !s || s.tipo === 'gruppo' || condiviso(s.ragazzoId);
// le note "nel gruppo" su un ragazzo si vedono (e si scrivono) anche senza condivisione
export const visibileNota = (n) => !n.ragazzoId || n.categoria === 'gruppo' || condiviso(n.ragazzoId);

// ---------------------------------------------------------------------------
export function nuovoId(p) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const r = crypto.getRandomValues(new Uint8Array(10));
  for (const x of r) s += a[x % a.length];
  return p + s;
}
const ora = () => new Date().toISOString();

export async function carica() {
  const [ragazzi, gruppi, sedute, note, sospesi, persone, serie] = await Promise.all(A.TABELLE.map((t) => A.tutti(t)));
  if (REALE) {
    Object.assign(dati, { ragazzi, gruppi, sedute, note, sospesi, persone: [], serie });
  } else if (!ragazzi.length && !gruppi.length) {
    const { creaDemo } = await import('./demo.js');
    const d = creaDemo();
    d.serie = d.serie || [];
    await A.mettiTutto(Object.fromEntries(A.TABELLE.map((t) => [t, d[t]])));
    try {
      // copertine dei gruppi e un disegno in una seduta, generati sul momento
      const { creaImmaginiDemo } = await import('./demo-immagini.js');
      const im = await creaImmaginiDemo();
      for (const g of d.gruppi) if (im[g.id]) g.copertina = im[g.id];
      const rabbia = d.sedute.find((x) => x.id === 'sgmart3');
      if (rabbia) rabbia.resoconto += `\n\n![Il termometro disegnato alla lavagna](img:${im.termometro})`;
      await A.mettiTutto({ gruppi: d.gruppi, sedute: d.sedute });
    } catch (e) { console.warn('Immagini di prova non create', e); }
    Object.assign(dati, d);
  } else Object.assign(dati, { ragazzi, gruppi, sedute, note, sospesi, persone, serie });
  await migraRicorrenze();
  if (!REALE && !dati.persone.length) {
    await A.mettiTutto({ persone: PERSONE_INIZIALI });
    dati.persone = structuredClone(PERSONE_INIZIALI);
  }
  try {
    const u = localStorage.getItem('psy:utente'); if (u) sessione.utenteId = u;
    const t = localStorage.getItem('psy:tema'); if (t) sessione.tema = t;
  } catch (e) { /* niente */ }
  dati.pronto = true;
}
export async function ricominciaDemo() {
  await A.svuota();
  dati.pronto = false;
  await carica();
}

/** Salva (crea o aggiorna) un oggetto e lo restituisce così come sta nello stato. */
export async function salva(tabella, oggetto, remoto = false) {
  const elenco = dati[tabella];
  const o = remoto ? { ...oggetto } : { ...oggetto, modificato: ora() };
  if (!o.creato) o.creato = o.modificato || ora();
  const i = elenco.findIndex((x) => x.id === o.id);
  if (i >= 0) elenco[i] = o; else elenco.push(o);
  await A.metti(tabella, $state.snapshot(o));
  if (!remoto) ganci.alCambio?.(tabella, o.id);
  return elenco[i >= 0 ? i : elenco.length - 1];
}
export async function elimina(tabella, id, remoto = false) {
  const i = dati[tabella].findIndex((x) => x.id === id);
  if (i >= 0) dati[tabella].splice(i, 1);
  await A.togli(tabella, id);
  if (!remoto) ganci.alCambio?.(tabella, id, true);
}

// ---------------------------------------------------------------------------
// Ragazzi e gruppi
export const ragazzo = (id) => dati.ragazzi.find((r) => r.id === id) || null;
export const gruppo = (id) => dati.gruppi.find((g) => g.id === id) || null;
export const nomeBreve = (r) => (r ? `${r.nome} ${r.cognome ? r.cognome[0] + '.' : ''}`.trim() : '?');
export const nomeCompleto = (r) => (r ? `${r.nome} ${r.cognome || ''}`.trim() : '?');
export function mappaNomi() {
  const m = {};
  for (const r of dati.ragazzi) m[r.id] = nomeBreve(r);
  return m;
}
/** Membri del gruppo in una certa data (chi è entrato dopo o uscito prima non c'è). */
export function membriAl(g, data) {
  return (g.membri || []).filter((m) => (!m.dal || m.dal <= data) && (!m.al || m.al >= data)).map((m) => m.ragazzoId);
}
export const gruppiDi = (rid) => dati.gruppi.filter((g) => (g.membri || []).some((m) => m.ragazzoId === rid && !m.al));
export const ragazziCondivisi = () => ragazziAttivi().filter((r) => condiviso(r.id));
export const ragazziVisibili = () => ragazziAttivi();
export const ragazziAttivi = () => dati.ragazzi.filter((r) => r.stato !== 'concluso').sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), 'it'));

// ---------------------------------------------------------------------------
// Sedute: quelle salvate + quelle previste dalle ricorrenze (virtuali finché
// non ci si scrive qualcosa).
export const TIPI = {
  gruppo: { nome: 'Seduta di gruppo', breve: 'Gruppo' },
  individuale: { nome: 'Seduta individuale', breve: 'Individuale' },
  genitori: { nome: 'Incontro con i genitori', breve: 'Genitori' },
  conoscenza: { nome: 'Colloquio di conoscenza', breve: 'Conoscenza' },
};
export const CATEGORIE_NOTA = { gruppo: 'Nel gruppo', osservazione: 'Osservazione', scuola: 'Scuola', famiglia: 'Famiglia', servizi: 'Servizi', telefonata: 'Telefonata', altro: 'Altro' };
const idVirtuale = (tipo, sogg, data) => `v:${tipo}:${sogg}:${data}`;
export const soggetto = (s) => (s.tipo === 'gruppo' ? 'g:' + s.gruppoId : s.tipo + ':' + s.ragazzoId);

// ---- serie di appuntamenti (src/lib/serie.js) ----
export const soggettoSerie = (se) => (se.tipo === 'gruppo' ? 'g:' + se.gruppoId : se.tipo + ':' + se.ragazzoId);
function serieAttiva(se) {
  if (se.tipo === 'gruppo') { const g = gruppo(se.gruppoId); return !!g && !g.archiviato; }
  const r = ragazzo(se.ragazzoId); return !!r && r.stato !== 'concluso';
}
export const serieDi = ({ gruppoId, ragazzoId } = {}) => dati.serie
  .filter((se) => (gruppoId ? se.gruppoId === gruppoId : ragazzoId ? se.ragazzoId === ragazzoId : true))
  .sort((a, b) => (a.dal < b.dal ? -1 : 1));
/** Le serie in corso (non finite prima di oggi) di un gruppo o ragazzo. */
export const serieInCorso = (f) => serieDi(f).filter((se) => !se.al || se.al >= oggi());
export const serie = (id) => dati.serie.find((x) => x.id === id) || null;
/** La serie di una seduta: quella segnata, o quella che cade nello stesso giorno per lo stesso gruppo o ragazzo. */
export function serieDiSeduta(s) {
  if (!s) return null;
  if (s.serieId) return serie(s.serieId);
  const k = soggetto(s);
  return dati.serie.find((se) => soggettoSerie(se) === k && occorrenze(se, s.data, s.data).length) || null;
}
function daSerie(se, d) {
  const base = { id: `v:${se.id}:${d}`, virtuale: true, serieId: se.id, tipo: se.tipo, data: d, ora: se.ora, durata: se.durata || (se.tipo === 'gruppo' ? 90 : 60), argomento: '', resoconto: '', prossima: '', autori: {} };
  if (se.tipo === 'gruppo') return { ...base, gruppoId: se.gruppoId, presenze: {}, partecipanti: {} };
  return { ...base, ragazzoId: se.ragazzoId, ...(se.chi ? { chi: se.chi } : {}) };
}

export function sedutePeriodo(da, a) {
  const out = dati.sedute.filter((s) => s.data >= da && s.data <= a);
  const presenti = new Set(out.map((s) => soggetto(s) + '|' + s.data));
  for (const se of dati.serie) {
    if (!serieAttiva(se)) continue;
    for (const d of occorrenze(se, da, a)) {
      const k = soggettoSerie(se) + '|' + d;
      if (presenti.has(k)) continue;
      presenti.add(k);
      out.push(daSerie(se, d));
    }
  }
  return out.filter((s) => !s.annullata && visibileSeduta(s)).sort((x, y) => (x.data + x.ora).localeCompare(y.data + y.ora));
}

export function seduta(id) {
  const s = dati.sedute.find((x) => x.id === id);
  if (s) return visibileSeduta(s) ? s : null;
  let m = /^v:([a-z0-9]+):(\d{4}-\d{2}-\d{2})$/.exec(id || '');
  let se = null, d = null;
  if (m) { se = serie(m[1]); d = m[2]; }
  else {
    // indirizzi di prima delle serie: v:gruppo:<id>:<data>
    m = /^v:(gruppo|individuale):([a-z0-9]+):(\d{4}-\d{2}-\d{2})$/.exec(id || '');
    if (!m) return null;
    d = m[3];
    se = dati.serie.find((x) => (m[1] === 'gruppo' ? x.gruppoId === m[2] && x.tipo === 'gruppo' : x.ragazzoId === m[2] && x.tipo === 'individuale')) || null;
  }
  if (!se) return null;
  // già salvata? si ritrova con lo stesso indirizzo
  const salvata = dati.sedute.find((x) => soggetto(x) === soggettoSerie(se) && x.data === d && !x.annullata);
  if (salvata) return visibileSeduta(salvata) ? salvata : null;
  if (!occorrenze(se, d, d).length) return null;
  const v = daSerie(se, d);
  return visibileSeduta(v) ? v : null;
}

// ---- gestione delle serie ----
export async function creaSerie(d) {
  const x = { eccezioni: {}, ...d, id: nuovoId('ri') };
  if (!x.volte) delete x.volte;
  if (!x.al) delete x.al;
  return salva('serie', x);
}
/** Cambia orario, giorni, ritmo "da questa data in poi": il passato resta com'era. */
export async function modificaSerieDa(se, da, nuovi) {
  const vecchia = $state.snapshot(se);
  if (da <= vecchia.dal) return salva('serie', { ...vecchia, ...nuovi });
  const ecc = vecchia.eccezioni || {};
  const prima = { ...vecchia, al: piu(da, -1), volte: undefined, eccezioni: Object.fromEntries(Object.entries(ecc).filter(([k]) => k < da)) };
  if (vecchia.volte) {
    // "dopo N volte": la nuova serie fa le volte rimaste
    const fatte = occorrenze({ ...vecchia, eccezioni: null }, vecchia.dal, piu(da, -1)).length;
    nuovi = { volte: Math.max(1, vecchia.volte - fatte), ...nuovi };
  }
  delete prima.volte;
  await salva('serie', prima);
  const ecc2 = Object.fromEntries(Object.entries(ecc).filter(([k]) => k >= da));
  return creaSerie({ ...vecchia, volte: undefined, ...nuovi, dal: da, eccezioni: ecc2 });
}
/** La serie finisce con questa data (compresa). */
export async function terminaSerie(se, al) {
  const s = { ...$state.snapshot(se), al };
  delete s.volte;
  return salva('serie', s);
}
export const eliminaSerie = (se) => elimina('serie', se.id);
/** Una sola data della serie non si fa (o è stata spostata). */
export async function eccezioneSerie(se, data, tipo = 'saltata') {
  const s = $state.snapshot(se);
  return salva('serie', { ...s, eccezioni: { ...(s.eccezioni || {}), [data]: tipo } });
}
export async function togliEccezione(se, data) {
  const s = $state.snapshot(se);
  const e = { ...(s.eccezioni || {}) };
  delete e[data];
  return salva('serie', { ...s, eccezioni: e });
}
/** Sposta una sola seduta (di una serie o no) a un altro giorno o orario. */
export async function spostaSeduta(s, data, oraNuova) {
  const se = serieDiSeduta(s);
  if (se && data !== s.data) await eccezioneSerie(se, s.data, 'spostata');
  const vera = await materializza(s);
  return salva('sedute', { ...$state.snapshot(vera), data, ora: oraNuova || vera.ora, ...(se ? { serieId: se.id } : {}) });
}

// Prima delle serie la ricorrenza stava dentro il gruppo o il ragazzo: si trasforma una volta
async function migraRicorrenze() {
  for (const g of [...dati.gruppi]) {
    const r = g.ricorrenza;
    if (!r) continue;
    if (r.giorni && r.giorni.length && !dati.serie.some((x) => x.gruppoId === g.id)) {
      await creaSerie({ tipo: 'gruppo', gruppoId: g.id, ora: r.ora || '15:00', durata: r.durata || 90, ripeti: { come: 'settimane', ogni: r.ogni || 1, giorni: r.giorni }, dal: r.dal || oggi(), ...(r.al ? { al: r.al } : {}) });
    }
    const x = { ...$state.snapshot(g) }; delete x.ricorrenza;
    await salva('gruppi', x, !REALE);
  }
  for (const k of [...dati.ragazzi]) {
    const r = k.ricorrenza;
    if (r === undefined) continue;
    if (r && r.giorni && r.giorni.length && !dati.serie.some((x) => x.ragazzoId === k.id && x.tipo === 'individuale')) {
      await creaSerie({ tipo: 'individuale', ragazzoId: k.id, ora: r.ora || '16:00', durata: r.durata || 60, ripeti: { come: 'settimane', ogni: r.ogni || 1, giorni: r.giorni }, dal: r.dal || oggi(), ...(r.al ? { al: r.al } : {}) });
    }
    const x = { ...$state.snapshot(k) }; delete x.ricorrenza;
    await salva('ragazzi', x, !REALE);
  }
}
/** Una seduta prevista diventa vera alla prima modifica. */
export async function materializza(s) {
  if (!s.virtuale) return s;
  const nuova = { ...$state.snapshot(s), id: nuovoId('s'), virtuale: undefined };
  delete nuova.virtuale;
  return salva('sedute', nuova);
}
export async function aggiornaSeduta(s, modifiche) {
  const vera = await materializza(s);
  const autori = { ...(vera.autori || {}) };
  for (const k of Object.keys(modifiche)) if (['argomento', 'resoconto', 'prossima'].includes(k) && modifiche[k] && !autori[k]) autori[k] = io().nome;
  return salva('sedute', { ...vera, ...modifiche, autori });
}

export function titoloSeduta(s) {
  if (s.tipo === 'gruppo') return gruppo(s.gruppoId)?.nome || 'Gruppo';
  const r = ragazzo(s.ragazzoId);
  return s.tipo === 'genitori' ? `Genitori di ${nomeBreve(r)}` : nomeCompleto(r);
}
/** futura · oggi · da-scrivere (passata senza resoconto) · scritta */
export function statoSeduta(s) {
  const o = oggi();
  const scritta = !!(s.resoconto && s.resoconto.trim());
  if (scritta) return 'scritta';
  if (s.data > o) return 'futura';
  if (s.data === o) return 'oggi';
  return 'da-scrivere';
}
export function partecipantiSeduta(s) {
  if (s.tipo !== 'gruppo') return s.ragazzoId ? [s.ragazzoId] : [];
  const g = gruppo(s.gruppoId);
  return g ? membriAl(g, s.data) : Object.keys(s.presenze || {});
}
export const presente = (s, rid) => (s.presenze && s.presenze[rid] === false ? false : true);

/** Seduta salvata precedente dello stesso gruppo o ragazzo (e tipo). */
export function precedente(s) {
  const k = soggetto(s);
  return dati.sedute.filter((x) => soggetto(x) === k && x.data < s.data && !x.annullata).sort((a, b) => (b.data + b.ora).localeCompare(a.data + a.ora))[0] || null;
}
export function successiva(s) {
  const k = soggetto(s);
  const fine = piu(s.data, 120);
  return sedutePeriodo(piu(s.data, 1), fine).find((x) => soggetto(x) === k) || null;
}
/** Quello che la volta scorsa si è deciso di fare "la prossima volta". */
export function dallaVoltaScorsa(s) {
  const p = precedente(s);
  if (!p) return null;
  const rimasti = daFare(p.argomento).filter((x) => !(s.argomento || '').includes(x));
  let prossima = (p.prossima || '').trim();
  // se è già tutto nel piano, non serve ricordarlo
  const righe = prossima.split('\n').map((x) => x.replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, '').trim()).filter(Boolean);
  if (righe.length && righe.every((x) => (s.argomento || '').includes(x))) prossima = '';
  if (!prossima && !rimasti.length) return null;
  return { seduta: p, prossima, rimasti };
}

// ---------------------------------------------------------------------------
// Argomenti in sospeso
export const sospesiDi = (tipo, id) => (tipo !== 'gruppo' && !condiviso(id) ? [] : dati.sospesi).filter((x) => !x.usatoIn && (tipo === 'gruppo' ? x.gruppoId === id : x.ragazzoId === id));
export async function usaSospeso(sosp, s) {
  const vera = await aggiornaSeduta(s, { argomento: aggiungiVoce(s.argomento, sosp.testo) });
  await salva('sospesi', { ...sosp, usatoIn: vera.id });
  return vera;
}
export function aggiungiVoce(testo, voce) {
  const t = (testo || '').replace(/\s+$/, '');
  return (t ? t + '\n' : '') + '- [ ] ' + voce.trim();
}

// ---------------------------------------------------------------------------
// Diario: tutto quello che riguarda un ragazzo, un gruppo, o l'aula intera.
function voceSeduta(s, perRagazzo) {
  const g = s.tipo === 'gruppo' ? gruppo(s.gruppoId) : null;
  const blocchi = [];
  if (perRagazzo && s.tipo === 'gruppo') {
    const assente = !presente(s, perRagazzo);
    const su = (s.partecipanti || {})[perRagazzo];
    if (assente) blocchi.push({ chiave: 'assente', etichetta: 'Presenza', testo: 'Assente' });
    if (su) blocchi.push({ chiave: 'partecipante', etichetta: 'Su ' + nomeBreve(ragazzo(perRagazzo)), testo: su, principale: true });
    if (s.argomento) blocchi.push({ chiave: 'argomento', etichetta: 'Argomento del gruppo', testo: s.argomento, secondario: true });
    if (s.resoconto) blocchi.push({ chiave: 'resoconto', etichetta: 'Resoconto del gruppo', testo: s.resoconto, secondario: true });
  } else {
    if (s.argomento) blocchi.push({ chiave: 'argomento', etichetta: s.data > oggi() ? 'Da fare' : 'Argomento', testo: s.argomento });
    if (s.resoconto) blocchi.push({ chiave: 'resoconto', etichetta: 'Com\'è andata', testo: s.resoconto, principale: true });
    if (s.tipo === 'gruppo') for (const [rid, t] of Object.entries(s.partecipanti || {})) if (t) blocchi.push({ chiave: 'p:' + rid, etichetta: nomeBreve(ragazzo(rid)), testo: t, ragazzo: rid });
    if (s.prossima) blocchi.push({ chiave: 'prossima', etichetta: 'Per la prossima volta', testo: s.prossima });
  }
  const testi = blocchi.map((b) => b.testo).join('\n');
  return {
    chiave: s.id, tipo: s.tipo, data: s.data, ora: s.ora, sedutaId: s.id,
    titolo: titoloSeduta(s), gruppoId: g?.id, ragazzoId: s.ragazzoId,
    stato: statoSeduta(s), blocchi, tags: tagDi(testi), testo: semplice(testi),
    autori: s.autori || {},
  };
}
function voceNota(n) {
  const cat = CATEGORIE_NOTA[n.categoria] || '';
  return {
    chiave: n.id, tipo: 'nota', data: n.data, ora: '', notaId: n.id, titolo: n.titolo || cat || 'Nota', categoria: cat,
    ragazzoId: n.ragazzoId, gruppoId: n.gruppoId,
    blocchi: [{ chiave: 'testo', etichetta: '', testo: n.testo, principale: true }],
    tags: tagDi(n.testo), testo: cat + ' ' + semplice(n.testo), autori: { testo: n.autore },
  };
}
export function diarioRagazzo(rid) {
  const out = [];
  for (const s of dati.sedute) {
    if (s.annullata || !visibileSeduta(s)) continue;
    if (s.tipo === 'gruppo') {
      const g = gruppo(s.gruppoId);
      const membro = g && membriAl(g, s.data).includes(rid);
      const citato = menzioniDi([s.argomento, s.resoconto, s.prossima].join('\n')).includes(rid);
      if ((membro && (s.resoconto || (s.partecipanti || {})[rid] || s.presenze?.[rid] === false)) || citato) out.push(voceSeduta(s, rid));
    } else if (s.ragazzoId === rid && (s.argomento || s.resoconto)) out.push(voceSeduta(s));
  }
  for (const n of dati.note) if (visibileNota(n) && (n.ragazzoId === rid || menzioniDi(n.testo).includes(rid))) out.push(voceNota(n));
  return out.sort((a, b) => (b.data + (b.ora || '')).localeCompare(a.data + (a.ora || '')));
}
export function storicoGruppo(gid) {
  const g = gruppo(gid);
  if (!g) return [];
  const da = serieDi({ gruppoId: gid }).map((x) => x.dal).sort()[0] || piu(oggi(), -365);
  const tutte = sedutePeriodo(da, piu(oggi(), 60)).filter((s) => s.gruppoId === gid);
  return tutte.filter((s) => !s.virtuale || s.data < oggi()).map((s) => voceSeduta(s)).concat(
    dati.note.filter((n) => n.gruppoId === gid).map(voceNota),
  ).sort((a, b) => (b.data + (b.ora || '')).localeCompare(a.data + (a.ora || '')));
}
export function diarioAula() {
  return dati.sedute.filter((s) => !s.annullata && visibileSeduta(s) && (s.argomento || s.resoconto)).map((s) => voceSeduta(s))
    .concat(dati.note.filter(visibileNota).map(voceNota))
    .sort((a, b) => (b.data + (b.ora || '')).localeCompare(a.data + (a.ora || '')));
}
export function conteggioTag(voci) {
  const c = {};
  for (const v of voci) for (const t of v.tags) c[t] = (c[t] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
export function tuttiTag() {
  const testi = [];
  for (const s of dati.sedute) testi.push(s.argomento, s.resoconto, s.prossima, ...Object.values(s.partecipanti || {}));
  for (const n of dati.note) testi.push(n.testo);
  for (const x of dati.sospesi) testi.push(x.testo);
  const c = {};
  for (const t of testi) for (const tag of tagDi(t)) c[tag] = (c[tag] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}
/** Filtri comuni a diario e storico. */
export function filtra(voci, f) {
  const q = (f.testo || '').trim().toLowerCase();
  return voci.filter((v) =>
    (!f.tipi || !f.tipi.length || f.tipi.includes(v.tipo)) &&
    (!f.tag || !f.tag.length || f.tag.every((t) => v.tags.includes(t))) &&
    (!f.da || v.data >= f.da) && (!f.a || v.data <= f.a) &&
    (!q || (v.titolo + ' ' + v.testo).toLowerCase().includes(q)));
}
