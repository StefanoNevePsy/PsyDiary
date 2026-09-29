// Navigazione con l'hash: #/calendario/settimana/2026-10-06, #/seduta/<id>, #/ragazzo/<id>…
export const rotta = $state({ parti: [], query: {} });

function leggi() {
  const h = location.hash.replace(/^#\/?/, '');
  const [percorso, q] = h.split('?');
  rotta.parti = percorso ? percorso.split('/').map(decodeURIComponent) : [];
  rotta.query = Object.fromEntries(new URLSearchParams(q || ''));
}
leggi();
window.addEventListener('hashchange', leggi);

export function vai(percorso) {
  const h = '#/' + percorso.replace(/^#?\/?/, '');
  if (location.hash === h) leggi(); else location.hash = h;
}
