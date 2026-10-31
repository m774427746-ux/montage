// Minimal Upstash Redis REST client (works with Vercel's Upstash/KV integration env vars).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const configured = () => Boolean(URL_ && TOKEN);

export async function pipeline(commands) {
  const r = await fetch(URL_.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis_http_${r.status}`);
  const out = await r.json();
  for (const item of out) if (item.error) throw new Error(item.error);
  return out.map((item) => item.result);
}

export function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}
