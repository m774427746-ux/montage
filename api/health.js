import { configured, pipeline } from './_redis.js';
// Read-only liveness probe for the monitor: PING only, no data returned.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ ok: false });
  if (!configured()) return res.status(503).json({ ok: false, redis: 'not_configured' });
  try {
    const t = Date.now();
    const [pong] = await pipeline([['PING']]);
    return res.status(pong === 'PONG' ? 200 : 502).json({ ok: pong === 'PONG', redis: pong === 'PONG' ? 'up' : 'bad_reply', ms: Date.now() - t });
  } catch { return res.status(502).json({ ok: false, redis: 'down' }); }
}
