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

function custode_() {
  if (_custode) return _custode;
  _custode = PD.creaCustode({
    archivio: archivioDrive_(),
    verificaToken: verificaToken_,
    proprietario: function () { return impostazione_('PROPRIETARIO') || Session.getEffectiveUser().getEmail(); },
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
  return {
    leggiJSON: function (p) { var f = file(p); return f ? JSON.parse(f.getBlob().getDataAsString('UTF-8')) : null; },
    scriviJSON: function (p, o) {
      var testo = JSON.stringify(o), f = file(p);
      if (f) { f.setContent(testo); return; }
      var parti = p.split('/'), nome = parti.pop();
      var nuovo = cartella(parti.join('/'), true).createFile(nome, testo, 'application/json');
      cache.put('f:' + p, nuovo.getId(), 21600);
      memoria['f:' + p] = nuovo;
    },
    esiste: function (p) { return !!file(p); },
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
  Logger.log('Proprietario, sempre operatore: ' + (impostazione_('PROPRIETARIO') || Session.getEffectiveUser().getEmail()));
  Logger.log('Client ID di Google: ' + (clientId || 'MANCA: imposta la proprietà GOOGLE_CLIENT_ID o la variabile di GitHub'));
  // Una chiamata esterna, così l'autorizzazione copre anche la verifica degli accessi
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', { muteHttpExceptions: true });
  Logger.log(clientId ? 'Pronto. Ora: Distribuisci > Nuova distribuzione > App web.' : 'Quasi pronto: manca il client ID.');
}
