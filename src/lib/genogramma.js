// Genogrammi di GenoGram Creator, ridisegnati da PsyDiary nel suo stile.
//
// GenoGram Creator salva ogni genogramma come dati (persone, legami, nuclei,
// note): qui si leggono quei dati e si calcola il disegno con la stessa
// geometria dell'app (stesse posizioni, stesse regole per coppie e figli),
// ma con il carattere, la carta e l'inchiostro di PsyDiary. I simboli dei
// legami restano quelli dello standard (McGoldrick/Gerson): tratto, doppie e
// triple linee, zig-zag, frecce, tagli. I colori, che nello standard hanno un
// significato (verde affetto, rosso conflitto…), passano a toni della stessa
// famiglia accordati al tema chiaro e scuro.
//
// Il disegno è un elenco di primitive SVG ({ el, a, testo? }) che il
// componente Genogramma.svelte mette sulla pagina. Modulo puro: si prova in Node.

const LATO = 40, RAGGIO = 20, CALO = 40, BARRA = RAGGIO + CALO;

// ---------------------------------------------------------------------------
// Tipi di legame: [etichetta, colore, tratto, simbolo], come la tabella che
// GenoGram Creator usa davvero per disegnare (BASE_REL_CONFIG in App.tsx)
export const LEGAMI = {
  // struttura e coppia
  marriage: ['Matrimonio', '#000000', 'solid', 'standard'],
  secret: ['Relazione segreta', '#000000', 'solid', 'triangle-up-center'],
  cohabitation: ['Convivenza', '#000000', 'dashed', 'standard'],
  couple: ['Relazione di coppia', '#000000', 'dashed', 'standard'],
  'divorce-commit': ['Divorzio, impegno emotivo', '#000000', 'solid', 'dashed-inner'],
  separation: ['Separazione', '#000000', 'solid', 'oblique'],
  'separation-repaired': ['Separazione riparata', '#000000', 'solid', 'x-cross'],
  'separation-cohab': ['Separazione (convivenza)', '#000000', 'dashed', 'oblique'],
  divorce: ['Divorzio', '#000000', 'solid', 'oblique-double'],
  'divorce-repaired': ['Divorzio riparato', '#000000', 'solid', 'oblique-double-crossed'],
  're-marriage': ['Risposati', '#000000', 'solid', 'standard'],
  affair: ['Relazione extra', '#FFD700', 'dotted', 'standard'],
  'one-night': ['Avventura', '#FFD700', 'dotted', 'standard'],
  engagement: ['Fidanzamento', '#0000FF', 'dashed', 'standard'],
  // figli
  'child-bio': ['Figlio biologico', '#000000', 'solid', 'standard'],
  'child-adopted': ['Adozione', '#0000FF', 'dotted', 'standard'],
  'child-foster': ['Affido', '#000000', 'dashed', 'standard'],
  'twin-dizygotic': ['Gemelli dizigoti', '#000000', 'solid', 'twin-link'],
  'twin-monozygotic': ['Gemelli monozigoti', '#000000', 'solid', 'twin-link-bar'],
  pregnancy: ['Gravidanza', '#000000', 'solid', 'standard'],
  // affetti e interazioni
  correlated: ['Correlato', '#000000', 'solid', 'standard'],
  harmony: ['Armonia', '#008000', 'solid', 'standard'],
  friendship: ['Amicizia', '#008000', 'dashed', 'standard'],
  'best-friend': ['Migliore amico', '#008000', 'dotted', 'double'],
  close: ['Molto uniti', '#008000', 'solid', 'double'],
  fusion: ['Fusione', '#008000', 'solid', 'triple'],
  'in-love': ['Innamorati', '#008000', 'solid', 'two-circles-center'],
  fan: ['Ammiratore', '#008000', 'dashed', 'arrow'],
  spiritual: ['Connessione spirituale', '#800080', 'dashed', 'standard'],
  // conflitto e distanza
  distance: ['Distanza', '#808080', 'dashed', 'standard'],
  distant: ['Distante', '#808080', 'dotted', 'standard'],
  poor: ['Povera', '#808080', 'dotted', 'standard'],
  hostile: ['Ostile', '#FF0000', 'zigzag', 'standard'],
  conflict: ['Conflitto', '#FF0000', 'zigzag', 'standard'],
  'close-hostile': ['Vicini e ostili', '#FF0000', 'solid', 'triple-zigzag-center'],
  'fusion-hostile': ['Fusione e conflitto', '#000000', 'solid', 'fusion-hostile'],
  'distant-hostile': ['Distante e ostile', '#FF0000', 'dotted', 'zigzag-overlay'],
  hate: ['Odio', '#FF0000', 'solid', 'triple-zigzag'],
  cutoff: ['Taglio', '#FF0000', 'solid', 'cutoff'],
  'cutoff-repaired': ['Taglio riparato', '#000000', 'solid', 'cutoff-repaired-circle'],
  restored: ['Relazione ristabilita', '#008000', 'solid', 'cutoff-repaired-circle'],
  // violenza, abuso e potere
  'violence-psychological': ['Violenza psicologica', '#FF0000', 'zigzag', 'arrow-open-end'],
  'violence-physical': ['Violenza fisica', '#FF0000', 'zigzag-thick', 'arrow-open-end'],
  'violence-sexual': ['Violenza sessuale', '#FF0080', 'solid', 'triple-zigzag-center-arrow'],
  violence: ['Violenza', '#FF0000', 'solid', 'arrow-thick'],
  'abuse-physical': ['Abuso fisico', '#800000', 'solid', 'arrow-thick'],
  'abuse-emotional': ['Abuso emotivo', '#800000', 'dashed', 'arrow'],
  'abuse-sexual': ['Abuso sessuale', '#FF0080', 'solid', 'arrow-double-bar-center'],
  focused: ['Focalizzato su', '#0000FF', 'solid', 'arrow-end'],
  'focused-negative': ['Focalizzato negativamente', '#FF0000', 'zigzag', 'arrow-end'],
  companions: ['Accompagnatori', '#000000', 'solid', 'arrow-open-end'],
  manipulative: ['Manipolativo', '#FF0000', 'solid', 'arrow-x-center'],
  controlling: ['Controllante', '#800080', 'solid', 'arrow-box-center'],
  keeper: ['Custode / caregiver', '#008080', 'solid', 'arrow-diamond-center'],
  neglect: ['Trascuratezza', '#808080', 'dashed', 'double-arrow-inward'],
  custom: ['Personalizzata', '#000000', 'solid', 'standard'],
};
const STRUTTURALI = ['marriage', 'secret', 'couple', 'divorce-commit', 'separation', 'separation-repaired', 'separation-cohab', 'divorce', 'divorce-repaired', 'cohabitation', 'affair', 're-marriage', 'engagement', 'one-night'];
const COPPIE = ['marriage', 'cohabitation', 'separation', 'divorce', 'affair', 're-marriage'];

