// Maschere disegnate "a mano": un tondo irregolare e un foglio dai bordi
// strappati. Sempre uguali per lo stesso seme, così un ragazzo ha la sua forma.

function casuale(seme) {
  let s = 0;
  for (const c of String(seme)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  s = s || 7;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const f = (n) => n.toFixed(2);

// curva morbida che passa per i punti (Catmull-Rom → Bézier)
function morbida(p) {
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < p.length; i++) {
    const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length], e = p[(i + 2) % p.length];
    d += ` C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return d + 'Z';
}

function tondo(r) {
  const n = 11, p = [];
  const fase = r() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = fase + (i / n) * Math.PI * 2;
    const raggio = 47 - r() * 3.2;
    p.push([50 + Math.cos(a) * raggio, 50 + Math.sin(a) * raggio]);
  }
  return morbida(p);
}
function foglio(r) {
  // bordi strappati: tanti piccoli denti, più fitti in alto e in basso
  const p = [];
  const bordo = (x0, y0, x1, y1, passi, amp) => {
    for (let i = 0; i < passi; i++) {
      const t = i / passi;
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny);
      const j = (r() - 0.5) * amp;
      p.push([x0 + (x1 - x0) * t + (nx / l) * j, y0 + (y1 - y0) * t + (ny / l) * j]);
    }
  };
  bordo(1.5, 2, 98.5, 1.2, 34, 1.6);
  bordo(98.5, 1.2, 99, 98.4, 22, 0.9);
  bordo(99, 98.4, 1.2, 98.8, 34, 1.8);
  bordo(1.2, 98.8, 1.5, 2, 22, 0.9);
  return 'M' + p.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + 'Z';
}

const memo = new Map();
/** Valore CSS per mask-image. */
export function maschera(forma, seme) {
  const k = forma + '|' + seme;
  if (!memo.has(k)) {
    const d = (forma === 'tondo' ? tondo : foglio)(casuale(seme));
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${d}'/></svg>`;
    memo.set(k, `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`);
  }
  return memo.get(k);
}
