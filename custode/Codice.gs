/**
 * PsyDiary — custode su Google Apps Script.
 *
 * Collega la logica (core.js, incollata sopra in fase di composizione) ai
 * servizi Google: Drive per i file, LockService per le scritture, UrlFetch per
 * verificare chi accede. Le regole su chi può fare cosa stanno tutte in core.js.
 *
 * Messa in servizio: docs/messa-in-servizio.md. In breve:
 *   1. il client ID di Google arriva da Configurazione.gs (generato dalla
 *      GitHub Action) o dalla proprietà dello script GOOGLE_CLIENT_ID;
 *   2. esegui una volta `configura` dall'editor: autorizza il custode e crea la cartella dei dati;
 *   3. Distribuisci come app web: "Esegui come: Me", "Chi ha accesso: Chiunque".
 */

var VERSIONE_CUSTODE = '1.0.0';
var PROP = PropertiesService.getScriptProperties();

function impostazione_(nome) {
  var c = (typeof CONFIGURAZIONE !== 'undefined' && CONFIGURAZIONE) || {};
  return PROP.getProperty(nome) || c[nome] || '';
}

function doPost(e) {
  var risposta;
  try {
    var corpo = (e && e.postData && e.postData.contents) || '';
    if (corpo.length > 20 * 1024 * 1024) risposta = { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta troppo grande.' };
    else {
      var richiesta;
      try { richiesta = JSON.parse(corpo); } catch (e) { richiesta = undefined; }
      risposta = richiesta === undefined
        ? { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta non leggibile.' }
        : custode_().gestisci(richiesta);
    }
  } catch (err) {
    // Configurazione o servizi Google (Drive, cache) non disponibili: l'app riprova
    risposta = { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(err && err.message || err).slice(0, 300) };
  }
  return ContentService.createTextOutput(JSON.stringify(risposta)).setMimeType(ContentService.MimeType.JSON);
}

// Per controllare dal browser che il custode risponda. Non espone dati.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, servizio: 'custode PsyDiary', versione: VERSIONE_CUSTODE,
    configurato: !!(PROP.getProperty('CARTELLA_RADICE') && impostazione_('GOOGLE_CLIENT_ID')),
  })).setMimeType(ContentService.MimeType.JSON);
}

