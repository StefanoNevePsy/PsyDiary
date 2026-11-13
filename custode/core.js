/**
 * PsyDiary — logica del custode.
 *
 * Nessun servizio Google qui dentro: l'"ambiente" (archivio, verifica del
 * token, orologio) arriva da fuori. La stessa logica gira su Google Apps
 * Script (Codice.gs) e in locale (tools/custode-locale.js), dove è testata.
 *
 * I dati arrivano GIÀ CIFRATI dall'app (AES-256-GCM, chiave dell'aula che il
 * custode non conosce). Il custode vede solo buste opache con pochi metadati
 * e decide chi può leggere e scrivere cosa.
 *
 * Ogni "voce" (ragazzo, scheda, gruppo, seduta, nota, idea in sospeso) sta in
 * un AMBITO:
 *   - "aula": tutto ciò che vede chiunque ha accesso all'aula (gruppi, sedute
 *     di gruppo, note di gruppo e "nel gruppo", nome e foto dei ragazzi);
 *   - "r:<id>": il resto di un ragazzo (anagrafica, individuali, genitori,
 *     conoscenza, note personali). Agli altri non arriva nemmeno cifrato.
 *
 * Chi vede "r:<id>" (registro _config/pazienti.json):
 *   - paziente riservato (tutti quelli creati da ora in poi): chi l'ha
 *     creato, le persone con cui l'ha condiviso, i tirocinanti a cui è
 *     assegnato. Di un riservato anche nome e foto stanno in "r:<id>".
 *   - paziente "di tutta l'aula" (quelli di prima, o riservati aperti a
 *     tutti): tutti gli operatori, più i tirocinanti a cui è assegnato.
 *   Se chi l'ha creato non è più abilitato, lo vede chi ospita il custode,
 *   che può passarlo a qualcun altro.
 *   - "g:<id>": un gruppo o una classe riservati, con le loro sedute, note,
 *     ricorrenze e idee in sospeso. Stesse regole: chi l'ha creato, le
 *     persone scelte (anche tirocinanti), tutti gli operatori se aperto.
 *     I gruppi "di tutta l'aula" (quelli di prima, o aperti) stanno in "aula".
 *
 * Corsia veloce (facoltativa): se l'ambiente fornisce `specchio` (Firestore, via REST) il custode
 * scrive lì, e solo lui, una COPIA di chi vede quali ambiti (vedi copiaFirestore). Le regole di
 * Firestore (firestore.rules) decidono su quella copia; i dati restano buste cifrate.
 *
 * Tutto è sincrono di proposito: in Apps Script lo sono anche Drive e UrlFetch.
 */
