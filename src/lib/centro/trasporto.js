// ContentService consegna il risultato del POST attraverso un URL temporaneo.
// Se quella consegna fallisce, recuperiamo lo stesso risultato con GET:
// non ripetiamo il POST, che potrebbe aver già salvato i dati su Drive.
//
// Se invece Google rimanda il POST a un altro indirizzo dell'app web (succede
// con più account Google nello stesso browser: …/macros/u/1/s/…/exec), il
// browser lo segue come GET e il custode non lo riceve mai: lì si rimanda il
// POST, che non era ancora stato eseguito.
const eAppWeb = (u) => u.protocol === 'https:' && u.hostname === 'script.google.com' && /\/exec$/.test(u.pathname);
export async function inviaAlCustode(url, corpo, { fetchImpl = fetch, pausa = (ms) => new Promise((ok) => setTimeout(ok, ms)) } = {}) {
  const posta = (dove) => fetchImpl(dove, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corpo), redirect: 'follow', cache: 'no-store',
  });
  let r = await posta(url);
  for (let giri = 0; giri < 2; giri++) {
    let altrove = null;
    try { const u = new URL(r.url); if (r.redirected && eAppWeb(u) && u.href !== url) altrove = u.href; } catch { /* niente */ }
    if (!altrove) break;
    url = altrove;
    r = await posta(url);
  }
  let consegna;
  try {
    const u = new URL(r.url);
    if (r.redirected && u.protocol === 'https:' && u.hostname === 'script.googleusercontent.com') consegna = u.href;
  } catch { /* nessun indirizzo di consegna valido */ }
  for (let tentativo = 0; consegna && [404, 429, 500, 502, 503, 504].includes(r.status) && tentativo < 3; tentativo++) {
    await pausa(600 * (tentativo + 1));
    r = await fetchImpl(consegna, { method: 'GET', redirect: 'follow', cache: 'no-store', credentials: 'omit' });
  }
  return r;
}
