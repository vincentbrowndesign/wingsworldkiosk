import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

Object.assign(process.env, {
  KIOSK_KEY: 'kiosk-secret', STAFF_CODE: '2468', CALL_CHANNEL: 'chan', SUPABASE_URL: 'https://db.test',
  SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', VAPID_SUBJECT: 'mailto:test@example.com',
  VAPID_PUBLIC_KEY: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  VAPID_PRIVATE_KEY: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
});

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
  return new Response(String(url).includes('kiosk_events?select') ? '[]' : null, { status: init.method === 'POST' ? 201 : 200 });
};

async function call(mod, { method = 'POST', url = '/', body } = {}) {
  const handler = (await import(`../api/${mod}.mjs`)).default;
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(req, { method, url });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  await handler(req, res);
  return res;
}

test('session requires the kiosk key or staff code and hides secrets', async () => {
  assert.equal((await call('session', { method: 'GET', url: '/?role=kiosk&key=nope' })).statusCode, 401);
  const kiosk = await call('session', { method: 'GET', url: '/?role=kiosk&key=kiosk-secret' });
  assert.equal(kiosk.statusCode, 200);
  assert.equal(kiosk.body.channel, 'kiosk-chan');
  assert.equal(JSON.stringify(kiosk.body).includes('service'), false);
  const staff = await call('session', { method: 'GET', url: '/?role=staff&code=2468' });
  assert.ok(staff.body.vapidPublicKey);
});

test('missing configuration answers 503 instead of failing silently', async () => {
  const saved = process.env.STAFF_CODE;
  process.env.STAFF_CODE = '';
  const res = await call('session', { method: 'GET', url: '/?role=staff&code=2468' });
  process.env.STAFF_CODE = saved;
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body.missing, ['STAFF_CODE']);
});

test('subscribe validates code and push subscription', async () => {
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'x', auth: 'y' } };
  assert.equal((await call('subscribe', { body: { code: '0000', name: 'A', device: 'device-123', subscription: sub } })).statusCode, 401);
  assert.equal((await call('subscribe', { body: { code: '2468', name: 'A', device: 'device-123', subscription: { endpoint: 'http://x' } } })).statusCode, 400);
  calls.length = 0;
  const ok = await call('subscribe', { body: { code: '2468', name: 'Owner', device: 'device-123', subscription: sub } });
  assert.equal(ok.statusCode, 200);
  assert.match(calls[0].url, /kiosk_staff_devices\?on_conflict=device/);
});

test('ring needs the kiosk key and records the push', async () => {
  assert.equal((await call('ring', { body: { key: 'bad', callId: 'abc' } })).statusCode, 401);
  calls.length = 0;
  const res = await call('ring', { body: { key: 'kiosk-secret', callId: 'abc-123' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sent, 0);
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/kiosk_events') && c.body.includes('"push"')));
});

test('event rejects unknown types', async () => {
  assert.equal((await call('event', { body: { key: 'kiosk-secret', type: 'drop table' } })).statusCode, 400);
  assert.equal((await call('event', { body: { key: 'kiosk-secret', type: 'missed', callId: 'abc' } })).statusCode, 200);
});

test('wrong method is refused', async () => {
  assert.equal((await call('ring', { method: 'GET' })).statusCode, 405);
});
