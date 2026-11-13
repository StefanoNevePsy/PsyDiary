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

var VERSIONE_CUSTODE = '1.1.0';
var PROP = PropertiesService.getScriptProperties();

// ---- misure: quante operazioni su Drive, cache e proprietà e quanto durano ----
// Vanno nella risposta (campo «fasi.ops»: nome → [quante, millisecondi]) e l'app le mostra in
// Impostazioni > Velocità del custode > Dettagli. Costano un'occhiata all'orologio per operazione.
var _misure = null;
function op_(nome, fn) {
  var m = _misure;
  if (!m) return fn();
  var t = Date.now();
  try { return fn(); }
  finally { var x = m[nome] || (m[nome] = [0, 0]); x[0]++; x[1] += Date.now() - t; }
}
function prop_(k) { return op_('prop', function () { return PROP.getProperty(k); }); }
// la cache di Apps Script, con le misure
function cacheServizio_() {
  var c = CacheService.getScriptCache();
  return {
    get: function (k) { return op_('cache', function () { return c.get(k); }); },
    getAll: function (ks) { return op_('cache', function () { return c.getAll(ks); }); },
    put: function (k, v, s) { return op_('cache', function () { return c.put(k, v, s); }); },
    putAll: function (o, s) { return op_('cache', function () { return c.putAll(o, s); }); },
    remove: function (k) { return op_('cache', function () { return c.remove(k); }); },
  };
}

function impostazione_(nome) {
  var c = (typeof CONFIGURAZIONE !== 'undefined' && CONFIGURAZIONE) || {};
  return prop_(nome) || c[nome] || '';
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
    corsiaVeloce: !!impostazione_('FIREBASE_PROJECT_ID'),
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
    creaSessione: creaSessione_,
    proprietario: proprietario_,
    ora: function () { return new Date().toISOString(); },
    // Risposte alle scritture gia' fatte, per i reinvii dell'app (10 minuti)
    // Lo "stato" (accessi, chiave, dispositivi, registro, revisioni) per rispondere senza leggere file
    cache: cacheStato_(),
    // Corsia veloce (facoltativa): copia degli accessi su Firestore. Esiste solo se è impostata la proprietà
    // FIREBASE_PROJECT_ID (si fa con configuraFirebase, vedi docs/firebase.md); senza, il custode è quello di sempre.
    specchio: firestore_(),
    misure: { inizia: function () { _misure = {}; }, leggi: function () { var m = _misure; _misure = null; return m; } },
    ricordo: {
      leggi: function (k) { return cacheServizio_().get(chiaveCache_(k)); },
      scrivi: function (k, v) { cacheServizio_().put(chiaveCache_(k), v, 600); },
    },
  });
  return _custode;
}

// ---------------------------------------------------------------------------
// Firestore (corsia veloce): solo la copia degli accessi, scritta da qui e da nessun altro.
// Usa l'account del proprietario (ScriptApp.getOAuthToken, scope datastore): per questo il progetto
// Apps Script va collegato allo STESSO progetto Google Cloud di Firebase (docs/firebase.md).
// ---------------------------------------------------------------------------
function firestore_() {
  var progetto = impostazione_('FIREBASE_PROJECT_ID');
  if (!progetto) return null;
  var base = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(progetto) + '/databases/(default)/documents';
  function chiama(azione, corpo) {
    var r = op_('firestore', function () {
      return UrlFetchApp.fetch(base + azione, {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(corpo), muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      });
    });
    var codice = r.getResponseCode();
    if (codice < 200 || codice >= 300) throw new Error('Firestore ' + codice + ': ' + String(r.getContentText()).slice(0, 200));
    return JSON.parse(r.getContentText() || 'null');
  }
  return {
    progetto: progetto,
    commit: function (corpo) { return chiama(':commit', corpo); },
    interroga: function (corpo) { return chiama(':runQuery', corpo); },
  };
}

