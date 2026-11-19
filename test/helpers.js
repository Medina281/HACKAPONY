import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { resetRateLimit } from '../src/auth.js';

/** Levanta una instancia real (HTTP + SQLite en archivo temporal) con reloj controlable. */
export async function startApp({ dir } = {}) {
  resetRateLimit();
  const tmp = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'rd-test-'));
  const clock = { t: Date.UTC(2026, 10, 20, 15, 0, 0) };
  const app = createApp({ dbPath: path.join(tmp, 'test.db'), uploadsDir: path.join(tmp, 'uploads'), now: () => clock.t });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const close = () => new Promise((r) => { app.server.close(r); app.server.closeAllConnections?.(); }).then(() => app.db.close());
  return { ...app, base, clock, tmp, close, advance: (h) => (clock.t += h * 3600e3) };
}

/** Cliente con su propia cookie de sesión. */
export function client(base) {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return {
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    patch: (u, b = {}) => call('PATCH', u, b),
  };
}

let phoneSeq = 4439000000;
export async function user(base, role, extra = {}) {
  const c = client(base);
  const r = await c.post('/api/auth/register', {
    role, name: `${role} prueba`, phone: String(phoneSeq++), password: 'secreta123', municipality: role === 'productor' ? 'tarimbaro' : 'morelia',
    business_name: role === 'comprador' ? 'Fonda de prueba' : undefined, ...extra,
  });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  c.user = r.body.user;
  return c;
}

export const JITOMATE = { product: 'Jitomate', kg: 100, ref_price: 25, rescue_price: 12, hours: 24, quality: 'maduro', declaration: true };
