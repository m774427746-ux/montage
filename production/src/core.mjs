import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { calculateQuote } from '../../api/_pricing.js';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'password_length');
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password, hash) {
  const [salt, value] = hash.split(':');
  return typeof password === 'string' && password.length <= 128 && timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(value, 'hex'));
}
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function safePath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes(':') || relative.includes('\\')) fail(400, 'unsafe_path');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) fail(400, 'unsafe_path');
  return resolved;
}
export function validateDetails(body, machine, material) {
  if (!body || typeof body.customer !== 'string' || !body.customer.trim() || body.customer.length > 200) fail(400, 'customer_required');
  if (typeof body.product !== 'string' || !body.product.trim() || body.product.length > 100) fail(400, 'product_required');
  if (material.machine_id !== machine.id) fail(400, 'material_machine_mismatch');
  for (const key of ['quantity', 'copies']) if (!Number.isInteger(body[key]) || body[key] < 1 || body[key] > 100000) fail(400, 'invalid_quantity');
  if (body.quantity * body.copies > 1000000) fail(400, 'invalid_quantity');
  if (!['mm','cm','m'].includes(body.unit) || !['width','height'].every(k => Number.isFinite(body[k]) && body[k] > 0 && body[k] <= 10000)) fail(400, 'invalid_dimensions');
  const choices = {};
  for (const [key, options] of Object.entries(material.options)) {
    if (!machine.fields.includes(key) || !Array.isArray(options) || !options.includes(body.options?.[key])) fail(400, 'required_option_' + key);
    choices[key] = body.options[key];
  }
  for (const key of Object.keys(body.options || {})) if (!(key in choices)) fail(400, 'unexpected_option');
  if (typeof (body.notes ?? '') !== 'string' || (body.notes || '').length > 4000) fail(400, 'notes_too_long');
  return { product: body.product.trim(), materialName: material.name, materialUnit: material.unit, quantity: body.quantity, copies: body.copies, width: body.width, height: body.height, unit: body.unit, options: choices, notes: body.notes || '' };
}
export function priceSnapshot(details, material) {
  const p = material.price, qty = details.quantity * details.copies;
  const factor = { mm: 0.1, cm: 1, m: 100 }[details.unit];
  const width = details.width * factor, height = details.height * factor;
  if (p.source === 'asbarix' && material.unit === 'cm2' && p.policy) {
    const result = calculateQuote({ qty, width, height, margin: p.policy.defaultMargin }, { ...p, name: material.name, unit: material.unit }, p.policy);
    return { source: p.source, approvedAt: material.updated_at, ...result, cost: result.ok ? p.cost * width * height * qty : null, operationCost: null };
  }
  const units = material.unit === 'piece' ? qty : width * height * qty / (material.unit === 'm2' ? 10000 : 1);
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const total = valid(p.retail) ? Math.ceil(units * p.retail * 100) / 100 : null;
  // Missing operating cost remains unknown; zero must be explicitly approved.
  const cost = valid(p.cost) && valid(p.operationCost) ? units * p.cost + qty * p.operationCost : null;
  return { source: 'local-approved', approvedAt: material.updated_at, units, rate: p.retail ?? null, total, cost, operationCost: p.operationCost ?? null, margin: cost !== null && total > 0 ? (total-cost)/total*100 : null, ok: cost !== null && total !== null, error: cost === null ? 'cost_missing' : total === null ? 'price_missing' : null };
}
export function publicPricing(p, role) { return role === 'admin' ? p : { total: p.total ?? null, error: p.error ?? null, ok: p.ok }; }
export function nextStatus(current, next, role) {
  if (!['admin','operator'].includes(role)) fail(403, 'forbidden');
  if (role === 'admin' && current === 'archived' && next === 'new') return;
  if ({new:'received',received:'running',running:'completed',completed:'archived'}[current] !== next) fail(409, 'invalid_transition');
}
export function cleanupDay(now = new Date()) {
  const local = new Date(now.getTime() + 3 * 3600000);
  if (local.getUTCHours() < 22) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0,10);
}