var PD = (function () {
  'use strict';

  var SCHEMA = 1;
  var RUOLI = ['admin', 'tirocinante'];
  var TIPI = ['ragazzo', 'scheda', 'gruppo', 'seduta', 'nota', 'sospeso', 'serie', 'programma'];
  // I tirocinanti scrivono ma non gestiscono: niente ragazzi, schede, gruppi.
  var SOLO_ADMIN = { ragazzo: true, scheda: true, gruppo: true, serie: true, programma: true };
  var STORIA_PER_VOCE = 15;   // versioni precedenti tenute per ogni voce
  var BOZZE_MS = 30 * 60000;  // salvataggi della stessa persona entro 30 minuti: una versione sola
  // ...ed entro 3 minuti dall'ultima versione archiviata non si riscrive nemmeno il file della storia
  var RAFFICA_MS = 3 * 60000;
  // Quanti ambiti al massimo possono essere «sporchi» (scritti più volte senza riscrivere lo stato su Drive)
  var MAX_SPORCHI = 8;

  // "r:" pazienti, "g:" gruppi e classi, "p:" programmi riservati
  var CARTELLA = { r: 'ragazzi/', g: 'gruppi/', p: 'programmi/' };
  var P = {
    accessi: '_config/accessi.json',
    cifratura: '_config/cifratura.json',
    dispositivi: '_config/dispositivi.json',
    stato: '_config/stato.json',
    pazienti: '_config/pazienti.json',
    esportazioni: '_config/esportazioni.json',
    specchio: '_config/specchio.json',
    ambito: function (a) { return a === 'aula' ? 'Dati/aula.json' : 'Dati/' + CARTELLA[a[0]] + a.slice(2) + '.json'; },
    storia: function (a) { return a === 'aula' ? 'Storia/aula.json' : 'Storia/' + CARTELLA[a[0]] + a.slice(2) + '.json'; },
    immagine: function (a, id) { return 'Immagini/' + (a === 'aula' ? 'aula' : a[0] === 'r' ? a.slice(2) : CARTELLA[a[0]] + a.slice(2)) + '/' + id + '.json'; },
  };

  var RE = {
    id: /^[a-z0-9]{2,40}$/,
    ambito: /^(aula|[rgp]:[a-z0-9]{2,40})$/,
    email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/,
    kid: /^[a-z0-9-]{1,40}$/,
    dispositivo: /^[a-z0-9]{8,40}$/,
    b64: /^[A-Za-z0-9+/]*={0,2}$/,
    data: /^\d{4}-\d{2}-\d{2}$/,
  };

  function Errore(codice, messaggio, extra) { this.codice = codice; this.message = messaggio || codice; this.extra = extra || null; }
  function err(c, m, x) { return new Errore(c, m, x); }

  // ---- validazione: l'endpoint è pubblico, tutto ciò che entra passa di qui ----
  function testoV(v, max, obbl, campo) {
    if (v === undefined || v === null || v === '') { if (obbl) throw err('richiesta-non-valida', 'Manca ' + campo); return null; }
    if (typeof v !== 'string') throw err('richiesta-non-valida', campo + ' deve essere testo');
    if (v.length > max) throw err('richiesta-non-valida', campo + ' troppo lungo');
    return v;
  }
  function interoV(v, min, max, campo) {
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < min || v > max) throw err('richiesta-non-valida', campo + ' non valido');
    return v;
  }
  function idV(v, re, campo) { if (typeof v !== 'string' || !re.test(v)) throw err('richiesta-non-valida', campo + ' non valido'); return v; }
  function oggettoV(v, campo) { if (!v || typeof v !== 'object' || Array.isArray(v)) throw err('richiesta-non-valida', campo + ' non valido'); return v; }
  function listaV(v, max, campo) {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > max) throw err('richiesta-non-valida', campo + ' non valido');
    return v;
  }
  function b64V(v, max, campo) {
    var t = testoV(v, max, true, campo);
    if (!RE.b64.test(t) || t.length % 4) throw err('richiesta-non-valida', campo + ' non valido');
    return t;
  }
  function bustaV(b, max, campo) {
    oggettoV(b, campo);
    if (b.v !== 1 || b.alg !== 'A256GCM') throw err('richiesta-non-valida', campo + ': cifratura non supportata');
    var iv = testoV(b.iv, 24, true, campo + '.iv');
    if (!RE.b64.test(iv) || iv.length !== 16) throw err('richiesta-non-valida', campo + '.iv non valido');
    return { v: 1, alg: 'A256GCM', kid: idV(b.kid, RE.kid, campo + '.kid'), iv: iv, comp: b.comp === 'gzip' ? 'gzip' : 'no', dati: b64V(b.dati, max, campo + '.dati') };
  }
  var MAX_VOCE = 2 * 1024 * 1024;        // una nota lunghissima, cifrata
  var MAX_IMMAGINE = 8 * 1024 * 1024;    // caratteri base64 (~6 MB)

  function validaCifratura(c) {
    oggettoV(c, 'cifratura');
    var kdf = oggettoV(c.kdf, 'kdf');
    if (kdf.nome !== 'PBKDF2-SHA256') throw err('richiesta-non-valida', 'Derivazione non supportata');
    return {
      schema: SCHEMA, kid: idV(c.kid, RE.kid, 'kid'),
      kdf: { nome: 'PBKDF2-SHA256', iterazioni: interoV(kdf.iterazioni, 100000, 5000000, 'iterazioni'), sale: b64V(kdf.sale, 100, 'sale') },
      verifica: bustaV(c.verifica, 1000, 'verifica'),
    };
  }
  function validaAccessi(a) {
    oggettoV(a, 'accessi');
    var utenti = oggettoV(a.utenti || {}, 'utenti'), out = {};
    Object.keys(utenti).forEach(function (email) {
      var e = String(email).trim().toLowerCase();
      if (!RE.email.test(e)) throw err('richiesta-non-valida', 'Email non valida: ' + email);
      var u = oggettoV(utenti[email], 'utente');
      var ruolo = RUOLI.indexOf(u.ruolo) >= 0 ? u.ruolo : 'tirocinante';
      out[e] = {
        nome: testoV(u.nome, 60, false, 'nome') || e.split('@')[0],
        ruolo: ruolo,
        ragazzi: ruolo === 'admin' ? [] : listaV(u.ragazzi, 2000, 'ragazzi').map(function (x) { return idV(x, RE.id, 'ragazzi'); }),
        // tirocinante con tutti i pazienti dell'operatore che gli dà l'accesso (tuttiDa), anche i futuri
        tuttiRagazzi: ruolo !== 'admin' && u.tuttiRagazzi === true,
        attivo: u.attivo !== false,
        scadenza: u.scadenza ? (RE.data.test(u.scadenza) ? u.scadenza : null) : null,
      };
    });
    return { schema: SCHEMA, utenti: out };
  }
  function stabile(v) {
    if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stabile(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  // Scritture che l'app puo' ripetere quando la risposta si perde per strada
  // (con Apps Script capita: l'azione e' fatta ma l'app vede un errore). Con lo
  // stesso identificativo di richiesta il custode restituisce la risposta di
  // allora invece di rifare l'azione. "sync" si protegge da solo, voce per voce.
  var RIPETIBILI = {
    'cifratura.imposta': true, 'dispositivo.registra': true, 'dispositivi.abilita': true,
    'dispositivo.togli': true, 'accessi.salva': true,
  };
  var RE_RICHIESTA = /^[A-Za-z0-9_-]{8,64}$/;

  function creaCustode(amb) {
    // Ogni file si legge una volta sola per richiesta (con Apps Script ogni lettura, anche dalla
    // cache, costa decine di millisecondi: un giro "niente di nuovo" ne faceva più di dieci).
    // Chi scrive aggiorna la copia; al lucchetto e a ogni richiesta nuova si riparte da zero.
    var A0 = amb.archivio, memoria = {};

    // ---- misure per fasi (restituite nella risposta come «fasi», per il riquadro «Velocità del custode») ----
    var fasi = null;
    function nuoveFasi() { return { attesaLock: 0, tenutoLock: 0, letture: 0, nLetture: 0, scritture: 0, nScritture: 0, cache: 0, nCache: 0, file: [] }; }
    function nomeBreve(p) { return p.replace(/\.json$/, '').replace('Dati/', '').replace('Storia/', 'storia/').replace('_config/', '').replace('ragazzi/', 'r/').replace('Immagini/', 'img/'); }
    function segnaFile(tipo, p, ms) { if (fasi && fasi.file.length < 14) fasi.file.push(tipo + ' ' + nomeBreve(p) + ':' + ms); }
    function letto(p) {
      var t = Date.now();
      try { return A0.leggiJSON(p); }
      finally { if (fasi) { var ms = Date.now() - t; fasi.letture += ms; fasi.nLetture++; segnaFile('L', p, ms); } }
    }
    function scritto(p, o) {
      var t = Date.now();
      try { A0.scriviJSON(p, o); }
      finally { if (fasi) { var ms = Date.now() - t; fasi.scritture += ms; fasi.nScritture++; segnaFile('S', p, ms); } }
    }
    function misuraCache(f) {
      var t = Date.now();
      try { return f(); }
      finally { if (fasi) { fasi.cache += Date.now() - t; fasi.nCache++; } }
    }
    var CA = amb.cache ? {
      get: function (k) { return misuraCache(function () { return amb.cache.get(k); }); },
      put: function (k, v, ttl) { return misuraCache(function () { return amb.cache.put(k, v, ttl); }); },
      remove: function (k) { return misuraCache(function () { return amb.cache.remove(k); }); },
    } : null;

    // ---- corsia rapida: lo "stato" in cache ----
    // I cinque file di configurazione (accessi, chiave, dispositivi, registro dei pazienti, stato
    // con la revisione di ogni ambito, senza l'indice delle voci) stanno anche in un'unica voce
    // di cache (amb.cache: get/put/remove, valori di testo con scadenza in secondi). Fuori dal
    // lucchetto si legge da lì: un giro «niente di nuovo» non legge nessun file.
    //  - Chi scrive un file di configurazione (o un file di dati: cambia la revisione) toglie la voce
    //    PRIMA di scrivere, e a fine lucchetto (se è andato tutto bene) la rifà da quello che sa
    //    già, SENZA rileggere i file. Se qualcosa si interrompe la voce resta tolta e la rifà il
    //    prossimo lettore, sotto il lucchetto, da Drive.
    //  - Dentro il lucchetto ci si fida della voce (se c'è): ogni scrittore la toglie prima di scrivere
    //    e la rifà prima di rilasciare il lucchetto, quindi chi entra la trova esatta oppure assente.
    //    Se è assente si rilegge dai file, lentamente, ma giusto.
    //  - Se la cache manca, scade o non funziona si torna a leggere i file: lentamente, ma giusto.
    //
    // Revisioni senza riscrivere «stato.json» a ogni salvataggio (era una scrittura su Drive in più):
    //  - ogni file di un ambito porta il proprio `rev` (l'ultima revisione che l'ha toccato);
    //  - «stato.json» ha un elenco `sporco` di ambiti che possono essere più avanti di lui:
    //    per gli altri `rev` e `ambiti` di stato.json sono esatti, per quelli sporchi vale il `rev` del loro file;
    //  - un ambito entra in `sporco` con una scrittura completa di stato.json (che si fa anche quando
    //    cambia l'indice delle voci o nasce un ambito); da lì in poi i salvataggi di quell'ambito
    //    scrivono solo il suo file, perché le revisioni vive stanno nella voce di cache;
    //  - se la voce di cache sparisce, chi entra nel lucchetto ricostruisce le revisioni da
    //    stato.json più i file degli ambiti sporchi (al massimo MAX_SPORCHI).
    var CHIAVE_STATO = 'stato1', TTL_STATO = 6 * 3600;
    var DI_STATO = {}; DI_STATO[P.accessi] = 'accessi'; DI_STATO[P.cifratura] = 'cifratura'; DI_STATO[P.dispositivi] = 'dispositivi';
    DI_STATO[P.pazienti] = 'pazienti'; DI_STATO[P.stato] = 'stato';
    var snap;            // fuori dal lucchetto. undefined: non ancora caricato in questa richiesta; null: non disponibile
    var lockSnap = null; // dentro il lucchetto: la voce di cache com'era all'ingresso (null se mancava)
    var vivoL = null;    // dentro il lucchetto: {rev, ambiti, sporco} esatti, modificabili
    var durev;           // dentro il lucchetto: stato.json com'è su Drive (letto solo se serve)
    var statoTolto = false, daRifare = false;
    function copia(o) { var x = {}; Object.keys(o || {}).forEach(function (k) { x[k] = o[k]; }); return x; }
    function cacheTogli() { statoTolto = true; snap = undefined; if (CA) CA.remove(CHIAVE_STATO); }
    // da chiamare prima di scrivere qualunque cosa che cambia lo stato (configurazione o dati)
    function statoMutato() { daRifare = true; if (!statoTolto || !inLock) cacheTogli(); }
    function leggiStatoCache() {
      try {
        var t = CA.get(CHIAVE_STATO);
        if (!t) return null;
        var o = JSON.parse(t);
        return o && o.v === 1 && o.stato && typeof o.stato.rev === 'number' && o.stato.ambiti && typeof o.stato.ambiti === 'object' ? o : null;
      } catch (e) { return null; }
    }
    // stato.json come sta su Drive (dentro il lucchetto, una lettura sola)
    function durevole() {
      if (durev === undefined) durev = A.leggiJSON(P.stato) || { schema: SCHEMA, rev: 0, ambiti: {} };
      return durev;
    }
    // revisioni esatte a partire da stato.json: per gli ambiti sporchi vale il rev scritto nel loro file
    function recupera(d) {
      d = d || { rev: 0, ambiti: {} };
      var v = { rev: d.rev || 0, ambiti: copia(d.ambiti), sporco: copia(d.sporco) };
      Object.keys(v.sporco).forEach(function (a) {
        var f = A.leggiJSON(P.ambito(a));
        if (f && typeof f.rev === 'number') {
          if (!(v.ambiti[a] >= f.rev)) v.ambiti[a] = f.rev;
          if (f.rev > v.rev) v.rev = f.rev;
        }
      });
      return v;
    }
    function vivoInLock() {
      if (!vivoL) {
        var d = lockSnap && lockSnap.stato;
        vivoL = d ? { rev: d.rev, ambiti: copia(d.ambiti), sporco: copia(d.sporco) } : recupera(durevole());
      }
      return vivoL;
    }
    // Dentro il lucchetto: rifà la voce di cache da quello che si sa già (copie in memoria, voce di cache
    // d'ingresso). Legge dai file solo ciò che non ha, cioè quando la voce mancava.
    function scriviStatoCache() {
      if (!CA) return;
      var v = vivoInLock();
      var o = { v: 1, accessi: A.leggiJSON(P.accessi), cifratura: A.leggiJSON(P.cifratura), dispositivi: A.leggiJSON(P.dispositivi),
        pazienti: A.leggiJSON(P.pazienti), stato: { schema: SCHEMA, rev: v.rev, ambiti: v.ambiti, sporco: v.sporco } };
      try { CA.put(CHIAVE_STATO, JSON.stringify(o), TTL_STATO); } catch (e) { try { CA.remove(CHIAVE_STATO); } catch (x) { /* solo una comodità */ } }
    }
    function statoRapido() {
      if (snap !== undefined) return snap;
      snap = null;
      if (!CA) return null;
      try {
        snap = leggiStatoCache();
        if (!snap) {
          // manca: la rifà chi ha il lucchetto, partendo dai file. Se è occupato si leggono i file e basta.
          conLock(function () {
            snap = lockSnap;
            if (!snap) { scriviStatoCache(); snap = leggiStatoCache(); }
          });
        }
      } catch (e) { snap = null; }
      return snap;
    }
    function valoreDi(s, p) { var x = s[DI_STATO[p]]; return x === undefined ? null : x; }
    var A = {
      leggiJSON: function (p) {
        if (p.indexOf('Immagini/') === 0) return letto(p);
        if (!inLock && DI_STATO[p]) { var s = statoRapido(); if (s) return valoreDi(s, p); }
        if (Object.prototype.hasOwnProperty.call(memoria, p)) return memoria[p];
        if (inLock && lockSnap && DI_STATO[p] && p !== P.stato) return valoreDi(lockSnap, p);
        memoria[p] = letto(p);
        return memoria[p];
      },
      scriviJSON: function (p, o) {
        if (p === P.accessi || p === P.pazienti) specchioDaFare = true;   // la copia per Firestore va riallineata
        if (DI_STATO[p]) statoMutato();
        scritto(p, o); if (p.indexOf('Immagini/') !== 0) memoria[p] = o;
      },
      esiste: function (p) { return A0.esiste(p); },
      conLock: function (fn) { return A0.conLock(function () { memoria = {}; return fn(); }); },
    };
    var inLock = false;
    function conLock(fn) {
      if (inLock) return fn();
      var t0 = Date.now(), t1 = t0, ottenuto = false;
      try {
        return A.conLock(function () {
          ottenuto = true; t1 = Date.now(); if (fasi) fasi.attesaLock += t1 - t0;
          inLock = true; statoTolto = false; daRifare = false; vivoL = null; durev = undefined;
          lockSnap = CA ? leggiStatoCache() : null;
          try {
            var r = fn();
            // andato tutto bene: se si è scritto qualcosa che cambia lo stato, lo si rifà
            if (daRifare) scriviStatoCache();
            return r;
          } finally { inLock = false; lockSnap = null; vivoL = null; durev = undefined; if (fasi) fasi.tenutoLock += Date.now() - t1; }
        });
      } finally { if (fasi && !ottenuto) fasi.attesaLock += Date.now() - t0; }   // lucchetto non ottenuto: tutta attesa
    }
    var oggi = function () { return amb.ora().slice(0, 10); };
    // una lettura per richiesta (con Apps Script è una chiamata al servizio delle proprietà)
    var prop = null;
    var proprietario = function () { if (prop === null) prop = String(amb.proprietario() || '').toLowerCase(); return prop; };
    function leggiAccessi() { return A.leggiJSON(P.accessi) || { schema: SCHEMA, version: 0, utenti: {} }; }

    // Chi è una persona abilitata, senza effetti collaterali: { u } oppure { negato: [codice, messaggio] }.
    // La usano utenteDa (a ogni richiesta) e la copia degli accessi per Firestore (copiaFirestore): una
    // logica sola, così le regole di Firestore non possono divergere da quelle del custode.
    function profiloDi(email, nome) {
      var voce = leggiAccessi().utenti[email];
      if (email && email === String(proprietario() || '').trim().toLowerCase()) {
        // chi ospita il custode è sempre operatore: nessuno può chiuderlo fuori
        return { u: { email: email, nome: (voce && voce.nome) || nome || email, ruolo: 'admin', ragazzi: [], proprietario: true } };
      }
      if (!voce) return { negato: ['non-autorizzato', 'L\'account ' + email + ' non è abilitato a PsyDiary. Chiedi a un operatore di aggiungerti.'] };
      if (voce.attivo === false) return { negato: ['disattivato', 'L\'account ' + email + ' è stato disattivato.'] };
      if (voce.scadenza && oggi() > voce.scadenza) return { negato: ['scaduto', 'L\'accesso di ' + email + ' è scaduto il ' + voce.scadenza + '.'] };
      return { u: { email: email, nome: voce.nome || nome || email, ruolo: voce.ruolo, ragazzi: voce.ragazzi || [],
        tuttiDa: voce.ruolo !== 'admin' && voce.tuttiRagazzi && voce.tuttiDa ? voce.tuttiDa : null, scadenza: voce.scadenza || null, proprietario: false } };
    }
    function utenteDa(identita) {
      var email = String(identita.email || '').toLowerCase();
      var p = profiloDi(email, identita.nome);
      if (p.negato) {
        if (p.negato[0] !== 'non-autorizzato') revocaSeServe(email);
        throw err(p.negato[0], p.negato[1]);
      }
      return p.u;
    }
    // Revoca della chiave: chi non è più abilitato (scaduto, disattivato) perde la
    // busta con la chiave dell'aula su tutti i suoi dispositivi. Se torna abilitato,
    // un operatore gliela riconsegna in automatico come a un dispositivo nuovo.
    function revocaChiavi() {
      var disp = leggiDispositivi(), n = 0;
      Object.keys(disp.dispositivi).forEach(function (id) {
        var r = disp.dispositivi[id];
        if (r.chiavi && Object.keys(r.chiavi).length && !abilitato(r.email)) {
          r.chiavi = {}; r.revocatoIl = amb.ora(); delete r.abilitatoDa; delete r.abilitatoIl; n++;
        }
      });
      if (n) A.scriviJSON(P.dispositivi, disp);
      return n;
    }
    function revocaSeServe(email) {
      var dd = leggiDispositivi().dispositivi;
      var ha = Object.keys(dd).some(function (id) { return dd[id].email === email && dd[id].chiavi && Object.keys(dd[id].chiavi).length; });
      if (!ha) return;
      try { conLock(revocaChiavi); } catch (e) { /* alla prossima richiesta, o al risveglio */ }
    }
    var eAdmin = function (u) { return u.ruolo === 'admin'; };

    // ---- pazienti riservati: il registro si legge una volta per richiesta ----
    var registro = null;
    function leggiPazienti() {
      if (!registro) {
        registro = A.leggiJSON(P.pazienti) || { schema: SCHEMA, pazienti: {} };
        registro.gruppi = registro.gruppi || {}; registro.programmi = registro.programmi || {};
      }
      return registro;
    }
    // il registro di un ambito: pazienti per "r:", gruppi per "g:", programmi per "p:"
    var REGISTRO = { r: 'pazienti', g: 'gruppi', p: 'programmi' };
    function recDi(a) { return leggiPazienti()[REGISTRO[a[0]]][a.slice(2)]; }
    function scriviPazienti(r) { registro = r; A.scriviJSON(P.pazienti, r); }
    function orfano(rec) { return !!rec && rec.proprietario !== proprietario() && !abilitato(rec.proprietario); }
    function vedeAmbito(u, a) {
      if (a === 'aula') return true;
      var rid = a.slice(2), rec = recDi(a);
      var assegnato = a[0] === 'r' && !eAdmin(u) && (u.ragazzi.indexOf(rid) >= 0 || vedeChiConcede(u, a));
      if (!rec) return eAdmin(u) || assegnato;              // di tutta l'aula (da prima)
      if (rec.proprietario === u.email || rec.condivisi.indexOf(u.email) >= 0 || assegnato) return true;
      if (rec.tutti && eAdmin(u)) return true;
      return !!u.proprietario && orfano(rec);
    }
    // "Tutti i pazienti": quelli che vede l'operatore che ha dato l'accesso, finché è operatore abilitato
    function vedeChiConcede(u, a) {
      var e = u.tuttiDa;
      if (!e || !abilitato(e)) return false;
      var v = leggiAccessi().utenti[e];
      if (e !== proprietario() && (!v || v.ruolo !== 'admin')) return false;
      return vedeAmbito({ email: e, ruolo: 'admin', ragazzi: [], proprietario: e === proprietario() }, a);
    }
    /** Come appare il paziente (o il gruppo, con a = "g:<id>") a chi lo vede (per l'app). */
    function accessoPer(u, rid, a) {
      var rec = a ? recDi(a) : leggiPazienti().pazienti[rid];
      if (!rec) return { tutti: true, daPrima: true };
      return { proprietario: rec.proprietario, condivisi: rec.condivisi.slice(), tutti: !!rec.tutti, mio: rec.proprietario === u.email, orfano: orfano(rec) };
    }
    function richiedi(cond, m) { if (!cond) throw err('vietato', m || 'Operazione non consentita al tuo ruolo.'); }

    // ---- stato globale: un contatore che cresce a ogni scrittura ----
    // rev e ambiti esatti (da non modificare fuori dal lucchetto)
    function leggiStato() {
      if (inLock) return vivoInLock();
      var s = statoRapido();
      if (s && s.stato) return s.stato;
      return recupera(A.leggiJSON(P.stato));   // senza cache: il file, più il rev degli ambiti sporchi
    }
    function leggiAmbito(a) { return A.leggiJSON(P.ambito(a)) || { schema: SCHEMA, ambito: a, voci: {} }; }

    // il promemoria interno «arch» (vedi archiviaStoria) non esce dal custode
    function pubblica(r) {
      if (!r || !('arch' in r)) return r;
      var x = Object.assign({}, r); delete x.arch; return x;
    }


    // ---- Corsia veloce (Firestore): la copia degli accessi -------------------------------
    // Le regole di Firestore non possono leggere il Drive: decidono su una COPIA di quello che il custode
    // sa su chi vede cosa, scritta SOLO da qui (via REST, con l'account del proprietario, che salta le
    // regole) e mai dai client. Un documento per persona abilitata:
    //   accessi/<email> = { email, attivo: true, ruolo, proprietario, scadeIl, ambiti: [...] }
    // `ambiti` sono gli ambiti «r:», «g:», «p:» che quella persona vede (l'ambito «aula» lo vede chiunque
    // abbia il documento). Si calcola con vedeAmbito() e profiloDi(), le STESSE funzioni delle richieste:
    // chi non è abilitato (sconosciuto, disattivato, scaduto) non ha il documento.
    var FS = { fine: '2100-01-01T00:00:00.000Z', pulizia: ['modifiche', 'buste', 'richieste', 'consegne'], MAX_AMBITI: 12000 };
    var SPECCHIO_IMP = 'specchio:imp', SPECCHIO_ERR = 'specchio:err';
    var specchioDaFare = false, specchioUltimoErrore = null;
    function giornoDopo(g) { return new Date(Date.parse(g + 'T00:00:00Z') + 86400000).toISOString(); }
    /** Cosa deve contenere Firestore: { 'accessi/<email>': {...} }. I timestamp sono { $ts: ISO }. */
    function copiaFirestore() {
      var utenti = leggiAccessi().utenti, emails = Object.keys(utenti), prop = proprietario(), docs = {};
      if (prop && emails.indexOf(prop) < 0) emails.push(prop);
      var tutti = Object.keys(leggiStato().ambiti).filter(function (a) { return a !== 'aula'; }).sort();
      emails.forEach(function (email) {
        var p = profiloDi(email, null);
        if (p.negato) return;
        var u = p.u, mie = tutti.filter(function (a) { return vedeAmbito(u, a); });
        if (mie.length > FS.MAX_AMBITI) return;   // non entra in un documento (1 MiB): niente corsia veloce per questa persona
        docs['accessi/' + email] = {
          email: email, attivo: true, ruolo: u.ruolo, proprietario: !!u.proprietario,
          scadeIl: { $ts: u.scadenza ? giornoDopo(u.scadenza) : FS.fine }, ambiti: mie,
        };
      });
      return docs;
    }
    // Valori nel formato REST di Firestore (https://firestore.googleapis.com/v1/...)
    function fsValore(v) {
      if (v === null || v === undefined) return { nullValue: null };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (typeof v === 'number') return Math.floor(v) === v ? { integerValue: String(v) } : { doubleValue: v };
      if (typeof v === 'string') return { stringValue: v };
      if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(fsValore) } : {} };
      if (typeof v === 'object' && typeof v.$ts === 'string') return { timestampValue: v.$ts };
      var campi = fsCampi(v);
      return { mapValue: Object.keys(campi).length ? { fields: campi } : {} };
    }
    function fsCampi(o) { var out = {}; Object.keys(o).forEach(function (k) { out[k] = fsValore(o[k]); }); return out; }
    function fsNome(progetto, percorso) { return 'projects/' + progetto + '/databases/(default)/documents/' + percorso; }
    function fsCommit(progetto, scritture, cancellazioni) {
      var w = [];
      Object.keys(scritture).forEach(function (p) { w.push({ update: { name: fsNome(progetto, p), fields: fsCampi(scritture[p]) } }); });
      (cancellazioni || []).forEach(function (p) { w.push({ 'delete': fsNome(progetto, p) }); });
      return { writes: w };
    }
    function fsScadute(collezione, adessoIso, limite) {
      return { structuredQuery: { from: [{ collectionId: collezione }],
        where: { fieldFilter: { field: { fieldPath: 'scade' }, op: 'LESS_THAN', value: { timestampValue: adessoIso } } }, limit: limite || 200 } };
    }
    function cacheTtl(k, v, s) { if (!CA) return; try { CA.put(k, v, s); } catch (e) { /* solo una comodità */ } }
    /** Riallinea la copia (solo i documenti cambiati). `tutto`: riscrive ogni documento. Restituisce quanti ne ha scritti o cancellati. */
    function specchia(tutto) {
      var S = amb.specchio;
      if (!S) return 0;
      var docs = copiaFirestore(), chiavi = Object.keys(docs).sort(), hash = {};
      chiavi.forEach(function (k) { hash[k] = improntaDi(docs[k]); });
      var imp = oggi() + '|' + improntaDi(chiavi.map(function (k) { return k + '=' + hash[k]; }));
      if (!tutto && CA && CA.get(SPECCHIO_IMP) === imp) return 0;
      var stato = A.leggiJSON(P.specchio) || { schema: SCHEMA, docs: {} };
      var scritture = {}, cancellazioni = [];
      chiavi.forEach(function (k) { if (tutto || stato.docs[k] !== hash[k]) scritture[k] = docs[k]; });
      Object.keys(stato.docs).forEach(function (k) { if (!docs[k]) cancellazioni.push(k); });
      var totale = Object.keys(scritture).length + cancellazioni.length;
      if (totale) {
        var ks = Object.keys(scritture), i = 0, j = 0;
        while (i < ks.length || j < cancellazioni.length) {
          var parte = {};
          ks.slice(i, i + 200).forEach(function (k) { parte[k] = scritture[k]; });
          var canc = cancellazioni.slice(j, j + 200);
          i += 200; j += 200;
          S.commit(fsCommit(S.progetto, parte, canc));
        }
        A.scriviJSON(P.specchio, { schema: SCHEMA, docs: hash, aggiornato: amb.ora() });
      }
      cacheTtl(SPECCHIO_IMP, imp, TTL_STATO);
      return totale;
    }
    function copiaVecchia() { return !!CA && String(CA.get(SPECCHIO_IMP) || '').slice(0, 10) !== oggi() && !CA.get(SPECCHIO_ERR); }
    // Dopo ogni richiesta che ha cambiato accessi, registro o ambiti (o al primo giro del giorno). Firestore è una
    // comodità: se non risponde il custode funziona lo stesso e riprova dopo un minuto.
    function specchiaSicuro() {
      specchioDaFare = false;
      if (!amb.specchio || (CA && CA.get(SPECCHIO_ERR))) return;
      try { conLock(function () { specchia(false); }); specchioUltimoErrore = null; }
      catch (e) {
        specchioUltimoErrore = String(e && e.message || e).slice(0, 300);
        if (CA) { try { CA.remove(SPECCHIO_IMP); } catch (x) { /* ok */ } cacheTtl(SPECCHIO_ERR, '1', 60); }
      }
    }
    // Cancella modifiche, buste, richieste e consegne scadute (scade < adesso)
    function pulisciFirestore() {
      var S = amb.specchio, n = 0;
      if (!S) return 0;
      var adesso = amb.ora();
      FS.pulizia.forEach(function (coll) {
        for (var giro = 0; giro < 10; giro++) {
          var r = S.interroga(fsScadute(coll, adesso, 200)) || [];
          var nomi = r.filter(function (x) { return x && x.document; }).map(function (x) { return x.document.name; });
          if (!nomi.length) break;
          S.commit({ writes: nomi.map(function (nome) { return { 'delete': nome }; }) });
          n += nomi.length;
          if (nomi.length < 200) break;
        }
      });
      return n;
    }
    /** Dal risveglio periodico o a mano: riallinea la copia e pulisce. */
    function riallinea(tutto) {
      if (!amb.specchio) return { copia: 0, pulite: 0, attivo: false };
      registro = null; memoria = {}; prop = null;
      var out = { attivo: true, copia: 0, pulite: 0 };
      out.copia = conLock(function () { return specchia(!!tutto); });
      try { out.pulite = pulisciFirestore(); } catch (e) { out.errorePulizia = String(e && e.message || e).slice(0, 200); }
      return out;
    }

    // ---- cifratura e dispositivi (come in Centro TICE) ----
    var azioni = {};
    azioni['io'] = function (u) {
      var c = A.leggiJSON(P.cifratura);
      // con la configurazione della chiave (non segreta): all'accesso basta una chiamata
      return { email: u.email, nome: u.nome, ruolo: u.ruolo, ragazzi: u.ragazzi, tuttiRagazzi: !!u.tuttiDa, scadenza: u.scadenza || null, proprietario: u.proprietario, cifratura: !!c, kid: c ? c.kid : null, cfg: c || null, funzioni: ['riservati', 'gruppi-riservati', 'esportazione', 'programmi', 'io-cfg', 'in-attesa', 'sync-rapido'].concat(amb.specchio ? ['veloce'] : []),
        veloce: amb.specchio ? { progetto: amb.specchio.progetto } : null };
    };
    azioni['cifratura.leggi'] = function () { return A.leggiJSON(P.cifratura); };
    azioni['cifratura.imposta'] = function (u, d) {
      richiedi(eAdmin(u), 'Solo un operatore può creare la chiave dell\'aula.');
      var c = validaCifratura(d.cifratura);
      return conLock(function () {
        var attuale = A.leggiJSON(P.cifratura);
        if (attuale) {
          if (stabile(attuale.verifica) === stabile(c.verifica) && attuale.kid === c.kid) return attuale;
          throw err('conflitto', 'La chiave dell\'aula esiste già.', { attuale: attuale });
        }
        c.creato = amb.ora(); c.creatoDa = u.email;
        A.scriviJSON(P.cifratura, c);
        return c;
      });
    };
    function leggiDispositivi() { return A.leggiJSON(P.dispositivi) || { schema: SCHEMA, dispositivi: {} }; }
    function abilitato(email) {
      if (email === proprietario()) return true;
      var v = leggiAccessi().utenti[email];
      return !!v && v.attivo !== false && !(v.scadenza && oggi() > v.scadenza);
    }
    azioni['dispositivo.registra'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id'), pubblica = b64V(d.pubblica, 2000, 'pubblica');
      var nome = testoV(d.nome, 80, false, 'nome') || 'Dispositivo';
      return conLock(function () {
        var disp = leggiDispositivi(), r = disp.dispositivi[id], ora = amb.ora();
        if (r && r.email !== u.email) throw err('conflitto', 'Identificativo di dispositivo già usato.');
        if (!r) r = disp.dispositivi[id] = { email: u.email, creato: ora, chiavi: {} };
        if (r.pubblica !== pubblica) { r.pubblica = pubblica; r.chiavi = {}; }
        r.nome = nome; r.ultimoAccesso = ora;
        A.scriviJSON(P.dispositivi, disp);
        return { id: id, abilitato: Object.keys(r.chiavi).length > 0 };
      });
    };
    azioni['dispositivo.chiave'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      var r = leggiDispositivi().dispositivi[id];
      if (!r || r.email !== u.email) throw err('non-trovato', 'Dispositivo non registrato.');
      var c = A.leggiJSON(P.cifratura);
      return { kid: c ? c.kid : null, chiavi: r.chiavi || {} };
    };
    azioni['dispositivi.elenco'] = function (u) {
      richiedi(eAdmin(u));
      var disp = leggiDispositivi(), c = A.leggiJSON(P.cifratura);
      return Object.keys(disp.dispositivi).map(function (id) {
        var r = disp.dispositivi[id];
        return { id: id, email: r.email, nome: r.nome, pubblica: r.pubblica, creato: r.creato, ultimoAccesso: r.ultimoAccesso,
          abilitato: !!(c && r.chiavi && r.chiavi[c.kid]), personaAbilitata: abilitato(r.email) };
      });
    };
    azioni['dispositivi.abilita'] = function (u, d) {
      richiedi(eAdmin(u));
      var id = idV(d.id, RE.dispositivo, 'id'), kid = idV(d.kid, RE.kid, 'kid'), busta = b64V(d.chiave, 2000, 'chiave');
      return conLock(function () {
        var c = A.leggiJSON(P.cifratura);
        if (!c || c.kid !== kid) throw err('chiave-cambiata', 'La chiave dell\'aula è cambiata.');
        var disp = leggiDispositivi(), r = disp.dispositivi[id];
        if (!r) throw err('non-trovato', 'Dispositivo non registrato.');
        if (!abilitato(r.email)) throw err('vietato', 'La persona di questo dispositivo non è abilitata.');
        if (d.pubblica !== r.pubblica) throw err('conflitto', 'Il dispositivo ha cambiato chiavi.');
        r.chiavi = {}; r.chiavi[kid] = busta; r.abilitatoDa = u.email; r.abilitatoIl = amb.ora();
        A.scriviJSON(P.dispositivi, disp);
        return { id: id, abilitato: true };
      });
    };
    azioni['dispositivo.togli'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      return conLock(function () {
        var disp = leggiDispositivi(), r = disp.dispositivi[id];
        if (!r) return true;
        if (r.email !== u.email) richiedi(eAdmin(u));
        delete disp.dispositivi[id];
        A.scriviJSON(P.dispositivi, disp);
        return true;
      });
    };

    // ---- accessi ----
    azioni['accessi.leggi'] = function (u) {
      richiedi(eAdmin(u));
      var a = Object.assign({}, leggiAccessi());
      a.proprietario = proprietario();
      return a;
    };
    azioni['accessi.salva'] = function (u, d) {
      richiedi(eAdmin(u));
      var nuovo = validaAccessi(d.accessi), base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var attuale = leggiAccessi();
        if ((attuale.version || 0) !== base) throw err('conflitto', 'Gli accessi sono stati modificati nel frattempo.', { attuale: attuale });
        if (!u.proprietario) {
          var io = nuovo.utenti[u.email];
          if (!io || io.ruolo !== 'admin' || !io.attivo) throw err('richiesta-non-valida', 'Non puoi togliere a te stesso il ruolo di operatore.');
        }
        // un paziente riservato si assegna a un tirocinante solo se lo si vede
        Object.keys(nuovo.utenti).forEach(function (e) {
          var prima = (attuale.utenti[e] && attuale.utenti[e].ragazzi) || [];
          nuovo.utenti[e].ragazzi.forEach(function (rid) {
            if (prima.indexOf(rid) < 0 && leggiPazienti().pazienti[rid] && !vedeAmbito(u, 'r:' + rid)) throw err('vietato', 'Non puoi assegnare un paziente riservato che non vedi.');
          });
        });
        // "tutti i pazienti" resta legato all'operatore che l'ha concesso per primo
        Object.keys(nuovo.utenti).forEach(function (e) {
          var n = nuovo.utenti[e], prima = attuale.utenti[e];
          if (n.tuttiRagazzi) n.tuttiDa = (prima && prima.tuttiRagazzi && prima.tuttiDa) || u.email;
        });
        nuovo.version = (attuale.version || 0) + 1;
        nuovo.aggiornato = amb.ora(); nuovo.aggiornatoDa = u.email;
        A.scriviJSON(P.accessi, nuovo);
        // chi esce dall'elenco perde i dispositivi (e con loro la chiave)
        var disp = leggiDispositivi(), cambiati = false;
        Object.keys(disp.dispositivi).forEach(function (id) {
          var e = disp.dispositivi[id].email;
          if (e !== proprietario() && !nuovo.utenti[e]) { delete disp.dispositivi[id]; cambiati = true; }
        });
        if (cambiati) A.scriviJSON(P.dispositivi, disp);
        revocaChiavi();
        nuovo.proprietario = proprietario();
        return nuovo;
      });
    };

    // ---- sincronizzazione ----
    function voceV(v, i) {
      oggettoV(v, 'invii[' + i + ']');
      var tipo = v.tipo;
      if (TIPI.indexOf(tipo) < 0) throw err('richiesta-non-valida', 'Tipo di voce sconosciuto');
      return {
        id: idV(v.id, RE.id, 'id'), tipo: tipo, ambito: idV(v.ambito, RE.ambito, 'ambito'),
        versioneBase: interoV(v.versioneBase, 0, 1e9, 'versioneBase'),
        eliminato: v.eliminato === true,
        busta: v.eliminato === true ? null : bustaV(v.busta, MAX_VOCE, 'busta'),
      };
    }
    // Le versioni precedenti: nella stessa richiesta un file di storia si legge
    // e si scrive una volta sola, anche se cambiano più voci dello stesso ambito.
    // Ogni voce porta un promemoria interno `arch` = { al, da }: quando e da chi è stata scritta la
    // versione che sta in cima alla sua storia. Con quello una raffica si riconosce senza leggere
    // il file della storia (che contiene tutte le versioni di tutte le voci dell'ambito: grande).
    // Restituisce il promemoria da mettere sulla voce nuova.
    var storie = null, storieCambiate = null;
    function cimaStoria(x) { return x && !x.eliminato ? { al: x.aggiornato, da: x.aggiornatoDa } : null; }
    function archiviaStoria(ambito, r, daChi) {
      var nuova = { version: r.version, busta: r.busta, aggiornato: r.aggiornato, aggiornatoDa: r.aggiornatoDa, eliminato: !!r.eliminato };
      var h = r.arch;
      if (h && !nuova.eliminato && h.da === nuova.aggiornatoDa && daChi === nuova.aggiornatoDa && Math.abs(Date.parse(amb.ora()) - Date.parse(h.al)) < RAFFICA_MS) return h;
      var s = storie && storie[ambito];
      if (!s) {
        s = A.leggiJSON(P.storia(ambito)) || { schema: SCHEMA, voci: {} };
        if (storie) storie[ambito] = s;
      }
      var l = s.voci[r.id] || [];
      // L'app salva mentre si scrive: le bozze della stessa persona a pochi minuti
      // l'una dall'altra sono una sessione di scrittura sola e se ne tiene l'ultima.
      // Così restano le versioni che servono (com'era prima di ogni sessione) e la
      // storia non si riempie di 15 bozze dello stesso minuto.
      var prec = l[0];
      var stessa = prec && !prec.eliminato && !nuova.eliminato && prec.aggiornatoDa === nuova.aggiornatoDa;
      // Salvataggi a raffica della stessa persona (si sta scrivendo): la versione precedente di
      // pochi minuti fa basta, il file della storia non si riscrive (una scrittura su Drive in meno
      // a ogni salvataggio). Se poi interviene un'altra persona si archivia come sempre.
      // (Questo ramo serve per le voci scritte prima del promemoria `arch`.)
      if (stessa && daChi === nuova.aggiornatoDa && Math.abs(Date.parse(amb.ora()) - Date.parse(prec.aggiornato)) < RAFFICA_MS) return cimaStoria(prec);
      if (stessa && Math.abs(Date.parse(nuova.aggiornato) - Date.parse(prec.aggiornato)) < BOZZE_MS) l[0] = nuova;
      else l.unshift(nuova);
      s.voci[r.id] = l.slice(0, STORIA_PER_VOCE);
      if (storieCambiate) storieCambiate[ambito] = true;
      else A.scriviJSON(P.storia(ambito), s);
      return cimaStoria(l[0]);
    }

    // Impronta corta e stabile (cyrb53) di un valore: serve solo a vedere se è cambiato
    function improntaDi(v) {
      var t = stabile(v), h1 = 0xdeadbeef, h2 = 0x41c6ce57;
      for (var i = 0; i < t.length; i++) {
        var ch = t.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '-' + t.length;
    }

    /**
     * Una sola chiamata: prima applica gli invii (con controllo di versione),
     * poi restituisce quello che è cambiato negli ambiti visibili.
     * dati = { cursori: { ambito: rev }, impronta?: string, io?: true, invii: [ { id, tipo, ambito, versioneBase, busta | eliminato } ] }
     */
    azioni['sync'] = function (u, d) {
      var c = A.leggiJSON(P.cifratura);
      var invii = listaV(d.invii, 200, 'invii').map(voceV);
      var esiti = [];
      if (invii.length) {
        if (!c) throw err('senza-chiave', 'Prima un operatore deve creare la chiave dell\'aula.');
        storie = {}; storieCambiate = {};
        try { conLock(function () {
          var st = vivoInLock();      // rev, ambiti, sporco: esatti (copie nostre)
          var toccati = {};   // ambito -> file (si scrive una volta sola)
          var mod = {};       // ambiti il cui file è cambiato davvero (gli altri non si riscrivono)
          var indiceNuovo = {};   // voci nate o spostate: solo allora cambia l'indice di stato.json
          var file = function (a) { return toccati[a] || (toccati[a] = leggiAmbito(a)); };
          invii.forEach(function (v) {
            try {
              if (v.busta && v.busta.kid !== c.kid) throw err('chiave-cambiata', 'La chiave dell\'aula è cambiata.');
              // il primo dato di un paziente nuovo lo rende di chi lo crea
              var rid = v.ambito.slice(2);
              if (v.ambito !== 'aula' && eAdmin(u) && !v.eliminato && st.ambiti[v.ambito] === undefined && !toccati[v.ambito] && !recDi(v.ambito)) {
                var reg = leggiPazienti();
                reg[REGISTRO[v.ambito[0]]][rid] = { proprietario: u.email, condivisi: [], tutti: false, creato: amb.ora() };
                scriviPazienti(reg);
              }
              richiedi(vedeAmbito(u, v.ambito), 'Questo ragazzo non è condiviso con te.');
              if (st.ambiti[v.ambito] === undefined) specchioDaFare = true;   // un ambito nuovo: la copia per Firestore lo aggiunge
              if (!eAdmin(u) && SOLO_ADMIN[v.tipo]) throw err('vietato', 'Ragazzi, anagrafiche e gruppi li gestiscono gli operatori.');
              // dove sta la voce: nel suo ambito se c'è lì (caso normale: l'indice non serve),
              // altrimenti lo dice l'indice di stato.json (voce nuova o cambiata di ambito)
              var propria = file(v.ambito).voci[v.id] || null;
              var normale = !!propria && !propria.spostato;
              var dove = normale ? v.ambito : ((indiceNuovo[v.id] || (durevole().indice || {})[v.id]) || v.ambito);
              var attualeFile = file(dove), attuale = attualeFile.voci[v.id] || null;
              if (attuale && !vedeAmbito(u, dove)) throw err('vietato', 'Voce non accessibile.');
              var versione = attuale ? attuale.version : 0;
              // Reinvio di un invio gia' accettato (la risposta si era persa per
              // strada): stessa busta, stesso autore, versione appena dopo la base
              if (attuale && versione === v.versioneBase + 1 && attuale.aggiornatoDa === u.email &&
                  dove === v.ambito && !!attuale.eliminato === !!v.eliminato && stabile(attuale.busta || null) === stabile(v.busta || null)) {
                esiti.push({ id: v.id, ok: true, version: versione, ambito: v.ambito });
                return;
              }
              if (versione !== v.versioneBase) throw err('conflitto', 'Modificata nel frattempo.', { attuale: attuale ? Object.assign({ ambito: dove }, pubblica(attuale)) : null });
              if (attuale && attuale.tipo !== v.tipo) throw err('richiesta-non-valida', 'Il tipo di una voce non cambia.');
              if (!eAdmin(u) && attuale && v.tipo === 'nota' && attuale.creatoDa !== u.email) throw err('vietato', 'Puoi modificare solo le note che hai scritto tu.');
              if (!eAdmin(u) && v.eliminato && attuale && attuale.creatoDa !== u.email) throw err('vietato', 'Puoi eliminare solo quello che hai scritto tu.');
              if (!attuale && v.eliminato) { esiti.push({ id: v.id, ok: true, version: 0 }); return; }
              var ora = amb.ora();
              st.rev += 1;
              var r = {
                id: v.id, tipo: v.tipo, version: versione + 1, rev: st.rev, busta: v.busta, eliminato: v.eliminato || undefined,
                creato: attuale ? attuale.creato : ora, creatoDa: attuale ? attuale.creatoDa : u.email, aggiornato: ora, aggiornatoDa: u.email,
              };
              if (attuale) r.arch = archiviaStoria(dove, attuale, u.email) || undefined;
              if (dove !== v.ambito) {
                // cambio di ambito (es. una nota che diventa "nel gruppo"): nel vecchio resta una lapide
                attualeFile.voci[v.id] = { id: v.id, tipo: v.tipo, version: r.version, rev: st.rev, eliminato: true, spostato: v.ambito, aggiornato: ora, aggiornatoDa: u.email };
                st.ambiti[dove] = st.rev; mod[dove] = true;
                r.arch = undefined;   // la storia di questa voce è rimasta nell'ambito di prima
              }
              file(v.ambito).voci[v.id] = r;
              st.ambiti[v.ambito] = st.rev; mod[v.ambito] = true;
              if (!normale) indiceNuovo[v.id] = v.ambito;
              esiti.push({ id: v.id, ok: true, version: r.version, ambito: v.ambito });
            } catch (e) {
              if (!(e instanceof Errore)) throw e;
              esiti.push({ id: v.id, ok: false, errore: e.codice, messaggio: e.message, extra: e.extra });
            }
          });
          var scritti = Object.keys(mod);
          if (!scritti.length) return;   // niente è cambiato: niente da riscrivere
          // da qui lo stato in cache non vale più (si rifà a fine lucchetto)
          statoMutato();
          scritti.forEach(function (a) { toccati[a].rev = st.ambiti[a]; });
          // Scrittura leggera: nessun cambio all'indice e gli ambiti sono già «sporchi» (stato.json li
          // dichiara più avanti di sé): le revisioni vive stanno nella voce di cache e nel rev dei file.
          var leggera = !!CA && !Object.keys(indiceNuovo).length && scritti.every(function (a) { return st.sporco[a]; });
          if (!leggera) {
            // stato.json prima dei file: se si interrompe a metà non resta mai indietro rispetto ai dati
            var nuovo = Object.keys(st.sporco).filter(function (a) { return !mod[a]; }).concat(scritti);
            nuovo = nuovo.slice(-MAX_SPORCHI);   // stato.json è esatto adesso: gli ambiti non segnati si segneranno alla prossima scrittura completa
            var sporco = {};
            if (CA) nuovo.forEach(function (a) { sporco[a] = true; });
            st.sporco = copia(sporco);
            var d = durevole();
            d.schema = SCHEMA; d.rev = st.rev; d.ambiti = copia(st.ambiti); d.sporco = sporco;
            d.indice = d.indice || {};
            Object.keys(indiceNuovo).forEach(function (id) { d.indice[id] = indiceNuovo[id]; });
            A.scriviJSON(P.stato, d);
          }
          scritti.forEach(function (a) { A.scriviJSON(P.ambito(a), toccati[a]); });
          Object.keys(storieCambiate).forEach(function (a) { A.scriviJSON(P.storia(a), storie[a]); });
        }); } finally { storie = null; storieCambiate = null; }
      }
      // cosa è cambiato da quando il dispositivo ha guardato l'ultima volta
      var cursori = oggettoV(d.cursori || {}, 'cursori');
      var stato = leggiStato(), visibili = [], cambi = [];
      Object.keys(stato.ambiti).forEach(function (a) {
        if (!vedeAmbito(u, a)) return;
        visibili.push(a);
        var noto = typeof cursori[a] === 'number' ? cursori[a] : -1;
        if (stato.ambiti[a] <= noto) return;
        var f = leggiAmbito(a);
        Object.keys(f.voci).forEach(function (id) {
          var r = f.voci[id];
          if (r.rev > noto) cambi.push(Object.assign({ ambito: a }, pubblica(r)));
        });
      });
      var pazienti = {}, gruppi = {}, programmi = {};
      visibili.forEach(function (a) {
        if (a[0] === 'r') pazienti[a.slice(2)] = accessoPer(u, a.slice(2));
        else if (a[0] === 'g') gruppi[a.slice(2)] = accessoPer(u, a.slice(2), a);
        else if (a[0] === 'p') programmi[a.slice(2)] = accessoPer(u, a.slice(2), a);
      });
      // gruppi e programmi aperti a tutti stanno nell'aula: anche di loro si dice di chi sono
      var regAll = leggiPazienti();
      Object.keys(regAll.gruppi).forEach(function (gid) { if (!gruppi[gid] && regAll.gruppi[gid].tutti) gruppi[gid] = accessoPer(u, gid, 'g:' + gid); });
      Object.keys(regAll.programmi).forEach(function (pid) { if (!programmi[pid] && regAll.programmi[pid].tutti) programmi[pid] = accessoPer(u, pid, 'p:' + pid); });
      // agli operatori: quanti dispositivi aspettano la chiave (così l'app chiede l'elenco solo se serve)
      var inAttesa = 0;
      if (eAdmin(u) && c) {
        var dd = leggiDispositivi().dispositivi;
        Object.keys(dd).forEach(function (id) { var x = dd[id]; if (!(x.chiavi && x.chiavi[c.kid]) && abilitato(x.email)) inAttesa++; });
      }
      // l'accesso può cambiare mentre l'app è aperta (scadenza, pazienti): l'app lo aggiorna senza chiedere "io"
      var accesso = { scadenza: u.scadenza || null, tuttiRagazzi: !!u.tuttiDa, ragazzi: u.ragazzi };
      var kid = c ? c.kid : null;
      // Impronta di tutto quello che non sono le voci (ambiti visibili, chi vede cosa, accesso, chiave):
      // se l'app ha già quella giusta non si rimanda niente di tutto questo, e un giro «niente di
      // nuovo» è una risposta di poche righe.
      var cursoriVisibili = {};
      visibili.forEach(function (a) { if (stato.ambiti && Object.prototype.hasOwnProperty.call(stato.ambiti, a)) cursoriVisibili[a] = stato.ambiti[a]; });
      var impronta = improntaDi([visibili, pazienti, gruppi, programmi, accesso, kid]);
      var risposta = { esiti: esiti, voci: cambi, rev: stato.rev, kid: kid, inAttesa: inAttesa, impronta: impronta };
      if (typeof d.impronta === 'string' && d.impronta === impronta) {
        risposta.uguale = true;
        if (cambi.length || esiti.length) { risposta.ambiti = visibili; risposta.cursori = cursoriVisibili; }
      } else {
        risposta.ambiti = visibili; risposta.cursori = cursoriVisibili;
        risposta.pazienti = pazienti; risposta.gruppi = gruppi; risposta.programmi = programmi; risposta.accesso = accesso;
      }
      // avvio in una richiesta sola: il profilo (con la configurazione della chiave) insieme alle novità
      if (d.io === true) risposta.io = azioni['io'](u);
      return risposta;
    };

    /**
     * Con chi è condiviso un paziente. Lo decide chi l'ha creato (o, se non è
     * più abilitato, chi ospita il custode). Dei pazienti di prima decide chi
     * ne ha creato la scheda. dati = { id, condivisi: [email], tutti, proprietario? }
     */
    azioni['paziente.condivisione'] = function (u, d) { return condivisione(u, d, 'r'); };
    /**
     * Lo stesso per un gruppo o una classe. Di un gruppo di prima (nell'aula)
     * decide chi l'ha creato; reso riservato, l'app sposta i suoi dati in "g:<id>".
     */
    azioni['gruppo.condivisione'] = function (u, d) { return condivisione(u, d, 'g'); };
    /** Lo stesso per un programma della biblioteca (di serie di tutta l'aula). */
    azioni['programma.condivisione'] = function (u, d) { return condivisione(u, d, 'p'); };
    function condivisione(u, d, k) {
      richiedi(eAdmin(u), 'Le condivisioni le decidono gli operatori.');
      var rid = idV(d.id, RE.id, 'id'), a = k + ':' + rid;
      var condivisi = listaV(d.condivisi, 200, 'condivisi').map(function (e) {
        var x = String(e).trim().toLowerCase();
        if (!RE.email.test(x)) throw err('richiesta-non-valida', 'Email non valida: ' + e);
        return x;
      });
      return conLock(function () {
        registro = null;
        var reg = leggiPazienti(), rec = recDi(a);
        var stato = { ambiti: vivoInLock().ambiti, indice: durevole().indice };
        var titolare;
        if (rec) titolare = rec.proprietario;
        else if (k === 'r') {
          if (stato.ambiti[a] === undefined) throw err('non-trovato', 'Paziente non trovato.');
          var f = leggiAmbito(a), sc = f.voci[rid + 'sc'];
          titolare = (sc && sc.creatoDa) || proprietario();
        } else {
          // gruppo (o programma) dell'aula: sta nell'aula
          var dove = (stato.indice || {})[rid];
          var gv = dove && leggiAmbito(dove).voci[rid];
          var tipoAtteso = k === 'p' ? 'programma' : 'gruppo';
          if (!gv || gv.tipo !== tipoAtteso || gv.eliminato) throw err('non-trovato', k === 'p' ? 'Programma non trovato.' : 'Gruppo non trovato.');
          titolare = gv.creatoDa || proprietario();
        }
        var puo = titolare === u.email || (u.proprietario && (!abilitato(titolare) || !rec && titolare === proprietario()));
        richiedi(puo, k === 'p' ? 'Solo chi ha creato il programma decide con chi condividerlo.' : k === 'g' ? 'Solo chi ha creato il gruppo decide con chi condividerlo.' : 'Solo chi ha creato il paziente decide con chi condividerlo.');
        var nuovoTitolare = titolare;
        if (d.proprietario !== undefined && d.proprietario !== null && d.proprietario !== titolare) {
          nuovoTitolare = String(d.proprietario).trim().toLowerCase();
          var v = leggiAccessi().utenti[nuovoTitolare];
          if (nuovoTitolare !== proprietario() && (!v || v.ruolo !== 'admin' || v.attivo === false)) throw err('richiesta-non-valida', 'Il paziente si può affidare solo a un operatore abilitato.');
        }
        condivisi = condivisi.filter(function (e, i) { return e !== nuovoTitolare && condivisi.indexOf(e) === i; });
        reg[REGISTRO[k]][rid] = {
          proprietario: nuovoTitolare, condivisi: condivisi, tutti: d.tutti === true,
          creato: rec ? rec.creato : amb.ora(), aggiornato: amb.ora(), aggiornatoDa: u.email,
        };
        scriviPazienti(reg);
        return accessoPer(u, rid, a);
      });
    }

    azioni['voce.storia'] = function (u, d) {
      var id = idV(d.id, RE.id, 'id'), a = idV(d.ambito, RE.ambito, 'ambito');
      richiedi(vedeAmbito(u, a));
      var s = A.leggiJSON(P.storia(a));
      return (s && s.voci[id]) || [];
    };

    // ---- esportazione completa (per passare a un altro sistema) ----
    // Solo chi ospita il custode: è l'unico che riceve tutto, anche i pazienti
    // e i gruppi riservati degli altri. Il custode manda le buste così come
    // sono (cifrate); le apre l'app sul dispositivo. Ogni esportazione resta
    // nel registro, che vedono tutti gli operatori.
    function leggiEsportazioni() { return A.leggiJSON(P.esportazioni) || { schema: SCHEMA, esportazioni: [] }; }
    azioni['esporta.inizia'] = function (u) {
      richiedi(!!u.proprietario, 'L\'esportazione completa la fa solo chi ospita il custode.');
      return conLock(function () {
        var reg = leggiEsportazioni(), stato = leggiStato();
        var voce = { email: u.email, nome: u.nome, il: amb.ora(), ambiti: Object.keys(stato.ambiti).length };
        reg.esportazioni.unshift(voce);
        reg.esportazioni = reg.esportazioni.slice(0, 50);
        A.scriviJSON(P.esportazioni, reg);
        return { ambiti: Object.keys(stato.ambiti), registro: voce };
      });
    };
    /** Le voci (cifrate, non eliminate) di alcuni ambiti. dati = { ambiti: [...] } (al massimo 40 per volta) */
    azioni['esporta.ambiti'] = function (u, d) {
      richiedi(!!u.proprietario, 'L\'esportazione completa la fa solo chi ospita il custode.');
      var ambiti = listaV(d.ambiti, 40, 'ambiti').map(function (a) { return idV(a, RE.ambito, 'ambito'); });
      var voci = [];
      ambiti.forEach(function (a) {
        var f = leggiAmbito(a);
        Object.keys(f.voci).forEach(function (id) { var r = f.voci[id]; if (!r.eliminato && r.busta) voci.push(Object.assign({ ambito: a }, pubblica(r))); });
      });
      return { voci: voci };
    };
    azioni['esporta.immagine'] = function (u, d) {
      richiedi(!!u.proprietario, 'L\'esportazione completa la fa solo chi ospita il custode.');
      var id = idV(d.id, RE.id, 'id'), a = idV(d.ambito, RE.ambito, 'ambito');
      var r = A.leggiJSON(P.immagine(a, id));
      if (!r) throw err('non-trovato', 'Immagine non trovata.');
      return r;
    };
    azioni['esportazioni.leggi'] = function (u) {
      richiedi(eAdmin(u));
      return leggiEsportazioni().esportazioni;
    };

    // ---- immagini: buste cifrate a parte, lette solo quando servono ----
    azioni['immagine.carica'] = function (u, d) {
      var id = idV(d.id, RE.id, 'id'), a = idV(d.ambito, RE.ambito, 'ambito');
      richiedi(vedeAmbito(u, a), 'Questo ragazzo non è condiviso con te.');
      var busta = bustaV(d.busta, MAX_IMMAGINE, 'busta');
      var c = A.leggiJSON(P.cifratura);
      if (!c || busta.kid !== c.kid) throw err('chiave-cambiata', 'La chiave dell\'aula è cambiata.');
      var percorso = P.immagine(a, id);
      if (!A.esiste(percorso)) A.scriviJSON(percorso, { id: id, ambito: a, busta: busta, caricato: amb.ora(), caricatoDa: u.email });
      return { id: id };
    };
    azioni['immagine.leggi'] = function (u, d) {
      var id = idV(d.id, RE.id, 'id'), a = idV(d.ambito, RE.ambito, 'ambito');
      richiedi(vedeAmbito(u, a), 'Immagine non accessibile.');
      var r = A.leggiJSON(P.immagine(a, id));
      if (!r) throw err('non-trovato', 'Immagine non trovata.');
      return r;
    };

    function gestisciInterno(richiesta) {
      try {
        if (!richiesta || typeof richiesta !== 'object') throw err('richiesta-non-valida', 'Richiesta vuota.');
        if (richiesta.v !== 1) throw err('richiesta-non-valida', 'Versione del protocollo non supportata: aggiorna l\'app.');
        var fn = azioni[richiesta.azione];
        var perSessione = (richiesta.azione === 'sessione.crea' || richiesta.azione === 'sessione.rinnova') && amb.creaSessione;
        if (!fn && !perSessione) throw err('richiesta-non-valida', 'Azione sconosciuta.');
        registro = null; memoria = {}; snap = undefined; prop = null; lockSnap = null; vivoL = null; durev = undefined;
        var identita;
        try { identita = amb.verificaToken(richiesta.token); } catch (e) { throw err('non-autenticato', 'Accesso scaduto o non valido: rientra con Google.'); }
        var u = utenteDa(identita);
        // Accesso lungo: dopo l'accesso con Google il custode rilascia una sessione firmata;
        // la si rinnova usandola. Chi viene tolto o scade resta fuori lo stesso (utenteDa).
        if (perSessione) {
          if (richiesta.azione === 'sessione.crea' && identita.sessione) throw err('richiesta-non-valida', 'Serve un accesso con Google.');
          if (richiesta.azione === 'sessione.rinnova' && !identita.sessione) throw err('richiesta-non-valida', 'Serve una sessione.');
          return { ok: true, dati: amb.creaSessione({ email: u.email, nome: u.nome }) };
        }
        var chiave = amb.ricordo && RIPETIBILI[richiesta.azione] && typeof richiesta.rid === 'string' && RE_RICHIESTA.test(richiesta.rid)
          ? 'rid:' + u.email + ':' + richiesta.azione + ':' + richiesta.rid : null;
        if (chiave) {
          var gia = null;
          try { gia = amb.ricordo.leggi(chiave); } catch (e0) { gia = null; }
          if (gia) return JSON.parse(gia);
        }
        specchioDaFare = false;
        var esito = fn(u, richiesta.dati && typeof richiesta.dati === 'object' ? richiesta.dati : {});
        // la copia per Firestore, prima di rispondere: chi riceve la risposta trova già i permessi aggiornati
        if (amb.specchio && (specchioDaFare || copiaVecchia())) specchiaSicuro();
        // "dati" c'è sempre: l'app distingue così una risposta vera da quella di doGet
        var risposta = { ok: true, dati: esito === undefined ? null : esito };
        if (chiave) {
          var testo = JSON.stringify(risposta);
          if (testo.length < 90000) { try { amb.ricordo.scrivi(chiave, testo); } catch (e1) { /* solo una comodita' */ } }
        }
        return risposta;
      } catch (e) {
        if (e instanceof Errore) return { ok: false, errore: e.codice, messaggio: e.message, extra: e.extra };
        if (e && e.occupato) return { ok: false, errore: 'occupato', messaggio: 'Il custode è occupato con un\'altra richiesta: riprova tra qualche secondo.' };
        return { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(e && e.message || e).slice(0, 300) };
      }
    }
    // «ms»: quanto ha impiegato il custode (dentro la sua esecuzione, senza rete né avvio dello script).
    // «fasi»: dove è andato quel tempo, per il riquadro «Velocità del custode» dell'app:
    //   attesaLock  attesa del lucchetto      tenutoLock  quanto l'ha tenuto
    //   letture / nLetture   tempo e numero di letture di file (dalla cache dei file o da Drive)
    //   scritture / nScritture   idem per le scritture
    //   cache / nCache   voce di stato in cache (le chiamate alla cache dei file sono dentro letture e scritture)
    //   altro  il resto (verifica dell'accesso, elaborazione, proprietà dello script…)
    //   (i valori a zero non si mandano)
    //   file   ["L aula:120", "S stato:380"…] letture (L) e scritture (S) in ordine, con i millisecondi
    //   ops  (solo Apps Script) operazioni sui servizi Google per tipo (getFileById, setContent, cache, prop…): [quante, millisecondi]
    function chiudiFasi(ms) {
      var f = fasi, o = {};
      var altro = Math.max(0, ms - f.attesaLock - f.letture - f.scritture - f.cache);
      // compatta: i valori a zero e gli elenchi vuoti non si mandano (un giro «niente di nuovo» resta piccolo)
      [['attesaLock', f.attesaLock], ['tenutoLock', f.tenutoLock], ['letture', f.letture], ['nLetture', f.nLetture], ['scritture', f.scritture], ['nScritture', f.nScritture],
        ['cache', f.cache], ['nCache', f.nCache], ['altro', altro]].forEach(function (x) { if (x[1]) o[x[0]] = Math.round(x[1]); });
      if (f.file.length) o.file = f.file;
      if (amb.misure) { try { var dr = amb.misure.leggi(); if (dr) o.ops = dr; } catch (e) { /* solo una misura */ } }
      return o;
    }
    function gestisci(richiesta) {
      var t0 = Date.now();
      fasi = nuoveFasi();
      if (amb.misure) { try { amb.misure.inizia(); } catch (e) { /* solo una misura */ } }
      var r;
      try { r = gestisciInterno(richiesta); }
      finally { /* le fasi si chiudono sotto */ }
      if (r && typeof r === 'object') { r.ms = Date.now() - t0; r.fasi = chiudiFasi(r.ms); }
      fasi = null;
      return r;
    }
    /** Dal risveglio periodico: tiene pronto lo stato in cache (e lo rifà se è sparito). */
    function riscalda() { registro = null; memoria = {}; snap = undefined; prop = null; lockSnap = null; vivoL = null; durev = undefined; return !!statoRapido(); }
    /** Dal risveglio periodico: le chiavi di chi è scaduto si revocano anche se non si ripresenta. */
    function revocaScaduti() { prop = null; memoria = {}; return conLock(revocaChiavi); }
    return { gestisci: gestisci, azioni: Object.keys(azioni), revocaScaduti: revocaScaduti, riscalda: riscalda,
      riallinea: riallinea, erroreSpecchio: function () { return specchioUltimoErrore; },
      // per i test: la copia come la calcolerebbe adesso e com'è scritta nel formato REST
      copiaFirestore: function () { registro = null; memoria = {}; snap = undefined; prop = null; return copiaFirestore(); } };
  }

  return { SCHEMA: SCHEMA, TIPI: TIPI, RUOLI: RUOLI, SOLO_ADMIN: SOLO_ADMIN, PERCORSI: P, RE: RE, creaCustode: creaCustode, stabile: stabile };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PD;
