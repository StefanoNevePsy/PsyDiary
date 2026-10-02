// Esportazione completa per passare a un altro sistema.
//
// Dai dati dell'aula (tutte le tabelle, decifrate sul dispositivo) e dai file
// (allegati, foto, immagini nelle note) compone il contenuto dello zip:
//   LEGGIMI.txt             cosa c'è e come è fatto
//   indice.html             da aprire nel browser per sfogliare tutto
//   psydiary.json           tutto, campo per campo, per importarlo altrove
//   tabelle/*.csv           una tabella per tipo di dato (Excel, LibreOffice, database)
//   pazienti/<nome>/        scheda.html, diario.html, diario.md, dati.json, allegati/
//   gruppi/<nome>/          gruppo.html (o classe), diario.md, dati.json, allegati/
//   aula/                   le note sull'aula in generale
// Funzioni pure (niente rete, niente DOM): testate in tools/test-esporta.mjs.
import { SEZIONI } from './anagrafica.js';

export const FORMATO = 'psydiary-esportazione';
export const VERSIONE = 1;

const TIPI_SEDUTA = { gruppo: 'Seduta di gruppo', individuale: 'Seduta individuale', genitori: 'Incontro con i genitori', conoscenza: 'Colloquio di conoscenza' };
const CATEGORIE = { gruppo: 'Nel gruppo', osservazione: 'Osservazione', scuola: 'Scuola', famiglia: 'Famiglia', servizi: 'Servizi', telefonata: 'Telefonata', altro: 'Altro' };

// ---- piccoli aiuti ----------------------------------------------------------
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nomeCompleto = (r) => [r?.cognome, r?.nome].filter(Boolean).join(' ') || r?.nome || 'Senza nome';
const dataIt = (d) => (/^\d{4}-\d{2}-\d{2}/.test(d || '') ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d || '');
/** Un nome valido come cartella o file, ovunque (Windows compreso). */
export function nomeFile(t, max = 60) {
  const s = String(t || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, max).trim();
  return s || 'senza nome';
}
const ESTENSIONI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'application/json': 'json', 'text/plain': 'txt' };
function estensione(blob, nome) {
  const daNome = /\.([a-z0-9]{1,5})$/i.exec(nome || '')?.[1];
  return (daNome || ESTENSIONI[blob?.type] || 'bin').toLowerCase();
}

