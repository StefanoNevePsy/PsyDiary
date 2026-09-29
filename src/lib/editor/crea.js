// Editor markdown con anteprima dal vivo (CodeMirror 6).
// Il testo resta markdown puro: portabile, esportabile, leggibile ovunque.
import { EditorState, RangeSetBuilder, Prec, EditorSelection } from '@codemirror/state';
import { EditorView, keymap, placeholder as segnaposto, Decoration, ViewPlugin, WidgetType, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { markdown, markdownLanguage, insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown';
import { syntaxTree, syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { autocompletion, completionKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';

// ---------------------------------------------------------------------------
// Comandi (usati da scorciatoie e barra degli strumenti)
function avvolgi(segno) {
  return (view) => {
    const { state } = view;
    const tr = state.changeByRange((r) => {
      const prima = state.sliceDoc(r.from - segno.length, r.from);
      const dopo = state.sliceDoc(r.to, r.to + segno.length);
      // cursore subito prima del segno di chiusura: si esce dal grassetto/corsivo
      if (r.empty && dopo === segno && prima !== segno) return { range: EditorSelection.cursor(r.to + segno.length) };
      if (prima === segno && dopo === segno) {
        return { changes: [{ from: r.from - segno.length, to: r.from }, { from: r.to, to: r.to + segno.length }], range: EditorSelection.range(r.from - segno.length, r.to - segno.length) };
      }
      return { changes: [{ from: r.from, insert: segno }, { from: r.to, insert: segno }], range: EditorSelection.range(r.from + segno.length, r.to + segno.length) };
    });
    view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}
const PREFISSI = {
  elenco: { re: /^(\s*)[-*+]\s+(?!\[[ xX]\])/, nuovo: '- ' },
  numeri: { re: /^(\s*)\d+[.)]\s+/, nuovo: '1. ' },
  compiti: { re: /^(\s*)[-*+]\s+\[[ xX]\]\s+/, nuovo: '- [ ] ' },
  citazione: { re: /^(\s*)>\s?/, nuovo: '> ' },
  h1: { re: /^#\s+/, nuovo: '# ' },
  h2: { re: /^##\s+/, nuovo: '## ' },
  h3: { re: /^###\s+/, nuovo: '### ' },
};
const TUTTI = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?|#{1,6}\s+)/;
function prefisso(tipo) {
  return (view) => {
    const { state } = view;
    const p = PREFISSI[tipo];
    const righe = new Set();
    for (const r of state.selection.ranges) for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) righe.add(n);
    const tutteHanno = [...righe].every((n) => p.re.test(state.doc.line(n).text));
    const changes = [];
    for (const n of righe) {
      const riga = state.doc.line(n);
      const m = TUTTI.exec(riga.text);
      const rientro = m ? m[1] : (/^\s*/.exec(riga.text)[0]);
      const toglie = m ? m[0].length : rientro.length;
      changes.push({ from: riga.from, to: riga.from + toglie, insert: tutteHanno ? rientro : rientro + p.nuovo });
    }
    view.dispatch({ changes, userEvent: 'input' });
    return true;
  };
}
function collegamento(view) {
  const { state } = view;
  const r = state.selection.main;
  const testo = state.sliceDoc(r.from, r.to) || 'testo';
  const ins = `[${testo}](https://)`;
  view.dispatch({ changes: { from: r.from, to: r.to, insert: ins }, selection: { anchor: r.from + testo.length + 3, head: r.from + ins.length - 1 }, userEvent: 'input' });
  return true;
}
function spuntaRiga(view) {
  const riga = view.state.doc.lineAt(view.state.selection.main.head);
  const m = /\[([ xX])\]/.exec(riga.text);
  if (!m || !/^\s*[-*+]\s+\[/.test(riga.text)) return false;
  const pos = riga.from + m.index + 1;
  view.dispatch({ changes: { from: pos, to: pos + 1, insert: m[1] === ' ' ? 'x' : ' ' } });
  return true;
}
/** Invio: continua elenchi e citazioni; su una voce vuota esce dall'elenco (o risale di un livello). */
function invio(view) {
  const { state } = view;
  const r = state.selection.main;
  if (r.empty) {
    const riga = state.doc.lineAt(r.head);
    const m = /^(\s*)([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)$/.exec(riga.text);
    if (m && r.head === riga.to) {
      const rientro = m[1];
      // in cima: riga vuota di stacco, così il testo dopo non finisce dentro l'ultima voce
      const nuovo = rientro.length >= 2 ? rientro.slice(2) + m[2] : '\n';
      view.dispatch({ changes: { from: riga.from, to: riga.to, insert: nuovo }, selection: { anchor: riga.from + nuovo.length }, userEvent: 'input' });
      return true;
    }
  }
  return insertNewlineContinueMarkup(view);
}
export const COMANDI = {
  grassetto: avvolgi('**'),
  corsivo: avvolgi('*'),
  barrato: avvolgi('~~'),
  elenco: prefisso('elenco'),
  numeri: prefisso('numeri'),
  compiti: prefisso('compiti'),
  citazione: prefisso('citazione'),
  h1: prefisso('h1'), h2: prefisso('h2'), h3: prefisso('h3'),
  collegamento,
  spunta: spuntaRiga,
  tag: (view) => { const r = view.state.selection.main; view.dispatch({ changes: { from: r.from, insert: '#' }, selection: { anchor: r.from + 1 } }); return true; },
  menzione: (view) => { const r = view.state.selection.main; view.dispatch({ changes: { from: r.from, insert: '@' }, selection: { anchor: r.from + 1 } }); return true; },
};
export const SCORCIATOIE = [
  { key: 'Mod-b', run: COMANDI.grassetto },
  { key: 'Mod-i', run: COMANDI.corsivo },
  { key: 'Mod-Shift-x', run: COMANDI.barrato },
  { key: 'Mod-k', run: COMANDI.collegamento },
  { key: 'Mod-Shift-7', run: COMANDI.numeri },
  { key: 'Mod-Shift-8', run: COMANDI.elenco },
  { key: 'Mod-Shift-9', run: COMANDI.compiti },
  { key: 'Mod-Shift-.', run: COMANDI.citazione },
  { key: 'Mod-Alt-1', run: COMANDI.h1 },
  { key: 'Mod-Alt-2', run: COMANDI.h2 },
  { key: 'Mod-Alt-3', run: COMANDI.h3 },
  { key: 'Mod-Enter', run: COMANDI.spunta },
  { key: 'Enter', run: invio },
  { key: 'Backspace', run: deleteMarkupBackward },
  { key: 'Tab', run: (v) => acceptCompletion(v) || indentMore(v) },
  { key: 'Shift-Tab', run: indentLess },
];

// ---------------------------------------------------------------------------
// Anteprima dal vivo: i segni del markdown spariscono fuori dalla riga in cui
// si scrive; elenchi, caselle, tag e menzioni diventano già quello che sono.
class Pallino extends WidgetType {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-pallino'; s.textContent = '•'; return s; }
  ignoreEvent() { return false; }
}
class Casella extends WidgetType {
  constructor(fatto, pos) { super(); this.fatto = fatto; this.pos = pos; }
  eq(o) { return o.fatto === this.fatto && o.pos === this.pos; }
  toDOM(view) {
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = this.fatto; c.className = 'cm-casella'; c.setAttribute('aria-label', 'Fatto');
    c.addEventListener('mousedown', (e) => e.preventDefault());
    c.addEventListener('click', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.fatto ? ' ' : 'x' } });
    });
    return c;
  }
  ignoreEvent() { return true; }
}
class Menzione extends WidgetType {
  constructor(nome) { super(); this.nome = nome; }
  eq(o) { return o.nome === this.nome; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-menzione'; s.textContent = this.nome; return s; }
}
const nascondi = Decoration.replace({});
const RE_TAG = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]{1,39})/gu;
const RE_MENZIONE = /@\[([^\]\n]{1,60})\]\(r:([a-z0-9]{4,32})\)/g;

function decorazioni(view, nomi) {
  const { state } = view;
  const sel = state.selection;
  const toccata = (from, to) => sel.ranges.some((r) => r.from <= to && r.to >= from);
  const rigaToccata = (pos) => { const l = state.doc.lineAt(pos); return toccata(l.from, l.to); };
  const decos = [];
  const add = (from, to, d) => decos.push(d.range(from, to));
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: (n) => {
        const nome = n.name;
        if (/^ATXHeading(\d)$/.test(nome)) {
          const liv = +nome.slice(-1);
          add(n.from, n.from, Decoration.line({ class: 'cm-titolo cm-h' + Math.min(liv, 3) }));
        } else if (nome === 'HeaderMark') {
          if (!rigaToccata(n.from)) add(n.from, Math.min(n.to + 1, state.doc.lineAt(n.from).to), nascondi);
        } else if (nome === 'EmphasisMark' || nome === 'StrikethroughMark' || nome === 'CodeMark') {
          const p = n.node.parent;
          if (p && !toccata(p.from, p.to)) add(n.from, n.to, nascondi);
        } else if (nome === 'QuoteMark') {
          add(state.doc.lineAt(n.from).from, state.doc.lineAt(n.from).from, Decoration.line({ class: 'cm-citaz' }));
          if (!rigaToccata(n.from)) add(n.from, Math.min(n.to + 1, state.doc.lineAt(n.from).to), nascondi);
        } else if (nome === 'ListMark') {
          const riga = state.doc.lineAt(n.from);
          const testo = state.sliceDoc(n.from, n.to);
          const compito = /^\s*\[[ xX]\]/.test(state.sliceDoc(n.to + 1, n.to + 5));
          if (compito) { if (!toccata(n.from, n.to + 5)) add(n.from, n.to + 1, nascondi); }
          else if (/^[-*+]$/.test(testo) && !toccata(n.from, n.to)) add(n.from, n.to, Decoration.replace({ widget: new Pallino() }));
          void riga;
        } else if (nome === 'TaskMarker') {
          if (!toccata(n.from, n.to)) add(n.from, n.to, Decoration.replace({ widget: new Casella(/x/i.test(state.sliceDoc(n.from, n.to)), n.from) }));
          const riga = state.doc.lineAt(n.from);
          if (/\[[xX]\]/.test(state.sliceDoc(n.from, n.to)) && n.to + 1 < riga.to) add(n.to + 1, riga.to, Decoration.mark({ class: 'cm-fatto' }));
        } else if (nome === 'Link') {
          const url = n.node.getChild('URL');
          const u = url ? state.sliceDoc(url.from, url.to) : '';
          if (u.startsWith('r:')) return false; // le menzioni le gestisce il passaggio sotto
          if (!toccata(n.from, n.to)) {
            const marks = n.node.getChildren('LinkMark');
            if (marks.length >= 2) {
              add(marks[0].from, marks[0].to, nascondi);
              add(marks[1].from, n.to, nascondi);
              add(marks[0].to, marks[1].from, Decoration.mark({ class: 'cm-link' }));
            }
          }
        } else if (nome === 'HorizontalRule') {
          add(n.from, n.from, Decoration.line({ class: 'cm-riga-hr' }));
        } else if (nome === 'InlineCode' || nome === 'FencedCode' || nome === 'CodeBlock') {
          return false;
        }
        return undefined;
      },
    });
    const testo = state.sliceDoc(from, to);
    for (const m of testo.matchAll(RE_MENZIONE)) {
      const a = from + m.index, b = a + m[0].length;
      if (!toccata(a, b)) add(a, b, Decoration.replace({ widget: new Menzione(nomi()[m[2]] || m[1]) }));
      else add(a, b, Decoration.mark({ class: 'cm-menzione-src' }));
    }
    for (const m of testo.matchAll(RE_TAG)) {
      const a = from + m.index + m[1].length;
      add(a, a + m[2].length + 1, Decoration.mark({ class: 'cm-tag' }));
    }
  }
  decos.sort((x, y) => x.from - y.from || x.value.startSide - y.value.startSide);
  const b = new RangeSetBuilder();
  let ultimo = -1;
  for (const d of decos) {
    // le sostituzioni non possono sovrapporsi
    if (d.value.point && d.from < ultimo) continue;
    b.add(d.from, d.to, d.value);
    if (d.value.point) ultimo = d.to;
  }
  return b.finish();
}
function anteprimaDalVivo(nomi) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = decorazioni(view, nomi); }
    update(u) { if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) this.decorations = decorazioni(u.view, nomi); }
  }, { decorations: (v) => v.decorations });
}