// Cache dello stato per core.js: testo con scadenza in secondi (al massimo 6 ore). I valori sopra
// 90 KB si spezzano in pezzi (fino a ~900 KB); chi legge ricompone, e se manca un pezzo è come
// se la voce non ci fosse. La generazione cambia con svuotaCache().
function cacheStato_() {
  var cache = cacheServizio_(), PEZZO = 90000, MAX_PEZZI = 10;
  function chiave(k) { return 'q' + generazioneCache_() + ':' + k; }
  return {
    get: function (k) {
      var kk = chiave(k), t = cache.get(kk);
      if (!t || t.charAt(0) !== '#') return t || null;
      var h = t.slice(1).split(':'), n = Number(h[1]), len = Number(h[2]), ks = [];
      for (var i = 0; i < n; i++) ks.push(kk + ':' + h[0] + ':' + i);
      var pezzi = cache.getAll(ks), out = '';
      for (var j = 0; j < ks.length; j++) { if (pezzi[ks[j]] == null) return null; out += pezzi[ks[j]]; }
      return out.length === len ? out : null;
    },
    put: function (k, v, ttl) {
      var kk = chiave(k), s = Math.max(1, Math.min(21600, ttl || 21600));
      if (v.length <= PEZZO) { cache.put(kk, v, s); return; }
      if (v.length > PEZZO * MAX_PEZZI) throw new Error('valore troppo grande per la cache');
      var tag = Math.random().toString(36).slice(2, 8), n = Math.ceil(v.length / PEZZO), pezzi = {};
      for (var i = 0; i < n; i++) pezzi[kk + ':' + tag + ':' + i] = v.slice(i * PEZZO, (i + 1) * PEZZO);
      cache.putAll(pezzi, s);
      cache.put(kk, '#' + tag + ':' + n + ':' + v.length, s);
    },
    remove: function (k) { cache.remove(chiave(k)); },
  };
}

