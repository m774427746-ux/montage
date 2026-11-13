import { pipeline } from '../api/_redis.js';
import { session, parseBody } from '../api/_session.js';
import { supplierCatalog } from '../api/_suppliers.js';
import { defaultPolicy } from '../api/_pricing.js';
import { productsData } from './managed-products.js';

// Team quote for a ready-goods product (sticker pack, banner, award...). The supplier cost and supplier names never leave the server:
// the response only carries the sale total and the margin the team picked (inside the admin's limits).
export async function readyQuoteHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'الطريقة غير مدعومة.' });
  try {
    const user = await session(req);
    if (!user) return res.status(401).json({ ok: false, message: 'سجّل الدخول أولًا.' });
    const body = parseBody(req);
    const product = (await productsData()).find(x => x.id === body.id);
    if (!product || !product.active || !product.usage) return res.status(400).json({ ok: false, message: 'اختر منتجًا جاهزًا صحيحًا.' });
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1e7) return res.status(422).json({ ok: false, message: 'راجع عدد الاستيكرات أو القطع.' });
    const [policyRaw] = await pipeline([['GET', 'montage:policy']]);
    const policy = { ...defaultPolicy, ...(policyRaw ? JSON.parse(policyRaw) : {}) };
    const packs = Math.ceil(qty / product.packQty);
    const linked = new Map((await supplierCatalog()).offers.map(o => [o.id, o]));
    const costs = (product.supplierOfferIds || []).map(id => linked.get(id)).filter(Boolean).map(o => o.total);

    // Manual price: no cost basis, so the price is fixed and the slider is off.
    if (product.priceMode !== 'supplier' || !costs.length) {
      if (product.price === null) return res.status(422).json({ ok: false, message: 'هذا المنتج بانتظار اعتماد السعر من الإدارة.' });
      return res.status(200).json({ ok: true, name: product.name, packQty: product.packQty, packs, chargedQty: packs * product.packQty, total: Math.round(packs * product.price * 100) / 100, per: Number((product.price / product.packQty).toFixed(6)), fixed: true });
    }

    const cost = Math.min(...costs);
    const fallback = product.marginPct ?? policy.defaultMargin;
    const margin = body.margin === undefined || body.margin === null || body.margin === '' ? fallback : Number(body.margin);
    if (!Number.isFinite(margin) || margin < policy.minMargin || margin > policy.maxMargin)
      return res.status(422).json({ ok: false, message: 'نسبة الربح خارج الحدود التي حددتها الإدارة.' });
    const pack = Math.ceil(cost / (1 - margin / 100) * 100 - 1e-8) / 100;
    const total = Math.round(packs * pack * 100) / 100;
    const profit = Math.round((total - packs * cost) * 100) / 100;
    return res.status(200).json({
      ok: true, name: product.name, packQty: product.packQty, packs, chargedQty: packs * product.packQty,
      total, per: Number((total / qty).toFixed(6)), margin, profit, fixed: false,
      range: { min: policy.minMargin, max: policy.maxMargin, default: fallback }
    });
  } catch {
    return res.status(503).json({ ok: false, message: 'تعذّر حساب السعر. حدّث الصفحة وأعد المحاولة.' });
  }
}
