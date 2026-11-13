import { pipeline } from '../api/_redis.js';
import { session, parseBody, isAdmin } from '../api/_session.js';
import { supplierCatalog } from '../api/_suppliers.js';
import { defaultPolicy } from '../api/_pricing.js';
import { productsData } from './managed-products.js';

const EXTRAS = 'montage:banner-extras';
const num = (v) => (v === null || v === '' || v === undefined ? null : Number(v));
const valid = (v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1e6);

// Admin-set prices for the banner options: iron frame per banner, installation per square metre.
export async function bannerExtras() {
  const [raw] = await pipeline([['GET', EXTRAS]]);
  const data = raw ? JSON.parse(raw) : {};
  return { ironPerBanner: data.ironPerBanner ?? null, installPerM2: data.installPerM2 ?? null };
}

export async function bannerExtrasHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!(await session(req))) return res.status(401).json({ ok: false, message: 'سجّل الدخول أولًا.' });
      return res.status(200).json({ ok: true, ...(await bannerExtras()) });
    }
    if (req.method !== 'PUT') return res.status(405).json({ ok: false, message: 'الطريقة غير مدعومة.' });
    if (!(await isAdmin(req))) return res.status(401).json({ ok: false, message: 'سجّل دخول الإدارة أولًا.' });
    const body = parseBody(req);
    const clean = { ironPerBanner: num(body.ironPerBanner), installPerM2: num(body.installPerM2) };
    if (!valid(clean.ironPerBanner) || !valid(clean.installPerM2)) return res.status(400).json({ ok: false, message: 'راجع أسعار الحديد والتركيب.' });
    await pipeline([['SET', EXTRAS, JSON.stringify(clean)]]);
    return res.status(200).json({ ok: true, ...clean });
  } catch {
    return res.status(503).json({ ok: false, message: 'تعذّر الحفظ. حاول مرة أخرى.' });
  }
}

// Banner quote: size in cm, option none / iron / install. Material = ready banner product priced per m² (packQty = m² per pack).
export async function bannerQuoteHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'الطريقة غير مدعومة.' });
  try {
    const user = await session(req);
    if (!user) return res.status(401).json({ ok: false, message: 'سجّل الدخول أولًا.' });
    const body = parseBody(req);
    const w = Number(body.w), h = Number(body.h);
    if (!(w > 0 && w <= 1000 && h > 0 && h <= 1000)) return res.status(422).json({ ok: false, message: 'راجع العرض والطول بالسنتيمتر (حتى 1000 سم).' });
    const option = ['none', 'iron', 'install'].includes(body.option) ? body.option : 'none';
    const product = (await productsData()).find(x => x.id === body.id);
    if (!product || !product.active || product.usage !== 'banners') return res.status(400).json({ ok: false, message: 'اختر خامة بنر جاهزة صحيحة.' });

    const areaM2 = Math.max(1, Math.ceil(w * h / 10000)); // sold in whole square metres
    const packs = Math.ceil(areaM2 / product.packQty);
    const [policyRaw] = await pipeline([['GET', 'montage:policy']]);
    const policy = { ...defaultPolicy, ...(policyRaw ? JSON.parse(policyRaw) : {}) };
    const extras = await bannerExtras();
    if (option === 'iron' && extras.ironPerBanner === null) return res.status(422).json({ ok: false, message: 'سعر الحديد غير معتمد بعد. اطلب من الإدارة اعتماده.' });
    if (option === 'install' && extras.installPerM2 === null) return res.status(422).json({ ok: false, message: 'سعر التركيب غير معتمد بعد. اطلب من الإدارة اعتماده.' });
    const extraCost = (option === 'iron' ? extras.ironPerBanner : 0) + (option === 'install' ? extras.installPerM2 * areaM2 : 0);

    const linked = new Map((await supplierCatalog()).offers.map(o => [o.id, o]));
    const costs = (product.supplierOfferIds || []).map(id => linked.get(id)).filter(Boolean).map(o => o.total);

    // Manual product price: fixed sale price, no margin slider.
    if (product.priceMode !== 'supplier' || !costs.length) {
      if (product.price === null) return res.status(422).json({ ok: false, message: 'هذه الخامة بانتظار اعتماد السعر من الإدارة.' });
      const total = Math.round((packs * product.price + extraCost) * 100) / 100;
      return res.status(200).json({ ok: true, areaM2, total, perM2: Number((total / areaM2).toFixed(4)), fixed: true, option });
    }

    const cost = packs * Math.min(...costs) + extraCost;
    const fallback = product.marginPct ?? policy.defaultMargin;
    const margin = body.margin === undefined || body.margin === null || body.margin === '' ? fallback : Number(body.margin);
    if (!Number.isFinite(margin) || margin < policy.minMargin || margin > policy.maxMargin)
      return res.status(422).json({ ok: false, message: 'نسبة الربح خارج الحدود التي حددتها الإدارة.' });
    const total = Math.ceil(cost / (1 - margin / 100) * 100 - 1e-8) / 100;
    const profit = Math.round((total - cost) * 100) / 100;
    return res.status(200).json({
      ok: true, areaM2, total, perM2: Number((total / areaM2).toFixed(4)), profit, margin, fixed: false, option,
      range: { min: policy.minMargin, max: policy.maxMargin, default: fallback }
    });
  } catch {
    return res.status(503).json({ ok: false, message: 'تعذّر حساب السعر. حدّث الصفحة وأعد المحاولة.' });
  }
}
