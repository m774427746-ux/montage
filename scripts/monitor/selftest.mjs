// End-to-end self-test of the alert pipeline: real/mock email, fake outage, de-duplication, recovery.
//   node scripts/monitor/selftest.mjs            -> mock Resend (proves logic, sends nothing)
//   RESEND_API_KEY=re_xxx node scripts/monitor/selftest.mjs --real   -> sends REAL emails to ALERT_EMAIL
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL = process.argv.includes('--real');
if (REAL && !process.env.RESEND_API_KEY) { console.error('--real needs RESEND_API_KEY in the environment'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
let down = false;
const sent = [];

const site = http.createServer((req, res) => {
  if (down) { res.writeHead(503); return res.end('down'); }
  if (req.url === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<link href="/assets/a.css"><script src="/assets/a.js"></script>'); }
  if (req.url.startsWith('/assets/')) { res.writeHead(200); return res.end('x'); }
  if (req.url === '/') { res.writeHead(307, { location: '/login' }); return res.end(); }
  if (req.url === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
  res.writeHead(401); res.end('{"ok":false}');
}).listen(0, '127.0.0.1');
const resend = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { sent.push(JSON.parse(b).subject); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"mock"}'); });
}).listen(0, '127.0.0.1');
await new Promise((r) => setTimeout(r, 200));

const state = mkdtempSync(join(tmpdir(), 'asbarix-selftest-'));
const env = { ...process.env, SITE_URL: `http://127.0.0.1:${site.address().port}`, STATE_DIR: state };
if (!REAL) { env.RESEND_API_KEY = 'mock'; env.RESEND_API_URL = `http://127.0.0.1:${resend.address().port}/emails`; }
const run = async () => { try { const r = await exec('node', [join(here, 'health.mjs')], { env }); return { stdout: r.stdout }; } catch (e) { return { stdout: e.stdout || '' }; } };

const results = [];
const step = async (name, isDown, expectMails) => {
  down = isDown; const before = REAL ? 0 : sent.length;
  const r = await run(); const mails = REAL ? (r.stdout.match(/email sent:/g) || []).length : sent.length - before;
  results.push({ name, pass: mails === expectMails, mails, expectMails });
};
await step('1. healthy: no email', false, 0);
await step('2. first failure: no email (needs 2 in a row)', true, 0);
await step('3. second failure: ONE alert email', true, 1);
await step('4. third failure: no duplicate alert', true, 0);
await step('5. still failing: no duplicate alert', true, 0);
await step('6. recovered: ONE recovery email', false, 1);
await step('7. healthy again: no email', false, 0);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (emails: ${r.mails}, expected ${r.expectMails})`);
if (!REAL) console.log('mock emails:', sent);
site.close(); resend.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
