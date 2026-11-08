// Every 15 min: availability, SSL/HTTPS, assets, safe read-only API probes.
// Alert after 2 consecutive failures; send a recovery email when healthy again.
import tls from 'node:tls';
import { SITE, timed, loadState, saveState, sendEmail } from './lib.mjs';

const failures = [], warnings = [], metrics = {};
const check = (name, cond, detail) => { if (!cond) failures.push(`${name}: ${detail}`); };

// 1. http -> https redirect
const http = await timed(SITE.replace('https://', 'http://') + '/login');
check('HTTP->HTTPS', http.ok && [301, 307, 308].includes(http.status) && /^https:/.test(http.headers.get('location') || ''), `status ${http.status} ${http.error || ''}`);

// 2. login page and every asset it references
const login = await timed(SITE + '/login');
metrics.login_ms = login.ms;
check('/login', login.status === 200, `status ${login.status} ${login.error || ''}`);
const assets = [...new Set([...login.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
check('/login assets', assets.length > 0, 'no /assets references found');
for (const a of assets) {
  const r = await timed(SITE + a);
  check(a, r.status === 200 && r.body.length > 0, `status ${r.status}`);
}

// 3. root must gate (redirect to /login) rather than error
const root = await timed(SITE + '/');
metrics.root_ms = root.ms;
check('/ (root)', [200, 307].includes(root.status), `status ${root.status} ${root.error || ''}`);

// 4. Redis ping (read-only) and auth gates must answer 401, never 5xx
const h = await timed(SITE + '/api/health');
metrics.health_ms = h.ms;
if (h.status === 404) warnings.push('/api/health not deployed yet (merge the monitoring branch)');
else check('Redis /api/health', h.status === 200, `status ${h.status} ${h.body.slice(0, 80)}`);
for (const p of ['/api/suppliers', '/api/prices', '/api/manage', '/api/favorites']) {
  const r = await timed(SITE + p);
  check(`${p} auth gate`, r.status === 401, `expected 401, got ${r.status} ${r.error || ''}`);
}

// 5. TLS certificate expiry
const host = new URL(SITE).hostname;
const days = await new Promise((res) => {
  const s = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
    const c = s.getPeerCertificate(); s.end();
    res(c.valid_to ? Math.floor((Date.parse(c.valid_to) - Date.now()) / 864e5) : null);
  });
  s.on('error', () => res(null));
  s.on('timeout', () => { s.destroy(); res(null); });
});
metrics.cert_days = days;
if (days === null) failures.push('SSL: could not read certificate');
else if (days < 7) failures.push(`SSL: certificate expires in ${days} days`);
if (login.ms > 5000) warnings.push(`/login slow: ${login.ms}ms`);

// State machine
const st = loadState('health', { consecutive: 0, alerted: false });
const bad = failures.length > 0;
console.log(JSON.stringify({ bad, failures, warnings, metrics }, null, 1));
if (bad) {
  st.consecutive += 1;
  if (st.consecutive >= 2 && !st.alerted) {
    if (await sendEmail('🚨 ASBARIX: الموقع فيه مشكلة', [...failures, `عدد الفحوصات الفاشلة المتتالية: ${st.consecutive}`], { level: 'critical' })) st.alerted = true;
  }
} else {
  if (st.alerted) await sendEmail('✅ ASBARIX: الموقع رجع يشتغل', ['كل الفحوصات نجحت', ...Object.entries(metrics).map(([k, v]) => `${k}: ${v}`)], { level: 'ok' });
  st.consecutive = 0; st.alerted = false;
}
saveState('health', st);
if (bad && st.consecutive >= 2) process.exitCode = process.exitCode || 1;
