// Server logic for the Vercel functions in /api. Kept free of Vercel types so it can be tested directly.
import { timingSafeEqual } from 'node:crypto';
import webpush from 'web-push';

export function env(name) {
  return (process.env[name] || '').trim();
}

export function configured() {
  const missing = [
    'KIOSK_KEY', 'STAFF_CODE', 'CALL_CHANNEL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
  ].filter((name) => !env(name));
  return { ok: missing.length === 0, missing };
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export const isKiosk = (key) => safeEqual(key, env('KIOSK_KEY'));
export const isStaff = (code) => safeEqual(code, env('STAFF_CODE'));

export function iceServers() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  if (env('TURN_URLS')) {
    servers.push({ urls: env('TURN_URLS').split(',').map((u) => u.trim()), username: env('TURN_USERNAME'), credential: env('TURN_CREDENTIAL') });
  }
  return servers;
}

export function sessionFor(role) {
  return {
    role,
    supabaseUrl: env('SUPABASE_URL'),
    supabaseAnonKey: env('SUPABASE_ANON_KEY'),
    channel: `kiosk-${env('CALL_CHANNEL')}`,
    iceServers: iceServers(),
    vapidPublicKey: role === 'staff' ? env('VAPID_PUBLIC_KEY') : undefined,
  };
}

// ---------- Storage (Supabase PostgREST with the service role; tables have RLS on and no public policies) ----------

export async function db(path, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Storage error ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}

export function validSubscription(sub) {
  return (
    sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000 &&
    typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string'
  );
}

export async function saveSubscription({ device, name, subscription }) {
  return db('kiosk_staff_devices?on_conflict=device', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: { device, name, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, updated_at: new Date().toISOString() },
  });
}

export async function logEvent(type, fields = {}) {
  return db('kiosk_events', { method: 'POST', prefer: 'return=minimal', body: { type, ...fields } });
}

// Push to every registered staff device (or one). Drops subscriptions the push service says are gone.
export async function pushAll(payload, { device } = {}) {
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const filter = device ? `&device=eq.${encodeURIComponent(device)}` : '';
  const devices = (await db(`kiosk_staff_devices?select=device,name,endpoint,p256dh,auth${filter}`)) || [];
  const results = await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify(payload), {
          TTL: 60,
          urgency: 'high',
        });
        return { device: d.device, ok: true };
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await db(`kiosk_staff_devices?device=eq.${encodeURIComponent(d.device)}`, { method: 'DELETE' }).catch(() => {});
        }
        return { device: d.device, ok: false, status: error.statusCode || 0 };
      }
    }),
  );
  return { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}

// One push burst per 20 seconds, so a stuck or tampered kiosk cannot flood phones.
export async function recentRing(seconds = 20) {
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const rows = await db(`kiosk_events?select=id&type=eq.push&created_at=gte.${encodeURIComponent(since)}&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

// ---------- HTTP helpers ----------

export async function readJson(req, limit = 8192) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function handler(fn, { method = 'POST' } = {}) {
  return async (req, res) => {
    if (req.method !== method) return send(res, 405, { error: 'Method not allowed' });
    const setup = configured();
    if (!setup.ok) return send(res, 503, { error: 'Calls are not set up yet', missing: setup.missing });
    try {
      const body = method === 'POST' ? await readJson(req) : {};
      const query = Object.fromEntries(new URL(req.url, 'http://local').searchParams);
      const [status, payload] = await fn({ body, query });
      send(res, status, payload);
    } catch (error) {
      console.error(error);
      send(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong' });
    }
  };
}

export const EVENT_TYPES = ['ring', 'connected', 'ended', 'missed', 'cancelled', 'failed', 'push-failed'];
