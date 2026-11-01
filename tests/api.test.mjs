import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TEAM_CODE = 'local-test-team';
process.env.ADMIN_KEY = 'local-test-admin';
process.env.KV_REST_API_URL = 'https://redis.test';
process.env.KV_REST_API_TOKEN = 'local-test-token';
const { tokenFor } = await import('../api/_session.js');
const { default: favorites } = await import('../api/favorites.js');
const { default: login } = await import('../api/login.js');
const { default: adminLogin } = await import('../api/admin-login.js');
const { default: prices } = await import('../api/prices.js');
const { default: stats } = await import('../api/stats.js');
const { default: signup } = await import('../api/signup.js');
const { default: middleware } = await import('../middleware.js');
const teamCookie = 'asb_session=' + tokenFor('team', process.env.TEAM_CODE);
const adminCookie = 'asb_admin=' + tokenFor('admin', process.env.ADMIN_KEY);
const stored = new Map();
let commandCount = 0;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://redis.test/pipeline');
  assert.equal(options.headers.Authorization, 'Bearer local-test-token');
  const results = JSON.parse(options.body).map(([command, ...args]) => {
    commandCount++;
    if (command === 'EVAL') { stored.set(args[3], args[4]); return { result: 1 }; }
    if (command === 'HVALS') return { result: [...stored.values()] };
    if (command === 'HDEL') return { result: stored.delete(args[1]) ? 1 : 0 };
    if (command === 'GET') return { result: null };
    throw new Error('Unexpected command: ' + command);
  });
  return { ok: true, json: async () => results };
};
async function call(handler, { method = 'GET', body, cookie = '' } = {}) {
  const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } };
  await handler({ method, body, headers: { cookie } }, res);
  return res;
}
test('team login rejects empty/wrong codes and issues a protected cookie', async () => {
  for (const code of ['', 'wrong']) assert.equal((await call(login, { method: 'POST', body: { code } })).code, 401);
  const r = await call(login, { method: 'POST', body: { code: process.env.TEAM_CODE } });
  assert.equal(r.code, 200);
  assert.match(r.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
});
test('middleware accepts team session and redirects forged/missing sessions', async () => {
  for (const cookie of ['', 'asb_session=forged']) {
    const r = await middleware(new Request('https://test.invalid/', { headers: { cookie } }));
    assert.equal(r.status, 307); assert.equal(r.headers.get('location'), '/login');
  }
  assert.equal((await middleware(new Request('https://test.invalid/', { headers: { cookie: teamCookie } }))).headers.get('x-middleware-next'), '1');
});
test('team cannot read stats or write prices; unauthorized requests do not touch Redis', async () => {
  const before = commandCount;
  assert.equal((await call(stats, { cookie: teamCookie })).code, 401);
  assert.equal((await call(prices, { method: 'PUT', cookie: teamCookie, body: { prices: [] } })).code, 401);
  assert.equal((await call(favorites)).code, 401);
  assert.equal((await call(signup, { method: 'POST', body: { email: 'test@example.com' } })).code, 401);
  assert.equal(commandCount, before);
});
test('admin login rejects bad password and issues HttpOnly admin cookie', async () => {
  assert.equal((await call(adminLogin, { method: 'POST', body: { password: 'wrong' } })).code, 401);
  const r = await call(adminLogin, { method: 'POST', body: { password: process.env.ADMIN_KEY } });
  assert.equal(r.code, 200); assert.match(r.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
});
test('shared favorite round trip, validation, and deletion', async () => {
  const item = { id: 'test-favorite', name: 'بطاقات', tab: 'sheets', fields: { 'sh-w': '9', 'sh-h': '5', 'sh-rot': true } };
  assert.equal((await call(favorites, { method: 'POST', cookie: teamCookie, body: item })).code, 200);
  assert.deepEqual((await call(favorites, { cookie: adminCookie })).body.items, [item]);
  assert.equal((await call(favorites, { method: 'POST', cookie: teamCookie, body: { ...item, fields: { password: 'x' } } })).code, 400);
  assert.equal((await call(favorites, { method: 'POST', cookie: teamCookie, body: { ...item, name: 'x'.repeat(61) } })).code, 400);
  assert.equal((await call(favorites, { method: 'DELETE', cookie: teamCookie, body: { id: item.id } })).code, 200);
  assert.deepEqual((await call(favorites, { cookie: teamCookie })).body.items, []);
});
