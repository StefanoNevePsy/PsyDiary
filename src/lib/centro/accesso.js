// Accesso con Google: solo un "ID token" (chi sei). Nessun accesso a Drive,
// posta o contatti di chi entra. Il custode lo verifica a ogni richiesta.
import { CONFIG } from './config.js';

// 'psy:utente' è anche la persona scelta nella demo: l'account ha una chiave sua
const K_TOKEN = 'psy:token', K_UTENTE = 'psy:account', K_VECCHIA = 'psy:utente';
let token = null, scadenza = 0, utente = null, gis = null, attesa = null;
const ascoltatori = [];
export class ErroreAccesso extends Error { constructor(m) { super(m); this.accesso = true; } }

function payload(jwt) {
  try {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(p).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  } catch (e) { return null; }
}
function imposta(t) {
  const d = payload(t);
  if (!d || !d.email) return false;
  token = t; scadenza = (d.exp || 0) * 1000;
  utente = { email: String(d.email).toLowerCase(), nome: d.given_name || d.name || d.email };
  try { sessionStorage.setItem(K_TOKEN, t); localStorage.setItem(K_UTENTE, JSON.stringify(utente)); } catch (e) { /* ok */ }
  avvisa();
  return true;
}
const avvisa = () => ascoltatori.forEach((f) => { try { f(utente); } catch (e) { console.error(e); } });
const valido = () => !!token && Date.now() < scadenza - 60000;

function caricaGIS() {
  if (gis) return gis;
  gis = new Promise((ok, ko) => {
    if (window.google?.accounts?.id) return ok();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { gis = null; ko(new ErroreAccesso('Non riesco a raggiungere Google: controlla la connessione.')); };
    document.head.appendChild(s);
  }).then(() => {
    google.accounts.id.initialize({
      client_id: CONFIG.googleClientId,
      callback: (r) => { if (r?.credential && imposta(r.credential) && attesa) { attesa.ok(token); attesa = null; } },
      auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true, itp_support: true,
    });
  });
  return gis;
}

export function inizia() {
  try {
    const t = sessionStorage.getItem(K_TOKEN);
    if (t && !t.startsWith('dev:')) imposta(t);
    if (!utente) {
      const leggi = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
      const u = leggi(K_UTENTE) || leggi(K_VECCHIA);
      if (u?.email) { utente = u; localStorage.setItem(K_UTENTE, JSON.stringify(u)); }
    }
    if (CONFIG.dev) { token = sessionStorage.getItem(K_TOKEN + ':dev') || localStorage.getItem(K_TOKEN + ':dev'); scadenza = token ? Infinity : 0; }
  } catch (e) { /* ok */ }
  if (!CONFIG.dev && CONFIG.googleClientId) caricaGIS().catch(() => { /* offline */ });
  return utente;
}
/** Disegna il pulsante "Accedi con Google" dentro el. */
export async function pulsante(el) {
  if (CONFIG.dev) return;
  await caricaGIS();
  google.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'it', width: Math.min(320, el.clientWidth || 320) });
}
export function accessoDev(email, nome) {
  if (!CONFIG.dev) return false;
  email = email.trim().toLowerCase();
  token = 'dev:' + email + '|' + (nome || email.split('@')[0]);
  scadenza = Infinity;
  utente = { email, nome: nome || email.split('@')[0] };
  try { localStorage.setItem(K_TOKEN + ':dev', token); localStorage.setItem(K_UTENTE, JSON.stringify(utente)); } catch (e) { /* ok */ }
  avvisa();
  return true;
}
/** Un token valido; se è scaduto (dura un'ora) lo rinnova in silenzio. */
export function prendiToken() {
  if (CONFIG.dev) return token ? Promise.resolve(token) : Promise.reject(new ErroreAccesso('Serve l\'accesso.'));
  if (valido()) return Promise.resolve(token);
  return caricaGIS().then(() => new Promise((ok, ko) => {
    attesa = { ok };
    const timer = setTimeout(() => { if (attesa) { attesa = null; ko(new ErroreAccesso('Accesso scaduto: rientra con Google.')); } }, 9000);
    google.accounts.id.prompt((n) => {
      const saltato = n.isNotDisplayed?.() || n.isSkippedMoment?.();
      if (saltato && attesa) { clearTimeout(timer); attesa = null; ko(new ErroreAccesso('Accesso scaduto: rientra con Google.')); }
    });
  }));
}
export function invalida() {
  token = null; scadenza = 0;
  try { sessionStorage.removeItem(K_TOKEN); } catch (e) { /* ok */ }
}
export function esci() {
  invalida(); utente = null;
  try { localStorage.removeItem(K_UTENTE); localStorage.removeItem(K_TOKEN + ':dev'); if ((localStorage.getItem(K_VECCHIA) || '').startsWith('{')) localStorage.removeItem(K_VECCHIA); } catch (e) { /* ok */ }
  window.google?.accounts?.id?.disableAutoSelect();
  avvisa();
}
export const utenteAttuale = () => utente;
export const alCambio = (f) => ascoltatori.push(f);
