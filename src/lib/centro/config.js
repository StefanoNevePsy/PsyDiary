// Configurazione della messa in servizio, decisa al momento della build
// (variabili del repository su GitHub, o un file .env in locale).
// Senza indirizzo del custode l'app è solo la demo con dati inventati.
export const CONFIG = {
  custodeUrl: import.meta.env.VITE_CUSTODE_URL || '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  // accesso finto "dev:email", solo con il custode locale
  dev: import.meta.env.VITE_ACCESSO_DEV === '1',
};

// Corsia veloce (Firebase/Firestore, facoltativa). La configurazione web di un progetto Firebase NON è segreta: a
// proteggere i dati sono le regole (firestore.rules) e la cifratura (Firestore vede solo buste cifrate). Il valore di
// ripiego è il progetto di PsyDiary; ogni campo si può cambiare con VITE_FIREBASE_* al momento della build, e
// VITE_FIREBASE=off la spegne del tutto (l'app resta com'era: nessun codice di Firebase viene caricato).
// VITE_FIREBASE_EMULATORE=firestore:porta,auth:porta (es. 127.0.0.1:8085,127.0.0.1:9099) la punta agli emulatori,
// ma solo con VITE_ACCESSO_DEV=1 (sviluppo locale): una build vera non può essere rediretta.
const E = import.meta.env;
function leggiFirebase() {
  if (E.VITE_FIREBASE === 'off') return null;
  const f = {
    apiKey: E.VITE_FIREBASE_API_KEY || 'AIzaSyDKIoFOaqHaRqhApDGPhUnq67sBIsvHAas',
    authDomain: E.VITE_FIREBASE_AUTH_DOMAIN || 'psydiary-510307.firebaseapp.com',
    projectId: E.VITE_FIREBASE_PROJECT_ID || 'psydiary-510307',
    storageBucket: E.VITE_FIREBASE_STORAGE_BUCKET || 'psydiary-510307.firebasestorage.app',
    messagingSenderId: E.VITE_FIREBASE_MESSAGING_SENDER_ID || '838795760240',
    appId: E.VITE_FIREBASE_APP_ID || '1:838795760240:web:6f9dcddc14d4f52cbedab5',
  };
  if (E.VITE_ACCESSO_DEV === '1' && E.VITE_FIREBASE_EMULATORE) {
    const [firestore, auth] = String(E.VITE_FIREBASE_EMULATORE).split(',');
    if (firestore && auth) f.emulatore = { firestore: firestore.trim(), auth: 'http://' + auth.trim() };
  }
  return f;
}
CONFIG.firebase = leggiFirebase();

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
