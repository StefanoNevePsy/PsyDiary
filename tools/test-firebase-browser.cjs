#!/usr/bin/env node
/**
 * Prova da un capo all'altro con TRE browser, il custode locale (stessa logica di Apps Script, tools/custode-locale.cjs) e gli
 * emulatori di Firestore e Auth: l'app vera (Vite in sviluppo), la libreria di Firebase vera (da npm, in un pezzo a parte).
 * Dimostra: consegna della chiave in pochi secondi (anche con il codice di verifica), modifica visibile sull'altro dispositivo in
 * circa un secondo, ambiti riservati che non arrivano a chi non li vede e arrivano quando vengono condivisi, riserva automatica
 * se la corsia si spegne. Nessuna chiamata al progetto vero. Si lancia con
 *   sh tools/test-firebase.sh   (che passa di qui se c'è Playwright)
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), http = require('http');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright non installato: prova con i browser saltata.'); process.exit(0); }
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085', AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const PROGETTO = process.env.GCLOUD_PROJECT || 'demo-psydiary';
if (!/^demo-/.test(PROGETTO)) { console.error('Solo progetti «demo-…» (emulatori): ' + PROGETTO); process.exit(2); }
const radice = path.join(__dirname, '..');
let n = 0, falliti = 0;
const ok = (c, m) => { n++; if (!c) falliti++; console.log((c ? '  ok  ' : '  NO  ') + m); };
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const portaLibera = () => new Promise((ok2) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok2(p)); }); });
async function pronto(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { await new Promise((ok2, ko) => http.get(url, (r) => { r.resume(); r.statusCode < 500 ? ok2() : ko(); }).on('error', ko)); return true; } catch (e) { await attendi(300); } }
  return false;
}
const PROP = 'stefano@aula.test', OP = 'elena@aula.test', TIR = 'giulia@aula.test';

(async () => {
  const figli = [];
  const parti = (cmd, args, env) => { const p = spawn(cmd, args, { cwd: radice, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); figli.push(p); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); return p; };
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-e2e-'));
  const [pc, pv] = [await portaLibera(), await portaLibera()];
  parti('node', ['tools/custode-locale.cjs', String(pc), dati], { FIRESTORE: HOST, PROGETTO, PROPRIETARIO: PROP });
  parti(path.join(radice, 'node_modules/.bin/vite'), ['--port', String(pv), '--strictPort', '--host', '127.0.0.1'], {
    VITE_CUSTODE_URL: 'http://127.0.0.1:' + pc, VITE_ACCESSO_DEV: '1', VITE_GOOGLE_CLIENT_ID: 'prova', VITE_FIREBASE_PROJECT_ID: PROGETTO,
    VITE_FIREBASE_EMULATORE: HOST + ',' + AUTH,
  });
  const url = 'http://127.0.0.1:' + pv + '/';
  const chiudiTutto = () => figli.forEach((p) => { try { p.kill(); } catch (e) { /* ok */ } });
  if (!(await pronto('http://127.0.0.1:' + pc + '/', 20000)) || !(await pronto(url, 60000))) { console.log('  NO  server di prova non partiti'); chiudiTutto(); process.exit(1); }
  const opz = {}; const pw = '/opt/pw-browsers';
  if (!process.env.CI && fs.existsSync(pw)) { const c = fs.readdirSync(pw).find((x) => x.startsWith('chromium-')); if (c) opz.executablePath = `${pw}/${c}/chrome-linux/chrome`; }
  const b = await chromium.launch(opz);
  const errori = [];
  async function dispositivo(nome) {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errori.push(nome + ': ' + e.message));
    await p.goto(url); await p.waitForSelector('input[type=email]', { timeout: 60000 });
    return p;
  }
  // tutto quello che serve dell'app si prende dai moduli, come li usa la pagina (stesse istanze)
  const nellaPagina = (p, corpo, arg) => p.evaluate(`(async (arg) => {
    const S = await import('/src/lib/centro/sync.svelte.js'), V = await import('/src/lib/centro/veloce.svelte.js'), D = await import('/src/lib/dati.svelte.js');
    ${corpo}
  })(${JSON.stringify(arg === undefined ? null : arg)})`);
  const finche = async (p, cond, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { if (await nellaPagina(p, 'return !!(' + cond + ');').catch(() => false)) return Date.now() - t0; await attendi(80); } return -1; };
  const entra = async (p, email) => { await p.fill('input[type=email]', email); await p.click('button:has-text("Entra")'); };
  try {
    const A = await dispositivo('A'), B = await dispositivo('B'), C = await dispositivo('C');
    // ---- A: il proprietario crea la chiave dell'aula
    await entra(A, PROP);
    await A.waitForSelector('button:has-text("Crea la chiave e inizia")', { timeout: 20000 });
    await A.check('.spunta input'); await A.click('button:has-text("Crea la chiave e inizia")');
    ok(await finche(A, "S.sync.fase === 'pronto'") >= 0, 'A: chiave dell\'aula creata, dentro');
    ok(await finche(A, 'V.veloce.attiva', 20000) >= 0, 'A: corsia veloce attiva (copia degli accessi letta da Firestore, libreria caricata da npm)');
    ok(await nellaPagina(A, 'return /Corsia veloce/.test(document.body.innerText) || true;'), 'A: pagina viva');
    await nellaPagina(A, `const a = await S.leggiAccessi();
      a.utenti[${JSON.stringify(OP)}] = { nome: 'Elena', ruolo: 'admin', ragazzi: [], attivo: true };
      a.utenti[${JSON.stringify(TIR)}] = { nome: 'Giulia', ruolo: 'tirocinante', ragazzi: [], attivo: true };
      await S.salvaAccessi(a, a.version);`);

    // ---- B: un operatore con un dispositivo nuovo riceve la chiave (consegna automatica)
    const t0 = Date.now();
    await entra(B, OP);
    const codiceB = await finche(B, "V.veloce.codice", 20000);
    ok(codiceB >= 0, 'B: in attesa, mostra il codice di verifica a 6 cifre');
    ok(/^\d{6}$/.test(await nellaPagina(B, 'return V.veloce.codice || "";')), 'B: il codice ha 6 cifre');
    const tChiave = await finche(B, "S.sync.fase === 'pronto'", 30000);
    ok(tChiave >= 0 && Date.now() - t0 < 12000, 'B: chiave ricevuta in ' + (Date.now() - t0) + ' ms dall\'accesso (il controllo del custode sarebbe ogni 5 secondi + il giro dell\'operatore)');
    ok(await nellaPagina(B, 'return !!S.sync.cfg;'), 'B: ha la configurazione della chiave');
    ok(await finche(B, 'V.veloce.attiva', 20000) >= 0, 'B: corsia veloce attiva');
    await attendi(600);
    ok(await nellaPagina(B, 'return V.veloce.codice === null && V._motore()._st.richiestaId === null;'), 'B: richiesta e consegna cancellate dopo l\'uso');

    // ---- consegna con il codice di verifica (modalità manuale) a un tirocinante
    await nellaPagina(A, 'V.impostaManuale(true);'); await nellaPagina(B, 'V.impostaManuale(true);');   // ogni operatore sceglie per il proprio dispositivo
    await entra(C, TIR);
    ok(await finche(C, 'V.veloce.codice', 20000) >= 0, 'C: tirocinante in attesa, mostra il codice');
    ok(await finche(A, 'V.veloce.richieste.length === 1', 15000) >= 0, 'A (consegna manuale): la richiesta aspetta il tocco');
    const codC = await nellaPagina(C, 'return V.veloce.codice;'), codA = await nellaPagina(A, 'return V.veloce.richieste[0].codice;');
    ok(codC && codC === codA, 'il codice di verifica è lo stesso sui due dispositivi: ' + codC);
    await attendi(1500);
    ok(await nellaPagina(C, "return S.sync.fase !== 'pronto';"), 'C: senza il tocco dell\'operatore la chiave non arriva');
    // la schermata dell'operatore: la riga «Corsia veloce», la richiesta con il codice, il tasto «Consegna»
    await A.evaluate(() => { location.hash = '#/impostazioni'; });
    await A.waitForSelector('text=Corsia veloce: attiva', { timeout: 10000 });
    ok(true, 'A: in Impostazioni c\'è la riga «Corsia veloce: attiva»');
    await A.waitForSelector('.richiesta', { timeout: 10000 });
    ok((await A.innerText('.richiesta')).includes(codA.slice(0, 3) + ' ' + codA.slice(3)), 'A: la richiesta in schermata mostra il codice di verifica ' + codA.slice(0, 3) + ' ' + codA.slice(3));
    await A.locator('.richiesta').scrollIntoViewIfNeeded();
    await A.screenshot({ path: path.join(os.tmpdir(), 'psy-impostazioni-attiva.png') });
    const t1 = Date.now();
    await A.click('.richiesta button:has-text("Consegna")');

    const cOk = await finche(C, "S.sync.fase === 'pronto'", 20000) >= 0;
    ok(cOk, 'C: chiave ricevuta in ' + (Date.now() - t1) + ' ms dal tocco');
    if (!cOk) console.log('DEBUG C', JSON.stringify(await nellaPagina(C, 'return { fase: S.sync.fase, errore: S.sync.errore, v: { ...V.veloce }, st: { stato: V._motore()._st.stato, richiestaId: V._motore()._st.richiestaId } };')),
      'A', JSON.stringify(await nellaPagina(A, 'return { v: { ...V.veloce }, abil: S.sync.dispositivi };')));
    ok(await finche(A, 'V.veloce.richieste.length === 0', 5000) >= 0, 'A: la richiesta sparisce dalla schermata');
    ok(await nellaPagina(C, 'return !(await (await import("/src/lib/centro/cifra.js")).portachiavi())[S.sync.cfg.kid].extractable;'), 'C: la chiave del tirocinante non è esportabile');
    await nellaPagina(A, 'V.impostaManuale(false);'); await nellaPagina(B, 'V.impostaManuale(false);');
    ok(await finche(C, 'V.veloce.attiva', 20000) >= 0, 'C: corsia veloce attiva');

    // ---- modifiche in tempo reale
    await nellaPagina(A, `await D.salva('gruppi', { id: 'gprova01', nome: 'Gruppo di prova', tipo: 'terapeutico', tema: '', obiettivi: '', membri: [], alunni: [], programmi: [] });`);
    await attendi(1200);
    const rB = await nellaPagina(B, 'return V.veloce.ricevute;');
    const tm = Date.now();
    await nellaPagina(A, `await D.salva('note', { id: 'nprova01', data: '2026-11-13', titolo: 'Prova', categoria: 'altro', testo: 'ciao dal dispositivo A', autore: 'A', gruppoId: 'gprova01' });`);
    const lat = await finche(B, "D.dati.note.some((x) => x.id === 'nprova01')", 15000);
    ok(lat >= 0 && Date.now() - tm < 4000, 'B: la nota di A arriva in ' + (Date.now() - tm) + ' ms');
    ok(await nellaPagina(B, `return V.veloce.ricevute > ${rB};`), 'B: è arrivata dalla corsia veloce (non dal giro del custode)');
    ok(await nellaPagina(A, 'return V.veloce.pubblicate > 0;'), 'A: ha pubblicato su Firestore');
    ok(await finche(C, "D.dati.note.some((x) => x.id === 'nprova01')", 15000) >= 0, 'C (tirocinante): la riceve anche lui');
    const tm2 = Date.now();
    await nellaPagina(A, `const x = D.dati.note.find((n) => n.id === 'nprova01'); await D.salva('note', { ...$state_snapshot(x), testo: 'ciao, modificata da A' });
      function $state_snapshot(o) { return JSON.parse(JSON.stringify(o)); }`);
    ok(await finche(B, "D.dati.note.find((x) => x.id === 'nprova01')?.testo === 'ciao, modificata da A'", 15000) >= 0, 'B: vede la modifica in ' + (Date.now() - tm2) + ' ms');
    // e il custode ha lo stesso: un giro con il custode non cambia niente né duplica
    await nellaPagina(B, 'await S.sincronizza();');
    ok(await nellaPagina(B, "return D.dati.note.filter((x) => x.id === 'nprova01').length === 1 && D.dati.note.find((x) => x.id === 'nprova01').testo === 'ciao, modificata da A';"), 'B: dopo un giro con il custode, stesso stato e nessun duplicato');
    // verso opposto, e da un tirocinante
    await nellaPagina(B, `await D.salva('note', { id: 'nprova02', data: '2026-11-13', titolo: 'Da B', categoria: 'altro', testo: 'scritta da B', autore: 'B', gruppoId: 'gprova01' });`);
    ok(await finche(A, "D.dati.note.some((x) => x.id === 'nprova02')", 15000) >= 0, 'A: riceve la nota di B');
    await nellaPagina(C, `await D.salva('note', { id: 'nprova03', data: '2026-11-13', titolo: 'Da C', categoria: 'altro', testo: 'scritta da C (tirocinante)', autore: 'C', gruppoId: 'gprova01' });`);
    ok(await finche(A, "D.dati.note.some((x) => x.id === 'nprova03')", 15000) >= 0 && await finche(B, "D.dati.note.some((x) => x.id === 'nprova03')", 15000) >= 0, 'A e B: ricevono la nota del tirocinante');
    await nellaPagina(B, `await D.elimina('note', 'nprova02'); S.sync.inCoda; (await import('/src/lib/centro/sync.svelte.js'));`).catch(() => {});

    // ---- ambiti riservati: arrivano solo a chi li vede
    const rid = await nellaPagina(A, `const p = await D.creaPaziente({ nome: 'Prova', cognome: 'Riservata', noteStabili: 'segreto di A' }); return p.id;`);
    await finche(A, 'S.sync.inCoda === 0', 10000); await attendi(2000);
    ok(await nellaPagina(B, `return !D.dati.ragazzi.some((x) => x.id === ${JSON.stringify(rid)});`), 'B: il paziente riservato di A non gli arriva (nemmeno il nome)');
    ok(await nellaPagina(C, `return !D.dati.ragazzi.some((x) => x.id === ${JSON.stringify(rid)});`), 'C: nemmeno a lei');
    const tc = Date.now();
    await nellaPagina(A, `await S.condividiPaziente(${JSON.stringify(rid)}, { condivisi: [${JSON.stringify(OP)}], tutti: false });`);
    ok(await finche(B, `D.dati.ragazzi.find((x) => x.id === ${JSON.stringify(rid)})?.noteStabili === 'segreto di A'`, 20000) >= 0, 'B: condiviso con lui, il paziente arriva in ' + (Date.now() - tc) + ' ms');
    ok(await nellaPagina(C, `return !D.dati.ragazzi.some((x) => x.id === ${JSON.stringify(rid)});`), 'C: a chi non è condiviso continua a non arrivare niente');
    await attendi(800);
    const rB2 = await nellaPagina(B, 'return V.veloce.ricevute;'), tr = Date.now();
    await nellaPagina(A, `const p = D.dati.ragazzi.find((x) => x.id === ${JSON.stringify(rid)}); await D.salva('ragazzi', { ...JSON.parse(JSON.stringify(p)), noteStabili: 'aggiornato da A' });`);
    ok(await finche(B, `D.dati.ragazzi.find((x) => x.id === ${JSON.stringify(rid)})?.noteStabili === 'aggiornato da A'`, 15000) >= 0, 'B: la modifica nell\'ambito appena condiviso arriva in ' + (Date.now() - tr) + ' ms');
    ok(await nellaPagina(B, `return V.veloce.ricevute > ${rB2};`), 'B: dalla corsia veloce');
    ok(await nellaPagina(C, `return !D.dati.ragazzi.some((x) => x.id === ${JSON.stringify(rid)});`), 'C: ancora niente');
    await nellaPagina(A, `await S.condividiPaziente(${JSON.stringify(rid)}, { condivisi: [], tutti: false });`);
    ok(await finche(B, `!D.dati.ragazzi.some((x) => x.id === ${JSON.stringify(rid)})`, 20000) >= 0, 'B: tolto l\'accesso, il paziente lascia il dispositivo');

    // ---- riserva: la corsia si spegne, l'app funziona come prima
    await nellaPagina(A, `V._motore().spegni('prova di riserva', { notifica: true });`);
    ok(await nellaPagina(A, 'return !V.veloce.attiva && /riserva/.test(V.veloce.motivo);'), 'A: lo stato dice «spenta (prova di riserva)»');
    await A.waitForSelector('text=Corsia veloce: spenta (prova di riserva)', { timeout: 10000 }).catch(async (e) => { console.log('DEBUG', JSON.stringify(await A.evaluate(() => document.querySelector('[data-corsia-veloce]')?.innerText)), await A.evaluate(() => location.hash)); throw e; });
    ok(true, 'A: in Impostazioni la riga dice «Corsia veloce: spenta (prova di riserva)»');
    ok(await A.isVisible('button:has-text("Riprova")'), 'A: c\'è il tasto «Riprova»');
    await A.locator('[data-corsia-veloce]').scrollIntoViewIfNeeded();
    await A.screenshot({ path: path.join(os.tmpdir(), 'psy-impostazioni-spenta.png') });
    const rB3 = await nellaPagina(B, 'return V.veloce.ricevute;');
    await nellaPagina(A, `const x = D.dati.note.find((n) => n.id === 'nprova01'); await D.salva('note', { ...JSON.parse(JSON.stringify(x)), testo: 'scritta con la corsia spenta' });`);
    ok(await finche(A, 'S.sync.inCoda === 0 && !S.sync.errore', 15000) >= 0, 'riserva: con la corsia spenta il salvataggio arriva lo stesso al custode');
    await attendi(1500);
    ok(await nellaPagina(B, `return V.veloce.ricevute === ${rB3};`), 'riserva: non è passata da Firestore');
    await nellaPagina(B, 'await S.sincronizza();');
    ok(await finche(B, "D.dati.note.find((x) => x.id === 'nprova01')?.testo === 'scritta con la corsia spenta'", 15000) >= 0, 'riserva: B la riceve dal giro del custode');
    ok(errori.length === 0, 'nessun errore di pagina' + (errori.length ? ': ' + errori.join(' | ') : ''));
  } catch (e) { falliti++; console.log('  NO  ' + (e && e.stack || e)); }
  await b.close(); chiudiTutto();
  console.log(`\n${n} verifiche, ${falliti} fallite`);
  process.exit(falliti ? 1 : 0);
})();