// ---------------------------------------------------------------------------
const evidenzia = HighlightStyle.define([
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--inchiostro-2)' },
  { tag: t.heading, fontFamily: 'var(--f-display)', fontWeight: '400' },
  { tag: t.monospace, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.92em' },
  { tag: [t.processingInstruction, t.meta, t.url], color: 'var(--inchiostro-3)' },
  { tag: t.quote, color: 'var(--inchiostro-2)', fontStyle: 'italic' },
]);
const tema = EditorView.theme({
  '&': { color: 'var(--inchiostro)', backgroundColor: 'transparent', fontSize: 'var(--t-nota)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--f-testo)', lineHeight: '1.6', overflow: 'visible' },
  '.cm-content': { padding: '4px 0', caretColor: 'var(--spot)', maxWidth: 'var(--misura)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--spot)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--spot-tenue) !important' },
  '.cm-placeholder': { color: 'var(--inchiostro-3)', fontStyle: 'italic' },
  '.cm-titolo': { fontFamily: 'var(--f-display)', lineHeight: '1.2', paddingTop: '6px' },
  '.cm-h1': { fontSize: '1.6em' }, '.cm-h2': { fontSize: '1.3em' }, '.cm-h3': { fontSize: '1.1em' },
  '.cm-pallino': { color: 'var(--spot)', fontWeight: '700', display: 'inline-block', width: '0.9em' },
  '.cm-casella': { accentColor: 'var(--spot)', margin: '0 6px 0 0', transform: 'translateY(2px)', cursor: 'pointer', width: '15px', height: '15px' },
  '.cm-fatto': { color: 'var(--inchiostro-2)', textDecoration: 'line-through', textDecorationColor: 'var(--spot)' },
  '.cm-citaz': { borderLeft: '1.5px solid var(--matita-forte)', paddingLeft: '12px !important', color: 'var(--inchiostro-2)', fontStyle: 'italic' },
  '.cm-tag': { background: 'var(--spot-tenue)', borderRadius: '2px', padding: '0 2px', fontWeight: '600' },
  '.cm-menzione': { fontFamily: 'var(--f-display)', backgroundImage: 'linear-gradient(var(--spot), var(--spot))', backgroundSize: '100% 1.5px', backgroundPosition: '0 100%', backgroundRepeat: 'no-repeat' },
  '.cm-menzione-src': { color: 'var(--inchiostro-2)' },
  '.cm-link': { textDecoration: 'underline', textDecorationColor: 'var(--spot)', textUnderlineOffset: '3px' },
  '.cm-riga-hr': { borderBottom: '1px dashed var(--matita-forte)' },
  '.cm-tooltip': { background: 'var(--carta-2)', border: '1px solid var(--matita-forte)', borderRadius: '2px', boxShadow: 'var(--ombra)' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--f-testo)', maxHeight: '14em' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--inchiostro)', color: 'var(--su-inchiostro)' },
  '.cm-completionDetail': { fontStyle: 'normal', color: 'inherit', opacity: '.7', marginLeft: '8px' },
});

