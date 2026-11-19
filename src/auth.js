import crypto from 'node:crypto';
import { HttpError } from './http.js';

const SESSION_DAYS = 30;
export const COOKIE = 'rd_session';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Sesiones firmadas: si el servidor gratuito se reinicia y la base vuelve a la demo, la sesión sigue valiendo
// (sólo si la cuenta sigue existiendo con el mismo teléfono). Requiere SESSION_SECRET en el entorno.
const SECRET = process.env.SESSION_SECRET || '';
const BOOT = Date.now();
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export function createSession(db, userId, now) {
  let token = crypto.randomBytes(32).toString('base64url');
  if (SECRET) {
    const u = db.prepare('SELECT phone FROM users WHERE id = ?').get(userId);
    const body = `${userId}.${Date.now()}.${sha(u?.phone || '').slice(0, 16)}.${crypto.randomBytes(9).toString('base64url')}`;
    token = `${body}.${sign(body)}`;
  }
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(
    sha(token), userId, now + SESSION_DAYS * 864e5,
  );
  return token;
}

const revoked = new Set();
export function destroySession(db, token) {
  if (!token) return;
  revoked.add(sha(token));
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure }) {
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function userFromRequest(db, req, now) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(sha(token), now);
  if (row) return row;
  return restoreSigned(db, token, now);
}

/** Sesión emitida ANTES de este arranque del servidor cuya fila se perdió al reiniciar la base. */
function restoreSigned(db, token, now) {
  if (!SECRET || revoked.has(sha(token))) return null;
  const parts = token.split('.');
  if (parts.length !== 5) return null;
  const body = parts.slice(0, 4).join('.');
  const mac = Buffer.from(parts[4]);
  const exp = Buffer.from(sign(body));
  if (mac.length !== exp.length || !crypto.timingSafeEqual(mac, exp)) return null;
  const [uid, iat, phoneTag] = parts;
  const issued = Number(iat);
  if (!(issued < BOOT) || issued + SESSION_DAYS * 864e5 < Date.now()) return null; // cerradas en este arranque no vuelven
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(Number(uid));
  if (!u || sha(u.phone).slice(0, 16) !== phoneTag) return null;
  db.prepare('INSERT OR IGNORE INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), u.id, issued + SESSION_DAYS * 864e5);
  return u;
}

export function requireRole(user, ...roles) {
  if (!user) throw new HttpError(401, 'Inicia sesión para continuar');
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'No tienes permiso para esta acción');
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, role: u.role, name: u.name, business_name: u.business_name, business_type: u.business_type,
    email: u.email, phone: u.phone, municipality: u.municipality, pickup_point: u.pickup_point,
    ...(u.role === 'transportista' ? { vehicle: u.vehicle, capacity_kg: u.capacity_kg, refrigerated: !!u.refrigerated, employer_id: u.employer_id } : {}),
  };
}

// Limitador simple de intentos de inicio de sesión (en memoria).
const attempts = new Map();
export function checkRateLimit(key, now, max = 8, windowMs = 10 * 60e3) {
  const a = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (a.length >= max) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
  a.push(now);
  attempts.set(key, a);
}
export const resetRateLimit = () => attempts.clear();
