#!/usr/bin/env node
/**
 * Custode in locale, per sviluppo e test: stessa logica di Apps Script, file
 * su disco invece che su Drive, e accesso finto ("dev:email|Nome") al posto
 * del token di Google.
 *
 *   node tools/custode-locale.cjs [porta] [cartella]    (PROPRIETARIO=… per il proprietario)
 *   GUASTI=0.3 … perde a caso il 30% delle risposte dopo aver fatto l'azione,
 *   come il 404 di Apps Script: serve a provare i reinvii dell'app.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const PD = require('../custode/core.js');

function archivioSuDisco(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = (x) => path.join(dir, x);
  return {
    leggiJSON: (x) => (fs.existsSync(p(x)) ? JSON.parse(fs.readFileSync(p(x), 'utf8')) : null),
    scriviJSON: (x, o) => { fs.mkdirSync(path.dirname(p(x)), { recursive: true }); fs.writeFileSync(p(x), JSON.stringify(o)); },
    esiste: (x) => fs.existsSync(p(x)),
    conLock: (fn) => fn(),   // un solo processo, richieste in fila
  };
}
function creaLocale(dir, opz = {}) {
  let ora = opz.ora || (() => new Date().toISOString());
  return PD.creaCustode({
    archivio: archivioSuDisco(dir),
    verificaToken: (t) => {
      const m = /^dev:([^|]+)\|?(.*)$/.exec(t || '');
      if (!m) throw new Error('token');
      return { email: m[1].toLowerCase(), nome: m[2] || m[1] };
    },
    proprietario: () => opz.proprietario || process.env.PROPRIETARIO || 'proprietario@esempio.it',
    ora: () => ora(),
    ricordo: (() => { const m = new Map(); return { leggi: (k) => m.get(k) || null, scrivi: (k, v) => m.set(k, v) }; })(),
  });
}
module.exports = { creaLocale, archivioSuDisco };

if (require.main === module) {
  const porta = Number(process.argv[2] || 8787);
  const dir = path.resolve(process.argv[3] || '.custode-locale');
  const c = creaLocale(dir);
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'content-type'); res.end(); return; }
    if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, servizio: 'custode PsyDiary (locale)' })); return; }
    let corpo = '';
    req.on('data', (d) => { corpo += d; });
    req.on('end', () => {
      let r;
      try { r = c.gestisci(JSON.parse(corpo)); } catch (e) { r = { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta non leggibile.' }; }
      if (Math.random() < Number(process.env.GUASTI || 0)) { res.statusCode = 404; res.end('<html>Sorry, unable to open the file at this time.</html>'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(r));
    });
  }).listen(porta, () => console.log(`custode locale su http://localhost:${porta} · dati in ${dir}`));
}
