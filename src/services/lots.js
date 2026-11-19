import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tx } from '../db.js';
import { HttpError, bad } from '../http.js';
import { validateLot, num } from '../validate.js';
import { discountPct, haversineKm, pesosToCents, kgToGrams } from '../../public/js/shared/calc.js';
import { municipality, normalize } from '../../public/js/shared/catalog.js';
import { priceAt, schedule, PRICE_RULE } from '../../public/js/shared/pricing.js';

/** Precio de rescate vigente (baja solo por tramos conforme pasan las horas de frescura). */
export const currentPrice = (l, now) => priceAt(l.ref_price_c, l.created_at, l.expires_at, now);

export const URGENT_MS = 6 * 3600e3; // "próximo a vencer": menos de 6 horas
const CLOSED_VISIBLE_MS = 24 * 3600e3; // agotados/vencidos se muestran 24 h más como referencia

export function lotState(l, now) {
  if (l.status === 'retirado') return 'retirado';
  if (l.status === 'pausado') return 'pausado';
  if (l.expires_at <= now) return 'vencido';
  if (l.available_g <= 0) return 'agotado';
  if (l.expires_at - now <= URGENT_MS) return 'por_vencer';
  return 'disponible';
}

/** Ya no hace falta sugerir rebajas: el precio baja solo con la regla automática. */
export function priceSuggestion() {
  return null;
}

export function serializeLot(l, now, { viewer, from } = {}) {
  const muni = municipality(l.municipality);
  const cp = currentPrice(l, now);
  const isOwner = viewer && (viewer.id === l.producer_id || viewer.role === 'admin');
  const out = {
    id: l.id,
    product: l.product,
    category: l.category,
    quality: l.quality,
    total_g: l.total_g,
    available_g: l.available_g,
    min_g: l.min_g,
    allow_partial: !!l.allow_partial,
    ref_price_c: l.ref_price_c,
    rescue_price_c: cp.cents,
    discount: discountPct(l.ref_price_c, cp.cents),
    price_rule: PRICE_RULE,
    next_price_at: cp.next_at,
    next_price_c: cp.next_cents,
    price_schedule: schedule(l.ref_price_c, l.created_at, l.expires_at),
    fresh_hours: l.fresh_hours,
    expires_at: l.expires_at,
    created_at: l.created_at,
    state: lotState(l, now),
    municipality: l.municipality,
    municipality_name: muni?.name,
    state_name: muni?.state,
    region: muni?.region,
    lat: muni?.lat,
    lng: muni?.lng,
    pickup_window: l.pickup_window,
    producer_transport: !!l.producer_transport,
    notes: l.notes,
    photo: l.photo,
    producer: { id: l.producer_id, name: l.producer_business || l.producer_name },
    is_demo: !!l.is_demo,
    input_method: l.input_method,
    ref_source: l.ref_source,
    ref_market: l.ref_market_json ? JSON.parse(l.ref_market_json) : null,
    shelf: l.shelf_json ? JSON.parse(l.shelf_json) : null,
  };
  if (from && muni) out.distance_km = haversineKm(from, muni);
  // Mecanismo de contacto autorizado: sólo comercios registrados ven el WhatsApp del productor.
  if (viewer && viewer.role === 'comprador' && l.producer_phone) out.producer.phone = l.producer_phone;
  if (isOwner) {
    out.pickup_point = l.pickup_point;
    out.suggestion = priceSuggestion(l, now);
    out.original_rescue_price_c = l.original_rescue_price_c;
  }
  return out;
}

const LOT_SELECT = `SELECT l.*, u.name AS producer_name, u.business_name AS producer_business, u.phone AS producer_phone
  FROM lots l JOIN users u ON u.id = l.producer_id`;

export function getLotRow(db, id) {
  const l = db.prepare(`${LOT_SELECT} WHERE l.id = ?`).get(id);
  if (!l) throw new HttpError(404, 'Oferta no encontrada');
  return l;
}

