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
// Cache in memoria, come CacheService: solo testo, con scadenza in secondi (per i test: `scadi()` la svuota)
function cacheInMemoria() {
  const m = new Map();
  return {
    get: (k) => { const x = m.get(k); return x && x.fine > Date.now() ? x.v : null; },
    put: (k, v, ttl) => { if (typeof v !== 'string') throw new Error('la cache vuole testo'); m.set(k, { v, fine: Date.now() + Math.min(ttl || 600, 21600) * 1000 }); },
    remove: (k) => { m.delete(k); },
    scadi: () => m.clear(),
  };
}
function creaLocale(dir, opz = {}) {
  let ora = opz.ora || (() => new Date().toISOString());
  const base = archivioSuDisco(dir);
  // conta le letture e le scritture di file (le immagini no): serve a vedere quanto costa una richiesta
  const conta = { letture: 0, scritture: 0, file: [] };
  const archivio = { ...base,
    leggiJSON: (x) => { conta.letture++; conta.file.push(x); return base.leggiJSON(x); },
    scriviJSON: (x, o) => { if (conta.guastoSu && x.includes(conta.guastoSu)) throw new Error('guasto di prova su ' + x); conta.scritture++; return base.scriviJSON(x, o); },
  };
  const cache = opz.cache === false ? undefined : opz.cache || cacheInMemoria();
  const custode = PD.creaCustode({
    archivio,
    cache,
    creaSessione: (id) => {
      const scade = Math.floor(Date.now() / 1000) + 180 * 86400;
      const d = Buffer.from(JSON.stringify({ e: id.email, n: id.nome, x: scade })).toString('base64url');
      return { token: 's1.' + d + '.' + require('crypto').createHmac('sha256', SEGRETO).update(d).digest('base64url'), scade };
    },
    verificaToken: (t) => {
      if (typeof t === 'string' && t.startsWith('s1.')) {
        const p = t.split('.'), f = require('crypto').createHmac('sha256', SEGRETO).update(p[1] || '').digest('base64url');
        if (p.length !== 3 || f !== p[2]) throw new Error('sessione non valida');
        const d = JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8'));
        if (!(d.x > Date.now() / 1000)) throw new Error('sessione scaduta');
        return { email: String(d.e).toLowerCase(), nome: d.n || d.e, sessione: true };
      }
      const m = /^dev:([^|]+)\|?(.*)$/.exec(t || '');
      if (!m) throw new Error('token');
      return { email: m[1].toLowerCase(), nome: m[2] || m[1] };
    },
    proprietario: () => opz.proprietario || process.env.PROPRIETARIO || 'proprietario@esempio.it',
    ora: () => ora(),
    ricordo: (() => { const m = new Map(); return { leggi: (k) => m.get(k) || null, scrivi: (k, v) => m.set(k, v) }; })(),
  });
  custode.conta = conta; custode.cache = cache;
  return custode;
}
const SEGRETO = require('crypto').randomBytes(32).toString('hex');
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
      try {
        const q = JSON.parse(corpo), l0 = c.conta.letture;
        r = c.gestisci(q);
        // CONTA=1: una riga per richiesta, con quanti file ha letto (a riposo devono essere zero)
        if (process.env.CONTA) console.log(`${q.azione}${q.azione === 'sync' ? (q.dati && q.dati.invii && q.dati.invii.length ? ' (invio)' : '') : ''} · ${r.ms} ms · ${c.conta.letture - l0} letture di file`);
      } catch (e) { r = { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta non leggibile.' }; }
      if (Math.random() < Number(process.env.GUASTI || 0)) { res.statusCode = 404; res.end('<html>Sorry, unable to open the file at this time.</html>'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(r));
    });
  }).listen(porta, () => console.log(`custode locale su http://localhost:${porta} · dati in ${dir}`));
}
