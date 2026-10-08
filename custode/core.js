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

  // "r:" pazienti, "g:" gruppi e classi, "p:" programmi riservati
  var CARTELLA = { r: 'ragazzi/', g: 'gruppi/', p: 'programmi/' };
  var P = {
    accessi: '_config/accessi.json',
    cifratura: '_config/cifratura.json',
    dispositivi: '_config/dispositivi.json',
    stato: '_config/stato.json',
    pazienti: '_config/pazienti.json',
    esportazioni: '_config/esportazioni.json',
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
    var A = amb.archivio;
    var inLock = false;
    function conLock(fn) {
      if (inLock) return fn();
      return A.conLock(function () { inLock = true; try { return fn(); } finally { inLock = false; } });
    }
    var oggi = function () { return amb.ora().slice(0, 10); };
    var proprietario = function () { return String(amb.proprietario() || '').toLowerCase(); };
    function leggiAccessi() { return A.leggiJSON(P.accessi) || { schema: SCHEMA, version: 0, utenti: {} }; }

    function utenteDa(identita) {
      var email = String(identita.email || '').toLowerCase();
      var voce = leggiAccessi().utenti[email];
      if (email && email === String(proprietario() || '').trim().toLowerCase()) {
        // chi ospita il custode è sempre operatore: nessuno può chiuderlo fuori
        return { email: email, nome: (voce && voce.nome) || identita.nome || email, ruolo: 'admin', ragazzi: [], proprietario: true };
      }
      if (!voce) throw err('non-autorizzato', 'L\'account ' + email + ' non è abilitato a PsyDiary. Chiedi a un operatore di aggiungerti.');
      if (voce.attivo === false) throw err('disattivato', 'L\'account ' + email + ' è stato disattivato.');
      if (voce.scadenza && oggi() > voce.scadenza) throw err('scaduto', 'L\'accesso di ' + email + ' è scaduto il ' + voce.scadenza + '.');
      return { email: email, nome: voce.nome || identita.nome || email, ruolo: voce.ruolo, ragazzi: voce.ragazzi || [], proprietario: false };
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
      var assegnato = a[0] === 'r' && !eAdmin(u) && u.ragazzi.indexOf(rid) >= 0;
      if (!rec) return eAdmin(u) || assegnato;              // di tutta l'aula (da prima)
      if (rec.proprietario === u.email || rec.condivisi.indexOf(u.email) >= 0 || assegnato) return true;
      if (rec.tutti && eAdmin(u)) return true;
      return !!u.proprietario && orfano(rec);
    }
    /** Come appare il paziente (o il gruppo, con a = "g:<id>") a chi lo vede (per l'app). */
    function accessoPer(u, rid, a) {
      var rec = a ? recDi(a) : leggiPazienti().pazienti[rid];
      if (!rec) return { tutti: true, daPrima: true };
      return { proprietario: rec.proprietario, condivisi: rec.condivisi.slice(), tutti: !!rec.tutti, mio: rec.proprietario === u.email, orfano: orfano(rec) };
    }
    function richiedi(cond, m) { if (!cond) throw err('vietato', m || 'Operazione non consentita al tuo ruolo.'); }

    // ---- stato globale: un contatore che cresce a ogni scrittura ----
    function leggiStato() { return A.leggiJSON(P.stato) || { schema: SCHEMA, rev: 0, ambiti: {} }; }
    function leggiAmbito(a) { return A.leggiJSON(P.ambito(a)) || { schema: SCHEMA, ambito: a, voci: {} }; }

    // ---- cifratura e dispositivi (come in Centro TICE) ----
    var azioni = {};
    azioni['io'] = function (u) {
      var c = A.leggiJSON(P.cifratura);
      // con la configurazione della chiave (non segreta): all'accesso basta una chiamata
      return { email: u.email, nome: u.nome, ruolo: u.ruolo, ragazzi: u.ragazzi, proprietario: u.proprietario, cifratura: !!c, kid: c ? c.kid : null, cfg: c || null, funzioni: ['riservati', 'gruppi-riservati', 'esportazione', 'programmi', 'io-cfg', 'in-attesa'] };
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
      var a = leggiAccessi();
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
    var storie = null;
    function archiviaStoria(ambito, r) {
      var s = storie && storie[ambito];
      if (!s) {
        s = A.leggiJSON(P.storia(ambito)) || { schema: SCHEMA, voci: {} };
        if (storie) storie[ambito] = s;
      }
      var l = s.voci[r.id] || [];
      var nuova = { version: r.version, busta: r.busta, aggiornato: r.aggiornato, aggiornatoDa: r.aggiornatoDa, eliminato: !!r.eliminato };
      // L'app salva mentre si scrive: le bozze della stessa persona a pochi minuti
      // l'una dall'altra sono una sessione di scrittura sola e se ne tiene l'ultima.
      // Così restano le versioni che servono (com'era prima di ogni sessione) e la
      // storia non si riempie di 15 bozze dello stesso minuto.
      var prec = l[0];
      if (prec && !prec.eliminato && !nuova.eliminato && prec.aggiornatoDa === nuova.aggiornatoDa &&
          Math.abs(Date.parse(nuova.aggiornato) - Date.parse(prec.aggiornato)) < BOZZE_MS) l[0] = nuova;
      else l.unshift(nuova);
      s.voci[r.id] = l.slice(0, STORIA_PER_VOCE);
      if (!storie) A.scriviJSON(P.storia(ambito), s);
    }

    /**
     * Una sola chiamata: prima applica gli invii (con controllo di versione),
     * poi restituisce quello che è cambiato negli ambiti visibili.
     * dati = { cursori: { ambito: rev }, invii: [ { id, tipo, ambito, versioneBase, busta | eliminato } ] }
     */
    azioni['sync'] = function (u, d) {
      var c = A.leggiJSON(P.cifratura);
      var invii = listaV(d.invii, 200, 'invii').map(voceV);
      var esiti = [];
      if (invii.length) {
        if (!c) throw err('senza-chiave', 'Prima un operatore deve creare la chiave dell\'aula.');
        storie = {};
        try { conLock(function () {
          var stato = leggiStato();
          stato.indice = stato.indice || {};
          var toccati = {};   // ambito -> file (si scrive una volta sola)
          var file = function (a) { return toccati[a] || (toccati[a] = leggiAmbito(a)); };
          invii.forEach(function (v) {
            try {
              if (v.busta && v.busta.kid !== c.kid) throw err('chiave-cambiata', 'La chiave dell\'aula è cambiata.');
              // il primo dato di un paziente nuovo lo rende di chi lo crea
              var rid = v.ambito.slice(2);
              if (v.ambito !== 'aula' && eAdmin(u) && !v.eliminato && stato.ambiti[v.ambito] === undefined && !toccati[v.ambito] && !recDi(v.ambito)) {
                var reg = leggiPazienti();
                reg[REGISTRO[v.ambito[0]]][rid] = { proprietario: u.email, condivisi: [], tutti: false, creato: amb.ora() };
                scriviPazienti(reg);
              }
              richiedi(vedeAmbito(u, v.ambito), 'Questo ragazzo non è condiviso con te.');
              if (!eAdmin(u) && SOLO_ADMIN[v.tipo]) throw err('vietato', 'Ragazzi, anagrafiche e gruppi li gestiscono gli operatori.');
              var dove = stato.indice[v.id] || v.ambito;
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
              if (versione !== v.versioneBase) throw err('conflitto', 'Modificata nel frattempo.', { attuale: attuale ? Object.assign({ ambito: dove }, attuale) : null });
              if (attuale && attuale.tipo !== v.tipo) throw err('richiesta-non-valida', 'Il tipo di una voce non cambia.');
              if (!eAdmin(u) && attuale && v.tipo === 'nota' && attuale.creatoDa !== u.email) throw err('vietato', 'Puoi modificare solo le note che hai scritto tu.');
              if (!eAdmin(u) && v.eliminato && attuale && attuale.creatoDa !== u.email) throw err('vietato', 'Puoi eliminare solo quello che hai scritto tu.');
              if (!attuale && v.eliminato) { esiti.push({ id: v.id, ok: true, version: 0 }); return; }
              var ora = amb.ora();
              stato.rev += 1;
              var r = {
                id: v.id, tipo: v.tipo, version: versione + 1, rev: stato.rev, busta: v.busta, eliminato: v.eliminato || undefined,
                creato: attuale ? attuale.creato : ora, creatoDa: attuale ? attuale.creatoDa : u.email, aggiornato: ora, aggiornatoDa: u.email,
              };
              if (attuale) archiviaStoria(dove, attuale);
              if (dove !== v.ambito) {
                // cambio di ambito (es. una nota che diventa "nel gruppo"): nel vecchio resta una lapide
                attualeFile.voci[v.id] = { id: v.id, tipo: v.tipo, version: r.version, rev: stato.rev, eliminato: true, spostato: v.ambito, aggiornato: ora, aggiornatoDa: u.email };
                stato.ambiti[dove] = stato.rev;
              }
              file(v.ambito).voci[v.id] = r;
              stato.ambiti[v.ambito] = stato.rev;
              stato.indice[v.id] = v.ambito;
              esiti.push({ id: v.id, ok: true, version: r.version, ambito: v.ambito });
            } catch (e) {
              if (!(e instanceof Errore)) throw e;
              esiti.push({ id: v.id, ok: false, errore: e.codice, messaggio: e.message, extra: e.extra });
            }
          });
          Object.keys(toccati).forEach(function (a) { A.scriviJSON(P.ambito(a), toccati[a]); });
          Object.keys(storie).forEach(function (a) { A.scriviJSON(P.storia(a), storie[a]); });
          A.scriviJSON(P.stato, stato);
        }); } finally { storie = null; }
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
          if (r.rev > noto) cambi.push(Object.assign({ ambito: a }, r));
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
      return { esiti: esiti, voci: cambi, ambiti: visibili, cursori: stato.ambiti, rev: stato.rev, kid: c ? c.kid : null, pazienti: pazienti, gruppi: gruppi, programmi: programmi, inAttesa: inAttesa };
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
        var stato = leggiStato();
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
        Object.keys(f.voci).forEach(function (id) { var r = f.voci[id]; if (!r.eliminato && r.busta) voci.push(Object.assign({ ambito: a }, r)); });
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

    function gestisci(richiesta) {
      try {
        if (!richiesta || typeof richiesta !== 'object') throw err('richiesta-non-valida', 'Richiesta vuota.');
        if (richiesta.v !== 1) throw err('richiesta-non-valida', 'Versione del protocollo non supportata: aggiorna l\'app.');
        var fn = azioni[richiesta.azione];
        if (!fn) throw err('richiesta-non-valida', 'Azione sconosciuta.');
        registro = null;
        var identita;
        try { identita = amb.verificaToken(richiesta.token); } catch (e) { throw err('non-autenticato', 'Accesso scaduto o non valido: rientra con Google.'); }
        var u = utenteDa(identita);
        var chiave = amb.ricordo && RIPETIBILI[richiesta.azione] && typeof richiesta.rid === 'string' && RE_RICHIESTA.test(richiesta.rid)
          ? 'rid:' + u.email + ':' + richiesta.azione + ':' + richiesta.rid : null;
        if (chiave) {
          var gia = null;
          try { gia = amb.ricordo.leggi(chiave); } catch (e0) { gia = null; }
          if (gia) return JSON.parse(gia);
        }
        var esito = fn(u, richiesta.dati && typeof richiesta.dati === 'object' ? richiesta.dati : {});
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
    return { gestisci: gestisci, azioni: Object.keys(azioni) };
  }

  return { SCHEMA: SCHEMA, TIPI: TIPI, RUOLI: RUOLI, PERCORSI: P, RE: RE, creaCustode: creaCustode, stabile: stabile };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PD;
