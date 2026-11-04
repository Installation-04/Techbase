// Talks to the updater service (the only thing in the stack that holds the Docker
// socket). The app never touches Docker itself: it asks, with a shared secret, for
// one of three fixed actions.
function config(env = process.env) {
  const token = env.UPDATER_TOKEN || '';
  return {
    enabled: token.length >= 32,
    token,
    url: (env.UPDATER_URL || 'http://updater:8090').replace(/\/$/, ''),
  };
}

async function call(path, { method = 'GET', body, env, fetchImpl = fetch } = {}) {
  const cfg = config(env);
  if (!cfg.enabled) { const e = new Error('Le service de mise à jour n\'est pas activé.'); e.status = 404; throw e; }
  let res;
  try {
    res = await fetchImpl(cfg.url + path, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const e = new Error('Le service de mise à jour ne répond pas.'); e.status = 503; throw e;
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) { const e = new Error(data.error || `Le service de mise à jour a répondu ${res.status}.`); e.status = res.status === 401 ? 502 : res.status; throw e; }
  return data;
}

module.exports = {
  config,
  status: opts => call('/status', opts),
  update: (version, opts) => call('/update', { ...opts, method: 'POST', body: { version } }),
  rollback: opts => call('/rollback', { ...opts, method: 'POST' }),
};
