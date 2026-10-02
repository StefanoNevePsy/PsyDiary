// Gli alunni di una classe: solo nome, sesso e una nota, dentro la classe
// stessa (non sono pazienti e non compaiono nell'elenco dei pazienti).
// Viaggiano con la classe: riservati se la classe è riservata.

export const SESSI = [{ valore: 'F', etichetta: 'F' }, { valore: 'M', etichetta: 'M' }, { valore: '', etichetta: '–' }];

const id = () => 'al' + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 9);

/**
 * Righe incollate (una per alunno) → alunni. In fondo alla riga si può
 * scrivere il sesso: "Rossi Giulia F", "Bianchi Marco (M)", "Verdi Ada - f".
 */
export function daElenco(testo) {
  return String(testo || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map((r) => {
    const m = /^(.*?)[\s,;(-]+\(?([FfMm])\)?$/.exec(r);
    const nome = (m ? m[1] : r).replace(/[\s,;-]+$/, '').trim();
    return { id: id(), nome, sesso: m ? m[2].toUpperCase() : '', nota: '' };
  }).filter((a) => a.nome);
}
export const nuovoAlunno = (nome, sesso = '') => ({ id: id(), nome: String(nome || '').trim(), sesso, nota: '' });

/** "24 alunni · 12 F · 11 M" */
export function conteggio(alunni) {
  const l = alunni || [], f = l.filter((a) => a.sesso === 'F').length, m = l.filter((a) => a.sesso === 'M').length;
  return [`${l.length} ${l.length === 1 ? 'alunno' : 'alunni'}`, f ? f + ' F' : '', m ? m + ' M' : ''].filter(Boolean).join(' · ');
}

/**
 * Un genogramma di partenza per GenoGram Creator: gli alunni disposti in
 * file, come i banchi, pronti per tracciare le relazioni della classe.
 */
export function genogrammaDiClasse(g) {
  const alunni = [...(g.alunni || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const n = alunni.length, colonne = Math.max(3, Math.ceil(Math.sqrt(n * 1.6))), righe = Math.ceil(n / colonne);
  const DX = 150, DY = 160, x0 = 4000 - ((colonne - 1) * DX) / 2, y0 = 4000 - ((righe - 1) * DY) / 2;
  const nodes = alunni.map((a, i) => ({
    id: a.id, x: Math.round(x0 + (i % colonne) * DX), y: Math.round(y0 + Math.floor(i / colonne) * DY),
    gender: a.sesso === 'F' ? 'F' : a.sesso === 'M' ? 'M' : 'Unknown', name: a.nome, birthDate: '', deceased: false,
    indexPerson: false, substanceAbuse: false, mentalIssue: false, physicalIssue: false, recovery: false, gayLesbian: false,
    notes: a.nota ? [{ id: 'n' + a.id, text: a.nota, date: '' }] : [],
  }));
  return {
    id: 'classe_' + g.id, titolo: 'Relazioni · ' + (g.nome || 'classe'), modificato: Date.now(),
    data: { nodes, edges: [], groups: [], presets: [], stickyNotes: [], structuralMaps: [] },
  };
}
