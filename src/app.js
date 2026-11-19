import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { send, readJson, serveStatic, HttpError, bad } from './http.js';
import * as auth from './auth.js';
import * as lots from './services/lots.js';
import * as orders from './services/orders.js';
import * as stats from './services/stats.js';
import * as deliveries from './services/deliveries.js';
import * as market from './services/market.js';
import { validateRegistration, validatePhone, str } from './validate.js';
import { MUNICIPALITIES, REPORT_REASONS } from '../public/js/shared/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ dbPath = path.join(ROOT, 'data', 'raiz.db'), now = () => Date.now(), uploadsDir, fetchImpl } = {}) {
  const db = openDb(dbPath);
  const uploads = uploadsDir || path.join(ROOT, 'data', 'uploads');
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler });
  };

  // ---------- Autenticación ----------
  route('POST', '/api/auth/register', ({ body, t, res }) => {
    if (body.role === 'transportista')
      throw bad('Los transportistas los da de alta su productor desde su panel', { role: 'Pide a tu productor que te registre' });
    const v = validateRegistration(body);
    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(v.phone))
      throw bad('Ese teléfono ya está registrado', { phone: 'Ya registrado; inicia sesión' });
    if (v.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(v.email))
      throw bad('Ese correo ya está registrado', { email: 'Ya registrado' });
    const r = db
      .prepare(
        `INSERT INTO users (role, name, business_name, business_type, email, phone, password_hash, municipality, pickup_point, created_at, vehicle, capacity_kg, refrigerated)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(v.role, v.name, v.business_name, v.business_type, v.email, v.phone, auth.hashPassword(v.password), v.municipality, v.pickup_point, t, v.vehicle, v.capacity_kg, v.refrigerated);
    const token = auth.createSession(db, Number(r.lastInsertRowid), t);
    res.setHeader('Set-Cookie', auth.sessionCookie(token, { secure: process.env.COOKIE_SECURE === '1' }));
    return [201, { user: auth.publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)) }];
  });

  route('POST', '/api/auth/login', ({ body, t, res, req }) => {
    const id = str(body.identifier, 120).toLowerCase();
    auth.checkRateLimit(`${req.socket.remoteAddress}|${id}`, t);
    const phone = validatePhone(id);
    const u = db.prepare('SELECT * FROM users WHERE (email = ? OR phone = ?) AND active = 1').get(id, phone || '-');
    if (!u || !auth.verifyPassword(String(body.password || ''), u.password_hash))
      throw new HttpError(401, 'Teléfono/correo o contraseña incorrectos');
    const token = auth.createSession(db, u.id, t);
    res.setHeader('Set-Cookie', auth.sessionCookie(token, { secure: process.env.COOKIE_SECURE === '1' }));
    return { user: auth.publicUser(u) };
  });

  route('POST', '/api/auth/logout', ({ req, res }) => {
    auth.destroySession(db, auth.parseCookies(req.headers.cookie)[auth.COOKIE]);
    res.setHeader('Set-Cookie', auth.clearCookie());
    return { ok: true };
  });

  route('GET', '/api/me', ({ user }) => ({ user: auth.publicUser(user) }));

  route('PATCH', '/api/me', ({ user, body }) => {
    auth.requireRole(user);
    const e = {};
    const phone = body.phone != null ? validatePhone(body.phone) : user.phone;
    if (!phone) e.phone = 'Teléfono de 10 dígitos';
    else if (db.prepare('SELECT 1 FROM users WHERE phone = ? AND id != ?').get(phone, user.id)) e.phone = 'Ya registrado';
    const muni = body.municipality ?? user.municipality;
    if (!MUNICIPALITIES.some((m) => m.id === muni)) e.municipality = 'Municipio no válido';
    const name = body.name != null ? str(body.name, 80) : user.name;
    if (name.length < 2) e.name = 'Nombre requerido';
    if (Object.keys(e).length) throw bad('Revisa los datos', e);
    if (user.role === 'transportista') {
      const cap = body.capacity_kg != null ? Math.round(Number(body.capacity_kg)) : user.capacity_kg;
      if (!(cap > 0 && cap <= 40000)) throw bad('Capacidad no válida', { capacity_kg: 'Entre 1 y 40,000 kg' });
      db.prepare('UPDATE users SET vehicle=?, capacity_kg=?, refrigerated=? WHERE id=?').run(
        body.vehicle != null ? str(body.vehicle, 60) || 'Camioneta' : user.vehicle, cap,
        body.refrigerated != null ? (body.refrigerated ? 1 : 0) : user.refrigerated, user.id,
      );
    }
    db.prepare('UPDATE users SET name=?, business_name=?, phone=?, municipality=?, pickup_point=? WHERE id=?').run(
      name, body.business_name != null ? str(body.business_name, 80) || null : user.business_name, phone, muni,
      body.pickup_point != null ? str(body.pickup_point, 160) || null : user.pickup_point, user.id,
    );
    return { user: auth.publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) };
  });

  // ---------- Ofertas (lotes) ----------
  route('GET', '/api/lots', ({ query, user, t }) => ({ server_now: t, lots: lots.listFeed(db, t, query, user) }));

  route('GET', '/api/lots/:id', ({ params, user, t }) => {
    const l = lots.getLotRow(db, Number(params.id));
    const visible = l.status === 'activo' || (user && (user.id === l.producer_id || user.role === 'admin'));
    if (!visible) throw new HttpError(404, 'Oferta no disponible');
    return { server_now: t, lot: lots.serializeLot(l, t, { viewer: user }) };
  });

  route('POST', '/api/lots', ({ user, body, t }) => {
    auth.requireRole(user, 'productor');
    const id = lots.createLot(db, t, user, body, { uploadsDir: uploads });
    return [201, { id, lot: lots.serializeLot(lots.getLotRow(db, id), t, { viewer: user }) }];
  });

  route('POST', '/api/lots/batch', ({ user, body, t }) => {
    auth.requireRole(user, 'productor');
    const ids = lots.createLots(db, t, user, body.lots, { uploadsDir: uploads });
    return [201, { lots: ids.map((id) => lots.serializeLot(lots.getLotRow(db, id), t, { viewer: user })) }];
  });

  route('PATCH', '/api/lots/:id/price', ({ user, body, params, t }) => {
    auth.requireRole(user, 'productor', 'admin');
    lots.updatePrice(db, t, user, Number(params.id), body);
    return { lot: lots.serializeLot(lots.getLotRow(db, Number(params.id)), t, { viewer: user }) };
  });

  route('POST', '/api/lots/:id/status', ({ user, body, params, t }) => {
    auth.requireRole(user, 'productor', 'admin');
    lots.setLotStatus(db, t, user, Number(params.id), body.status);
    return { ok: true };
  });

  route('POST', '/api/lots/:id/reduce', ({ user, body, params, t }) => {
    auth.requireRole(user, 'productor');
    lots.reduceAvailable(db, t, user, Number(params.id), body);
    return { lot: lots.serializeLot(lots.getLotRow(db, Number(params.id)), t, { viewer: user }) };
  });

  route('POST', '/api/lots/:id/reserve', ({ user, body, params, t }) => {
    auth.requireRole(user, 'comprador');
    const folio = orders.reserve(db, t, user, Number(params.id), body);
    return [201, { folio, order: orders.getOrder(db, user, folio) }];
  });

  // ---------- Pedidos ----------
  route('GET', '/api/orders', ({ user, query }) => {
    auth.requireRole(user, 'productor', 'comprador');
    return { orders: orders.listOrders(db, user, query.as === 'productor' && user.role === 'productor' ? 'productor' : user.role) };
  });
  route('GET', '/api/orders/:folio', ({ user, params, t }) => {
    auth.requireRole(user);
    return { server_now: t, order: orders.getOrder(db, user, params.folio) };
  });
  route('POST', '/api/orders/:folio/:action', ({ user, params, body, t }) => {
    auth.requireRole(user);
    orders.transition(db, t, user, params.folio, params.action, body);
    return { order: orders.getOrder(db, user, params.folio) };
  });

  // ---------- Panel del productor / comprador ----------
  route('GET', '/api/producer/summary', ({ user, t }) => {
    auth.requireRole(user, 'productor');
    return { summary: stats.producerSummary(db, user), lots: lots.producerLots(db, t, user), server_now: t };
  });
  route('GET', '/api/buyer/summary', ({ user }) => {
    auth.requireRole(user, 'comprador');
    return { summary: stats.buyerSummary(db, user) };
  });

  // ---------- Entregas con el transporte propio del productor ----------
  route('POST', '/api/deliveries', ({ user, body, t }) => {
    auth.requireRole(user, 'comprador');
    const id = deliveries.requestDelivery(db, t, user, body);
    return [201, { delivery: deliveries.serializeDelivery(deliveries.getDeliveryRow(db, id), user) }];
  });
  route('GET', '/api/deliveries', ({ user }) => {
    auth.requireRole(user, 'transportista', 'productor');
    return { deliveries: user.role === 'productor' ? deliveries.listForProducer(db, user) : deliveries.listForCarrier(db, user) };
  });
  route('GET', '/api/deliveries/:id', ({ user, params }) => {
    auth.requireRole(user);
    const s = deliveries.serializeDelivery(deliveries.getDeliveryRow(db, Number(params.id)), user);
    if (s.role === 'publico') throw new HttpError(403, 'No tienes acceso a esta entrega');
    return { delivery: s };
  });
  route('POST', '/api/deliveries/:id/:action', ({ user, params, body, t }) => {
    auth.requireRole(user);
    deliveries.actOnDelivery(db, t, user, Number(params.id), params.action, body);
    return { delivery: deliveries.serializeDelivery(deliveries.getDeliveryRow(db, Number(params.id)), user) };
  });
  route('GET', '/api/carrier/summary', ({ user }) => {
    auth.requireRole(user, 'transportista');
    const boss = user.employer_id ? db.prepare('SELECT name, business_name, phone, municipality FROM users WHERE id = ?').get(user.employer_id) : null;
    return { summary: deliveries.carrierSummary(db, user), employer: boss ? { name: boss.business_name || boss.name, phone: boss.phone, municipality: boss.municipality } : null };
  });

  // ---------- Transportistas del productor (su propio personal) ----------
  route('GET', '/api/producer/drivers', ({ user }) => {
    auth.requireRole(user, 'productor');
    return { drivers: deliveries.listDrivers(db, user) };
  });
  route('POST', '/api/producer/drivers', ({ user, body, t }) => {
    auth.requireRole(user, 'productor');
    const v = validateRegistration({ ...body, role: 'transportista', municipality: user.municipality });
    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(v.phone)) throw bad('Ese teléfono ya está registrado', { phone: 'Ya registrado' });
    const r = db.prepare(`INSERT INTO users (role, name, phone, password_hash, municipality, created_at, vehicle, capacity_kg, refrigerated, employer_id)
      VALUES ('transportista',?,?,?,?,?,?,?,?,?)`).run(v.name, v.phone, auth.hashPassword(v.password), user.municipality, t, v.vehicle, v.capacity_kg, v.refrigerated, user.id);
    return [201, { drivers: deliveries.listDrivers(db, user), id: Number(r.lastInsertRowid) }];
  });
  route('PATCH', '/api/producer/drivers/:id', ({ user, params, body }) => {
    auth.requireRole(user, 'productor');
    const d = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'transportista' AND employer_id = ?`).get(Number(params.id), user.id);
    if (!d) throw new HttpError(404, 'Transportista no encontrado');
    if (body.active === false && db.prepare(`SELECT 1 FROM deliveries WHERE carrier_id = ? AND status IN ('asignada','recogida')`).get(d.id))
      throw new HttpError(409, 'Tiene entregas en curso; reasígnalas antes de darlo de baja');
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(body.active === false ? 0 : 1, d.id);
    if (body.active === false) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(d.id);
    return { drivers: deliveries.listDrivers(db, user) };
  });

  // ---------- Precios de mercado (SNIIM) ----------
  route('GET', '/api/market/:product', ({ params, t }) => ({ price: market.getMarketPrice(db, params.product, { now: t, fetchImpl }) }));

  // ---------- Plantillas ----------
  route('GET', '/api/templates', ({ user }) => {
    auth.requireRole(user, 'productor');
    return {
      templates: db.prepare('SELECT id, name, payload FROM templates WHERE producer_id = ? ORDER BY id DESC').all(user.id)
        .map((r) => ({ ...r, payload: JSON.parse(r.payload) })),
    };
  });
  route('POST', '/api/templates', ({ user, body, t }) => {
    auth.requireRole(user, 'productor');
    const name = str(body.name, 60);
    if (!name) throw bad('Ponle nombre a la plantilla', { name: 'Requerido' });
    const allowed = ['product', 'category', 'quality', 'kg', 'min_kg', 'allow_partial', 'ref_price', 'rescue_price', 'hours', 'pickup_point', 'pickup_window', 'producer_transport', 'notes'];
    const payload = Object.fromEntries(allowed.filter((k) => body.payload?.[k] !== undefined).map((k) => [k, body.payload[k]]));
    const n = db.prepare('SELECT COUNT(*) n FROM templates WHERE producer_id = ?').get(user.id).n;
    if (n >= 20) throw bad('Máximo 20 plantillas');
    const r = db.prepare('INSERT INTO templates (producer_id, name, payload, created_at) VALUES (?,?,?,?)').run(user.id, name, JSON.stringify(payload), t);
    return [201, { id: Number(r.lastInsertRowid) }];
  });
  route('DELETE', '/api/templates/:id', ({ user, params }) => {
    auth.requireRole(user, 'productor');
    db.prepare('DELETE FROM templates WHERE id = ? AND producer_id = ?').run(Number(params.id), user.id);
    return { ok: true };
  });

  // ---------- Reportes y notificaciones ----------
  route('POST', '/api/reports', ({ user, body, t }) => {
    auth.requireRole(user);
    if (!REPORT_REASONS.some((r) => r.id === body.reason)) throw bad('Motivo no válido', { reason: 'Elige un motivo' });
    const lotId = body.lot_id ? Number(body.lot_id) : null;
    if (lotId) lots.getLotRow(db, lotId);
    let orderId = null;
    if (body.folio) {
      const o = db.prepare('SELECT id, buyer_id, producer_id, lot_id FROM orders WHERE folio = ?').get(String(body.folio));
      if (!o || (o.buyer_id !== user.id && o.producer_id !== user.id)) throw new HttpError(403, 'No puedes reportar ese pedido');
      orderId = o.id;
    }
    if (!lotId && !orderId) throw bad('Indica la oferta o el pedido');
    const r = db.prepare('INSERT INTO reports (lot_id, order_id, reporter_id, reason, details, created_at) VALUES (?,?,?,?,?,?)').run(
      lotId, orderId, user.id, body.reason, str(body.details, 500) || null, t,
    );
    // El reporte llega al panel de administración y se avisa a cada administrador.
    for (const a of db.prepare("SELECT id FROM users WHERE role='admin' AND active=1").all())
      db.prepare('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)').run(a.id, `🚩 Nuevo reporte #${r.lastInsertRowid}: ${REPORT_REASONS.find((x) => x.id === body.reason).label}`, '#/admin?tab=reportes', t);
    return [201, { ok: true, id: Number(r.lastInsertRowid) }];
  });
  route('GET', '/api/reports/mine', ({ user }) => {
    auth.requireRole(user);
    return {
      reports: db.prepare(`SELECT r.id, r.reason, r.details, r.status, r.resolution, r.created_at, l.product, o.folio FROM reports r
        LEFT JOIN lots l ON l.id = r.lot_id LEFT JOIN orders o ON o.id = r.order_id WHERE r.reporter_id = ? ORDER BY r.id DESC`).all(user.id),
    };
  });
  route('GET', '/api/notifications', ({ user }) => {
    auth.requireRole(user);
    return {
      notifications: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(user.id),
      unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0').get(user.id).n,
    };
  });
  route('POST', '/api/notifications/read', ({ user }) => {
    auth.requireRole(user);
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id);
    return { ok: true };
  });

  // ---------- Impacto (público) ----------
  route('GET', '/api/stats', ({ query, t }) => ({ stats: stats.impactStats(db, t, { includeDemo: query.demo !== '0' }) }));

  // ---------- Administración (permisos verificados en servidor) ----------
  route('GET', '/api/admin/overview', ({ user, t }) => {
    auth.requireRole(user, 'admin');
    return {
      stats: stats.impactStats(db, t),
      users: db.prepare('SELECT id, role, name, business_name, phone, email, municipality, active, is_demo, created_at FROM users ORDER BY id DESC').all(),
      lots: db.prepare(`SELECT l.*, u.name producer_name, u.business_name producer_business FROM lots l JOIN users u ON u.id=l.producer_id ORDER BY l.id DESC LIMIT 200`).all()
        .map((l) => lots.serializeLot(l, t, { viewer: user })),
      orders: db.prepare(`SELECT o.folio, o.status, o.qty_g, o.total_rescue_c, o.created_at, o.is_demo, l.product, b.business_name buyer, p.name producer
        FROM orders o JOIN lots l ON l.id=o.lot_id JOIN users b ON b.id=o.buyer_id JOIN users p ON p.id=o.producer_id ORDER BY o.id DESC LIMIT 200`).all(),
      deliveries: db.prepare(`SELECT d.id, d.status, d.fee_c, d.distance_km, d.weight_g, d.from_muni, d.to_muni, d.created_at, o.folio, l.product,
        b.business_name buyer, COALESCE(p.business_name, p.name) producer, c.name carrier FROM deliveries d JOIN orders o ON o.id=d.order_id JOIN lots l ON l.id=o.lot_id
        JOIN users b ON b.id=d.buyer_id JOIN users p ON p.id=d.producer_id LEFT JOIN users c ON c.id=d.carrier_id ORDER BY d.id DESC LIMIT 200`).all(),
      market: db.prepare(`SELECT product, variety, scope, market, price_date, freq_c, fetched_at FROM market_prices m
        WHERE fetched_at = (SELECT MAX(fetched_at) FROM market_prices WHERE product = m.product) ORDER BY product`).all(),
      market_errors: db.prepare('SELECT product, error, fetched_at FROM market_fetch_log ORDER BY id DESC LIMIT 10').all(),
      reports: db.prepare(`SELECT r.*, u.name reporter, l.product, o.folio FROM reports r JOIN users u ON u.id=r.reporter_id
        LEFT JOIN lots l ON l.id=r.lot_id LEFT JOIN orders o ON o.id=r.order_id ORDER BY r.status='abierto' DESC, r.id DESC`).all(),
    };
  });
  route('POST', '/api/admin/users/:id/active', ({ user, params, body }) => {
    auth.requireRole(user, 'admin');
    if (Number(params.id) === user.id) throw bad('No puedes desactivarte a ti mismo');
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(body.active ? 1 : 0, Number(params.id));
    if (!body.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(params.id));
    return { ok: true };
  });
  route('POST', '/api/admin/reports/:id', ({ user, params, body, t }) => {
    auth.requireRole(user, 'admin');
    const status = ['resuelto', 'descartado'].includes(body.status) ? body.status : null;
    if (!status) throw bad('Estado no válido');
    const rep = db.prepare('SELECT r.*, l.producer_id FROM reports r LEFT JOIN lots l ON l.id = r.lot_id WHERE r.id = ?').get(Number(params.id));
    if (!rep) throw new HttpError(404, 'Reporte no encontrado');
    const actions = [];
    if (body.pause_lot && rep.lot_id) {
      db.prepare("UPDATE lots SET status='pausado' WHERE id=? AND status='activo'").run(rep.lot_id);
      actions.push('oferta pausada');
    }
    if (body.suspend_producer && rep.producer_id) {
      db.prepare('UPDATE users SET active=0 WHERE id=? AND role != ?').run(rep.producer_id, 'admin');
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(rep.producer_id);
      actions.push('productor suspendido');
    }
    const resolution = [str(body.resolution, 300), ...actions].filter(Boolean).join(' · ') || null;
    db.prepare('UPDATE reports SET status=?, resolution=?, resolved_by=? WHERE id=?').run(status, resolution, user.id, rep.id);
    db.prepare('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)').run(
      rep.reporter_id, `Tu reporte #${rep.id} fue ${status}${resolution ? `: ${resolution}` : ''}`, '#/perfil', t);
    return { ok: true };
  });

  route('POST', '/api/admin/market/refresh', async ({ user, t }) => {
    auth.requireRole(user, 'admin');
    const results = {};
    for (const p of Object.keys(market.SNIIM_PRODUCTS)) results[p] = await market.refreshPrice(db, p, { now: t, fetchImpl });
    return { results };
  });

  route('GET', '/api/health', ({ t }) => ({ ok: true, server_now: t }));

  // ---------- Servidor ----------
  let lastSweep = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) {
        const t = now();
        if (t - lastSweep > 15e3 || t < lastSweep) {
          orders.sweepExpired(db, t);
          lastSweep = t;
        }
        const r = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
        if (!r) throw new HttpError(404, 'Ruta no encontrada');
        const m = r.re.exec(url.pathname);
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const body = await readJson(req);
        const user = auth.userFromRequest(db, req, t);
        let out = await r.handler({ req, res, body, params, query: Object.fromEntries(url.searchParams), user, t });
        let status = 200;
        if (Array.isArray(out)) [status, out] = out;
        return send(res, status, out);
      }
      if (url.pathname.startsWith('/uploads/') && serveStatic(req, res, uploads, url.pathname.slice(8), { maxAge: 604800 })) return;
      if (serveStatic(req, res, path.join(ROOT, 'public'), url.pathname)) return;
      if (serveStatic(req, res, path.join(ROOT, 'public'), '/index.html')) return;
      send(res, 404, 'No encontrado');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, fields: e.fields });
      if (String(e.message).includes('CHECK constraint') || String(e.message).includes('UNIQUE constraint'))
        return send(res, 400, { error: 'Los datos no cumplen las reglas del sistema' });
      console.error(e);
      send(res, 500, { error: 'Error interno. Intenta de nuevo.' });
    }
  });

  return { server, db, now };
}
