// Programmi e protocolli di intervento. Funzioni pure (testate in
// tools/test-programmi.mjs): niente stato dell'app, niente rete.
//
// Programma (biblioteca):
//   { id, nome, descrizione, destinatari: ['gruppo','classe','individuale'],
//     moduli: [{ id, nome, immagine, unita: [{ id, titolo, obiettivi, attivita, durata, facoltativa }] }],
//     libere: [{ id, titolo, attivita, durata }] }          ← menù di attività libere
// Assegnazione (dentro il gruppo, la classe o il paziente, in .programmi):
//   { id, programmaId, nome, dal, versione, moduli, libere, saltate: [idUnità], chiusa }
//   È una COPIA del programma: l'ordine dei moduli e delle unità si cambia qui,
//   per quel gruppo, senza toccare la biblioteca né gli altri.
// Seduta collegata: seduta.programma = { assegnazione, unita, libera?, esito? }
//   esito: 'fatta' | 'non-fatta' (scelto a mano); senza esito è fatta quando
//   ha il resoconto.
// Il ritmo è per sedute: la prossima unità è la prima non ancora fatta né già
// prevista in un'altra seduta; un annullamento non consuma niente.

const id = (p) => p + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');
export const nuovoId = id;

export const DESTINATARI = { gruppo: 'Gruppi terapeutici', classe: 'Classi', individuale: 'Individuale' };

export function nuovoProgramma(campi = {}) {
  return { id: id('p'), nome: 'Nuovo programma', descrizione: '', destinatari: ['gruppo', 'classe'], moduli: [nuovoModulo()], libere: [], ...campi };
}
export const nuovoModulo = (nome = '') => ({ id: id('m'), nome, immagine: null, unita: [] });
export const nuovaUnita = (titolo = '') => ({ id: id('u'), titolo, obiettivi: '', attivita: '', durata: null, facoltativa: false });
export const nuovaLibera = (titolo = '') => ({ id: id('l'), titolo, attivita: '', durata: null });

/** Il programma adatto a un soggetto? tipo: 'gruppo' | 'classe' | 'individuale' */
export const adatto = (p, tipo) => !p.destinatari?.length || p.destinatari.includes(tipo);

