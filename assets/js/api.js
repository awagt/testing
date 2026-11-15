/* api.js — single gateway to the Apps Script backend.
 * Uses POST + text/plain (a CORS "simple request": no preflight, which Apps Script can't answer).
 * Write calls carry an idempotency key so retries and double-taps never create duplicates. */
const API = (() => {
  const url = () => (window.IDH_CONFIG && window.IDH_CONFIG.API_URL) || '';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'k' + Date.now() + Math.random().toString(16).slice(2));
  let token = null;
  const inflight = new Map(); // de-duplicates identical concurrent reads

  async function call(action, payload = {}, opts = {}) {
    if (!/^https:\/\/|^http:\/\/localhost/.test(url())) throw Object.assign(new Error('API URL is not configured. Edit assets/js/config.js.'), { code: 'CONFIG' });
    const body = { action, payload, token };
    if (opts.write) body.idemKey = opts.idemKey || uuid();
    const key = opts.write ? null : action + JSON.stringify(payload);
    if (key && inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeout || 45000);
      let res;
      try {
        res = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: ctrl.signal });
      } catch (e) {
        throw Object.assign(new Error(e.name === 'AbortError' ? 'The server took too long to respond. Please try again.' : 'Cannot reach the server. Check your connection.'), { code: 'NETWORK' });
      } finally { clearTimeout(timer); }
      let json;
      try { json = await res.json(); } catch (e) { throw Object.assign(new Error('Unexpected server response (HTTP ' + res.status + '). Check the deployment access is set to "Anyone".'), { code: 'BAD_RESPONSE' }); }
      if (!json.ok) {
        const err = Object.assign(new Error(json.error || 'Request failed'), { code: json.code });
        if (json.code === 'AUTH' && action !== 'login' && window.Auth) Auth.expired();
        throw err;
      }
      return json.data;
    })();
    if (key) { inflight.set(key, p); p.finally(() => inflight.delete(key)).catch(() => {}); }
    return p;
  }
  return { call, setToken: t => (token = t), getToken: () => token, uuid, url };
})();