export const SESSI = {
  M: 'Maschio', F: 'Femmina', TransWoman: 'Donna trans', TransMan: 'Uomo trans', NonBinary: 'Non binario', Pet: 'Animale',
  Pregnancy: 'Gravidanza', Miscarriage: 'Aborto spontaneo', Abortion: 'Interruzione', Stillbirth: 'Nato morto', Unknown: 'Non noto',
};

// ---------------------------------------------------------------------------
// Colori: dal colore dell'app alla famiglia di colore, che il tema rende
// (variabili CSS --g-* in Genogramma.svelte, chiare e scure)
export function famiglia(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return String(hex || '').toLowerCase() === 'red' ? 'rosso' : 'nero';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.2 || d < 0.08) return l < 0.35 ? 'nero' : 'grigio';
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return l < 0.33 ? 'bordeaux' : 'rosso';
  if (hue < 45) return 'arancio';
  if (hue < 70) return 'oro';
  if (hue < 170) return 'verde';
  if (hue < 200) return 'ottanio';
  if (hue < 270) return 'blu';
  if (hue < 320) return 'viola';
  return 'rosa';
}
const C = (f) => `var(--g-${f})`;
const INK = 'var(--g-nero)', CARTA = 'var(--g-carta)', FONDO = 'var(--g-fondo)';

// ---------------------------------------------------------------------------
// Lettura del file esportato da GenoGram Creator: un genogramma, il backup
// con tutti, oppure i soli dati. Restituisce [{ id, titolo, data }].
export function leggiGenogrammi(testo) {
  let j;
  try { j = typeof testo === 'string' ? JSON.parse(testo) : testo; } catch (e) { return []; }
  const valido = (d) => d && Array.isArray(d.nodes) && Array.isArray(d.edges);
  const voce = (g, i) => ({ id: String(g.id || 'g' + i), titolo: String(g.title || 'Genogramma'), modificato: g.lastModified || null, data: g.data });
  if (Array.isArray(j)) return j.filter((g) => g && valido(g.data)).map(voce);
  if (j && valido(j.data)) return [voce(j, 0)];
  if (valido(j)) return [{ id: 'g0', titolo: 'Genogramma', modificato: null, data: j }];
  return [];
}
/** Un file JSON che contiene un genogramma (riconosciuto dal contenuto). */
export const eGenogramma = (testo) => leggiGenogrammi(testo).length > 0;