var _custode = null;
// Le chiavi della cache di Apps Script hanno un limite di lunghezza
function chiaveCache_(k) {
  return 'r:' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

// Chi ospita il custode, sempre operatore. Lo si legge da Google una volta e lo
// si ricorda nelle proprietà dello script: se Google per un attimo non lo dice,
// il proprietario non viene scambiato per uno sconosciuto.
function proprietario_() {
  var p = impostazione_('PROPRIETARIO');
  if (p) return String(p).trim().toLowerCase();
  var e = '';
  try { e = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (x) { e = ''; }
  if (e) { try { PROP.setProperty('PROPRIETARIO', e); } catch (x) { /* si riprova la prossima volta */ } }
  return e;
}

function custode_() {
  if (_custode) return _custode;
  _custode = PD.creaCustode({
    archivio: archivioDrive_(),
    verificaToken: verificaToken_,
    proprietario: proprietario_,
    ora: function () { return new Date().toISOString(); },
    // Risposte alle scritture gia' fatte, per i reinvii dell'app (10 minuti)
    ricordo: {
      leggi: function (k) { return CacheService.getScriptCache().get(chiaveCache_(k)); },
      scrivi: function (k, v) { CacheService.getScriptCache().put(chiaveCache_(k), v, 600); },
    },
  });
  return _custode;
}

// Verifica dell'ID token di "Accedi con Google": solo chi sei, nessun accesso
// al tuo Drive o alla posta.
function verificaToken_(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new Error('token mancante');
  var clientIds = impostazione_('GOOGLE_CLIENT_ID').split(/[\s,]+/).filter(Boolean);
  if (!clientIds.length) throw new Error('GOOGLE_CLIENT_ID non configurato');
  var cache = CacheService.getScriptCache();
  var chiave = 'tok:' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var inCache = cache.get(chiave);
  if (inCache) return JSON.parse(inCache);
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('token rifiutato da Google');
  var t = JSON.parse(r.getContentText());
  if (clientIds.indexOf(t.aud) < 0) throw new Error('token emesso per un\'altra app');
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw new Error('emittente non valido');
  if (String(t.email_verified) !== 'true') throw new Error('email non verificata');
  var adesso = Math.floor(Date.now() / 1000), scade = Number(t.exp);
  if (!(scade > adesso)) throw new Error('token scaduto');
  var identita = { email: String(t.email).toLowerCase(), nome: t.given_name || t.name || t.email };
  cache.put(chiave, JSON.stringify(identita), Math.max(1, Math.min(21600, scade - adesso - 60)));
  return identita;
}
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }

// Archivio su Drive, con percorsi tipo "Dati/ragazzi/rluca01.json"
function archivioDrive_() {
  var radiceId = PROP.getProperty('CARTELLA_RADICE') || creaCartella_().getId();
  var cache = CacheService.getScriptCache();
  var memoria = {};
  function radice() { return DriveApp.getFolderById(radiceId); }
  function cartella(percorso, crea) {
    if (!percorso) return radice();
    if (memoria['d:' + percorso]) return memoria['d:' + percorso];
    var id = cache.get('d:' + percorso);
    if (id) {
      try { var f = DriveApp.getFolderById(id); memoria['d:' + percorso] = f; return f; } catch (e) { cache.remove('d:' + percorso); }
    }
    var parti = percorso.split('/'), nome = parti.pop();
    var genitore = cartella(parti.join('/'), crea);
    if (!genitore) return null;
    var it = genitore.getFoldersByName(nome);
    var trovata = it.hasNext() ? it.next() : (crea ? genitore.createFolder(nome) : null);
    if (trovata) { cache.put('d:' + percorso, trovata.getId(), 21600); memoria['d:' + percorso] = trovata; }
    return trovata;
  }
  function file(percorso) {
    if (memoria['f:' + percorso] !== undefined) return memoria['f:' + percorso];
    var id = cache.get('f:' + percorso);
    if (id) {
      try { var f = DriveApp.getFileById(id); if (!f.isTrashed()) { memoria['f:' + percorso] = f; return f; } } catch (e) { /* cercato per nome */ }
      cache.remove('f:' + percorso);
    }
    var parti = percorso.split('/'), nome = parti.pop();
    var dir = cartella(parti.join('/'), false), trovato = null;
    if (dir) {
      var it = dir.getFilesByName(nome);
      while (it.hasNext()) { var c = it.next(); if (!c.isTrashed()) { trovato = c; break; } }
    }
    if (trovato) cache.put('f:' + percorso, trovato.getId(), 21600);
    memoria['f:' + percorso] = trovato;
    return trovato;
  }
  // Il contenuto dei file si tiene anche nella cache di Apps Script (molto più
  // veloce di Drive): si aggiorna a ogni scrittura, che passa sempre di qui.
  // I file grandi si spezzano in pezzi da 90 KB; oltre ~900 KB si legge da Drive.
  var PEZZO = 90000, MAX_PEZZI = 10;
  // la generazione cambia con svuotaCache(): da lì tutto si rilegge da Drive
  function chiaveC(p) { return 'c' + generazioneCache_() + ':' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p)).slice(0, 40); }
  // undefined: la cache non sa niente; null: il file non c'è; testo: il contenuto
  function daCache(p) {
    if (!daTenere(p)) return undefined;
    var k = chiaveC(p), testa = cache.get(k);
    if (!testa) return undefined;
    try {
      var t = JSON.parse(testa);
      if (t.assente) return null;
      var chiavi = [];
      for (var i = 0; i < t.n; i++) chiavi.push(k + ':' + t.tag + ':' + i);
      var pezzi = cache.getAll(chiavi), out = '';
      for (var j = 0; j < chiavi.length; j++) { if (pezzi[chiavi[j]] == null) return undefined; out += pezzi[chiavi[j]]; }
      return out.length === t.len ? out : undefined;
    } catch (e) { return undefined; }
  }
  // le immagini no: sono tante, grandi e si leggono di rado (riempirebbero la cache)
  var daTenere = function (p) { return p.indexOf('Immagini/') !== 0; };
  function inCache(p, testo) {
    if (!daTenere(p)) return;
    var k = chiaveC(p);
    try {
      if (testo.length > PEZZO * MAX_PEZZI) { cache.remove(k); return; }
      var tag = Math.random().toString(36).slice(2, 8), n = Math.ceil(testo.length / PEZZO), pezzi = {};
      for (var i = 0; i < n; i++) pezzi[k + ':' + tag + ':' + i] = testo.slice(i * PEZZO, (i + 1) * PEZZO);
      cache.putAll(pezzi, 21600);
      cache.put(k, JSON.stringify({ tag: tag, n: n, len: testo.length }), 21600);
    } catch (e) { try { cache.remove(k); } catch (x) { /* solo una comodità */ } }
  }
  function leggiTesto(p) {
    var c = daCache(p);
    if (c !== undefined) return c;
    var f = file(p);
    if (!f) {
      if (daTenere(p)) { try { cache.put(chiaveC(p), JSON.stringify({ assente: true }), 21600); } catch (e) { /* solo una comodità */ } }
      return null;
    }
    var testo = f.getBlob().getDataAsString('UTF-8');
    inCache(p, testo);
    return testo;
  }
  return {
    leggiJSON: function (p) { var t = leggiTesto(p); return t ? JSON.parse(t) : null; },
    scriviJSON: function (p, o) {
      var testo = JSON.stringify(o), f = file(p);
      if (f) { f.setContent(testo); inCache(p, testo); return; }
      var parti = p.split('/'), nome = parti.pop();
      var nuovo = cartella(parti.join('/'), true).createFile(nome, testo, 'application/json');
      cache.put('f:' + p, nuovo.getId(), 21600);
      memoria['f:' + p] = nuovo;
      inCache(p, testo);
    },
    esiste: function (p) { var c = daCache(p); return c !== undefined ? c !== null : !!file(p); },
    conLock: function (fn) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) {
        var e = new Error('Il custode è occupato: riprova tra qualche secondo.');
        e.occupato = true;
        throw e;
      }
      try { return fn(); } finally { lock.releaseLock(); }
    },
  };
}

