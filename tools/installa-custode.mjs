#!/usr/bin/env node
/**
 * Installa (o aggiorna) il custode di PsyDiary su Google Apps Script con un
 * solo comando, dal tuo computer:
 *
 *   npm run custode:installa -- <client-id-di-google>
 *
 * Cosa fa:
 *   1. accede a Google con clasp (si apre il browser, una volta sola);
 *   2. crea il progetto Apps Script "PsyDiary · custode" (o aggiorna quello già creato);
 *   3. carica il codice e lo distribuisce come app web;
 *   4. se c'è la CLI di GitHub (gh) già collegata, imposta da sola le
 *      variabili e il segreto del repository; altrimenti te li stampa.
 *
 * Resta da fare a mano una cosa sola: aprire il progetto e premere ▶ Esegui
 * su "configura", per dare al custode il permesso di usare il tuo Drive.
 * Prima volta: abilita "Google Apps Script API" su https://script.google.com/home/usersettings
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLASP = ['--yes', '@google/clasp@2.4.2'];
const clasp = (args, opz = {}) => execFileSync('npx', [...CLASP, ...args], { cwd: radice, encoding: 'utf8', stdio: opz.eco ? 'inherit' : 'pipe' });
const esiste = (f) => fs.existsSync(f);
const titolo = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const clientId = (process.argv[2] || process.env.GOOGLE_CLIENT_ID || '').trim();
if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
  console.error('Serve il client ID di Google (finisce con .apps.googleusercontent.com):\n  npm run custode:installa -- 1234-abc.apps.googleusercontent.com\nVedi docs/messa-in-servizio.md, passo 2.');
  process.exit(1);
}

titolo('1. Accesso a Google');
const rc = path.join(os.homedir(), '.clasprc.json');
if (!esiste(rc)) clasp(['login'], { eco: true });
else console.log('già fatto (' + rc + ')');

titolo('2. Preparo il codice del custode');
execFileSync(process.execPath, [path.join(radice, 'tools/componi-custode.cjs')], { env: { ...process.env, GOOGLE_CLIENT_ID: clientId }, stdio: 'inherit' });
fs.rmSync(path.join(radice, 'custode-pronto/custode-completo.gs'));   // su Apps Script vanno i file separati

titolo('3. Progetto Apps Script');
const claspJson = path.join(radice, '.clasp.json');
if (!esiste(claspJson)) {
  clasp(['create', '--type', 'standalone', '--title', 'PsyDiary · custode', '--rootDir', 'custode-pronto'], { eco: true });
  // clasp create può riscrivere il manifesto: si rimette il nostro
  fs.copyFileSync(path.join(radice, 'custode/appsscript.json'), path.join(radice, 'custode-pronto/appsscript.json'));
}
const { scriptId } = JSON.parse(fs.readFileSync(claspJson, 'utf8'));
console.log('progetto: https://script.google.com/d/' + scriptId + '/edit');

titolo('4. Carico il codice');
clasp(['push', '--force'], { eco: true });

titolo('5. Distribuzione come app web');
const memoria = path.join(radice, '.custode-distribuzione');
let deploymentId = esiste(memoria) ? fs.readFileSync(memoria, 'utf8').trim() : '';
const out = deploymentId
  ? clasp(['deploy', '--deploymentId', deploymentId, '--description', 'PsyDiary ' + new Date().toISOString().slice(0, 10)])
  : clasp(['deploy', '--description', 'PsyDiary, prima distribuzione']);
const m = /(AKfy[\w-]+)/.exec(out);
if (!m) { console.error(out); console.error('Non trovo l\'id della distribuzione nella risposta di clasp.'); process.exit(1); }
deploymentId = m[1];
fs.writeFileSync(memoria, deploymentId);
const url = 'https://script.google.com/macros/s/' + deploymentId + '/exec';
console.log('indirizzo del custode: ' + url);

titolo('6. GitHub');
const variabili = { CUSTODE_URL: url, GOOGLE_CLIENT_ID: clientId, SCRIPT_ID: scriptId, CUSTODE_DEPLOYMENT_ID: deploymentId };
const gh = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status === 0;
if (gh) {
  for (const [k, v] of Object.entries(variabili)) execFileSync('gh', ['variable', 'set', k, '--body', v], { cwd: radice, stdio: 'inherit' });
  execFileSync('gh', ['secret', 'set', 'CLASPRC_JSON'], { cwd: radice, input: fs.readFileSync(rc), stdio: ['pipe', 'inherit', 'inherit'] });
  console.log('variabili e segreto impostati: al prossimo push la GitHub Action pubblica l\'app collegata al custode.');
} else {
  console.log('Non trovo la CLI "gh" collegata. Imposta a mano su GitHub (Settings → Secrets and variables → Actions):');
  for (const [k, v] of Object.entries(variabili)) console.log(`  variabile ${k} = ${v}`);
  console.log('  segreto  CLASPRC_JSON = il contenuto del file ' + rc + ' (facoltativo: serve ad aggiornare il custode da GitHub)');
}

titolo('Ultimo passo, a mano (una volta sola)');
console.log('Apri https://script.google.com/d/' + scriptId + '/edit, scegli la funzione "configura" e premi ▶ Esegui.');
console.log('Google chiede il permesso di usare il tuo Drive: accetta. Poi controlla ' + url + ' : deve rispondere "configurato": true.');
