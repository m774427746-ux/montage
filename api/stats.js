import { configured, pipeline } from "./_redis.js";
import { timingSafeEqual } from "node:crypto";
import { isAdmin } from "./_session.js";

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const toObj = (arr) => { const o = {}; for (let i = 0; arr && i < arr.length; i += 2) o[arr[i]] = arr[i + 1]; return o; };

// GET with admin session cookie or header x-admin-key — users list and counts for the owner only.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const admin = process.env.ADMIN_KEY;
  const key = req.headers["x-admin-key"] || "";
  if (!admin) return res.status(503).json({ ok: false, error: "admin_key_not_configured" });
  if (!isAdmin(req) && (!key || !same(key, admin))) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!configured()) return res.status(503).json({ ok: false, error: "storage_not_configured" });

  try {
    const [members, first, last, visits] = await pipeline([
      ["SMEMBERS", "montage:users"],
      ["HGETALL", "montage:first"],
      ["HGETALL", "montage:last"],
      ["HGETALL", "montage:visits"],
    ]);
    const f = toObj(first), l = toObj(last), v = toObj(visits);
    const users = (members || []).map((email) => ({
      email, first: f[email] || null, last: l[email] || null, visits: Number(v[email] || 0),
    })).sort((a, b) => String(b.first).localeCompare(String(a.first)));
    const now = Date.now(), day = 864e5;
    const since = (iso, ms) => iso && now - Date.parse(iso) <= ms;
    return res.status(200).json({
      ok: true,
      total: users.length,
      newToday: users.filter((u) => since(u.first, day)).length,
      new7d: users.filter((u) => since(u.first, 7 * day)).length,
      active7d: users.filter((u) => since(u.last, 7 * day)).length,
      visits: users.reduce((s, u) => s + u.visits, 0),
      users,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "storage_error" });
  }
}
