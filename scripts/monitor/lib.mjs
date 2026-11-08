// Shared helpers for ASBARIX monitoring. Node >=18, no dependencies.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
export const SITE = (process.env.SITE_URL || 'https://asbarix.vercel.app').replace(/\/$/, '');
export const TO = process.env.ALERT_EMAIL || 'adv.asbar@gmail.com';
export const FROM = process.env.MONITOR_FROM || 'ASBARIX Monitor <onboarding@resend.dev>';
export const RESEND_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';
export const REPO = process.env.GITHUB_REPOSITORY || 'musdes21/asbarix';
export const STATE_DIR = process.env.STATE_DIR || '.monitor-state';
export const riyadh = (d = new Date()) => d.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', hour12: false });

export async function timed(url, opts = {}, timeoutMs = 15000) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: 'manual', ...opts, signal: AbortSignal.timeout(timeoutMs) });
    const body = opts.method === 'HEAD' ? '' : await r.text();
    return { ok: true, status: r.status, ms: Date.now() - t, headers: r.headers, body, url };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t, error: String(e.cause?.code || e.name || e.message), headers: new Headers(), body: '', url };
  }
}

export function loadState(name, fallback = {}) {
  try { return JSON.parse(readFileSync(`${STATE_DIR}/${name}.json`, 'utf8')); } catch { return fallback; }
}
export function saveState(name, data) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(`${STATE_DIR}/${name}.json`, JSON.stringify(data, null, 1));
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export async function sendEmail(subject, lines, { level = 'info' } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('RESEND_API_KEY missing - cannot send email'); process.exitCode = 2; return false; }
  const color = { critical: '#b42318', warn: '#b54708', ok: '#067647', info: '#175cd3' }[level] || '#175cd3';
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:640px;margin:auto"><div style="background:${color};color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-size:18px">${esc(subject)}</div><div style="border:1px solid #ddd;border-top:0;padding:16px;border-radius:0 0 8px 8px"><ul style="line-height:1.9;padding-inline-start:20px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p style="color:#667085;font-size:12px">${esc(riyadh())} (Asia/Riyadh) · ${esc(SITE)}</p></div></div>`;
  const r = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html, text: lines.join('\n') }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) { console.error('Resend error', r.status, (await r.text()).slice(0, 300)); process.exitCode = 2; return false; }
  console.log('email sent:', subject);
  return true;
}

export async function gh(path) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'asbarix-monitor' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers: h, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`github_${r.status}`);
  return r.json();
}