// ---------------------------------------------------------------------------
// Assegnazione
const copia = (x) => JSON.parse(JSON.stringify(x));
export function assegna(p, dal) {
  return { id: id('as'), programmaId: p.id, nome: p.nome, dal: dal || null, versione: p.modificato || null, moduli: copia(p.moduli || []), libere: copia(p.libere || []), saltate: [], chiusa: false };
}
/** Le unità nell'ordine dell'assegnazione: [{ modulo, unita, n }] (n da 1). */
export function unitaInOrdine(as) {
  const out = [];
  for (const m of as.moduli || []) for (const u of m.unita || []) out.push({ modulo: m, unita: u, n: out.length + 1 });
  return out;
}
const scritto = (t) => !!(t && String(t).replace(/[\s#>*_\-[\]x]/gi, '').length);
/** La seduta conta come "fatta" per la sua unità? */
export function sedutaFatta(s) {
  if (!s?.programma || s.annullata) return false;
  if (s.programma.esito === 'fatta') return true;
  if (s.programma.esito === 'non-fatta') return false;
  return scritto(s.resoconto);
}
/**
 * Lo stato di ogni unità: Map(idUnità → { stato, sedute }).
 * stato: 'fatta' | 'prevista' (in una seduta, non ancora fatta) | 'saltata' | 'da-fare'
 */
export function statoUnita(as, sedute) {
  const mie = (sedute || []).filter((s) => s.programma?.assegnazione === as.id && !s.programma.libera && !s.annullata);
  const out = new Map();
  for (const { unita } of unitaInOrdine(as)) {
    const sue = mie.filter((s) => s.programma.unita === unita.id).sort((a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || '')));
    const fatte = sue.filter(sedutaFatta);
    const previste = sue.filter((s) => !sedutaFatta(s) && s.programma.esito !== 'non-fatta');
    const stato = fatte.length ? 'fatta' : previste.length ? 'prevista' : (as.saltate || []).includes(unita.id) ? 'saltata' : 'da-fare';
    out.set(unita.id, { stato, sedute: sue, fatte, previste });
  }
  return out;
}
/**
 * La prossima unità da proporre in una seduta (o null a programma finito).
 * Non conta la seduta stessa (per poter proporre di nuovo dopo "Togli").
 * Le unità facoltative non si propongono da sole: si scelgono.
 */
export function prossima(as, sedute, sedutaId = null) {
  const altre = (sedute || []).filter((s) => s.id !== sedutaId);
  const st = statoUnita(as, altre);
  return unitaInOrdine(as).find(({ unita }) => !unita.facoltativa && st.get(unita.id).stato === 'da-fare') || null;
}
/** Le prossime n unità da fare, in ordine (per le sedute future non ancora decise). */
export function prossimeN(as, sedute, n) {
  const st = statoUnita(as, sedute);
  return unitaInOrdine(as).filter(({ unita }) => !unita.facoltativa && st.get(unita.id).stato === 'da-fare').slice(0, n);
}
export function avanzamento(as, sedute) {
  const st = statoUnita(as, sedute);
  const tutte = unitaInOrdine(as).filter(({ unita }) => !unita.facoltativa);
  return { fatte: tutte.filter(({ unita }) => st.get(unita.id).stato === 'fatta').length, totale: tutte.length };
}
export function trova(as, uid) {
  for (const m of as.moduli || []) for (const u of m.unita || []) if (u.id === uid) return { modulo: m, unita: u };
  const l = (as.libere || []).find((x) => x.id === uid);
  return l ? { modulo: null, unita: l, libera: true } : null;
}

/** Sposta un modulo (o un'unità dentro il suo modulo) di una posizione. */
export function sposta(lista, i, verso) {
  const j = i + verso;
  if (j < 0 || j >= lista.length) return lista;
  const l = [...lista];
  [l[i], l[j]] = [l[j], l[i]];
  return l;
}
/**
 * "Anticipa": il modulo diventa il prossimo da fare, cioè va subito prima del
 * primo modulo non ancora concluso (anche se a metà: si riprende dopo).
 */
export function anticipa(as, idModulo, sedute) {
  const st = statoUnita(as, sedute);
  const concluso = (m) => (m.unita || []).every((u) => u.facoltativa || ['fatta', 'saltata'].includes(st.get(u.id)?.stato));
  const m = (as.moduli || []).find((x) => x.id === idModulo);
  if (!m) return as.moduli;
  const l = as.moduli.filter((x) => x.id !== idModulo);
  let k = l.findIndex((x) => !concluso(x));
  if (k < 0) k = l.length;
  l.splice(k, 0, m);
  return l;
}

/**
 * Aggiorna la copia di un'assegnazione con la versione nuova della biblioteca:
 * resta l'ordine scelto per quel gruppo, i contenuti diventano quelli nuovi,
 * i moduli e le unità nuove si aggiungono in fondo (al loro posto nel modulo).
 */
export function aggiornaDa(as, p) {
  const nuovi = new Map((p.moduli || []).map((m) => [m.id, m]));
  const moduli = [];
  for (const m of as.moduli || []) {
    const n = nuovi.get(m.id);
    if (!n) continue;
    const un = new Map((n.unita || []).map((u) => [u.id, u]));
    const unita = (m.unita || []).filter((u) => un.has(u.id)).map((u) => copia(un.get(u.id)));
    for (const u of n.unita || []) if (!unita.some((x) => x.id === u.id)) unita.push(copia(u));
    moduli.push({ ...copia(n), unita });
    nuovi.delete(m.id);
  }
  for (const n of nuovi.values()) moduli.push(copia(n));
  return { ...as, nome: p.nome, versione: p.modificato || null, moduli, libere: copia(p.libere || []) };
}
export const daAggiornare = (as, p) => !!p && !!p.modificato && p.modificato !== as.versione;

/** Il testo da mettere nel piano della seduta per un'unità (o attività libera). */
export function pianoDi(as, uid) {
  const t = trova(as, uid);
  if (!t) return '';
  const { modulo, unita } = t;
  const titolo = `### ${modulo?.nome ? modulo.nome + ' · ' : ''}${unita.titolo || 'Attività'}`;
  const parti = [titolo];
  if (unita.obiettivi) parti.push('', '**Obiettivi:** ' + unita.obiettivi.trim());
  if (unita.attivita) parti.push('', unita.attivita.trim());
  return parti.join('\n');
}

// ---------------------------------------------------------------------------
/**
 * Un programma da un documento incollato:
 *   # Modulo            → un modulo
 *   ## Incontro         → un'unità del modulo (il testo sotto è l'attività)
 *   Obiettivi: …        → gli obiettivi dell'unità
 *   # Attività libere   → le ## sotto diventano il menù di attività libere
 * Senza "#" ma con "##": un solo modulo. Il testo prima del primo titolo è la descrizione.
 */
export function daTesto(testo, nome = '') {
  const p = nuovoProgramma({ nome: nome || 'Programma importato', moduli: [], libere: [] });
  let modulo = null, unita = null, libere = false;
  const descr = [];
  const chiudi = () => { if (unita) { unita.attivita = unita.attivita.replace(/^\n+|\n+$/g, ''); unita = null; } };
  for (const riga of String(testo || '').split(/\r?\n/)) {
    let m;
    if ((m = /^#\s+(.+)$/.exec(riga))) {
      chiudi();
      libere = /^attività\s+libere|^attivita\s+libere|^menù|^menu/i.test(m[1].trim());
      if (!libere) { modulo = nuovoModulo(m[1].trim()); p.moduli.push(modulo); }
    } else if ((m = /^##\s+(.+)$/.exec(riga))) {
      chiudi();
      if (libere) { unita = nuovaLibera(m[1].trim()); p.libere.push(unita); }
      else {
        if (!modulo) { modulo = nuovoModulo(''); p.moduli.push(modulo); }
        unita = nuovaUnita(m[1].trim()); modulo.unita.push(unita);
      }
    } else if (unita && !libere && (m = /^\s*obiettiv[oi]\s*:\s*(.+)$/i.exec(riga)) && !unita.obiettivi) {
      unita.obiettivi = m[1].trim();
    } else if (unita && (m = /^\s*durata\s*:\s*(\d+)/i.exec(riga)) && !unita.durata) {
      unita.durata = Number(m[1]);
    } else if (unita) unita.attivita += riga + '\n';
    else if (!modulo && !libere) descr.push(riga);
  }
  chiudi();
  p.descrizione = descr.join('\n').trim();
  if (!p.moduli.length) p.moduli.push(nuovoModulo(''));
  return p;
}
/** Il programma come documento (il formato che daTesto rilegge). */
export function aTesto(p) {
  const out = [];
  if (p.descrizione) out.push(p.descrizione, '');
  for (const m of p.moduli || []) {
    out.push(`# ${m.nome || 'Modulo'}`, '');
    for (const u of m.unita || []) {
      out.push(`## ${u.titolo || 'Unità'}${u.facoltativa ? ' (facoltativa)' : ''}`);
      if (u.obiettivi) out.push(`Obiettivi: ${u.obiettivi}`);
      if (u.durata) out.push(`Durata: ${u.durata} minuti`);
      if (u.attivita) out.push('', u.attivita);
      out.push('');
    }
  }
  if (p.libere?.length) {
    out.push('# Attività libere', '');
    for (const l of p.libere) out.push(`## ${l.titolo || 'Attività'}`, ...(l.attivita ? ['', l.attivita] : []), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
