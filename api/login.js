import { createHash, timingSafeEqual } from "node:crypto";

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// POST {code} — checks the shared team code and sets the session cookie used by middleware.js.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const team = process.env.TEAM_CODE;
  if (!team) return res.status(503).json({ ok: false, error: "team_code_not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const code = String((body && body.code) || "");
  if (!code || !same(code, team)) return res.status(401).json({ ok: false, error: "invalid_code" });

  const token = createHash("sha256").update("team|" + team).digest("hex");
  res.setHeader("Set-Cookie", `asb_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  return res.status(200).json({ ok: true });
}
