// Weekly: regression tests + build + audit, then an email summary (always sent).
import { execSync, spawnSync } from 'node:child_process';
import { SITE, timed, sendEmail, gh } from './lib.mjs';

const lines = [];
const run = (label, cmd) => {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  const ok = r.status === 0;
  lines.push(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) lines.push('   ' + (r.stdout + r.stderr).trim().split('\n').slice(-6).join(' | ').slice(0, 600));
  return { ok, out: r.stdout };
};

const tests = run('اختبارات Regression (UBC / الباركود / المنتجات / الأوفست)', 'npm test');
const build = run('بناء الواجهة', 'npm run build');
for (const l of (tests.out || '').split('\n').filter((x) => /passed/.test(x))) lines.push('   · ' + l.trim());

try {
  let out; try { out = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = e.stdout; }
  const m = JSON.parse(out).metadata.vulnerabilities;
  lines.push(`🔐 npm audit: critical ${m.critical}, high ${m.high}, moderate ${m.moderate}, low ${m.low}`);
} catch { lines.push('⚠️ تعذر تشغيل npm audit'); }

const h = await timed(SITE + '/api/health');
lines.push(`🌐 /login: ${(await timed(SITE + '/login')).status} · Redis: ${h.status === 200 ? 'up' : 'status ' + h.status}`);
try {
  const { workflow_runs = [] } = await gh('/actions/runs?per_page=50&status=completed');
  const week = workflow_runs.filter((x) => Date.now() - Date.parse(x.created_at) < 7 * 864e5);
  lines.push(`⚙️ GitHub Actions هذا الأسبوع: ${week.filter((x) => x.conclusion === 'success').length} نجاح / ${week.filter((x) => x.conclusion === 'failure').length} فشل`);
} catch { /* optional */ }

lines.push('📌 مراجعة يدوية أسبوعية مقترحة: تدقيق منطق UBC (منع تكرار الباركود، الربط/فك الربط) على بيانات حقيقية، ومراجعة أخطاء الأداء في Vercel Observability.');
const ok = tests.ok && build.ok;
await sendEmail(`${ok ? '📊' : '⚠️'} ASBARIX: الملخص الأسبوعي`, lines, { level: ok ? 'info' : 'warn' });
if (!ok) process.exitCode = process.exitCode || 1;
