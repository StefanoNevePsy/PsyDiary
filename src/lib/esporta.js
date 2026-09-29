// Esportazione: Word (.docx) generato sul dispositivo, PDF e carta dalla stampa.
import { lunga } from './date.js';
import { RE_MENZIONE } from './testo.js';

export function stampa() { window.print(); }

/** Markdown semplice → paragrafi docx (titoli, elenchi, caselle, grassetto, corsivo). */
function paragrafi(D, testo) {
  const out = [];
  for (const riga of (testo || '').replace(RE_MENZIONE, '$1').split('\n')) {
    if (!riga.trim()) continue;
    let r = riga, opz = {};
    let m;
    if ((m = /^\s*(#{1,3})\s+(.*)$/.exec(r))) { r = m[2]; opz.heading = [D.HeadingLevel.HEADING_3, D.HeadingLevel.HEADING_4, D.HeadingLevel.HEADING_5][m[1].length - 1]; }
    else if ((m = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(r))) { r = (m[2] === ' ' ? '☐ ' : '☑ ') + m[3]; opz.indent = { left: 360 + m[1].length * 180 }; }
    else if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(r))) { r = m[2]; opz.bullet = { level: Math.min(3, Math.floor(m[1].length / 2)) }; }
    else if ((m = /^(\s*)\d+[.)]\s+(.*)$/.exec(r))) { r = m[0].trim(); }
    else if ((m = /^\s*>\s?(.*)$/.exec(r))) { r = m[1]; opz.indent = { left: 360 }; }
    const runs = [];
    for (const pezzo of r.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/)) {
      if (!pezzo) continue;
      if (/^\*\*.*\*\*$/.test(pezzo)) runs.push(new D.TextRun({ text: pezzo.slice(2, -2), bold: true }));
      else if (/^(\*|_).*(\*|_)$/.test(pezzo)) runs.push(new D.TextRun({ text: pezzo.slice(1, -1), italics: true }));
      else if (/^~~.*~~$/.test(pezzo)) runs.push(new D.TextRun({ text: pezzo.slice(2, -2), strike: true }));
      else runs.push(new D.TextRun(pezzo.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')));
    }
    out.push(new D.Paragraph({ children: runs, spacing: { after: 80 }, ...opz }));
  }
  return out;
}

/**
 * voci: dal diario o dallo storico (già filtrate). titolo: es. "Diario di Luca Martini".
 */
export async function word(titolo, sottotitolo, voci, nomeFile) {
  const D = await import('docx');
  const NOMI = { gruppo: 'Gruppo', individuale: 'Individuale', genitori: 'Genitori', nota: 'Nota' };
  const figli = [
    new D.Paragraph({ children: [new D.TextRun({ text: titolo, font: 'Georgia', size: 44 })], spacing: { after: 120 } }),
    new D.Paragraph({ children: [new D.TextRun({ text: sottotitolo, color: '5A6070', size: 20 })], spacing: { after: 360 } }),
  ];
  for (const v of voci) {
    figli.push(new D.Paragraph({
      heading: D.HeadingLevel.HEADING_2, spacing: { before: 320, after: 80 },
      children: [new D.TextRun({ text: `${lunga(v.data, true)}${v.ora ? ', ' + v.ora : ''} · ${NOMI[v.tipo]} · ${v.titolo}` })],
    }));
    for (const b of v.blocchi) {
      if (b.etichetta) figli.push(new D.Paragraph({ children: [new D.TextRun({ text: b.etichetta.toUpperCase(), size: 16, bold: true, color: 'A8412A' })], spacing: { before: 120, after: 40 } }));
      figli.push(...paragrafi(D, b.testo));
    }
    if (v.tags.length) figli.push(new D.Paragraph({ children: [new D.TextRun({ text: v.tags.map((t) => '#' + t).join('  '), color: 'A8412A', size: 18 })] }));
  }
  const doc = new D.Document({
    creator: 'PsyDiary', title: titolo,
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{ properties: {}, children: figli }],
  });
  const blob = await D.Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeFile + '.docx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
