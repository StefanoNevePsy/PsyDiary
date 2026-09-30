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
 *     conoscenza, note personali). Lo vedono gli operatori e i tirocinanti a
 *     cui il ragazzo è condiviso: agli altri non arriva nemmeno cifrato.
 *
 * Tutto è sincrono di proposito: in Apps Script lo sono anche Drive e UrlFetch.
 */
var PD = (function () {
  'use strict';

  var SCHEMA = 1;
  var RUOLI = ['admin', 'tirocinante'];
  var TIPI = ['ragazzo', 'scheda', 'gruppo', 'seduta', 'nota', 'sospeso', 'serie'];
  // I tirocinanti scrivono ma non gestiscono: niente ragazzi, schede, gruppi.
  var SOLO_ADMIN = { ragazzo: true, scheda: true, gruppo: true, serie: true };
  var STORIA_PER_VOCE = 15;   // versioni precedenti tenute per ogni voce

  var P = {
    accessi: '_config/accessi.json',
    cifratura: '_config/cifratura.json',
    dispositivi: '_config/dispositivi.json',
    stato: '_config/stato.json',
    ambito: function (a) { return a === 'aula' ? 'Dati/aula.json' : 'Dati/ragazzi/' + a.slice(2) + '.json'; },
    storia: function (a) { return a === 'aula' ? 'Storia/aula.json' : 'Storia/ragazzi/' + a.slice(2) + '.json'; },
    immagine: function (a, id) { return 'Immagini/' + (a === 'aula' ? 'aula' : a.slice(2)) + '/' + id + '.json'; },
  };

  var RE = {
    id: /^[a-z0-9]{2,40}$/,
    ambito: /^(aula|r:[a-z0-9]{2,40})$/,
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
      if (email && email === proprietario()) {
        // chi ospita il custode è sempre operatore: nessuno può chiuderlo fuori
        return { email: email, nome: (voce && voce.nome) || identita.nome || email, ruolo: 'admin', ragazzi: [], proprietario: true };
      }
      if (!voce) throw err('non-autorizzato', 'L\'account ' + email + ' non è abilitato a PsyDiary. Chiedi a un operatore di aggiungerti.');
      if (voce.attivo === false) throw err('disattivato', 'L\'account ' + email + ' è stato disattivato.');
      if (voce.scadenza && oggi() > voce.scadenza) throw err('scaduto', 'L\'accesso di ' + email + ' è scaduto il ' + voce.scadenza + '.');
      return { email: email, nome: voce.nome || identita.nome || email, ruolo: voce.ruolo, ragazzi: voce.ragazzi || [], proprietario: false };
    }
    var eAdmin = function (u) { return u.ruolo === 'admin'; };
    function vedeAmbito(u, a) { return a === 'aula' || eAdmin(u) || u.ragazzi.indexOf(a.slice(2)) >= 0; }
    function richiedi(cond, m) { if (!cond) throw err('vietato', m || 'Operazione non consentita al tuo ruolo.'); }

    // ---- stato globale: un contatore che cresce a ogni scrittura ----
    function leggiStato() { return A.leggiJSON(P.stato) || { schema: SCHEMA, rev: 0, ambiti: {} }; }
    function leggiAmbito(a) { return A.leggiJSON(P.ambito(a)) || { schema: SCHEMA, ambito: a, voci: {} }; }

    // ---- cifratura e dispositivi (come in Centro TICE) ----
    var azioni = {};
    azioni['io'] = function (u) {
      var c = A.leggiJSON(P.cifratura);
      return { email: u.email, nome: u.nome, ruolo: u.ruolo, ragazzi: u.ragazzi, proprietario: u.proprietario, cifratura: !!c, kid: c ? c.kid : null };
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
    function archiviaStoria(ambito, r) {
      var s = A.leggiJSON(P.storia(ambito)) || { schema: SCHEMA, voci: {} };
      var l = s.voci[r.id] || [];
      l.unshift({ version: r.version, busta: r.busta, aggiornato: r.aggiornato, aggiornatoDa: r.aggiornatoDa, eliminato: !!r.eliminato });
      s.voci[r.id] = l.slice(0, STORIA_PER_VOCE);
      A.scriviJSON(P.storia(ambito), s);
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
        conLock(function () {
          var stato = leggiStato();
          stato.indice = stato.indice || {};
          var toccati = {};   // ambito -> file (si scrive una volta sola)
          var file = function (a) { return toccati[a] || (toccati[a] = leggiAmbito(a)); };
          invii.forEach(function (v) {
            try {
              if (v.busta && v.busta.kid !== c.kid) throw err('chiave-cambiata', 'La chiave dell\'aula è cambiata.');
              richiedi(vedeAmbito(u, v.ambito), 'Questo ragazzo non è condiviso con te.');
              if (!eAdmin(u) && SOLO_ADMIN[v.tipo]) throw err('vietato', 'Ragazzi, anagrafiche e gruppi li gestiscono gli operatori.');
              var dove = stato.indice[v.id] || v.ambito;
              var attualeFile = file(dove), attuale = attualeFile.voci[v.id] || null;
              if (attuale && !vedeAmbito(u, dove)) throw err('vietato', 'Voce non accessibile.');
              var versione = attuale ? attuale.version : 0;
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
          A.scriviJSON(P.stato, stato);
        });
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
      return { esiti: esiti, voci: cambi, ambiti: visibili, cursori: stato.ambiti, rev: stato.rev, kid: c ? c.kid : null };
    };

    azioni['voce.storia'] = function (u, d) {
      var id = idV(d.id, RE.id, 'id'), a = idV(d.ambito, RE.ambito, 'ambito');
      richiedi(vedeAmbito(u, a));
      var s = A.leggiJSON(P.storia(a));
      return (s && s.voci[id]) || [];
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
        var identita;
        try { identita = amb.verificaToken(richiesta.token); } catch (e) { throw err('non-autenticato', 'Accesso scaduto o non valido: rientra con Google.'); }
        var u = utenteDa(identita);
        return { ok: true, dati: fn(u, richiesta.dati && typeof richiesta.dati === 'object' ? richiesta.dati : {}) };
      } catch (e) {
        if (e instanceof Errore) return { ok: false, errore: e.codice, messaggio: e.message, extra: e.extra };
        return { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(e && e.message || e).slice(0, 300) };
      }
    }
    return { gestisci: gestisci, azioni: Object.keys(azioni) };
  }

  return { SCHEMA: SCHEMA, TIPI: TIPI, RUOLI: RUOLI, PERCORSI: P, RE: RE, creaCustode: creaCustode, stabile: stabile };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PD;
