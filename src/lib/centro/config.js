// Configurazione della messa in servizio, decisa al momento della build
// (variabili del repository su GitHub, o un file .env in locale).
// Senza indirizzo del custode l'app è solo la demo con dati inventati.
export const CONFIG = {
  custodeUrl: import.meta.env.VITE_CUSTODE_URL || '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  // accesso finto "dev:email", solo con il custode locale
  dev: import.meta.env.VITE_ACCESSO_DEV === '1',
};

// Demo: dati inventati, in un archivio a parte, mai inviati al custode.
// Si apre dal pulsante nella pagina d'ingresso o con l'indirizzo …/?demo
function leggiDemo() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) localStorage.setItem('psy:demo', '1');
    return localStorage.getItem('psy:demo') === '1';
  } catch (e) { return false; }
}
export const DEMO = !CONFIG.custodeUrl || leggiDemo();
export const REALE = !!CONFIG.custodeUrl && !DEMO;
/** Entra o esce dalla demo (ricarica l'app). */
export function demo(si) {
  try { if (si) localStorage.setItem('psy:demo', '1'); else localStorage.removeItem('psy:demo'); } catch (e) { /* ok */ }
  location.href = location.pathname + location.hash;
}
