#!/usr/bin/env node
/**
 * Prepara il custode per Google Apps Script, in custode-pronto/:
 *   - Codice.gs           logica (core.js) + collegamento ai servizi Google
 *   - Configurazione.gs   client ID di Google (da GOOGLE_CLIENT_ID), se dato
 *   - appsscript.json     manifesto (app web, permessi)
 *   - custode-completo.gs tutto in un file, da incollare a mano nell'editor
 * Usato dalla GitHub Action (con clasp) e per l'installazione a mano.
 */
const fs = require('fs');
const path = require('path');
const radice = path.join(__dirname, '..');
const fuori = path.join(radice, 'custode-pronto');
const core = fs.readFileSync(path.join(radice, 'custode/core.js'), 'utf8')
  .replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
const codice = fs.readFileSync(path.join(radice, 'custode/Codice.gs'), 'utf8');
const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
const proprietario = (process.env.PROPRIETARIO || '').trim();

const config = `// Generato da tools/componi-custode.cjs: non modificare a mano.
// Le proprietà dello script con lo stesso nome, se ci sono, hanno la precedenza.
var CONFIGURAZIONE = ${JSON.stringify({ GOOGLE_CLIENT_ID: clientId, PROPRIETARIO: proprietario }, null, 2)};
`;
fs.rmSync(fuori, { recursive: true, force: true });
fs.mkdirSync(fuori);
const intestazione = '// PsyDiary · custode. Generato da tools/componi-custode.cjs il ' + new Date().toISOString().slice(0, 10) + '\n\n';
fs.writeFileSync(path.join(fuori, 'Codice.gs'), intestazione + core + '\n' + codice);
fs.writeFileSync(path.join(fuori, 'Configurazione.gs'), config);
fs.copyFileSync(path.join(radice, 'custode/appsscript.json'), path.join(fuori, 'appsscript.json'));
fs.writeFileSync(path.join(fuori, 'custode-completo.gs'), intestazione + config + '\n' + core + '\n' + codice);
console.log('custode-pronto/ scritto' + (clientId ? ' (client ID incluso)' : ' (senza client ID: impostalo come proprietà dello script)'));