// La cartella dei dati nel Drive del proprietario, creata al primo bisogno
function creaCartella_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var id = PROP.getProperty('CARTELLA_RADICE');
    if (id) return DriveApp.getFolderById(id);
    var radice = DriveApp.createFolder('PsyDiary · dati cifrati');
    radice.setDescription('Dati di PsyDiary, cifrati. Non spostare né modificare i file a mano.');
    PROP.setProperty('CARTELLA_RADICE', radice.getId());
    return radice;
  } finally { lock.releaseLock(); }
}

/**
 * Da eseguire una volta dall'editor (▶ Esegui). Crea la cartella dei dati nel
 * tuo Drive se non c'è, e controlla la configurazione. Si può rieseguire.
 */
function configura() {
  var radiceId = PROP.getProperty('CARTELLA_RADICE');
  var radice = null;
  if (radiceId) { try { radice = DriveApp.getFolderById(radiceId); } catch (e) { radice = null; } }
  if (!radice) { PROP.deleteProperty('CARTELLA_RADICE'); radice = creaCartella_(); }
  ['_config', 'Dati', 'Dati/ragazzi', 'Storia', 'Immagini'].forEach(function (p) {
    var dir = radice;
    p.split('/').forEach(function (nome) { var it = dir.getFoldersByName(nome); dir = it.hasNext() ? it.next() : dir.createFolder(nome); });
  });
  var clientId = impostazione_('GOOGLE_CLIENT_ID');
  Logger.log('Cartella dei dati: ' + radice.getName() + ' (' + radice.getUrl() + ')');
  Logger.log('Proprietario, sempre operatore: ' + proprietario_());
  Logger.log('Client ID di Google: ' + (clientId || 'MANCA: imposta la proprietà GOOGLE_CLIENT_ID o la variabile di GitHub'));
  // Una chiamata esterna, così l'autorizzazione copre anche la verifica degli accessi
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', { muteHttpExceptions: true });
  Logger.log(clientId ? 'Pronto. Ora: Distribuisci > Nuova distribuzione > App web.' : 'Quasi pronto: manca il client ID.');
}

/**
 * Facoltativo, per un custode più pronto. Apps Script, quando nessuno lo usa
 * per un po', alla prima richiesta impiega qualche secondo a ripartire: un
 * risveglio ogni 10 minuti nelle ore di lavoro lo tiene pronto e rinfresca la
 * cache dei file di configurazione. Esegui una volta `attivaRisveglio` dall'editor
 * (chiede il permesso di creare un attivatore); `disattivaRisveglio` lo toglie.
 * Costa circa un secondo ogni 10 minuti, tra le 7 e le 21.
 */
function attivaRisveglio() {
  disattivaRisveglio();
  ScriptApp.newTrigger('risveglio').timeBased().everyMinutes(10).create();
  Logger.log('Risveglio attivo: ogni 10 minuti, dalle 7 alle 21.');
}
function disattivaRisveglio() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'risveglio') ScriptApp.deleteTrigger(t); });
}
function risveglio() {
  var ora = Number(Utilities.formatDate(new Date(), 'Europe/Rome', 'H'));
  if (ora < 7 || ora >= 21) return;
  var a = archivioDrive_();
  ['_config/accessi.json', '_config/cifratura.json', '_config/dispositivi.json', '_config/stato.json', '_config/pazienti.json']
    .forEach(function (p) { try { a.leggiJSON(p); } catch (e) { /* al prossimo giro */ } });
}

// Dopo una modifica fatta a mano sui file in Drive (da evitare: es. un file
// ripristinato da una versione precedente) il custode continuerebbe a usare la
// copia in cache per qualche ora. svuotaCache, eseguita dall'editor, la fa
// rileggere tutta da Drive.
var _generazione = null;
function generazioneCache_() {
  if (_generazione == null) _generazione = PropertiesService.getScriptProperties().getProperty('GENERAZIONE_CACHE') || '0';
  return _generazione;
}
function svuotaCache() {
  _generazione = Date.now().toString(36);
  PropertiesService.getScriptProperties().setProperty('GENERAZIONE_CACHE', _generazione);
  Logger.log('Cache svuotata: il custode rilegge tutto da Drive.');
}
