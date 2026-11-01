import { configured, pipeline } from "./_redis.js";
import { isAdmin, isTeam, parseBody } from "./_session.js";

const KEY = "montage:prices";
const num = (v) => (v === null || v === "" ? null : Number(v));
const valid = (v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1e6);

// GET — team reads prices. Returns prices:null when nothing was saved yet (site falls back to reference values).
// PUT — admin only. Body: {prices:[{id, retail, individual}]}; null means "غير محدد".
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!configured()) return res.status(503).json({ ok: false, error: "storage_not_configured", message: "الحفظ المشترك غير مُفعَّل بعد. التعديلات لن تُحفظ." });

  if (req.method === "GET") {
    if (!(await isTeam(req)) && !(await isAdmin(req))) return res.status(401).json({ ok: false, error: "unauthorized" });
    try {
      const [raw] = await pipeline([["GET", KEY]]);
      const data=raw?JSON.parse(raw):null;
      if(data && !(await isAdmin(req))) data.items=data.items.map(({cost,...item})=>item);
      return res.status(200).json({ok:true,prices:data});
    } catch {
      return res.status(502).json({ ok: false, error: "storage_error", message: "تعذّر قراءة الأسعار المحفوظة." });
    }
  }

  if (req.method === "PUT") {
    if (!(await isAdmin(req))) return res.status(401).json({ ok: false, error: "unauthorized", message: "سجّل دخول الإدارة أولًا." });
    const list = parseBody(req).prices;
    if (!Array.isArray(list) || list.length > 500) return res.status(400).json({ ok: false, error: "invalid_prices" });
    const clean = [];
    for (const item of list) {
      const id = String(item && item.id || "");
      const retail = num(item && item.retail), individual = num(item && item.individual), cost = num(item?.cost ?? null);
      if (!id || id.length > 20 || !valid(retail) || !valid(individual) || !valid(cost) || typeof item.designerCanEdit !== "boolean") return res.status(400).json({ ok: false, error: "invalid_prices", id });
      clean.push({ id, retail, individual, cost, designerCanEdit: item.designerCanEdit });
    }
    try {
      const stamp = new Date().toISOString();
      await pipeline([["SET", KEY, JSON.stringify({ updatedAt: stamp, items: clean })]]);
      return res.status(200).json({ ok: true, updatedAt: stamp });
    } catch {
      return res.status(502).json({ ok: false, error: "storage_error", message: "تعذّر حفظ الأسعار. حاول مرة أخرى." });
    }
  }

  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
