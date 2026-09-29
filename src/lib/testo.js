// Tag (#parola), menzioni (@[Nome](r:id)) e resa sicura del markdown.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export const RE_TAG = /(^|[\s(>[\-*])#([\p{L}\p{N}][\p{L}\p{N}_-]{1,39})/gu;
export const RE_MENZIONE = /@\[([^\]\n]{1,60})\]\(r:([a-z0-9]{4,32})\)/g;
export const RE_IMMAGINE = /!\[([^\]\n]*)\]\(img:([a-z0-9]{4,32})\)/g;
/** Id delle immagini citate nel testo. */
export const immaginiDi = (testo) => [...(testo || '').matchAll(RE_IMMAGINE)].map((m) => m[2]);

/** Tag presenti in un testo, in minuscolo e senza doppioni. */
export function tagDi(testo) {
  const out = new Set();
  if (!testo) return [];
  for (const m of testo.matchAll(RE_TAG)) out.add(m[2].toLowerCase());
  return [...out];
}
/** Id dei ragazzi menzionati. */
export function menzioniDi(testo) {
  const out = new Set();
  if (!testo) return [];
  for (const m of testo.matchAll(RE_MENZIONE)) out.add(m[2]);
  return [...out];
}
/** Testo semplice (per anteprime e ricerca). */
export function semplice(testo) {
  return (testo || '')
    .replace(RE_IMMAGINE, ' ')
    .replace(RE_MENZIONE, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
export function anteprima(testo, n = 140) {
  const s = semplice(testo);
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
}
/** Voci della checklist non spuntate. */
export function daFare(testo) {
  return [...(testo || '').matchAll(/^\s*[-*+]\s+\[ \]\s+(.+)$/gm)].map((m) => m[1].trim());
}

marked.setOptions({ gfm: true, breaks: true });

/**
 * Markdown → HTML sicuro, con tag e menzioni resi come elementi cliccabili e
 * le caselle della checklist attive (data-riga = numero della riga nel testo).
 */
export function html(testo, nomi = {}) {
  if (!testo || !testo.trim()) return '';
  let righe = 0;
  const conMenzioni = testo
    .replace(RE_IMMAGINE, (_, alt, id) => `<span class="immagine" data-img="${id}" data-alt="${escape(alt)}"></span>`)
    .replace(RE_MENZIONE, (_, nome, id) => `<a class="menzione" href="#/ragazzo/${id}">${escape(nomi[id] || nome)}</a>`);
  let h = marked.parse(conMenzioni);
  // caselle: marked le rende disabilitate; si numerano per poterle spuntare
  const posizioni = [...testo.matchAll(/^\s*[-*+]\s+\[[ xX]\]/gm)].map((m) => testo.slice(0, m.index).split('\n').length - 1);
  h = h.replace(/<li>(\s*)<input (checked="" )?disabled="" type="checkbox">/g, (_, sp, sp2) => {
    const riga = posizioni[righe++];
    return `<li class="compito">${sp}<input data-riga="${riga}" data-fatto="${sp2 ? 1 : 0}" aria-label="Fatto">`;
  });
  // tag fuori dai tag HTML
  h = h.replace(/(^|>)([^<]+)/g, (m, a, t) => a + t.replace(RE_TAG, (x, p, tag) => `${p}<button type="button" class="tag" data-tag="${tag.toLowerCase()}">${tag}</button>`));
  const pulito = DOMPurify.sanitize(h, { ADD_ATTR: ['data-riga', 'data-fatto', 'data-tag', 'data-img', 'data-alt', 'target'], ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#\/)/i });
  // DOMPurify toglie type/checked dagli input: si rimettono dopo, su testo già ripulito
  return pulito.replace(/<input data-riga="(\d+)" data-fatto="([01])"/g, (_, r, f) => `<input type="checkbox"${f === '1' ? ' checked' : ''} data-riga="${r}"`);
}
/** Spunta/togli la casella alla riga indicata. */
export function spunta(testo, riga) {
  const r = testo.split('\n');
  if (r[riga] == null) return testo;
  r[riga] = /\[ \]/.test(r[riga]) ? r[riga].replace('[ ]', '[x]') : r[riga].replace(/\[[xX]\]/, '[ ]');
  return r.join('\n');
}
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
