// POST — clears the admin session cookie.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  res.setHeader("Set-Cookie", "asb_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
  return res.status(200).json({ ok: true });
}
