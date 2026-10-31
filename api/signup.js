import { configured, pipeline, readBody } from "./_redis.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST {email} — registers a user on first entry and records every later visit.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const email = String(readBody(req).email || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return res.status(400).json({ ok: false, error: "invalid_email" });
  if (!configured()) return res.status(503).json({ ok: false, error: "storage_not_configured" });

  const now = new Date().toISOString();
  try {
    const [added] = await pipeline([
      ["SADD", "montage:users", email],
      ["HSETNX", "montage:first", email, now],
      ["HSET", "montage:last", email, now],
      ["HINCRBY", "montage:visits", email, 1],
    ]);
    return res.status(200).json({ ok: true, isNew: added === 1 });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "storage_error" });
  }
}