/** Tabella CSV (separatore ";" e BOM: si apre bene in Excel in italiano). */
export function csv(colonne, righe) {
  const cella = (v) => {
    const t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + [colonne.join(';'), ...righe.map((r) => colonne.map((c) => cella(r[c])).join(';'))].join('\r\n') + '\r\n';
}

// ---- testo delle note: markdown di PsyDiary → markdown pulito e HTML ---------
const RE_MENZ = /@\[([^\]]+)\]\((?:r|g):[a-z0-9]+\)/g;
const RE_IMG = /!\[([^\]]*)\]\(img:([a-z0-9]+)\)/g;
/** Markdown con le immagini come file nella cartella e le menzioni come testo. */
export function mdPulito(testo, percorsoImm) {
  return String(testo || '').replace(RE_MENZ, '@$1').replace(RE_IMG, (m, alt, id) => (percorsoImm(id) ? `![${alt}](${percorsoImm(id)})` : `[immagine non disponibile: ${alt}]`));
}
function inline(t) {
  return esc(t)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/_([^_]+)_/g, '<i>$1</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>');
}
/** Markdown semplice → HTML (titoli, elenchi, caselle, citazioni, paragrafi). */
export function mdHtml(md) {
  const out = []; let lista = null;
  const chiudi = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  for (const riga of String(md || '').split('\n')) {
    let m;
    if (!riga.trim()) { chiudi(); continue; }
    if ((m = /^\s*(#{1,4})\s+(.*)$/.exec(riga))) { chiudi(); const n = Math.min(6, m[1].length + 2); out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
    else if ((m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(riga))) { if (lista !== 'ul') { chiudi(); out.push('<ul class="caselle">'); lista = 'ul'; } out.push(`<li>${m[1] === ' ' ? '☐' : '☑'} ${inline(m[2])}</li>`); }
    else if ((m = /^\s*[-*+]\s+(.*)$/.exec(riga))) { if (lista !== 'ul') { chiudi(); out.push('<ul>'); lista = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(riga))) { if (lista !== 'ol') { chiudi(); out.push('<ol>'); lista = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*>\s?(.*)$/.exec(riga))) { chiudi(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else { chiudi(); out.push(`<p>${inline(riga)}</p>`); }
  }
  chiudi();
  return out.join('\n');
}

const STILE = `body{font:16px/1.5 Georgia,serif;max-width:860px;margin:32px auto;padding:0 20px;color:#1d2230}
h1{font-size:30px;margin:0 0 4px}h2{font-size:21px;margin:32px 0 8px;border-bottom:1px solid #ccc}h3{font-size:17px;margin:20px 0 4px}
.sotto{color:#666;font-size:14px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #e3e3e3;padding:5px 8px;text-align:left;vertical-align:top}
th{width:34%;color:#555;font-weight:600}.voce{border-top:1px dashed #bbb;padding-top:10px;margin-top:18px}.voce h3{margin:0}
img{max-width:100%}blockquote{border-left:3px solid #ccc;margin:6px 0;padding-left:10px;color:#444}ul.caselle{list-style:none;padding-left:4px}
.et{display:inline-block;border:1px solid #bbb;border-radius:9px;padding:0 8px;font-size:13px;margin-right:4px}
@media print{body{margin:0}a{color:inherit}}`;
const pagina = (titolo, corpo, indietro = '../../indice.html') => `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titolo)}</title><style>${STILE}</style></head><body>
${indietro ? `<p class="sotto"><a href="${indietro}">← Indice</a></p>` : ''}
${corpo}
</body></html>
`;

// ---- composizione ----------------------------------------------------------
/**
 * dati: { ragazzi, gruppi, sedute, note, sospesi, serie } · file: Map(id → Blob)
 * opz: { da, il } (chi esporta e quando).
 * Restituisce { voci: [{ percorso, testo } | { percorso, blob }], riepilogo }.
 */
export function componi(dati, file = new Map(), opz = {}) {
  const T = { ragazzi: [], gruppi: [], sedute: [], note: [], sospesi: [], serie: [], ...dati };
  const il = opz.il || new Date().toISOString();
  const voci = [];
  const testo = (percorso, t) => voci.push({ percorso, testo: t });

  // cartelle uniche per pazienti e gruppi
  const cartelle = new Map();
  const usate = new Set();
  const cartella = (base, nome, id) => {
    let c = `${base}/${nomeFile(nome)}`;
    if (usate.has(c.toLowerCase())) c = `${base}/${nomeFile(nome, 48)} (${id})`;
    usate.add(c.toLowerCase());
    return c;
  };
  const pazienti = [...T.ragazzi].sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), 'it'));
  const gruppi = [...T.gruppi].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
  for (const r of pazienti) cartelle.set('r:' + r.id, cartella('pazienti', nomeCompleto(r), r.id));
  for (const g of gruppi) cartelle.set('g:' + g.id, cartella('gruppi', (g.tipo === 'classe' ? 'Classe ' : '') + (g.nome || 'Gruppo'), g.id));
  cartelle.set('aula', 'aula');
  const nomeR = (id) => { const r = T.ragazzi.find((x) => x.id === id); return r ? nomeCompleto(r) : '(paziente non presente)'; };
  const nomeG = (id) => T.gruppi.find((x) => x.id === id)?.nome || '(gruppo non presente)';

  // di chi è ogni voce (cartella in cui finisce)
  const proprietario = (o) => (o.gruppoId && !o.ragazzoId ? 'g:' + o.gruppoId : o.ragazzoId ? 'r:' + o.ragazzoId : o.gruppoId ? 'g:' + o.gruppoId : 'aula');
  const diSeduta = (s) => (s.tipo === 'gruppo' ? 'g:' + s.gruppoId : 'r:' + s.ragazzoId);

  // file: ognuno nella cartella di chi lo usa (allegati/<nome>.<ext>)
  const fileIn = new Map();       // chiave cartella → Map(id → nome file)
  const mancanti = new Set();
  function percorsoFile(chiave, id, nome) {
    const blob = file.get(id);
    if (!blob) { mancanti.add(id); return null; }
    if (!fileIn.has(chiave)) fileIn.set(chiave, new Map());
    const m = fileIn.get(chiave);
    if (!m.has(id)) {
      const base = nomeFile(nome ? nome.replace(/\.[a-z0-9]{1,5}$/i, '') : id, 50);
      let n = `${base}.${estensione(blob, nome)}`;
      const gia = new Set([...m.values()].map((x) => x.toLowerCase()));
      if (gia.has(n.toLowerCase())) n = `${base} (${id}).${estensione(blob, nome)}`;
      m.set(id, n);
    }
    return 'allegati/' + m.get(id);
  }

  // diario di un soggetto: sedute (con contenuto o annullate) e note, in ordine
  const vociDiario = (chiave) => [
    ...T.sedute.filter((s) => diSeduta(s) === chiave).map((s) => ({ tipo: 'seduta', data: s.data, ora: s.ora || '', o: s })),
    ...T.note.filter((n) => proprietario(n) === chiave).map((n) => ({ tipo: 'nota', data: n.data, ora: '', o: n })),
  ].sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora));
  // note "nel gruppo" su un paziente: compaiono anche nel suo diario
  const diarioPaziente = (rid) => vociDiario('r:' + rid);

  function titoloVoce(v) {
    if (v.tipo === 'seduta') {
      const s = v.o;
      return `${dataIt(s.data)}${s.ora ? ' · ' + s.ora : ''}${s.durata ? ' (' + s.durata + ' min)' : ''} — ${TIPI_SEDUTA[s.tipo] || s.tipo}${s.tipo === 'gruppo' ? ': ' + nomeG(s.gruppoId) : ''}${s.annullata ? ' · annullata' : ''}`;
    }
    const n = v.o;
    return `${dataIt(n.data)} — ${n.titolo || CATEGORIE[n.categoria] || 'Nota'}${n.categoria ? ' (' + (CATEGORIE[n.categoria] || n.categoria) + ')' : ''}${n.autore ? ' · ' + n.autore : ''}`;
  }
  function diarioMd(titolo, elenco, chiave) {
    const imm = (id) => percorsoFile(chiave, id);
    const parti = [`# ${titolo}`, '', `Esportato da PsyDiary il ${dataIt(il.slice(0, 10))}.`, ''];
    for (const v of elenco) {
      parti.push(`## ${titoloVoce(v)}`, '');
      if (v.tipo === 'seduta') {
        const s = v.o;
        if (s.argomento) parti.push('**Piano**', '', mdPulito(s.argomento, imm), '');
        if (s.resoconto) parti.push('**Resoconto**', '', mdPulito(s.resoconto, imm), '');
        const pres = Object.entries(s.presenze || {}).filter(([, x]) => x === false).map(([rid]) => nomeR(rid));
        if (pres.length) parti.push(`Assenti: ${pres.join(', ')}`, '');
        for (const [rid, t] of Object.entries(s.partecipanti || {})) if (t) parti.push(`- **${nomeR(rid)}**: ${mdPulito(t, imm)}`);
        if (Object.values(s.partecipanti || {}).some(Boolean)) parti.push('');
      } else parti.push(mdPulito(v.o.testo, imm), '');
    }
    return parti.join('\n');
  }
  const diarioHtml = (titolo, md) => pagina(titolo, mdHtml(md.replace(/^# .*\n/, `# ${titolo}\n`)).replace(/^<h3>/, '<h1>').replace(/^(<h1>.*?)<\/h3>/, '$1</h1>'));

  // ---- pazienti ----
  const noti = new Set(SEZIONI.flatMap((s) => s.campi.map((c) => c[0])));
  const SPECIALI = new Set(['id', 'genitori', 'allegati', 'foto', 'noteFamiglia', 'noteStabili', 'etichette', 'accesso', 'creato', 'modificato', 'tipo']);
  for (const r of pazienti) {
    const chiave = 'r:' + r.id, dir = cartelle.get(chiave);
    const valore = (c, v) => (c[2] === 'select' ? (c[3] || []).find((o) => o[0] === v)?.[1] ?? v : c[2] === 'date' ? dataIt(v) : v);
    let corpo = `<h1>${esc(nomeCompleto(r))}</h1>`;
    if (r.etichette?.length) corpo += `<p>${r.etichette.map((t) => `<span class="et">${esc(t)}</span>`).join('')}</p>`;
    if (r.foto && file.get(r.foto)) corpo += `<p><img src="${esc(percorsoFile(chiave, r.foto, 'foto'))}" alt="Foto" style="max-width:180px;border-radius:50%"></p>`;
    for (const sez of SEZIONI) {
      const righe = sez.campi.filter((c) => r[c[0]] !== undefined && r[c[0]] !== '' && r[c[0]] !== null).map((c) => `<tr><th>${esc(c[1])}</th><td>${esc(valore(c, r[c[0]]))}</td></tr>`);
      if (righe.length) corpo += `<h2>${esc(sez.titolo)}</h2><table>${righe.join('')}</table>`;
    }
    const altri = Object.keys(r).filter((k) => !noti.has(k) && !SPECIALI.has(k) && r[k] !== '' && r[k] !== null && r[k] !== undefined);
    if (altri.length) corpo += `<h2>Altri campi</h2><table>${altri.map((k) => `<tr><th>${esc(k)}</th><td>${esc(typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k])}</td></tr>`).join('')}</table>`;
    if (r.genitori?.length || r.noteFamiglia) {
      corpo += '<h2>Famiglia</h2>';
      if (r.genitori?.length) corpo += `<table>${r.genitori.map((g) => `<tr><th>${esc(g.relazione || 'familiare')}</th><td>${esc(g.nome || '')}${g.telefono ? ' · ' + esc(g.telefono) : ''}${g.email ? ' · ' + esc(g.email) : ''}</td></tr>`).join('')}</table>`;
      if (r.noteFamiglia) corpo += `<p>${esc(r.noteFamiglia).replace(/\n/g, '<br>')}</p>`;
    }
    if (r.noteStabili) corpo += '<h2>Da tenere a mente</h2>' + mdHtml(mdPulito(r.noteStabili, (id) => percorsoFile(chiave, id)));
    const membro = T.gruppi.filter((g) => (g.membri || []).some((m) => m.ragazzoId === r.id));
    if (membro.length) corpo += `<h2>Gruppi e classi</h2><ul>${membro.map((g) => { const m = g.membri.find((x) => x.ragazzoId === r.id); return `<li>${esc(g.nome)}${m.dal ? ' · dal ' + dataIt(m.dal) : ''}${m.al ? ' · al ' + dataIt(m.al) : ''}</li>`; }).join('')}</ul>`;
    const allegati = (r.allegati || []).map((a) => ({ a, p: percorsoFile(chiave, a.id, a.nome + (a.genogramma ? '.genogramma.json' : '')) }));
    if (allegati.length) corpo += `<h2>Allegati</h2><ul>${allegati.map(({ a, p }) => `<li>${p ? `<a href="${esc(p)}">${esc(a.nome)}</a>` : esc(a.nome) + ' (file non disponibile)'}${a.genogramma ? ' · genogramma di GenoGram Creator' : ''}</li>`).join('')}</ul>`;
    const serie = T.serie.filter((x) => x.ragazzoId === r.id);
    if (serie.length) corpo += `<h2>Appuntamenti ricorrenti</h2><ul>${serie.map((x) => `<li>${esc(TIPI_SEDUTA[x.tipo] || x.tipo)} · ${esc(descriviSerie(x))}</li>`).join('')}</ul>`;
    const sosp = T.sospesi.filter((x) => x.ragazzoId === r.id);
    if (sosp.length) corpo += `<h2>In sospeso</h2><ul>${sosp.map((x) => `<li>${esc(x.testo)}${x.usatoIn ? ' (usato)' : ''}</li>`).join('')}</ul>`;
    corpo += '<p class="sotto"><a href="diario.html">Diario →</a></p>';
    testo(`${dir}/scheda.html`, pagina(nomeCompleto(r), corpo));
    const md = diarioMd('Diario · ' + nomeCompleto(r), diarioPaziente(r.id), chiave);
    testo(`${dir}/diario.md`, md);
    testo(`${dir}/diario.html`, diarioHtml('Diario · ' + nomeCompleto(r), md));
    testo(`${dir}/dati.json`, JSON.stringify({
      paziente: r,
      sedute: T.sedute.filter((s) => s.ragazzoId === r.id && s.tipo !== 'gruppo'),
      note: T.note.filter((n) => n.ragazzoId === r.id),
      ricorrenze: serie, sospesi: sosp,
    }, null, 2));
  }

  // ---- gruppi e classi ----
  for (const g of gruppi) {
    const chiave = 'g:' + g.id, dir = cartelle.get(chiave), classe = g.tipo === 'classe';
    let corpo = `<h1>${esc(g.nome || 'Gruppo')}</h1><p class="sotto">${classe ? 'Classe' : 'Gruppo terapeutico'}${g.archiviato ? ' · archiviato' : ''}</p>`;
    if (g.tema) corpo += `<p><i>${esc(g.tema)}</i></p>`;
    if (g.obiettivi) corpo += '<h2>Obiettivi</h2>' + mdHtml(mdPulito(g.obiettivi, (id) => percorsoFile(chiave, id)));
    if (g.alunni?.length) corpo += `<h2>Alunni</h2><table>${[...g.alunni].sort((a, b) => a.nome.localeCompare(b.nome, 'it')).map((a) => `<tr><th>${esc(a.nome)}</th><td>${esc(a.sesso || '–')}${a.nota ? ' · ' + esc(a.nota) : ''}</td></tr>`).join('')}</table>`;
    if (g.membri?.length) corpo += `<h2>${classe ? 'Pazienti seguiti in questa classe' : 'Membri'}</h2><ul>${g.membri.map((m) => `<li>${esc(nomeR(m.ragazzoId))}${m.dal ? ' · dal ' + dataIt(m.dal) : ''}${m.al ? ' · al ' + dataIt(m.al) : ''}</li>`).join('')}</ul>`;
    const serie = T.serie.filter((x) => x.gruppoId === g.id);
    if (serie.length) corpo += `<h2>Quando si incontra</h2><ul>${serie.map((x) => `<li>${esc(descriviSerie(x))}</li>`).join('')}</ul>`;
    const allegati = (g.allegati || []).map((a) => ({ a, p: percorsoFile(chiave, a.id, a.nome + (a.genogramma ? '.genogramma.json' : '')) }));
    if (allegati.length) corpo += `<h2>Allegati</h2><ul>${allegati.map(({ a, p }) => `<li>${p ? `<a href="${esc(p)}">${esc(a.nome)}</a>` : esc(a.nome) + ' (file non disponibile)'}${a.genogramma ? ' · genogramma di GenoGram Creator' : ''}</li>`).join('')}</ul>`;
    const sosp = T.sospesi.filter((x) => x.gruppoId === g.id && !x.ragazzoId);
    if (sosp.length) corpo += `<h2>In sospeso</h2><ul>${sosp.map((x) => `<li>${esc(x.testo)}${x.usatoIn ? ' (usato)' : ''}</li>`).join('')}</ul>`;
    const md = diarioMd('Diario · ' + (g.nome || 'Gruppo'), vociDiario(chiave), chiave);
    corpo += '<h2>Diario</h2>' + mdHtml(md.split('\n').slice(3).join('\n'));
    testo(`${dir}/${classe ? 'classe' : 'gruppo'}.html`, pagina(g.nome || 'Gruppo', corpo));
    testo(`${dir}/diario.md`, md);
    testo(`${dir}/dati.json`, JSON.stringify({
      gruppo: g, sedute: T.sedute.filter((s) => s.tipo === 'gruppo' && s.gruppoId === g.id),
      note: T.note.filter((n) => n.gruppoId === g.id && !n.ragazzoId), ricorrenze: serie, sospesi: sosp,
    }, null, 2));
  }

  // ---- aula: note senza paziente né gruppo ----
  const aula = vociDiario('aula');
  if (aula.length) {
    const md = diarioMd("Note sull'aula", aula, 'aula');
    testo('aula/diario.md', md);
    testo('aula/diario.html', diarioHtml("Note sull'aula", md));
  }

  // ---- i file, nelle cartelle di chi li usa ----
  for (const [chiave, m] of fileIn) for (const [id, nome] of m) voci.push({ percorso: `${cartelle.get(chiave)}/allegati/${nome}`, blob: file.get(id) });

  // ---- tabelle ----
  const campiPaz = ['id', ...SEZIONI.flatMap((s) => s.campi.map((c) => c[0])).filter((k) => k !== 'id'), 'etichette', 'noteFamiglia', 'noteStabili', 'creato', 'modificato'];
  testo('tabelle/pazienti.csv', csv(campiPaz, pazienti.map((r) => ({ ...r, etichette: (r.etichette || []).join(', ') }))));
  testo('tabelle/familiari.csv', csv(['paziente_id', 'paziente', 'relazione', 'nome', 'telefono', 'email'],
    pazienti.flatMap((r) => (r.genitori || []).map((g) => ({ paziente_id: r.id, paziente: nomeCompleto(r), ...g })))));
  testo('tabelle/gruppi.csv', csv(['id', 'tipo', 'nome', 'tema', 'obiettivi', 'archiviato', 'creato', 'modificato'],
    gruppi.map((g) => ({ ...g, tipo: g.tipo === 'classe' ? 'classe' : 'gruppo terapeutico', archiviato: g.archiviato ? 'sì' : '' }))));
  testo('tabelle/membri.csv', csv(['gruppo_id', 'gruppo', 'paziente_id', 'paziente', 'dal', 'al'],
    gruppi.flatMap((g) => (g.membri || []).map((m) => ({ gruppo_id: g.id, gruppo: g.nome, paziente_id: m.ragazzoId, paziente: nomeR(m.ragazzoId), dal: m.dal || '', al: m.al || '' })))));
  testo('tabelle/alunni.csv', csv(['gruppo_id', 'classe', 'id', 'nome', 'sesso', 'nota'],
    gruppi.flatMap((g) => (g.alunni || []).map((a) => ({ gruppo_id: g.id, classe: g.nome, ...a })))));
  const sedute = [...T.sedute].sort((a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || '')));
  testo('tabelle/sedute.csv', csv(['id', 'tipo', 'data', 'ora', 'durata', 'paziente_id', 'paziente', 'gruppo_id', 'gruppo', 'annullata', 'argomento', 'resoconto', 'chi'],
    sedute.map((s) => ({ ...s, tipo: TIPI_SEDUTA[s.tipo] || s.tipo, paziente_id: s.ragazzoId || '', paziente: s.ragazzoId ? nomeR(s.ragazzoId) : '', gruppo_id: s.gruppoId || '', gruppo: s.gruppoId ? nomeG(s.gruppoId) : '', annullata: s.annullata ? 'sì' : '' }))));
  testo('tabelle/presenze.csv', csv(['seduta_id', 'data', 'gruppo', 'paziente_id', 'paziente', 'presente', 'nota'],
    sedute.filter((s) => s.tipo === 'gruppo').flatMap((s) => {
      const g = T.gruppi.find((x) => x.id === s.gruppoId);
      const ids = new Set([...(g?.membri || []).filter((m) => (!m.dal || m.dal <= s.data) && (!m.al || m.al >= s.data)).map((m) => m.ragazzoId), ...Object.keys(s.presenze || {}), ...Object.keys(s.partecipanti || {})]);
      return [...ids].map((rid) => ({ seduta_id: s.id, data: s.data, gruppo: nomeG(s.gruppoId), paziente_id: rid, paziente: nomeR(rid), presente: s.presenze?.[rid] === false ? 'no' : 'sì', nota: s.partecipanti?.[rid] || '' }));
    })));
  testo('tabelle/note.csv', csv(['id', 'data', 'categoria', 'titolo', 'autore', 'paziente_id', 'paziente', 'gruppo_id', 'gruppo', 'testo'],
    [...T.note].sort((a, b) => String(a.data).localeCompare(String(b.data))).map((n) => ({ ...n, categoria: CATEGORIE[n.categoria] || n.categoria || '', paziente_id: n.ragazzoId || '', paziente: n.ragazzoId ? nomeR(n.ragazzoId) : '', gruppo_id: n.gruppoId || '', gruppo: n.gruppoId ? nomeG(n.gruppoId) : '', testo: mdPulito(n.testo, () => null) }))));
  testo('tabelle/ricorrenze.csv', csv(['id', 'tipo', 'paziente_id', 'gruppo_id', 'dal', 'al', 'volte', 'ora', 'durata', 'descrizione'],
    T.serie.map((x) => ({ ...x, tipo: TIPI_SEDUTA[x.tipo] || x.tipo, paziente_id: x.ragazzoId || '', gruppo_id: x.gruppoId || '', descrizione: descriviSerie(x) }))));
  testo('tabelle/sospesi.csv', csv(['id', 'testo', 'paziente_id', 'gruppo_id', 'usatoIn', 'creato'], T.sospesi.map((x) => ({ ...x, paziente_id: x.ragazzoId || '', gruppo_id: x.gruppoId || '' }))));
  testo('tabelle/allegati.csv', csv(['proprietario', 'id', 'nome', 'tipo', 'genogramma', 'file'],
    [...pazienti.map((r) => ['r:' + r.id, r]), ...gruppi.map((g) => ['g:' + g.id, g])].flatMap(([k, o]) => (o.allegati || []).map((a) => ({
      proprietario: k.startsWith('r:') ? nomeCompleto(o) : o.nome, id: a.id, nome: a.nome, tipo: a.tipo || '', genogramma: a.genogramma ? 'sì' : '',
      file: fileIn.get(k)?.get(a.id) ? `${cartelle.get(k)}/allegati/${fileIn.get(k).get(a.id)}` : '(non disponibile)',
    })))));

  // ---- tutto in un file, per importarlo altrove ----
  testo('psydiary.json', JSON.stringify({
    formato: FORMATO, versione: VERSIONE, esportato: il, da: opz.da || '',
    nota: 'Tutte le tabelle di PsyDiary, campo per campo. Gli allegati sono nelle cartelle dei pazienti e dei gruppi (vedi tabelle/allegati.csv).',
    tabelle: { pazienti: T.ragazzi, gruppi: T.gruppi, sedute: T.sedute, note: T.note, ricorrenze: T.serie, sospesi: T.sospesi },
  }, null, 2));

  // ---- indice e istruzioni ----
  const li = (k, nome, file, extra = '') => `<li><a href="${esc(cartelle.get(k))}/${file}">${esc(nome)}</a>${extra}</li>`;
  testo('indice.html', pagina('PsyDiary · esportazione', `<h1>PsyDiary · esportazione</h1>
<p class="sotto">Esportata il ${esc(dataIt(il.slice(0, 10)))}${opz.da ? ' da ' + esc(opz.da) : ''}. ${pazienti.length} pazienti, ${gruppi.length} gruppi e classi, ${T.sedute.length} sedute, ${T.note.length} note.</p>
<h2>Pazienti</h2><ul>${pazienti.map((r) => li('r:' + r.id, nomeCompleto(r), 'scheda.html', r.stato === 'concluso' ? ' <span class="sotto">(concluso)</span>' : '')).join('')}</ul>
<h2>Classi</h2><ul>${gruppi.filter((g) => g.tipo === 'classe').map((g) => li('g:' + g.id, g.nome, 'classe.html')).join('') || '<li class="sotto">nessuna</li>'}</ul>
<h2>Gruppi</h2><ul>${gruppi.filter((g) => g.tipo !== 'classe').map((g) => li('g:' + g.id, g.nome, 'gruppo.html')).join('') || '<li class="sotto">nessuno</li>'}</ul>
${aula.length ? '<h2>Aula</h2><ul><li><a href="aula/diario.html">Note sull\'aula</a></li></ul>' : ''}
<h2>Per altri sistemi</h2><ul><li><a href="psydiary.json">psydiary.json</a>: tutto, campo per campo</li><li>tabelle/: un CSV per tipo di dato</li><li><a href="LEGGIMI.txt">LEGGIMI.txt</a></li></ul>`, ''));
  testo('LEGGIMI.txt', leggimi({ il, da: opz.da, pazienti: pazienti.length, gruppi: gruppi.length, sedute: T.sedute.length, note: T.note.length, mancanti: mancanti.size }));

  return { voci, riepilogo: { pazienti: pazienti.length, gruppi: gruppi.length, sedute: T.sedute.length, note: T.note.length, file: [...fileIn.values()].reduce((n, m) => n + m.size, 0), mancanti: [...mancanti] } };
}

function descriviSerie(x) {
  const G = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  const r = x.ripeti || {};
  const quando = r.giorni?.length ? r.giorni.map((g) => G[g]).join(', ') : '';
  const ogni = r.come === 'settimane' ? (r.ogni > 1 ? `ogni ${r.ogni} settimane` : 'ogni settimana') : r.come === 'giorni' ? `ogni ${r.ogni || 1} giorni` : r.come === 'mesi' ? 'ogni mese' : '';
  return [quando, ogni, x.ora ? 'alle ' + x.ora : '', x.dal ? 'dal ' + dataIt(x.dal) : '', x.al ? 'al ' + dataIt(x.al) : x.volte ? x.volte + ' volte' : 'senza fine'].filter(Boolean).join(' · ');
}

function leggimi(n) {
  return `PsyDiary · esportazione completa
================================

Esportata il ${dataIt(n.il.slice(0, 10))}${n.da ? ' da ' + n.da : ''}.
${n.pazienti} pazienti, ${n.gruppi} gruppi e classi, ${n.sedute} sedute, ${n.note} note.
${n.mancanti ? `\nATTENZIONE: ${n.mancanti} file non erano disponibili (mai arrivati al custode): vedi tabelle/allegati.csv.\n` : ''}
Contiene dati clinici. Conservalo cifrato e cancellalo quando non serve più.

DA LEGGERE
  indice.html              aprilo nel browser: porta a tutte le schede e ai diari
  pazienti/<nome>/         scheda.html (anagrafica, famiglia, allegati) e diario.html
  gruppi/<nome>/           gruppo.html o classe.html, con alunni, membri e diario
  aula/                    le note sull'aula in generale
  I file .html si stampano o si salvano in PDF dal browser, e si aprono in Word.

PER ALTRI SISTEMI
  psydiary.json            tutto, campo per campo (formato "${FORMATO}", versione ${VERSIONE})
  pazienti/<nome>/dati.json, gruppi/<nome>/dati.json
                           lo stesso, diviso per paziente e per gruppo
  diario.md                il diario in Markdown, con le immagini come file accanto
  tabelle/*.csv            una tabella per tipo di dato, separatore ";" e codifica UTF-8:
                           pazienti, familiari, gruppi, membri, alunni, sedute,
                           presenze, note, ricorrenze, sospesi, allegati
  */allegati/              i file originali: immagini, PDF, documenti; i genogrammi
                           sono file .genogramma.json di GenoGram Creator (si
                           importano lì com'è)

I CAMPI PRINCIPALI
  pazienti   id, nome, cognome, nascita (AAAA-MM-GG), ... (le etichette sono in
             pazienti.csv), genitori = familiari {nome, relazione, telefono, email}
  gruppi     id, tipo ("classe" o vuoto = gruppo terapeutico), nome, tema, obiettivi,
             membri {ragazzoId, dal, al}, alunni {nome, sesso, nota}
  sedute     id, tipo (gruppo, individuale, genitori, conoscenza), data, ora, durata
             in minuti, ragazzoId o gruppoId, argomento (piano), resoconto,
             presenze {idPaziente: false se assente}, partecipanti {idPaziente: nota}
  note       id, data, categoria, titolo, testo (Markdown), autore, ragazzoId/gruppoId
  Nei testi: "@[Nome](r:id)" è una menzione, "![...](img:id)" un'immagine
  (in diario.md e nei .html sono già sostituite con il nome e con il file).
`;
}
