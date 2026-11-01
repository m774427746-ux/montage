import { configured, pipeline } from './_redis.js';
import { isTeam, isAdmin, parseBody } from './_session.js';

const KEY = 'montage:favorites';
const TABS = ['sheets', 'stickers', 'acrylic'];
const PREFIXES = { sheets: 'sh-', stickers: 'st-', acrylic: 'ac-' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isTeam(req) && !isAdmin(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ ok: false });
  if (!configured()) return res.status(503).json({ ok: false, message: 'المفضلة المشتركة غير متاحة؛ تحقق من اتصال الحفظ.' });
  try {
    if (req.method === 'GET') {
      const [values] = await pipeline([['HVALS', KEY]]);
      return res.status(200).json({ ok: true, items: (values || []).map(v => JSON.parse(v)) });
    }
    const body = parseBody(req);
    if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(body.id)) return res.status(400).json({ ok: false });
    if (req.method === 'DELETE') {
      await pipeline([['HDEL', KEY, body.id]]);
      return res.status(200).json({ ok: true });
    }
    if (!TABS.includes(body.tab) || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60 ||
      !body.fields || Array.isArray(body.fields) || typeof body.fields !== 'object' || Object.keys(body.fields).length > 40) {
      return res.status(400).json({ ok: false, error: 'invalid_favorite' });
    }
    const fields = {};
    for (const [id, value] of Object.entries(body.fields)) {
      if (!(id.startsWith(PREFIXES[body.tab]) || (body.tab === 'acrylic' && ['sale-material','sale-client','sale-rate'].includes(id))) ||
        !['string', 'boolean'].includes(typeof value) || String(value).length > 100) return res.status(400).json({ ok: false });
      fields[id] = value;
    }
    const item = { id: body.id, tab: body.tab, name: body.name.trim(), fields };
    // Atomically bound the shared collection; updating an existing entry remains possible at the limit.
    const script = "if redis.call('HEXISTS',KEYS[1],ARGV[1]) == 0 and redis.call('HLEN',KEYS[1]) >= 100 then return 0 end redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]) return 1";
    const [saved] = await pipeline([['EVAL', script, 1, KEY, item.id, JSON.stringify(item)]]);
    if (!saved) return res.status(409).json({ ok: false, message: 'المفضلة ممتلئة (100 مقاس). احذف مقاسًا قديمًا أولًا.' });
    return res.status(200).json({ ok: true, item });
  } catch {
    return res.status(502).json({ ok: false, message: 'تعذّر الاتصال بالحفظ. حاول مرة أخرى.' });
  }
}
