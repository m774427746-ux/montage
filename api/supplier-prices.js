import { readFileSync } from 'node:fs';
import { configured } from './_redis.js';
import { isAdmin } from './_session.js';

// Supplier purchase price list (prices exclude VAT). Admin only: purchase costs never reach designers.
const data = JSON.parse(readFileSync(new URL('../src/data/supplier-prices.json', import.meta.url), 'utf8'));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!configured()) return res.status(503).json({ ok: false, error: 'storage_not_configured', message: 'خدمة الدخول غير مُفعّلة بعد.' });
  if (!(await isAdmin(req))) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'سجّل دخول الإدارة أولًا.' });
  return res.status(200).json({ ok: true, ...data });
}
