// Daily security scan. Non-intrusive: one request per URL, no writes, no attack payloads.
// Secret findings report file:line + type only - values are never printed or emailed.
import { execSync } from 'node:child_process';
import { SITE, timed, sendEmail, loadState, saveState } from './lib.mjs';

const high = [], medium = [], info = [];

// 1. npm audit
try {
  let out; try { out = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = e.stdout; }
  const a = JSON.parse(out).vulnerabilities || {};
  for (const [name, v] of Object.entries(a)) {
    const line = `${name} (${v.severity})${v.fixAvailable ? '' : ' - no fix'}`;
    if (['high', 'critical'].includes(v.severity)) high.push('npm audit: ' + line); else medium.push('npm audit: ' + line);
  }
} catch (e) { info.push('npm audit failed: ' + e.message); }

// 2. HTTP security headers on live site
const r = await timed(SITE + '/login');
const hd = (k) => r.headers.get(k);
if (!/max-age=\d{7,}/.test(hd('strict-transport-security') || '')) high.push('HSTS missing/weak');
if ((hd('x-content-type-options') || '').toLowerCase() !== 'nosniff') medium.push('X-Content-Type-Options missing');
if (!hd('content-security-policy')) medium.push('Content-Security-Policy missing');
if (!hd('x-frame-options') && !/frame-ancestors/.test(hd('content-security-policy') || '')) medium.push('Clickjacking protection missing (X-Frame-Options / frame-ancestors)');
if (!hd('referrer-policy')) info.push('Referrer-Policy missing');
if (!hd('permissions-policy')) info.push('Permissions-Policy missing');

// 3. CORS on API: must not reflect arbitrary origins or send wildcard with credentials
for (const p of ['/api/prices', '/api/manage', '/api/suppliers']) {
  const c = await timed(SITE + p, { headers: { Origin: 'https://evil.example' } });
  const acao = c.headers.get('access-control-allow-origin');
  if (acao === 'https://evil.example' || acao === '*') high.push(`CORS: ${p} allows origin ${acao}`);
}

// 4. Authentication: protected endpoints must reject anonymous callers; admin page must redirect
for (const p of ['/api/prices', '/api/manage', '/api/suppliers', '/api/favorites', '/api/stats']) {
  const a = await timed(SITE + p);
  if (a.status !== 401) high.push(`Auth: ${p} returned ${a.status} for anonymous request (expected 401)`);
}
const adm = await timed(SITE + '/admin');
if (adm.status !== 307 && adm.status !== 401) high.push(`Auth: /admin returned ${adm.status} for anonymous request`);
const lg = await timed(SITE + '/api/login');
if (lg.headers.get('set-cookie')) high.push('Auth: /api/login sets a cookie on GET');

// 5. Session cookie flags in source
try {
  const src = execSync('git grep -n -i -E "asb_(session|admin)=" -- api', { encoding: 'utf8' });
  for (const flag of ['HttpOnly', 'Secure', 'SameSite']) if (!new RegExp(flag, 'i').test(src)) medium.push(`Session cookie source lacks ${flag}`);
} catch { info.push('Could not inspect session cookie flags in source'); }

// 6. Secret leak scan over tracked files (type + location only)
const patterns = { 'AWS key': 'AKIA[0-9A-Z]{16}', 'Private key': '-----BEGIN [A-Z ]*PRIVATE KEY-----', 'GitHub token': 'gh[pousr]_[A-Za-z0-9]{36,}', 'Resend key': 're_[A-Za-z0-9]{20,}', 'Upstash/Redis URL with password': 'rediss?://[^\\s:@]+:[^\\s@]{8,}@', 'Slack token': 'xox[baprs]-[A-Za-z0-9-]{10,}', 'Generic secret assignment': '(api[_-]?key|secret|token|password)["\']?\\s*[:=]\\s*["\'][A-Za-z0-9_\\-]{24,}["\']' };
for (const [type, re] of Object.entries(patterns)) {
  try {
    const out = execSync(`git grep -n -I -l -E '${re.replace(/'/g, "'\\''")}' -- . ':!package-lock.json' ':!tests' ':!scripts/monitor'`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const f of out.trim().split('\n').filter(Boolean)) high.push(`Possible secret (${type}) in ${f}`);
  } catch { /* no match */ }
}

// 7. Sensitive files must not be served
for (const p of ['/.env', '/.git/config', '/package.json', '/api/_redis.js']) {
  const s = await timed(SITE + p);
  if (s.status === 200 && !/<html/i.test(s.body.slice(0, 200))) high.push(`Exposed file: ${p} returned 200`);
}

// Report: email on any high finding, or on new medium findings
const st = loadState('security', { seen: [] });
const fresh = medium.filter((m) => !st.seen.includes(m));
st.seen = [...new Set([...st.seen, ...medium])].slice(-200);
saveState('security', st);
console.log(JSON.stringify({ high, medium, info }, null, 1));
if (high.length || fresh.length) {
  await sendEmail(high.length ? '🔐 ASBARIX: ثغرات/مخاطر أمنية عالية' : '🔐 ASBARIX: ملاحظات أمنية جديدة',
    [...high.map((x) => '[عالي] ' + x), ...fresh.map((x) => '[متوسط] ' + x)], { level: high.length ? 'critical' : 'warn' });
}
if (high.length) process.exitCode = process.exitCode || 1;
