// Dagli oggetti dell'app alle "voci" che viaggiano cifrate verso il custode,
// e ritorno. Qui si decide l'AMBITO di ogni dato: "aula" (lo vede chiunque ha
// accesso) o "r:<id>" (solo chi ha il ragazzo condiviso). Funzioni pure,
// testate in tools/test-voci.mjs.

// Del ragazzo, chiunque vede solo questi campi; il resto è la sua "scheda".
export const CAMPI_PUBBLICI = ['id', 'nome', 'cognome', 'nascita', 'scuola', 'classe', 'foto', 'stato', 'creato', 'modificato'];
export const idScheda = (rid) => rid + 'sc';
const TIPO_DI = { gruppi: 'gruppo', sedute: 'seduta', note: 'nota', sospesi: 'sospeso', serie: 'serie' };
export const TABELLA_DI = { gruppo: 'gruppi', seduta: 'sedute', nota: 'note', sospeso: 'sospesi', serie: 'serie', ragazzo: 'ragazzi', scheda: 'ragazzi' };

export function ambitoDi(tabella, o) {
  if (tabella === 'sedute') return o.tipo === 'gruppo' ? 'aula' : 'r:' + o.ragazzoId;
  if (tabella === 'note') return o.ragazzoId && o.categoria !== 'gruppo' ? 'r:' + o.ragazzoId : 'aula';
  if (tabella === 'sospesi') return o.ragazzoId ? 'r:' + o.ragazzoId : 'aula';
  // appuntamenti ricorrenti: quelli di un ragazzo sono personali (individuali, genitori…)
  if (tabella === 'serie') return o.tipo === 'gruppo' ? 'aula' : 'r:' + o.ragazzoId;
  return 'aula';
}

/** Le voci che rappresentano un oggetto locale. */
export function vociDi(tabella, o) {
  if (tabella === 'ragazzi') {
    const pub = {}, scheda = { id: o.id };
    for (const [k, v] of Object.entries(o)) (CAMPI_PUBBLICI.includes(k) ? pub : scheda)[k] = v;
    scheda.id = o.id;
    return [
      { id: o.id, tipo: 'ragazzo', ambito: 'aula', dati: pub },
      { id: idScheda(o.id), tipo: 'scheda', ambito: 'r:' + o.id, dati: scheda },
    ];
  }
  if (!TIPO_DI[tabella]) return [];
  return [{ id: o.id, tipo: TIPO_DI[tabella], ambito: ambitoDi(tabella, o), dati: o }];
}
/** Gli id delle voci di un oggetto (anche quando l'oggetto non c'è più). */
export const idVociDi = (tabella, id) => (tabella === 'ragazzi' ? [id, idScheda(id)] : TIPO_DI[tabella] ? [id] : []);

/** L'oggetto locale che una voce aggiorna: { tabella, id }. */
export function destinazione(voce) {
  if (voce.tipo === 'scheda') return { tabella: 'ragazzi', id: voce.id.replace(/sc$/, '') };
  return { tabella: TABELLA_DI[voce.tipo], id: voce.id };
}

/**
 * Applica una voce arrivata dal custode all'oggetto locale attuale (o null).
 * Restituisce il nuovo oggetto, o null se va tolto.
 */
export function applica(voce, attuale, dati) {
  if (voce.tipo === 'ragazzo') {
    if (voce.eliminato) return null;
    const scheda = {};
    if (attuale) for (const [k, v] of Object.entries(attuale)) if (!CAMPI_PUBBLICI.includes(k)) scheda[k] = v;
    return { ...scheda, ...dati };
  }
  if (voce.tipo === 'scheda') {
    const pub = {};
    if (attuale) for (const k of CAMPI_PUBBLICI) if (k in attuale) pub[k] = attuale[k];
    if (voce.eliminato) return attuale ? pub : null;          // scheda non più visibile: resta il nome
    return { ...dati, ...pub, id: attuale?.id || dati.id };
  }
  return voce.eliminato ? null : dati;
}

// ---------------------------------------------------------------------------
// Unione a tre vie: base (ultima versione comune), mia, loro.
// Campo per campo; se entrambi hanno cambiato lo stesso testo non si perde
// niente: si tengono tutte e due le versioni una sotto l'altra.
const uguale = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const oggetto = (x) => x && typeof x === 'object' && !Array.isArray(x);

export function unisci(base, mia, loro, chiLoro = 'un altro dispositivo') {
  if (uguale(mia, loro)) return mia;
  if (base === undefined || base === null) base = {};
  if (uguale(mia, base)) return loro;
  if (uguale(loro, base)) return mia;
  if (oggetto(mia) && oggetto(loro)) {
    const out = {};
    for (const k of new Set([...Object.keys(mia), ...Object.keys(loro)])) {
      if (k === 'modificato') { out[k] = (mia[k] || '') > (loro[k] || '') ? mia[k] : loro[k]; continue; }
      const v = unisci(oggetto(base) ? base[k] : undefined, mia[k], loro[k], chiLoro);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (typeof mia === 'string' && typeof loro === 'string') {
    if (!mia.trim()) return loro;
    if (!loro.trim()) return mia;
    if (mia.includes(loro)) return mia;
    if (loro.includes(mia)) return loro;
    // tutti e due hanno aggiunto in fondo: si tengono entrambe le aggiunte
    if (typeof base === 'string' && base && mia.startsWith(base) && loro.startsWith(base)) return mia + '\n' + loro.slice(base.length).replace(/^\n+/, '');
    return `${mia}\n\n> Scritto nello stesso momento da ${chiLoro}:\n\n${loro}`;
  }
  return mia === undefined ? loro : mia;   // numeri, liste, booleani: vince questo dispositivo
}

/** Id delle immagini citate da un oggetto (foto, copertine, immagini nel testo). */
export function immaginiDi(o) {
  const out = new Set();
  (function visita(v) {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\(img:([a-z0-9]{4,32})\)/g)) out.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(visita);
    else if (v && typeof v === 'object') Object.values(v).forEach(visita);
  })(o);
  if (o && typeof o.foto === 'string' && o.foto) out.add(o.foto);
  if (o && typeof o.copertina === 'string' && o.copertina) out.add(o.copertina);
  return [...out];
}
