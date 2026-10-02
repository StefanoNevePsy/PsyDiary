// Tema scelto prima del primo disegno, niente lampi. In un file a parte (non
// inline) così la Content Security Policy può vietare ogni script inline.
try { var t = localStorage.getItem('psy:tema'); if (t === 'chiaro' || t === 'scuro') document.documentElement.dataset.tema = t; } catch (e) {}