// ---------------------------------------------------------------------------
// Date ed età, come in GenoGram Creator
function leggiData(str) {
  if (!str) return null;
  str = String(str).trim();
  const p = str.split(/[/\-.]/);
  if (p.length === 3) {
    let [a, b, c] = p.map((x) => parseInt(x, 10));
    if (p[0].length === 4) [a, c] = [c, a];     // AAAA-MM-GG
    if (!isNaN(a) && !isNaN(b) && !isNaN(c)) return new Date(c < 100 ? (c > 30 ? 1900 + c : 2000 + c) : c, b - 1, a);
  }
  if (/^\d{4}$/.test(str)) return new Date(+str, 0, 1);
  if (/^\d{1,3}$/.test(str) && +str <= 150) return new Date(new Date().getFullYear() - +str, 0, 1);
  return null;
}
export function eta(str, oggi = new Date()) {
  if (!str) return '';
  const s = String(str).trim();
  if (/^\d{1,3}$/.test(s) && +s <= 150) return s;
  const d = leggiData(s);
  if (!d) return '';
  let n = oggi.getFullYear() - d.getFullYear();
  const m = oggi.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && oggi.getDate() < d.getDate())) n--;
  return String(n);
}

// ---------------------------------------------------------------------------
// Geometria (come GenoGram Creator)
function zigzag(x1, y1, x2, y2, amp = 4, freq = 12) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (!len) return `M ${x1} ${y1}`;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const passi = Math.max(1, Math.round(len / freq)), lp = len / passi;
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i < passi; i++) {
    const o = i % 2 ? amp : -amp;
    d += ` L ${x1 + ux * i * lp + px * o} ${y1 + uy * i * lp + py * o}`;
  }
  return d + ` L ${x2} ${y2}`;
}
const croce = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function involucro(punti) {
  const p = punti.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const giu = [], su = [];
  for (const q of p) { while (giu.length >= 2 && croce(giu[giu.length - 2], giu[giu.length - 1], q) <= 0) giu.pop(); giu.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (su.length >= 2 && croce(su[su.length - 2], su[su.length - 1], q) <= 0) su.pop(); su.push(q); }
  return [...giu.slice(0, -1), ...su.slice(0, -1)];
}
function forma(punti, margine) {
  if (punti.length < 3) return null;
  const cx = punti.reduce((s, p) => s + p.x, 0) / punti.length, cy = punti.reduce((s, p) => s + p.y, 0) / punti.length;
  const ctrl = punti.map((p) => { const a = Math.atan2(p.y - cy, p.x - cx), r = Math.hypot(p.x - cx, p.y - cy) + margine; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
  const n = ctrl.length;
  const medi = ctrl.map((p, i) => ({ x: (p.x + ctrl[(i + 1) % n].x) / 2, y: (p.y + ctrl[(i + 1) % n].y) / 2 }));
  let d = `M ${medi[0].x} ${medi[0].y}`;
  for (let i = 0; i < n; i++) { const c = ctrl[(i + 1) % n], m = medi[(i + 1) % n]; d += ` Q ${c.x} ${c.y} ${m.x} ${m.y}`; }
  return { d: d + ' Z', cx, cy, bordo: medi, ctrl };
}
function geometriaNucleo(g, persone) {
  const mem = persone.filter((n) => (g.memberIds || []).includes(n.id));
  if (!mem.length) return null;
  const punti = [];
  for (const n of mem) {
    const mezza = Math.max(80, String(n.name || '').length * 8) / 2, cx = n.x + LATO / 2;
    punti.push({ x: cx - mezza, y: n.y - 25 }, { x: cx + mezza, y: n.y - 25 }, { x: cx - mezza, y: n.y + LATO + 10 }, { x: cx + mezza, y: n.y + LATO + 10 },
      { x: n.x - 5, y: n.y + LATO / 2 }, { x: n.x + LATO + 5, y: n.y + LATO / 2 });
  }
  return forma(involucro(punti), g.customPadding || 23);
}
function piuVicino(poli, t) {
  let best = t, min = Infinity;
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i], b = poli[(i + 1) % poli.length], l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (!l2) continue;
    const k = Math.max(0, Math.min(1, ((t.x - a.x) * (b.x - a.x) + (t.y - a.y) * (b.y - a.y)) / l2));
    const p = { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y) }, d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
    if (d < min) { min = d; best = p; }
  }
  return best;
}
function suPerimetro(ctrl, t) {
  const n = ctrl.length, x = t * n, i = Math.floor(x) % n, k = x - Math.floor(x);
  const c = ctrl[(i + 1) % n], a = ctrl[i], b = ctrl[(i + 2) % n];
  const s = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, e = { x: (c.x + b.x) / 2, y: (c.y + b.y) / 2 }, m = 1 - k;
  return { x: m * m * s.x + 2 * m * k * c.x + k * k * e.x, y: m * m * s.y + 2 * m * k * c.y + k * k * e.y };
}
function confini(g, persone) {
  const mem = persone.filter((n) => (g.memberIds || []).includes(n.id));
  if (!mem.length) return null;
  const x0 = Math.min(...mem.map((n) => n.x)) - 40, x1 = Math.max(...mem.map((n) => n.x + LATO)) + 40;
  const y0 = Math.min(...mem.map((n) => n.y)) - 40, y1 = Math.max(...mem.map((n) => n.y + LATO)) + 40;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

// ---------------------------------------------------------------------------
// Un legame → primitive SVG
const el = (nome, a, testo) => (testo === undefined ? { el: nome, a } : { el: nome, a, testo });
function legame(e, s, t, cfg, persona, versoNucleo) {
  const [, colore, tratto, tipo] = cfg;
  const stroke = C(famiglia(e.color || colore));
  const rosso = C('rosso');
  const strutt = STRUTTURALI.includes(e.type);
  const barra = Math.max(s.y, t.y) + CALO;
  const mx = (s.x + t.x) / 2, my = strutt ? barra : (s.y + t.y) / 2;
  const ang = strutt ? 0 : (Math.atan2(t.y - s.y, t.x - s.x) * 180) / Math.PI;
  let bordo = 20;
  if (persona && !versoNucleo) {
    const dx = s.x - t.x, dy = s.y - t.y;
    let r = ['M', 'F', 'TransWoman', 'TransMan', 'NonBinary'].includes(persona.gender) ? 20 : 15;
    if (persona.gender !== 'F' && (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01)) {
      const th = Math.atan2(dy, dx);
      r = Math.min(30, Math.min(r / (Math.abs(Math.cos(th)) || 1), r / (Math.abs(Math.sin(th)) || 1)));
    }
    bordo = r;
  }
  const punta = (versoNucleo ? 0 : bordo) + (tipo.includes('arrow-thick') ? 4 : 6);
  const frecciaT = `translate(${t.x},${t.y}) rotate(${ang}) translate(-${punta},0)`;
  const centroT = `translate(${mx},${my}) rotate(${ang})`;
  let ex = t.x, ey = t.y;
  const freccia = (tipo.includes('arrow') && !tipo.includes('center') && tipo !== 'double-arrow-inward') || tipo === 'triple-zigzag-center-arrow';
  if (freccia && !strutt) { const r = Math.atan2(t.y - s.y, t.x - s.x); ex = t.x - Math.cos(r) * (punta + 4); ey = t.y - Math.sin(r) * (punta + 4); }

  let d;
  if (strutt) d = `M ${s.x} ${s.y + RAGGIO} L ${s.x} ${barra} L ${t.x} ${barra} L ${t.x} ${t.y + RAGGIO}`;
  else if (e.type.startsWith('twin')) d = `M ${s.x} ${s.y} L ${ex} ${ey}`;
  else if (e.type.startsWith('child')) d = `M ${s.x} ${s.y} L ${ex} ${s.y} L ${ex} ${ey}`;
  else if (tratto.startsWith('zigzag')) d = tratto === 'zigzag-thick' ? zigzag(s.x, s.y, ex, ey, 6, 10) : zigzag(s.x, s.y, ex, ey);
  else d = `M ${s.x} ${s.y} Q ${mx} ${my} ${ex} ${ey}`;
  const tr = tratto === 'dashed' ? '8,4' : tratto === 'dotted' ? '2,3' : null;

  const out = [el('path', { d, stroke, 'stroke-width': tratto === 'zigzag-thick' ? 3 : 1.75, 'stroke-dasharray': tr, fill: 'none', 'stroke-linecap': tratto === 'dotted' ? 'round' : null })];
  const lin = (spost, extra = {}) => el('path', { d, stroke, 'stroke-width': 1, transform: `translate(${spost},${spost})`, fill: 'none', ...extra });
  const zz = () => el('path', { d: zigzag(s.x, s.y, ex, ey), stroke: rosso, 'stroke-width': 1.5, fill: 'none' });
  const tacca = (x1, y1, x2, y2, w = 2) => el('line', { x1, y1, x2, y2, stroke, 'stroke-width': w, 'stroke-linecap': 'round' });
  const triangolo = (tr2, pts = '-6,-6 6,0 -6,6', f = stroke) => el('polygon', { points: pts, fill: f, transform: tr2 });

  const zz6 = () => el('path', { d: zigzag(s.x, s.y, ex, ey, 4, 12), stroke: rosso, 'stroke-width': 1.5, fill: 'none' });
  const obliqua = (dx, w = 2) => tacca(mx + 5 + dx, my - 10, mx - 5 + dx, my + 10, w);
  if (e.type === 'best-friend') out.push(lin(3), lin(-3));
  else if (tipo === 'oblique') out.push(obliqua(0));
  else if (tipo === 'oblique-double') out.push(obliqua(-3), obliqua(3));
  else if (tipo === 'x-cross') out.push(obliqua(0), tacca(mx - 5, my - 10, mx + 5, my + 10));
  else if (tipo === 'oblique-double-crossed') out.push(obliqua(-3), obliqua(3), tacca(mx - 8, my - 10, mx + 8, my + 10));
  else if (tipo === 'dashed-inner') out.push(el('path', { d, stroke, 'stroke-width': 1.5, 'stroke-dasharray': '4,4', fill: 'none', transform: 'translate(0,6)' }));
  else if (tipo === 'triangle-up-center') out.push(el('polygon', { points: '-6,0 6,0 0,-10', fill: stroke, transform: `translate(${mx},${my})` }));
  else if (tipo === 'triple-zigzag-center') out.push(lin(6), lin(-6), zz6());
  else if (tipo === 'triple-zigzag-center-arrow') out.push(lin(6), lin(-6), zz6(), triangolo(frecciaT, '-6,-6 6,0 -6,6', rosso));
  else if (tipo === 'arrow-open-end') out.push(el('polyline', { points: '-6,-6 6,0 -6,6', stroke, 'stroke-width': 2, fill: 'none', transform: frecciaT, 'stroke-linejoin': 'round' }));
  else if (tipo === 'arrow-open-center') out.push(el('polyline', { points: '-6,-6 6,0 -6,6', stroke, 'stroke-width': 2, fill: 'none', transform: centroT, 'stroke-linejoin': 'round' }));
  else if (tipo === 'fusion' || tipo === 'triple') out.push(lin(3), lin(-3));
  else if (tipo === 'fusion-hostile' || tipo === 'triple-zigzag') out.push(lin(3), lin(-3), zz());
  else if (tipo === 'double' || tipo === 'double-zigzag') { out.push(lin(3, { 'stroke-dasharray': tr })); if (tipo === 'double-zigzag') out.push(zz()); }
  else if (tipo === 'zigzag-overlay') out.push(zz());
  else if (tipo === 'cutoff-double') out.push(tacca(mx - 3, my - 10, mx - 3, my + 10), tacca(mx + 3, my - 10, mx + 3, my + 10));
  else if (tipo === 'cutoff') out.push(tacca(mx, my - 10, mx, my + 10, 3));
  else if (tipo === 'cutoff-circle' || tipo === 'cutoff-repaired-circle') out.push(tacca(mx - 4, my - 10, mx - 14, my + 10), el('circle', { cx: mx, cy: my, r: 5, fill: CARTA, stroke, 'stroke-width': 1.5 }), tacca(mx + 14, my - 10, mx + 4, my + 10));
  else if (tipo === 'two-circles-center') out.push(el('g', { transform: centroT }, [el('circle', { cx: -5, cy: 0, r: 5, fill: CARTA, stroke, 'stroke-width': 1.5 }), el('circle', { cx: 5, cy: 0, r: 5, fill: CARTA, stroke, 'stroke-width': 1.5 })]));
  else if (tipo === 'twin-link-bar') out.push(tacca(mx - 8, my, mx + 8, my, 1.75));
  else if (tipo === 'double-arrow-inward') {
    const dx = ex - s.x, dy = ey - s.y, a = (Math.atan2(dy, dx) * 180) / Math.PI;
    out.push(triangolo(`translate(${s.x + dx * 0.33},${s.y + dy * 0.33}) rotate(${a})`, '6,-6 -6,0 6,6'), triangolo(`translate(${s.x + dx * 0.67},${s.y + dy * 0.67}) rotate(${a})`));
  } else if (tipo === 'arrow-x-center') out.push(triangolo(frecciaT), el('g', { transform: centroT }, [tacca(-6, -6, 6, 6), tacca(-6, 6, 6, -6)]));
  else if (tipo === 'arrow-box-center') out.push(triangolo(frecciaT), el('rect', { x: -6, y: -6, width: 12, height: 12, stroke, 'stroke-width': 2, fill: CARTA, transform: centroT }));
  else if (tipo === 'arrow-diamond-center') out.push(triangolo(frecciaT), el('polygon', { points: '0,-6 6,0 0,6 -6,0', stroke, 'stroke-width': 2, fill: CARTA, transform: centroT }));
  else if (tipo === 'arrow-double-bar-center') out.push(triangolo(frecciaT), el('g', { transform: centroT }, [tacca(-3, -8, -3, 8), tacca(3, -8, 3, 8)]));
  else if (tipo === 'arrow-thick') out.push(triangolo(frecciaT, '-8,-8 4,0 -8,8'));
  else if (tipo === 'arrow-open') out.push(el('polyline', { points: '-6,-6 6,0 -6,6', stroke, 'stroke-width': 2, fill: 'none', transform: frecciaT, 'stroke-linejoin': 'round' }));
  else if (freccia) out.push(triangolo(frecciaT));
  if (e.label) out.push(el('text', { x: mx, y: my - 12, 'text-anchor': 'middle', class: 'g-etichetta-legame', fill: stroke }, e.label));
  return out;
}

// ---------------------------------------------------------------------------
// Una persona → primitive SVG (coordinate locali, poi traslate)
function persona(n, opz) {
  const w = LATO, h = LATO, r = RAGGIO;
  const sw = n.indexPerson ? 2.75 : 1.5;
  const base = { stroke: INK, 'stroke-width': sw, fill: CARTA };
  const parti = [];
  switch (n.gender) {
    case 'M': parti.push(el('rect', { x: 0, y: 0, width: w, height: h, ...base })); break;
    case 'F': parti.push(el('circle', { cx: r, cy: r, r, ...base })); break;
    case 'TransWoman': parti.push(el('rect', { x: 0, y: 0, width: w, height: h, ...base }), el('circle', { cx: r, cy: r, r: w / 3, stroke: INK, 'stroke-width': 1, fill: 'none' })); break;
    case 'TransMan': parti.push(el('circle', { cx: r, cy: r, r, ...base }), el('rect', { x: 10, y: 10, width: w - 20, height: h - 20, stroke: INK, 'stroke-width': 1, fill: 'none' })); break;
    case 'NonBinary': case 'Pet': parti.push(el('polygon', { points: `${r},0 ${w},${r} ${r},${h} 0,${r}`, ...base })); break;
    case 'Pregnancy': parti.push(el('path', { d: `M${r} 0 L${w} ${h} L0 ${h} Z`, ...base, 'stroke-linejoin': 'round' })); break;
    case 'Miscarriage': parti.push(el('circle', { cx: r, cy: r, r: 8, fill: INK })); break;
    case 'Abortion': parti.push(el('path', { d: `M5 5 L${w - 5} ${h - 5} M${w - 5} 5 L5 ${h - 5}`, stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round' })); break;
    case 'Stillbirth': parti.push(el('rect', { x: 0, y: 0, width: w, height: h, ...base }), el('path', { d: `M0 0 L${w} ${h} M${w} 0 L0 ${h}`, stroke: INK, 'stroke-width': 1 })); break;
    default: parti.push(el('rect', { x: 5, y: 5, width: w - 10, height: h - 10, ...base, 'stroke-dasharray': '4 2' }));
  }
  // segni clinici: dipendenze (metà inferiore), salute mentale (lato sinistro), LGB (triangolo)
  const quadrato = n.gender === 'M';
  if (n.substanceAbuse) parti.push(quadrato ? el('rect', { x: 0, y: h / 2, width: w, height: h / 2, fill: C('arancio'), class: 'g-segno' }) : el('path', { d: `M 0 ${h / 2} A ${r} ${r} 0 0 0 ${w} ${h / 2} Z`, fill: C('arancio'), class: 'g-segno' }));
  if (n.mentalIssue) parti.push(quadrato ? el('rect', { x: 0, y: 0, width: w / 3, height: h, fill: C('viola'), class: 'g-segno' }) : el('path', { d: `M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${h} Z`, fill: C('viola'), class: 'g-segno' }));
  if (n.gayLesbian) parti.push(el('path', { d: `M ${r - 7} ${h - 12} L ${r + 7} ${h - 12} L ${r} ${h} Z`, fill: C('rosa'), stroke: CARTA, 'stroke-width': 1 }));
  // ridisegno del contorno sopra i riempimenti, perché resti netto
  if ((n.substanceAbuse || n.mentalIssue) && ['M', 'F'].includes(n.gender)) parti.push(n.gender === 'M' ? el('rect', { x: 0, y: 0, width: w, height: h, stroke: INK, 'stroke-width': sw, fill: 'none' }) : el('circle', { cx: r, cy: r, r, stroke: INK, 'stroke-width': sw, fill: 'none' }));
  if (n.indexPerson) parti.push(quadrato ? el('rect', { x: 6, y: 6, width: w - 12, height: h - 12, stroke: INK, 'stroke-width': 1.25, fill: 'none' }) : el('circle', { cx: r, cy: r, r: r - 6, stroke: INK, 'stroke-width': 1.25, fill: 'none' }));
  if (n.deceased) parti.push(el('path', { d: `M0 0 L${w} ${h} M${w} 0 L0 ${h}`, stroke: INK, 'stroke-width': 1.5 }));
  const anni = n.showAge !== false && n.birthDate ? eta(n.birthDate, opz.oggi) : '';
  if (anni) parti.push(el('text', { x: r, y: r + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'g-eta' }, anni));
  if (n.name) parti.push(el('text', { x: r, y: -9, 'text-anchor': 'middle', class: 'g-nome' }, n.name));
  if (n.label) parti.push(el('text', { x: r, y: h + 15, 'text-anchor': 'middle', class: 'g-sotto' }, n.label));
  if (n.notes && n.notes.length) parti.push(el('circle', { cx: w + 5, cy: 0, r: 3.5, fill: C('rosso') }));
  return el('g', { transform: `translate(${n.x},${n.y})`, class: 'g-persona', 'data-id': n.id }, parti);
}

// ---------------------------------------------------------------------------
/** Il disegno completo: { vista: {x,y,w,h}, livelli: { nuclei, legami, persone, note }, usati } */
export function disegna(data, opz = {}) {
  const o = { oggi: new Date(), ...opz };
  const persone = (data.nodes || []).filter((n) => n && isFinite(n.x) && isFinite(n.y));
  const nuclei = data.groups || [], legami = data.edges || [];
  const preset = Object.fromEntries((data.presets || []).map((p) => [p.id, [p.name, p.config.color, p.config.lineStyle, p.config.renderType]]));
  const perId = Object.fromEntries(persone.map((n) => [n.id, n]));
  const geom = Object.fromEntries(nuclei.map((g) => [g.id, geometriaNucleo(g, persone)]));
  const centro = (id) => (perId[id] ? { x: perId[id].x + RAGGIO, y: perId[id].y + RAGGIO } : nuclei.find((g) => g.id === id) ? confini(nuclei.find((g) => g.id === id), persone) : null);

  const livNuclei = [];
  for (const g of nuclei) {
    const f = geom[g.id];
    if (!f) continue;
    const col = C(famiglia(g.color));
    livNuclei.push(el('path', { d: f.d, fill: col, 'fill-opacity': 0.06, stroke: col, 'stroke-dasharray': '10,6', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    if (g.showLabel !== false && g.label) {
      const lx = g.labelPos ? g.labelPos.x : f.cx, ly = g.labelPos ? g.labelPos.y : Math.min(...f.bordo.map((p) => p.y)) - 14;
      livNuclei.push(el('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'g-nucleo', fill: col }, g.label));
    }
  }

  const usati = new Set();
  const livLegami = [];
  for (const e of legami) {
    let s = centro(e.fromId), t = centro(e.toId);
    if (!s || !t) continue;
    const gt = geom[e.toId], gs = geom[e.fromId];
    if (gt) t = e.toAnchor !== undefined ? suPerimetro(gt.ctrl, e.toAnchor) : piuVicino(gt.bordo, s);
    if (gs) s = e.fromAnchor !== undefined ? suPerimetro(gs.ctrl, e.fromAnchor) : piuVicino(gs.bordo, t);
    const da = perId[e.fromId], a = perId[e.toId];
    if ((e.type.startsWith('child') || e.type.startsWith('twin')) && da && a) {
      const coppia = legami.find((x) => (x.fromId === e.fromId || x.toId === e.fromId) && COPPIE.includes(x.type));
      const p1 = coppia && perId[coppia.fromId], p2 = coppia && perId[coppia.toId];
      s = p1 && p2 ? { x: (p1.x + p2.x + LATO) / 2, y: Math.max(p1.y, p2.y) + BARRA } : { x: da.x + RAGGIO, y: da.y + LATO };
    }
    const cfg = LEGAMI[e.type] || preset[e.type] || ['Legame', '#000000', 'solid', 'standard'];
    usati.add(e.type);
    livLegami.push(el('g', { class: 'g-legame' }, legame(e, s, t, cfg, a, !!gt)));
  }

  const livPersone = persone.map((n) => persona(n, o));

  const livNote = (data.stickyNotes || []).filter((x) => x && isFinite(x.x)).map((x) => {
    const w = x.width || 160, h = x.height || 100;
    const etichetta = x.variant === 'label';
    return el('g', { transform: `translate(${x.x},${x.y})`, class: 'g-nota' }, [
      etichetta ? null : el('rect', { x: 0, y: 0, width: w, height: h, rx: 6, class: 'g-foglietto' }),
      el('foreignObject', { x: 0, y: 0, width: w, height: h }, { html: String(x.text || '') }),
    ].filter(Boolean));
  });

  // confini del disegno
  const xs = [], ys = [];
  persone.forEach((n) => { const m = Math.max(80, String(n.name || '').length * 7) / 2; xs.push(n.x + RAGGIO - m, n.x + RAGGIO + m); ys.push(n.y - 26, n.y + LATO + 24); });
  Object.values(geom).forEach((f) => f && f.bordo.forEach((p) => { xs.push(p.x); ys.push(p.y - 30); }));
  (data.stickyNotes || []).forEach((x) => { if (isFinite(x.x)) { xs.push(x.x, x.x + (x.width || 160)); ys.push(x.y, x.y + (x.height || 100)); } });
  legami.forEach((e) => { const a = perId[e.fromId], b = perId[e.toId]; if (a && b && STRUTTURALI.includes(e.type)) ys.push(Math.max(a.y, b.y) + BARRA + 14); });
  const pad = 30;
  const vista = xs.length ? { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 } : { x: 0, y: 0, w: 400, h: 300 };

  return { vista, livelli: { nuclei: livNuclei, legami: livLegami, persone: livPersone, note: livNote }, usati: [...usati].map((t) => ({ tipo: t, cfg: LEGAMI[t] || preset[t] || ['Legame', '#000000', 'solid', 'standard'] })), persone };
}

/** Un campione del legame per la legenda (segmento orizzontale). */
export function campione(tipo, cfg) {
  const e = { type: tipo.startsWith('child') || STRUTTURALI.includes(tipo) ? 'harmony' : tipo };
  const c = [cfg[0], cfg[1], cfg[2], cfg[3]];
  return legame(e, { x: 4, y: 12 }, { x: 70, y: 12 }, c, null, true);
}

/** Dati di una persona per la scheda che si apre toccandola. */
export function scheda(n, oggi = new Date()) {
  const segni = [];
  if (n.indexPerson) segni.push('paziente designato');
  if (n.deceased) segni.push('deceduto');
  if (n.substanceAbuse) segni.push('uso di sostanze');
  if (n.mentalIssue) segni.push('salute mentale');
  if (n.physicalIssue) segni.push('salute fisica');
  if (n.recovery) segni.push('in recupero');
  if (n.gayLesbian) segni.push('gay/lesbica');
  const a = n.birthDate ? eta(n.birthDate, oggi) : '';
  return { nome: n.name || '—', sesso: SESSI[n.gender] || '', nascita: n.birthDate || '', eta: a, etichetta: n.label || '', segni, note: (n.notes || []).filter((x) => x && x.text) };
}
