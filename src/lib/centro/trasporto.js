// ContentService consegna il risultato del POST attraverso un URL temporaneo.
// Se quella consegna fallisce, recuperiamo lo stesso risultato con GET:
// non ripetiamo il POST, che potrebbe aver già salvato i dati su Drive.
export async function inviaAlCustode(url, corpo, { fetchImpl = fetch, pausa = (ms) => new Promise((ok) => setTimeout(ok, ms)) } = {}) {
  let r = await fetchImpl(url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corpo), redirect: 'follow', cache: 'no-store',
  });
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