// Verifica dell'ID token di "Accedi con Google": solo chi sei, nessun accesso
// al tuo Drive o alla posta.
// Sessione del custode: «s1.<dati>.<firma>», firmata con un segreto che il custode crea
// da solo nelle proprietà dello script. Dura SESSIONE_GIORNI giorni e l'app la rinnova usandola.
var SESSIONE_GIORNI = 180;
var _segreto = null;
function segretoSessione_() {
  if (_segreto) return _segreto;
  var s = prop_('SESSIONE_SEGRETO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); PROP.setProperty('SESSIONE_SEGRETO', s); }
  _segreto = s;
  return s;
}
function firmaSessione_(dati) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(dati, segretoSessione_())).replace(/=+$/, '');
}
function creaSessione_(id) {
  var scade = Math.floor(Date.now() / 1000) + SESSIONE_GIORNI * 86400;
  var dati = Utilities.base64EncodeWebSafe(JSON.stringify({ e: id.email, n: id.nome, x: scade }), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return { token: 's1.' + dati + '.' + firmaSessione_(dati), scade: scade };
}
function verificaSessione_(token) {
  var p = token.split('.');
  if (p.length !== 3 || firmaSessione_(p[1]) !== p[2]) throw new Error('sessione non valida');
  var d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[1])).getDataAsString());
  if (!(d.x > Date.now() / 1000)) throw new Error('sessione scaduta');
  return { email: String(d.e).toLowerCase(), nome: d.n || d.e, sessione: true };
}
function verificaToken_(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new Error('token mancante');
  if (token.indexOf('s1.') === 0) return verificaSessione_(token);
  var clientIds = impostazione_('GOOGLE_CLIENT_ID').split(/[\s,]+/).filter(Boolean);
  if (!clientIds.length) throw new Error('GOOGLE_CLIENT_ID non configurato');
  var cache = cacheServizio_();
  var chiave = 'tok:' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var inCache = cache.get(chiave);
  if (inCache) return JSON.parse(inCache);
  var r = op_('fetch', function () { return UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true }); });
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
// Operazioni Drive per un salvataggio normale (con gli identificativi dei file in cache): per ogni
// file scritto `getFileById` + `setContent`, e basta. Le ricerche per nome (`getFoldersByName`,
// `getFilesByName`) si fanno solo la prima volta che un file o una cartella viene incontrato.
function archivioDrive_() {
  var radiceId = prop_('CARTELLA_RADICE') || creaCartella_().getId();
  var cache = cacheServizio_();
  var memoria = {};
  function radice() { return op_('getFolderById', function () { return DriveApp.getFolderById(radiceId); }); }
  function cartella(percorso, crea) {
    if (!percorso) return radice();
    if (memoria['d:' + percorso]) return memoria['d:' + percorso];
    var id = cache.get('d:' + percorso);
    if (id) {
      try { var f = op_('getFolderById', function () { return DriveApp.getFolderById(id); }); memoria['d:' + percorso] = f; return f; } catch (e) { cache.remove('d:' + percorso); }
    }
    var parti = percorso.split('/'), nome = parti.pop();
    var genitore = cartella(parti.join('/'), crea);
    if (!genitore) return null;
    var trovata = op_('cercaCartella', function () { var it = genitore.getFoldersByName(nome); return it.hasNext() ? it.next() : null; });
    if (!trovata && crea) trovata = op_('createFolder', function () { return genitore.createFolder(nome); });
    if (trovata) { cache.put('d:' + percorso, trovata.getId(), 21600); memoria['d:' + percorso] = trovata; }
    return trovata;
  }
  function file(percorso) {
    if (memoria['f:' + percorso] !== undefined) return memoria['f:' + percorso];
    var id = cache.get('f:' + percorso);
    if (id) {
      // l'identificativo in cache è fidato: niente controllo del cestino (un'operazione Drive in più
      // a ogni file). Se qualcuno butta un file a mano resta la copia in cache: serve svuotaCache.
      try { var f = op_('getFileById', function () { return DriveApp.getFileById(id); }); memoria['f:' + percorso] = f; return f; } catch (e) { /* cercato per nome */ }
      cache.remove('f:' + percorso);
    }
    var parti = percorso.split('/'), nome = parti.pop();
    var dir = cartella(parti.join('/'), false), trovato = null;
    if (dir) {
      trovato = op_('cercaFile', function () {
        var it = dir.getFilesByName(nome);
        while (it.hasNext()) { var c = it.next(); if (!c.isTrashed()) return c; }
        return null;
      });
    }
    if (trovato) cache.put('f:' + percorso, trovato.getId(), 21600);
    memoria['f:' + percorso] = trovato;
    return trovato;
  }
  // Il contenuto dei file si tiene anche nella cache di Apps Script (molto più
  // veloce di Drive): si aggiorna a ogni scrittura, che passa sempre di qui.
  // I file grandi si spezzano in pezzi da 90 KB; oltre ~2,7 MB si legge da Drive.
  var PEZZO = 90000, MAX_PEZZI = 30;
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
      if (testo == null) { cache.put(k, JSON.stringify({ assente: true }), 21600); return; }
      if (testo.length > PEZZO * MAX_PEZZI) { cache.remove(k); return; }
      var tag = Math.random().toString(36).slice(2, 8), n = Math.ceil(testo.length / PEZZO), pezzi = {};
      for (var i = 0; i < n; i++) pezzi[k + ':' + tag + ':' + i] = testo.slice(i * PEZZO, (i + 1) * PEZZO);
      cache.putAll(pezzi, 21600);
      cache.put(k, JSON.stringify({ tag: tag, n: n, len: testo.length }), 21600);
    } catch (e) { try { cache.remove(k); } catch (x) { /* solo una comodità */ } }
  }
  // Una copia letta da Drive entra in cache solo se nessuno può scrivere intanto:
  // dentro il lucchetto delle scritture, o prendendolo se è libero. Altrimenti una
  // lettura lenta potrebbe rimettere in cache la versione vecchia di un file
  // appena salvato da un'altra persona.
  var inLock = false;
  function testoDrive(p) { var f = file(p); return f ? op_('leggi', function () { return f.getBlob().getDataAsString('UTF-8'); }) : null; }
  function leggiTesto(p) {
    var c = daCache(p);
    if (c !== undefined) return c;
    if (inLock || !daTenere(p)) { var t = testoDrive(p); if (inLock) inCache(p, t); return t; }
    var lock = LockService.getScriptLock();
    if (lock.tryLock(0)) {
      try { var t2 = testoDrive(p); inCache(p, t2); return t2; } finally { lock.releaseLock(); }
    }
    return testoDrive(p);
  }
  return {
    leggiJSON: function (p) { var t = leggiTesto(p); return t ? JSON.parse(t) : null; },
    scriviJSON: function (p, o) {
      var testo = JSON.stringify(o), f = file(p);
      if (f) { op_('setContent', function () { f.setContent(testo); }); inCache(p, testo); return; }
      var parti = p.split('/'), nome = parti.pop();
      var dir = cartella(parti.join('/'), true);
      var nuovo = op_('createFile', function () { return dir.createFile(nome, testo, 'application/json'); });
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
      inLock = true;
      try { return fn(); } finally { inLock = false; lock.releaseLock(); }
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
  // lo stato in cache (accessi, chiave, dispositivi…): se è scaduto o sparito si rifà, così la prima richiesta è già veloce
  try { custode_().riscalda(); } catch (e) { /* al prossimo giro */ }
  // accessi scaduti: le chiavi dei loro dispositivi si revocano (scrive solo se ce n'è)
  try { custode_().revocaScaduti(); } catch (e) { /* al prossimo giro */ }
  // corsia veloce: la copia degli accessi su Firestore si riallinea e le modifiche vecchie si cancellano
  try { custode_().riallinea(false); } catch (e) { /* al prossimo giro */ }
}

/**
 * Corsia veloce (Firestore, facoltativa). Da eseguire UNA volta dall'editor (▶ Esegui) dopo aver aggiornato il
 * custode e collegato il progetto Google Cloud (docs/firebase.md): scrive la proprietà FIREBASE_PROJECT_ID, copia
 * su Firestore accessi e ambiti e, alla prima esecuzione, chiede il permesso «Cloud Datastore».
 */
var FIREBASE_PROGETTO = 'psydiary-510307';   // il progetto Firebase di PsyDiary (non è un segreto)
function configuraFirebase() { impostaFirebase(FIREBASE_PROGETTO); }
/** Come configuraFirebase, ma con l'id di un altro progetto: impostaFirebase('nome-del-progetto'). */
function impostaFirebase(idProgetto) {
  if (!idProgetto) throw new Error('Scrivi l\'id del progetto Firebase: impostaFirebase(\'nome-del-progetto\')');
  PROP.setProperty('FIREBASE_PROJECT_ID', String(idProgetto).trim());
  _custode = null;
  var r = custode_().riallinea(true);
  Logger.log('Corsia veloce attiva sul progetto ' + idProgetto + ': ' + r.copia + ' documenti scritti, ' + r.pulite + ' modifiche vecchie cancellate.');
}
/** Dopo aver svuotato Firestore, o per riparare: riscrive tutta la copia degli accessi. */
function riallineaFirebase() {
  _custode = null;
  var r = custode_().riallinea(true);
  Logger.log(r.attivo ? 'Copia riscritta: ' + r.copia + ' documenti.' : 'La corsia veloce non è impostata (configuraFirebase).');
}
function disattivaFirebase() {
  PROP.deleteProperty('FIREBASE_PROJECT_ID');
  _custode = null;
  Logger.log('Corsia veloce spenta: le app tornano a usare solo il custode.');
}

// Dopo una modifica fatta a mano sui file in Drive (da evitare: es. un file
// ripristinato da una versione precedente) il custode continuerebbe a usare la
// copia in cache per qualche ora. svuotaCache, eseguita dall'editor, la fa
// rileggere tutta da Drive.
var _generazione = null;
function generazioneCache_() {
  if (_generazione == null) _generazione = prop_('GENERAZIONE_CACHE') || '0';
  return _generazione;
}
function svuotaCache() {
  _generazione = Date.now().toString(36);
  PropertiesService.getScriptProperties().setProperty('GENERAZIONE_CACHE', _generazione);
  Logger.log('Cache svuotata: il custode rilegge tutto da Drive.');
}