export function listFeed(db, now, q, viewer) {
  const where = ["l.status = 'activo'", 'u.active = 1', 'l.expires_at > ?'];
  const params = [now - CLOSED_VISIBLE_MS];
  if (q.q) {
    where.push('(l.product LIKE ? OR l.notes LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`);
  }
  if (q.category) where.push('l.category = ?'), params.push(q.category);
  if (q.municipality) where.push('l.municipality = ?'), params.push(q.municipality);
  if (q.quality) where.push('l.quality = ?'), params.push(q.quality);
  const maxPrice = num(q.max_price);

  const rows = db.prepare(`${LOT_SELECT} WHERE ${where.join(' AND ')} ORDER BY l.expires_at ASC LIMIT 200`).all(...params);

  const from = municipality(q.from) || null;
  let list = rows.map((r) => serializeLot(r, now, { viewer, from }));
  if (q.closed !== '1') list = list.filter((l) => ['disponible', 'por_vencer'].includes(l.state));
  const radius = num(q.radius);
  if (from && Number.isFinite(radius) && radius > 0) list = list.filter((l) => l.distance_km <= radius);
  if (q.urgent === '1') list = list.filter((l) => l.state === 'por_vencer');
  if (Number.isFinite(maxPrice) && maxPrice > 0) list = list.filter((l) => l.rescue_price_c <= pesosToCents(maxPrice));

  const open = (l) => (['disponible', 'por_vencer'].includes(l.state) ? 0 : 1);
  const sorters = {
    urgencia: (a, b) => a.expires_at - b.expires_at,
    descuento: (a, b) => b.discount - a.discount,
    precio: (a, b) => a.rescue_price_c - b.rescue_price_c,
    distancia: (a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9),
    recientes: (a, b) => b.created_at - a.created_at,
  };
  const s = sorters[q.sort] || sorters.urgencia;
  list.sort((a, b) => open(a) - open(b) || s(a, b));
  return list.slice(0, 100);
}

function savePhoto(dataUrl, uploadsDir) {
  if (!dataUrl) return null;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw bad('Formato de foto no válido', { photo: 'Usa una foto JPG, PNG o WebP' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 600_000) throw bad('Foto demasiado pesada', { photo: 'Máximo 600 KB' });
  const magic = { jpeg: [0xff, 0xd8], png: [0x89, 0x50], webp: [0x52, 0x49] }[m[1]];
  if (buf[0] !== magic[0] || buf[1] !== magic[1]) throw bad('El archivo no es una imagen válida', { photo: 'Imagen inválida' });
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return `/uploads/${name}`;
}

function insertLot(db, now, producer, v, photo, isDemo, body) {
  // El precio de referencia sólo se marca "SNIIM" si coincide con el último precio guardado del SNIIM.
  let refSource = 'declarado';
  let refMarket = null;
  if (body.ref_source === 'sniim') {
    const m = db.prepare('SELECT * FROM market_prices WHERE product = ? ORDER BY fetched_at DESC LIMIT 1').get(normalize(v.product));
    if (m && Math.abs(m.freq_c - v.ref_price_c) <= 50) {
      refSource = 'sniim';
      refMarket = JSON.stringify({ variety: m.variety, market: m.market, date: m.price_date, freq_c: m.freq_c, scope: m.scope });
    }
  }
  const r = db
    .prepare(
      `INSERT INTO lots (producer_id, product, category, quality, total_g, available_g, min_g, allow_partial,
        ref_price_c, rescue_price_c, original_rescue_price_c, fresh_hours, expires_at, municipality, pickup_point,
        pickup_window, producer_transport, notes, photo, status, declaration_ok, is_demo, created_at, input_method, shelf_json, ref_source, ref_market_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'activo',1,?,?,?,?,?,?)`,
    )
    .run(
      producer.id, v.product, v.category, v.quality, v.total_g, v.total_g, v.min_g, v.allow_partial,
      v.ref_price_c, v.rescue_price_c, v.rescue_price_c, v.fresh_hours, now + v.fresh_hours * 3600e3,
      v.municipality, v.pickup_point || producer.pickup_point, v.pickup_window, v.producer_transport, v.notes,
      photo, isDemo, now, v.input_method, v.shelf_json, refSource, refMarket,
    );
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO inventory_movements (lot_id, delta_g, reason, created_at) VALUES (?,?,?,?)').run(id, v.total_g, 'publicacion', now);
  return id;
}

export function createLot(db, now, producer, body, { uploadsDir, isDemo = 0 } = {}) {
  const v = validateLot({ municipality: producer.municipality, ...body });
  const photo = savePhoto(body.photo, uploadsDir);
  return tx(db, () => insertLot(db, now, producer, v, photo, isDemo, body));
}

/** Varios productos de un mismo dictado: se validan todos y se guardan juntos (todo o nada). */
export function createLots(db, now, producer, list, { uploadsDir } = {}) {
  if (!Array.isArray(list) || !list.length) throw bad('No hay productos para publicar');
  if (list.length > 8) throw bad('Máximo 8 productos por publicación');
  const valid = list.map((b, i) => {
    try {
      return validateLot({ municipality: producer.municipality, ...b });
    } catch (e) {
      e.message = `Producto ${i + 1}${b.product ? ` (${b.product})` : ''}: ${e.message}`;
      e.fields = { index: i, ...e.fields };
      throw e;
    }
  });
  const photos = list.map((b) => savePhoto(b.photo, uploadsDir));
  return tx(db, () => valid.map((v, i) => insertLot(db, now, producer, v, photos[i], 0, list[i])));
}

function ownLot(db, user, id) {
  const l = getLotRow(db, id);
  if (user.role !== 'admin' && l.producer_id !== user.id) throw new HttpError(403, 'Esta oferta no es tuya');
  return l;
}

/** El productor corrige SU precio por kilo; el de rescate se recalcula solo. */
export function updatePrice(db, now, user, id, body) {
  const l = ownLot(db, user, id);
  const p = num(body.ref_price ?? body.price);
  if (!Number.isFinite(p) || p <= 0 || p > 2000) throw bad('Precio no válido', { ref_price: 'Precio no válido' });
  const c = pesosToCents(p);
  if (lotState(l, now) === 'vencido') throw new HttpError(409, 'La oferta ya venció');
  tx(db, () => {
    db.prepare(`UPDATE lots SET ref_price_c = ?, rescue_price_c = ?, ref_source = 'declarado' WHERE id = ?`).run(c, priceAt(c, l.created_at, l.expires_at, l.created_at).cents, id);
    db.prepare('INSERT INTO price_history (lot_id, old_c, new_c, actor_id, reason, created_at) VALUES (?,?,?,?,?,?)').run(
      id, l.ref_price_c, c, user.id, body.reason || 'ajuste_precio_productor', now,
    );
  });
}

export function setLotStatus(db, now, user, id, status) {
  const l = ownLot(db, user, id);
  const allowed = { activo: ['pausado'], pausado: ['activo', 'retirado'], retirado: [] };
  allowed.activo.push('retirado');
  if (!allowed[l.status].includes(status)) throw new HttpError(409, `No se puede pasar de ${l.status} a ${status}`);
  db.prepare('UPDATE lots SET status = ? WHERE id = ?').run(status, id);
}

/** El productor vendió parte por otro canal: reduce lo disponible sin tocar lo ya apartado. */
export function reduceAvailable(db, now, user, id, body) {
  ownLot(db, user, id);
  const newKg = num(body.available_kg);
  if (!Number.isFinite(newKg) || newKg < 0) throw bad('Cantidad no válida', { available_kg: 'Cantidad no válida' });
  const g = kgToGrams(newKg);
  tx(db, () => {
    const cur = db.prepare('SELECT available_g FROM lots WHERE id = ?').get(id);
    if (g > cur.available_g) throw bad('Sólo puedes reducir lo disponible', { available_kg: 'Sólo puedes reducir' });
    db.prepare('UPDATE lots SET available_g = ? WHERE id = ?').run(g, id);
    db.prepare('INSERT INTO inventory_movements (lot_id, delta_g, reason, created_at) VALUES (?,?,?,?)').run(
      id, g - cur.available_g, 'vendido_otro_canal', now,
    );
  });
}

export function producerLots(db, now, user) {
  return db
    .prepare(`${LOT_SELECT} WHERE l.producer_id = ? ORDER BY l.created_at DESC LIMIT 100`)
    .all(user.id)
    .map((l) => {
      const s = serializeLot(l, now, { viewer: user });
      const agg = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status IN ('apartado','confirmado','listo') THEN qty_g END),0) AS reserved_g,
             COALESCE(SUM(CASE WHEN status = 'recolectado' THEN qty_g END),0) AS delivered_g,
             COALESCE(SUM(CASE WHEN status = 'recolectado' THEN total_rescue_c END),0) AS income_c
           FROM orders WHERE lot_id = ?`,
        )
        .get(l.id);
      return { ...s, ...agg };
    });
}
