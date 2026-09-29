// Editor "come un normale programma di scrittura" (TipTap/ProseMirror):
// si vede la formattazione, mai i simboli. Sotto il cofano il testo resta
// markdown puro, portabile ed esportabile.
import { Editor, Extension, InputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { Markdown } from '@tiptap/markdown';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Suggestion from '@tiptap/suggestion';
import { urlImmagine, scegliImmagine, salvaImmagine } from '../immagini.js';
import { maschera } from '../maschere.js';

const RE_TAG = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]{1,39})/gu;

// ---------------------------------------------------------------------------
// Tendina dei suggerimenti (per @ragazzi e #tag), senza librerie
function tendina(etichetta) {
  let el = null, voci = [], sel = 0, comando = null;
  const disegna = () => {
    el.innerHTML = '';
    if (!voci.length) { el.hidden = true; return; }
    el.hidden = false;
    voci.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sugg-voce'; b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(i === sel));
      b.innerHTML = `<span class="sugg-nome"></span>${v.dettaglio ? '<span class="sugg-dett"></span>' : ''}`;
      b.firstChild.textContent = v.etichetta;
      if (v.dettaglio) b.lastChild.textContent = v.dettaglio;
      b.onmousedown = (e) => { e.preventDefault(); comando(v); };
      el.appendChild(b);
    });
  };
  const posiziona = (rect) => {
    const r = rect?.(); if (!r) return;
    const alto = window.innerHeight - r.bottom < 220;
    el.style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
    el.style.top = (alto ? r.top - el.offsetHeight - 6 : r.bottom + 6) + 'px';
  };
  return {
    onStart(p) {
      el = document.createElement('div');
      el.className = 'sugg'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', etichetta);
      document.body.appendChild(el);
      voci = p.items; sel = 0; comando = p.command; disegna(); posiziona(p.clientRect);
    },
    onUpdate(p) { voci = p.items; sel = 0; comando = p.command; disegna(); posiziona(p.clientRect); },
    onKeyDown({ event }) {
      if (!voci.length) return false;
      if (event.key === 'ArrowDown') { sel = (sel + 1) % voci.length; disegna(); return true; }
      if (event.key === 'ArrowUp') { sel = (sel - 1 + voci.length) % voci.length; disegna(); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { comando(voci[sel]); return true; }
      if (event.key === 'Escape') { el.hidden = true; return true; }
      return false;
    },
    onExit() { el?.remove(); el = null; },
  };
}

// ---------------------------------------------------------------------------
// @menzione di un ragazzo: nel testo diventa @[Nome](r:id)
const Menzione = Mention.extend({
  markdownTokenName: 'menzione',
  markdownTokenizer: {
    name: 'menzione',
    level: 'inline',
    start: (src) => src.indexOf('@['),
    tokenize(src) {
      const m = /^@\[([^\]\n]{1,60})\]\(r:([a-z0-9]{4,32})\)/.exec(src);
      if (m) return { type: 'menzione', raw: m[0], label: m[1], id: m[2] };
    },
  },
  parseMarkdown: (token, h) => h.createNode('mention', { id: token.id, label: token.label }),
  renderMarkdown: (node) => `@[${node.attrs?.label || ''}](r:${node.attrs?.id || ''})`,
});

// #tag: testo normale, evidenziato mentre si scrive
const Tag = Extension.create({
  name: 'evidenziaTag',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('tag'),
      props: {
        decorations(state) {
          const dec = [];
          state.doc.descendants((n, pos) => {
            if (!n.isText) return;
            for (const m of n.text.matchAll(RE_TAG)) {
              const da = pos + m.index + m[1].length;
              dec.push(Decoration.inline(da, da + m[2].length + 1, { class: 'ed-tag' }));
            }
          });
          return DecorationSet.create(state.doc, dec);
        },
      },
    })];
  },
});
// suggerimenti per i tag, con il # come innesco
const SuggerisciTag = Extension.create({
  name: 'suggerisciTag',
  addOptions: () => ({ tag: () => [] }),
  addProseMirrorPlugins() {
    return [Suggestion({
      editor: this.editor,
      pluginKey: new PluginKey('suggerisciTag'),
      char: '#',
      allowSpaces: false,
      items: ({ query }) => {
        const q = query.toLowerCase();
        const tutti = this.options.tag().filter((t) => t.startsWith(q)).slice(0, 6);
        return tutti.map((t) => ({ id: t, etichetta: '#' + t }));
      },
      command: ({ editor, range, props }) => editor.chain().focus().insertContentAt(range, '#' + props.id + ' ').run(),
      render: () => tendina('Tag'),
    })];
  },
});

