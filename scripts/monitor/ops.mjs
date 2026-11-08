// Every 6 h: deployments/CI health, 5xx probes, performance vs. rolling baseline.
// Vercel API data needs VERCEL_TOKEN (optional); GitHub Actions data works with the default token.
import { SITE, timed, gh, loadState, saveState, sendEmail } from './lib.mjs';

const problems = [], notes = [];
const TEAM = process.env.VERCEL_TEAM_ID || 'team_kyPwDgWRihLuOS832zLBPYx2';
const PROJECT = process.env.VERCEL_PROJECT_ID || 'prj_aQ3HvWLwyYQoHdALE92QrXNOXk49';

// 1. Vercel production deployments
if (process.env.VERCEL_TOKEN) {
  const r = await fetch(`https://api.vercel.com/v6/deployments?projectId=${PROJECT}&teamId=${TEAM}&target=production&limit=5`, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) problems.push(`Vercel API returned ${r.status} (check VERCEL_TOKEN)`);
  else {
    const { deployments = [] } = await r.json();
    const latest = deployments[0];
    if (!latest) problems.push('No production deployment found');
    else {
      notes.push(`آخر نشر production: ${latest.state} (${latest.meta?.githubCommitRef || '-'} / ${String(latest.meta?.githubCommitSha || '').slice(0, 7)})`);
      if (latest.state === 'ERROR' || latest.state === 'CANCELED') problems.push(`آخر نشر production فشل: ${latest.state} - ${latest.meta?.githubCommitMessage || ''}`);
    }
  }
} else notes.push('VERCEL_TOKEN غير مضبوط: تم تخطي فحص نشرات Vercel وأخطاء runtime');

// 2. GitHub Actions recent runs
try {
  const { workflow_runs = [] } = await gh('/actions/runs?per_page=15&status=completed');
  const bad = workflow_runs.filter((x) => ['failure', 'timed_out'].includes(x.conclusion) && Date.now() - Date.parse(x.created_at) < 36e5 * 12 && !/Monitor/i.test(x.name));
  for (const x of bad) problems.push(`GitHub Actions فشل: ${x.name} على ${x.head_branch} (${x.html_url})`);
} catch (e) { notes.push(`تعذر قراءة GitHub Actions: ${e.message}`); }

// 3. 5xx probes on public routes (read-only GETs)
for (const p of ['/login', '/api/suppliers', '/api/prices', '/api/manage', '/api/health']) {
  const r = await timed(SITE + p);
  if (r.status >= 500 || !r.ok) problems.push(`${p} -> ${r.status || r.error}`);
}

// 4. Performance vs. baseline (median of last 28 samples = 7 days)
const st = loadState('ops', { login: [], health: [] });
const samples = { login: (await timed(SITE + '/login')).ms, health: (await timed(SITE + '/api/health')).ms };
for (const [k, v] of Object.entries(samples)) {
  const hist = st[k] || [];
  if (hist.length >= 8) {
    const med = [...hist].sort((a, b) => a - b)[Math.floor(hist.length / 2)];
    if (v > Math.max(med * 3, med + 1500)) problems.push(`أداء ${k}: ${v}ms مقابل المعتاد ~${med}ms`);
  }
  st[k] = [...hist, v].slice(-28);
}
saveState('ops', st);

console.log(JSON.stringify({ problems, notes, samples }, null, 1));
if (problems.length) { await sendEmail('⚠️ ASBARIX: فحص تشغيلي - مشاكل', [...problems, ...notes], { level: 'warn' }); process.exitCode = process.exitCode || 1; }
