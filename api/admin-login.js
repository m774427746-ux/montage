import { same, tokenFor, parseBody } from "./_session.js";

// POST {password} — sets an HttpOnly admin session cookie (8 hours). The key never reaches the browser.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  const key = process.env.ADMIN_KEY;
  if (!key) return res.status(503).json({ ok: false, error: "admin_not_configured", message: "الإدارة غير مُفعَّلة بعد." });
  const password = String(parseBody(req).password || "");
  if (!password || !same(password, key)) return res.status(401).json({ ok: false, error: "invalid_password", message: "كلمة المرور غير صحيحة." });
  res.setHeader("Set-Cookie", `asb_admin=${tokenFor("admin", key)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
  return res.status(200).json({ ok: true });
}