// Immagini salvate sul dispositivo: src "img:ID", mostrate in bicromia
const Figura = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), src: { default: null }, alt: { default: '' } };
  },
  addNodeView() {
    return ({ node }) => {
      const fig = document.createElement('span');
      fig.className = 'ed-figura';
      fig.contentEditable = 'false';
      const duo = document.createElement('span');
      duo.className = 'duo-ed';
      const id = String(node.attrs.src || '').replace(/^img:/, '');
      duo.style.setProperty('--maschera', maschera('foglio', id));
      const img = document.createElement('img');
      img.alt = node.attrs.alt || '';
      duo.appendChild(img);
      fig.appendChild(duo);
      if (id) urlImmagine(id).then((u) => { if (u) img.src = u; });
      return { dom: fig };
    };
  },
});

// Scorciatoie "da tastiera", come in un programma di videoscrittura
const Tasti = Extension.create({
  name: 'tastiPsy',
  addKeyboardShortcuts() {
    const e = this.editor;
    return {
      'Mod-Shift-8': () => e.chain().focus().toggleBulletList().run(),
      'Mod-Shift-7': () => e.chain().focus().toggleOrderedList().run(),
      'Mod-Shift-9': () => e.chain().focus().toggleTaskList().run(),
      'Mod-Shift-.': () => e.chain().focus().toggleBlockquote().run(),
      'Mod-Alt-1': () => e.chain().focus().toggleHeading({ level: 1 }).run(),
      'Mod-Alt-2': () => e.chain().focus().toggleHeading({ level: 2 }).run(),
      'Mod-Alt-3': () => e.chain().focus().toggleHeading({ level: 3 }).run(),
      'Mod-Alt-0': () => e.chain().focus().setParagraph().run(),
      'Mod-Enter': () => {
        const { $from } = e.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const n = $from.node(d);
          if (n.type.name === 'taskItem') {
            return e.chain().command(({ tr }) => { tr.setNodeMarkup($from.before(d), undefined, { ...n.attrs, checked: !n.attrs.checked }); return true; }).run();
          }
        }
        return false;
      },
    };
  },
  addInputRules() {
    // "[ ] " o "[] " a inizio riga: casella da fare
    return [new InputRule({
      find: /^\s*\[( |x)?\]\s$/,
      handler: ({ range, chain, match }) => {
        chain().deleteRange(range).toggleTaskList().command(({ tr, state }) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'taskItem') { tr.setNodeMarkup($from.before(d), undefined, { checked: match[1] === 'x' }); break; }
          return true;
        }).run();
      },
    })];
  },
});

