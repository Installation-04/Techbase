// What the admin panel knows about the installation: the installed version, how it was
// installed, and the newest published release (read from GitHub, cached, never fatal).
const { version } = require('../../package.json');

const RELEASES_URL = 'https://api.github.com/repos/Installation-04/Techbase/releases?per_page=10';
const CACHE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

let cache = null; // { at, value }

// "all-in-one" | "four-containers" | "netlify" | "source". Compose files set DEPLOY_MODE;
// TECHIBASE_VERSION is only passed in for installs from the published images.
function detectInstall(env = process.env) {
  let mode = 'source';
  if (env.NETLIFY) mode = 'netlify';
  else if (env.DEPLOY_MODE === 'single') mode = 'all-in-one';
  else if (env.DEPLOY_MODE === 'multi') mode = 'four-containers';
  const fromRelease = mode !== 'netlify' && !!env.TECHIBASE_VERSION && env.TECHIBASE_VERSION !== 'dev';
  return { mode, fromRelease, pinned: fromRelease ? env.TECHIBASE_VERSION : null };
}

// 1 / 0 / -1 for MAJOR.MINOR.PATCH (a pre-release suffix sorts before the plain version).
function compareVersions(a, b) {
  const parse = v => {
    const [core, pre] = String(v).replace(/^v/, '').split('-');
    return { nums: core.split('.').map(n => parseInt(n, 10) || 0), pre: pre || null };
  };
  const x = parse(a); const y = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((x.nums[i] || 0) !== (y.nums[i] || 0)) return (x.nums[i] || 0) > (y.nums[i] || 0) ? 1 : -1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre > y.pre ? 1 : -1;
}

// The newest *published* release (drafts are ignored; pre-releases count, since every 0.0.x is one).
function pickLatest(releases) {
  const usable = (Array.isArray(releases) ? releases : [])
    .filter(r => r && !r.draft && /^v\d+\.\d+\.\d+/.test(r.tag_name || ''))
    .map(r => ({
      version: r.tag_name.replace(/^v/, ''),
      notes: typeof r.body === 'string' ? r.body : '',
      url: typeof r.html_url === 'string' && r.html_url.startsWith('https://github.com/') ? r.html_url : null,
      publishedAt: r.published_at || null,
      prerelease: !!r.prerelease,
    }));
  usable.sort((p, q) => compareVersions(q.version, p.version));
  return usable[0] || null;
}

async function fetchLatest({ fetchImpl = fetch, now = Date.now(), env = process.env } = {}) {
  if (env.UPDATE_CHECK === 'false') return { latest: null, checked: false, reason: 'disabled' };
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  let value;
  try {
    const res = await fetchImpl(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'TechIBase-update-check' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    value = { latest: pickLatest(await res.json()), checked: true, reason: null };
  } catch (err) {
    // Offline or rate limited: not an error for the admin, just "unknown". Not cached for long.
    return { latest: null, checked: false, reason: 'unreachable' };
  }
  cache = { at: now, value };
  return value;
}

function resetCache() { cache = null; }

async function systemInfo(opts = {}) {
  const install = detectInstall(opts.env);
  const { latest, checked, reason } = await fetchLatest(opts);
  const updateAvailable = !!latest && compareVersions(latest.version, version) > 0;
  return {
    version,
    ...install,
    latest,
    checked,
    reason,
    updateAvailable,
    updaterAvailable: install.fromRelease && require('./updaterClient').config(opts.env).enabled,
  };
}

module.exports = { systemInfo, detectInstall, compareVersions, pickLatest, fetchLatest, resetCache };
