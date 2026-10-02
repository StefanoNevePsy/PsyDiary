import assert from 'node:assert/strict';
import { inviaAlCustode } from '../src/lib/centro/trasporto.js';

const endpoint = 'https://script.google.com/macros/s/test/exec';
const consegna = 'https://script.googleusercontent.com/macros/echo?user_content_key=test';
const risposta = (status, url = consegna, redirected = true) => ({ status, url, redirected, ok: status === 200 });
async function prova(sequenza) {
  const chiamate = [];
  const result = await inviaAlCustode(endpoint, { azione: 'cifratura.imposta', dati: {} }, {
    pausa: async () => {},
    fetchImpl: async (url, opzioni) => { chiamate.push({ url, opzioni }); return sequenza.shift(); },
  });
  return { result, chiamate };
}
let p = await prova([risposta(404), risposta(200)]);
assert.equal(p.result.status, 200);
assert.deepEqual(p.chiamate.map((c) => c.opzioni.method), ['POST', 'GET']);
assert.equal(p.chiamate[1].url, consegna);
assert.equal(p.chiamate[1].opzioni.body, undefined);
assert.equal(p.chiamate[1].opzioni.credentials, 'omit');
p = await prova([risposta(404), risposta(404), risposta(404), risposta(404)]);
assert.equal(p.chiamate.length, 4);
assert.equal(p.chiamate.filter((c) => c.opzioni.method === 'POST').length, 1);
for (const r of [risposta(200), risposta(404, endpoint, false), risposta(403), risposta(404, 'https://example.com/result')]) {
  p = await prova([r]); assert.equal(p.chiamate.length, 1);
}
// più account Google: il POST rimandato a /macros/u/1/… diventa un GET (doGet): si rimanda il POST lì
const altroAccount = 'https://script.google.com/macros/u/1/s/test/exec';
p = await prova([risposta(200, altroAccount, true), risposta(200)]);
assert.deepEqual(p.chiamate.map((c) => [c.opzioni.method, c.url]), [['POST', endpoint], ['POST', altroAccount]]);
assert.ok(p.chiamate[1].opzioni.body, 'il secondo POST porta la richiesta');
p = await prova([risposta(200, altroAccount, true), risposta(200, altroAccount, true)]);
assert.equal(p.chiamate.length, 2, 'stesso indirizzo: non si gira all\'infinito');
console.log('ok: recupero della consegna Google, tentativi limitati, nessun salvataggio ripetuto');