// ---------------------------------------------------------------------------
// paragrafi vuoti in coda (li aggiunge l'editor dopo un'immagine) e spazi finali
const pulisci = (md) => md.replace(/(\n*(&nbsp;|\u00a0)\s*)+$/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trimEnd();

export function creaEditor(parent, opz) {
  const menzione = Menzione.configure({
    HTMLAttributes: { class: 'ed-menzione' },
    renderText: ({ node }) => node.attrs.label,
    renderHTML: ({ node, options }) => ['span', { ...options.HTMLAttributes, 'data-id': node.attrs.id }, node.attrs.label],
    suggestion: {
      char: '@',
      items: ({ query }) => {
        const q = query.toLowerCase();
        return opz.ragazzi().filter((r) => (r.nome + ' ' + r.dettaglio).toLowerCase().includes(q)).slice(0, 6)
          .map((r) => ({ id: r.id, label: r.nome, etichetta: r.dettaglio, dettaglio: '' }));
      },
      command: ({ editor, range, props }) => editor.chain().focus().insertContentAt(range, [
        { type: 'mention', attrs: { id: props.id, label: props.label } }, { type: 'text', text: ' ' },
      ]).run(),
      render: () => tendina('Ragazzi'),
    },
  });

  let ultimo = opz.testo || '';
  const ed = new Editor({
    element: parent,
    editable: !opz.soloLettura,
    content: ultimo,
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false, underline: false, link: { openOnClick: false, autolink: true } }),
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: opz.segnaposto || '' }),
      Figura.configure({ inline: false, allowBase64: false }),
      menzione, Tag, SuggerisciTag.configure({ tag: opz.tag }), Tasti,
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    editorProps: {
      attributes: { 'aria-label': opz.etichetta || 'Testo', 'aria-multiline': 'true', role: 'textbox', class: 'ed-testo md' },
      handleDrop: (view, event) => incolla(event.dataTransfer?.files),
      handlePaste: (view, event) => incolla(event.clipboardData?.files),
    },
    onUpdate: ({ editor }) => {
      const md = pulisci(editor.getMarkdown());
      if (md === ultimo) return;
      ultimo = md;
      opz.alCambio(md);
    },
    onFocus: () => opz.alFocus?.(true),
    onBlur: () => opz.alFocus?.(false),
    onTransaction: () => opz.alStato?.(),
  });

  if (import.meta.env.DEV) (window.__editori ||= new Set()).add(ed);
  function incolla(files) {
    const imgs = [...(files || [])].filter((f) => /^image\//.test(f.type));
    if (!imgs.length) return false;
    (async () => { for (const f of imgs) inserisciImmagine(await salvaImmagine(f)); })().catch((e) => alert(e.message));
    return true;
  }
  function inserisciImmagine(id) {
    if (!id) return;
    ed.chain().focus().insertContent({ type: 'image', attrs: { src: 'img:' + id, alt: '' } }).run();
  }

  const c = () => ed.chain().focus();
  const COMANDI = {
    grassetto: () => c().toggleBold().run(),
    corsivo: () => c().toggleItalic().run(),
    barrato: () => c().toggleStrike().run(),
    h1: () => c().toggleHeading({ level: 1 }).run(),
    h2: () => c().toggleHeading({ level: 2 }).run(),
    h3: () => c().toggleHeading({ level: 3 }).run(),
    elenco: () => c().toggleBulletList().run(),
    numeri: () => c().toggleOrderedList().run(),
    compiti: () => c().toggleTaskList().run(),
    citazione: () => c().toggleBlockquote().run(),
    tag: () => c().insertContent('#').run(),
    menzione: () => c().insertContent('@').run(),
    collegamento: () => {
      const prima = ed.getAttributes('link').href || 'https://';
      const url = prompt('Indirizzo del collegamento', prima);
      if (url === null) return;
      if (!url.trim() || url === 'https://') c().unsetLink().run();
      else c().extendMarkRange('link').setLink({ href: url.trim() }).run();
    },
    immagine: () => scegliImmagine().then(inserisciImmagine).catch((e) => alert(e.message)),
  };
  const ATTIVI = {
    grassetto: () => ed.isActive('bold'), corsivo: () => ed.isActive('italic'), barrato: () => ed.isActive('strike'),
    h2: () => ed.isActive('heading'), elenco: () => ed.isActive('bulletList'), numeri: () => ed.isActive('orderedList'),
    compiti: () => ed.isActive('taskList'), citazione: () => ed.isActive('blockquote'), collegamento: () => ed.isActive('link'),
  };

  return {
    editor: ed,
    esegui: (nome) => COMANDI[nome]?.(),
    attivo: (nome) => ATTIVI[nome]?.() || false,
    imposta(testo) {
      if ((testo || '') === ultimo) return;
      ultimo = testo || '';
      const { from, to } = ed.state.selection;
      ed.commands.setContent(ultimo, { contentType: 'markdown', emitUpdate: false });
      if (ed.isFocused) {
        const max = ed.state.doc.content.size - 1;
        ed.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      }
    },
    modificabile: (si) => { if (ed.isEditable !== si) ed.setEditable(si, false); },
    fuoco: () => ed.commands.focus('end'),
    distruggi: () => ed.destroy(),
  };
}
