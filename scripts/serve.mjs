// Local preview: static files from /public plus the /api functions.
// With LOCAL_CALLS=1 (default when Supabase is not configured) calls use a same-browser channel and no push is sent.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const port = Number(process.env.PORT || 3300);
const local = !process.env.SUPABASE_URL;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

if (local) {
  Object.assign(process.env, { KIOSK_KEY: 'dev-kiosk', STAFF_CODE: '1234', CALL_CHANNEL: 'dev' });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function localApi(req, res, path) {
  const url = new URL(req.url, 'http://local');
  const ok = (q) => (q.role === 'kiosk' && q.key === 'dev-kiosk') || (q.role === 'staff' && q.code === '1234');
  if (path === 'session') {
    const q = Object.fromEntries(url.searchParams);
    if (!ok(q)) return json(res, 401, { error: q.role === 'staff' ? 'Wrong staff code' : 'This kiosk is not set up' });
    return json(res, 200, { transport: 'local', channel: 'kiosk-dev', iceServers: [], vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' });
  }
  for await (const _ of req);
  console.log(`[local api] ${path}`);
  return json(res, 200, { ok: true, sent: 0, local: true });
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (path.startsWith('/api/')) {
    const name = path.slice(5).replace(/[^\w-]/g, '');
    if (local) return localApi(req, res, name);
    try {
      const mod = await import(`../api/${name}.mjs`);
      return mod.default(req, res);
    } catch {
      return json(res, 404, { error: 'Not found' });
    }
  }
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root)) return json(res, 403, { error: 'Forbidden' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Kiosk: http://localhost:${port}/?key=dev-kiosk   Staff: http://localhost:${port}/answer.html (code 1234)${local ? '   [local calls]' : ''}`));
