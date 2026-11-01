import { createHash, timingSafeEqual } from "node:crypto";

export const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export const tokenFor = (role, secret) => createHash("sha256").update(role + "|" + secret).digest("hex");

export const readCookie = (req, name) => {
  const header = req.headers.cookie || "";
  const hit = header.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : "";
};

// True when the request carries a valid admin session cookie issued by /api/admin-login.
export const isAdmin = (req) => {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const token = readCookie(req, "asb_admin");
  return Boolean(token) && same(token, tokenFor("admin", key));
};

export const parseBody = (req) => {
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  return body || {};
};

// True when the request carries the team session cookie issued by /api/login.
export const isTeam = (req) => {
  const team = process.env.TEAM_CODE;
  if (!team) return false;
  const token = readCookie(req, "asb_session");
  return Boolean(token) && same(token, tokenFor("team", team));
};