// ---------------------------------------------------------------------------
/**
 * opz: { testo, alCambio(testo), segnaposto, etichetta, soloLettura,
 *        tag() → [string], ragazzi() → [{id, nome}], nomi() → {id: nome}, alFocus(bool) }
 */
export function creaEditor(parent, opz) {
  const completaTag = (ctx) => {
    const m = ctx.matchBefore(/(^|[\s(])#[\p{L}\p{N}_-]*/u);
    if (!m) return null;
    const inizio = m.from + m.text.indexOf('#') + 1;
    return { from: inizio, options: (opz.tag ? opz.tag() : []).map((x) => ({ label: x, type: 'keyword', detail: 'tag' })), validFor: /^[\p{L}\p{N}_-]*$/u };
  };
  const completaMenzione = (ctx) => {
    const m = ctx.matchBefore(/@[\p{L}' ]{0,30}/u);
    if (!m || (m.from > 0 && /\S/.test(ctx.state.sliceDoc(m.from - 1, m.from)))) return null;
    return {
      from: m.from,
      options: (opz.ragazzi ? opz.ragazzi() : []).map((r) => ({ label: '@' + r.nome, apply: `@[${r.nome}](r:${r.id})`, detail: r.dettaglio || '', type: 'variable' })),
      validFor: /^@[\p{L}' ]*$/u,
    };
  };
  const estensioni = [
    history(),
    drawSelection(),
    indentUnit.of('  '),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, addKeymap: false }),
    syntaxHighlighting(evidenzia),
    anteprimaDalVivo(opz.nomi || (() => ({}))),
    autocompletion({ override: [completaTag, completaMenzione], icons: false, activateOnTyping: true }),
    Prec.high(keymap.of([...SCORCIATOIE, ...completionKeymap])),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    tema,
    EditorView.contentAttributes.of({ 'aria-label': opz.etichetta || 'Testo', 'aria-multiline': 'true', spellcheck: 'true', lang: 'it', autocapitalize: 'sentences' }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && opz.alCambio) opz.alCambio(u.state.doc.toString());
      if (u.focusChanged && opz.alFocus) opz.alFocus(u.view.hasFocus);
    }),
  ];
  if (opz.segnaposto) estensioni.push(segnaposto(opz.segnaposto));
  if (opz.soloLettura) estensioni.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
  const view = new EditorView({ parent, state: EditorState.create({ doc: opz.testo || '', extensions: estensioni }) });
  return {
    view,
    esegui(nome) { const c = COMANDI[nome]; if (c) { c(view); view.focus(); } },
    imposta(testo) {
      if (testo === view.state.doc.toString()) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: testo || '' } });
    },
    fuoco() { view.focus(); view.dispatch({ selection: { anchor: view.state.doc.length } }); },
    distruggi() { view.destroy(); },
  };
}
