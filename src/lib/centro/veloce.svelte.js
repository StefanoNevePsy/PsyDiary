/**
 * Collegamento della corsia veloce (veloce.js) all'app: stato per l'interfaccia e aggancio alla sincronizzazione.
 * Si carica solo con la versione collegata al custode e solo se c'è la configurazione di Firebase (config.js):
 * senza, questo file non viene nemmeno scaricato e l'app è identica a prima.
 */
import { untrack } from 'svelte';
import { CONFIG, REALE } from './config.js';
import * as Auth from './accesso.js';
import { sync, ganciVeloce, veloceInterno as X } from './sync.svelte.js';
import { configurata, creaMotore, backendPigro, formatoCodice } from './veloce.js';

const K_MANUALE = 'psy:consegna-manuale', K_MEMORIA = 'psy:veloce:';
const leggiLocale = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const scriviLocale = (k, v) => { try { localStorage.setItem(k, v); } catch { /* solo una comodità */ } };

/** Lo stato per l'interfaccia (Impostazioni, consegna della chiave, ingresso). */
export const veloce = $state({
  presente: false, attiva: false, motivo: '', serveAccesso: false, rete: false, fisso: false,
  codice: null, richieste: [], pubblicate: 0, ricevute: 0,
  // consegna della chiave solo con un tocco dell'operatore (dopo aver controllato il codice di verifica)
  manuale: leggiLocale(K_MANUALE) === '1',
});
export { formatoCodice };

let motore = null, timer = null;
// L'ID token con cui collegare Firebase: quello vero di Google; in sviluppo (custode e emulatori locali) uno finto
// che accetta solo l'emulatore di Firebase Auth.
function idTokenPerFirebase() {
  const u = Auth.utenteAttuale(), fb = CONFIG.firebase;
  if (CONFIG.dev && fb?.emulatore && u) return JSON.stringify({ sub: 'dev-' + u.email, email: u.email, email_verified: true, name: u.nome });
  return Auth.idTokenGoogle();
}
function copiaStato() {
  if (!motore) return;
  const s = motore.stato();
  veloce.attiva = s.attiva; veloce.motivo = s.motivo; veloce.serveAccesso = s.serveAccesso; veloce.rete = s.rete; veloce.fisso = s.fisso;
  veloce.codice = s.codice; veloce.pubblicate = s.pubblicate; veloce.ricevute = s.ricevute;
  veloce.richieste = motore.richieste().map((r) => ({ id: r.id, email: r.email, nome: r.nome, codice: r.codice }));
}
function pianifica() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!motore) return;
    const c = X.contesto();
    if (!c.io || c.fase === 'fuori' || c.fase === 'spento') {
      const s = motore.stato();
      if (s.stato !== 'spenta' || s.motivo !== 'uscito dall\'aula') motore.ferma('uscito dall\'aula');
      return;
    }
    if (motore.attiva()) { motore.ricalcola(); if (c.fase === 'pronto') motore.chiaveArrivata(); else motore.avviaChiave(); }
    else motore.avvia();
  }, 250);
}

export function avviaVeloce() {
  const cfg = CONFIG.firebase;
  if (motore || !REALE || !configurata(cfg)) return;
  motore = creaMotore({
    cfg, backend: backendPigro(cfg), ora: Date.now,
    sync: { ...X, idToken: idTokenPerFirebase, cambiato: copiaStato, consegnaManuale: () => veloce.manuale },
    memoria: { leggi: (k) => leggiLocale(K_MEMORIA + k), scrivi: (k, v) => scriviLocale(K_MEMORIA + k, v) },
    log: (m) => { try { console.info('[corsia veloce] ' + m); } catch { /* ok */ } },
  });
  ganciVeloce.attiva = () => motore.attiva();
  ganciVeloce.manuale = () => veloce.manuale && motore.attiva();   // senza corsia non ci sono codici da controllare: si consegna come sempre
  ganciVeloce.pubblica = (recs) => motore.pubblica(recs);
  ganciVeloce.chiaveArrivata = () => motore.chiaveArrivata();
  veloce.presente = true;
  copiaStato();
  // ogni volta che la sincronizzazione cambia (fase, profilo, ambiti visibili) la corsia si riallinea
  $effect.root(() => {
    $effect(() => {
      sync.fase; sync.io; sync.cfg; sync.ambiti.join('|');
      untrack(pianifica);
    });
  });
  Auth.alCambio((u) => { if (u && motore && !motore.attiva()) motore.avvia({ forza: true }); });
  window.addEventListener('online', () => { const s = motore.stato(); if (!s.attiva && s.rete) motore.avvia({ forza: true }); });
  // tornando all'app dopo un po': una corsia spenta per un guasto passeggero ci riprova (non per la quota, non se la causa è ferma)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const s = motore.stato();
    if (!s.attiva && !s.fisso && !s.serveAccesso && s.spentaIl && Date.now() - s.spentaIl > 600000) motore.avvia();
  });
  pianifica();
}

/** «Riprova» (e, dopo un accesso con Google nuovo, «Attiva la corsia veloce»). */
export async function riprovaVeloce() { if (motore) await motore.avvia({ forza: true }); copiaStato(); }
export async function attivaVeloce() {
  if (!motore) return false;
  if (!idTokenPerFirebase()) await Auth.rinnovaGoogle();   // un accesso con Google al volo, senza uscire dall'app
  const r = await motore.avvia({ forza: true });
  copiaStato();
  return r;
}
export async function consegnaVeloce(id) { if (!motore) return false; const r = await motore.consegna(id); copiaStato(); return r; }
export function impostaManuale(si) { veloce.manuale = !!si; scriviLocale(K_MANUALE, si ? '1' : '0'); if (!si && motore) motore.smista().catch(() => {}); }
export const _motore = () => motore;
