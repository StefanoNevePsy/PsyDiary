// Configurazione della messa in servizio, decisa al momento della build
// (variabili del repository su GitHub, o un file .env in locale).
// Senza indirizzo del custode l'app resta un prototipo con dati di prova.
export const CONFIG = {
  custodeUrl: import.meta.env.VITE_CUSTODE_URL || '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  // accesso finto "dev:email", solo con il custode locale
  dev: import.meta.env.VITE_ACCESSO_DEV === '1',
};
export const REALE = !!CONFIG.custodeUrl;
