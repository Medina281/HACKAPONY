// Entregas a domicilio con el transporte PROPIO del productor.
// El transportista es personal del productor (lo da de alta el propio productor); no hay fletes abiertos.
// El costo de envío sale de la tarifa que fija el productor (base + por km) y se guarda al pedir la entrega.
//   abierta (el comercio la pidió) → asignada (el productor elige a su transportista) → recogida (el transportista cargó)
//   → entregada (el transportista captura el código del comprador; el pedido pasa a "recolectado").
import crypto from 'node:crypto';
import { tx } from '../db.js';
import { HttpError, bad } from '../http.js';
import { str } from '../validate.js';
import { haversineKm, formatKg, ROAD_FACTOR } from '../../public/js/shared/calc.js';
import { municipality } from '../../public/js/shared/catalog.js';
import { completeOrder, ACTIVE } from './orders.js';

const notify = (db, userId, text, link, now) =>
  db.prepare('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)').run(userId, text, link, now);

const SELECT = `SELECT d.*, o.folio, o.status AS order_status, o.qty_g, o.pickup_at, o.delivery_code, o.total_rescue_c, l.product, l.pickup_point, l.pickup_window,
  p.name AS producer_name, p.business_name AS producer_business, p.phone AS producer_phone,
  b.name AS buyer_name, b.business_name AS buyer_business, b.phone AS buyer_phone,
  c.name AS carrier_name, c.phone AS carrier_phone, c.vehicle AS carrier_vehicle
  FROM deliveries d JOIN orders o ON o.id = d.order_id JOIN lots l ON l.id = o.lot_id
  JOIN users p ON p.id = d.producer_id JOIN users b ON b.id = d.buyer_id LEFT JOIN users c ON c.id = d.carrier_id`;

export function serializeDelivery(d, viewer) {
  const role = viewer.role === 'admin' ? 'admin' : viewer.id === d.carrier_id ? 'transportista' : viewer.id === d.buyer_id ? 'comprador' : viewer.id === d.producer_id ? 'productor' : 'publico';
  const out = {
    id: d.id, folio: d.folio, status: d.status, order_status: d.order_status, product: d.product, weight_g: d.weight_g,
    needs_cold: !!d.needs_cold, from_muni: d.from_muni, to_muni: d.to_muni,
    from_name: municipality(d.from_muni)?.name, to_name: municipality(d.to_muni)?.name,
    distance_km: d.distance_km, fee_c: d.fee_c, total_rescue_c: d.total_rescue_c, pickup_at: d.pickup_at, pickup_window: d.pickup_window, notes: d.notes,
    created_at: d.created_at, assigned_at: d.assigned_at, picked_at: d.picked_at, delivered_at: d.delivered_at,
    cancel_reason: d.cancel_reason, is_demo: !!d.is_demo, role,
  };
  if (role !== 'publico') {
    out.producer = { name: d.producer_business || d.producer_name, phone: d.producer_phone, pickup_point: d.pickup_point };
    out.buyer = { name: d.buyer_business || d.buyer_name, contact: d.buyer_name, phone: d.buyer_phone, address: d.address };
    out.carrier = d.carrier_id ? { id: d.carrier_id, name: d.carrier_name, phone: d.carrier_phone, vehicle: d.carrier_vehicle } : null;
  }
  return out;
}

// ---------- Tarifa y costo de envío ----------
// Cada proveedor fija su tarifa (cargo base + $ por km). El costo se calcula en el servidor con la distancia
// estimada por carretera (línea recta × ROAD_FACTOR) del punto del productor al del comercio, y queda fijo en el pedido.
// Tarifa inicial con la que arranca cada proveedor (la ajusta en Mi transporte).
export const DEFAULT_TARIFF = { base_c: 2500, per_km_c: 400 };

export function tariffOf(producer) {
  if (producer?.delivery_base_c == null || producer?.delivery_per_km_c == null) return null;
  return { base_c: producer.delivery_base_c, per_km_c: producer.delivery_per_km_c };
}

export function setTariff(db, producer, body) {
  const base = Number(body.base);
  const perKm = Number(body.per_km);
  const e = {};
  if (!Number.isFinite(base) || base < 0 || base > 5000) e.base = 'Entre $0 y $5,000';
  if (!Number.isFinite(perKm) || perKm < 0 || perKm > 500) e.per_km = 'Entre $0 y $500 por km';
  if (Object.keys(e).length) throw bad('Revisa tu tarifa de envío', e);
  db.prepare('UPDATE users SET delivery_base_c = ?, delivery_per_km_c = ? WHERE id = ?').run(Math.round(base * 100), Math.round(perKm * 100), producer.id);
  return tariffOf(db.prepare('SELECT * FROM users WHERE id = ?').get(producer.id));
}

/** Cotiza el envío de un lote hasta el comercio (su ubicación si la compartió; si no, su municipio). */
export function quote(db, lotRow, buyer, point) {
  const producer = db.prepare('SELECT * FROM users WHERE id = ?').get(lotRow.producer_id);
  const t = tariffOf(producer);
  const from = municipality(lotRow.municipality);
  const dest = point || municipality(buyer.municipality);
  if (!from || !dest) return null;
  const straight = haversineKm(from, dest);
  const roadKm = Math.max(1, Math.round(straight * ROAD_FACTOR * 10) / 10);
  const fee = t ? Math.round((t.base_c + t.per_km_c * roadKm) / 100) * 100 : null; // a pesos cerrados
  return { available: !!lotRow.producer_transport && !!t, offered: !!lotRow.producer_transport, road_km: roadKm, straight_km: straight,
    fee_c: fee, base_c: t?.base_c ?? null, per_km_c: t?.per_km_c ?? null, uses_location: !!point };
}

export function validateDeliveryInput(body) {
  const e = {};
  const address = str(body.address, 200);
  if (address.length < 6) e.address = 'Escribe la dirección de entrega';
  const dest = validPoint(body.dest_lat, body.dest_lng);
  if ((body.dest_lat != null && body.dest_lat !== '') && !dest) e.dest = 'Ubicación no válida';
  if (Object.keys(e).length) throw bad('Revisa los datos de la entrega', e);
  return { address, dest };
}

/** El comercio pide que el productor se lo lleve. El costo sale de la tarifa del productor y no lo edita nadie más. */
export function requestDelivery(db, now, buyer, body) {
  const { address, dest } = validateDeliveryInput(body);
  const toMuni = buyer.municipality;

  return tx(db, () => {
    const o = db.prepare('SELECT o.*, l.municipality, l.producer_transport, l.producer_id AS lot_producer FROM orders o JOIN lots l ON l.id = o.lot_id WHERE o.folio = ?').get(String(body.folio));
    if (!o) throw new HttpError(404, 'Pedido no encontrado');
    if (o.buyer_id !== buyer.id) throw new HttpError(403, 'Sólo quien apartó puede pedir la entrega');
    if (!o.producer_transport) throw new HttpError(409, 'Este productor no ofrece entrega a domicilio; el pedido se recoge en su punto');
    if (!ACTIVE.includes(o.status)) throw new HttpError(409, 'El pedido ya no está activo');
    const prev = db.prepare('SELECT * FROM deliveries WHERE order_id = ?').get(o.id);
    if (prev && prev.status !== 'cancelada') throw new HttpError(409, 'Este pedido ya tiene una entrega solicitada');
    const q = quote(db, { municipality: o.municipality, producer_id: o.producer_id, producer_transport: o.producer_transport }, buyer, dest);
    if (!q?.available) throw new HttpError(409, 'Este productor aún no fija su tarifa de envío; por ahora se recoge en su punto');
    const code = String(crypto.randomInt(100000, 1000000));
    const vals = [buyer.id, o.producer_id, o.municipality, toMuni, address, q.road_km, o.qty_g, body.needs_cold ? 1 : 0, str(body.notes, 300) || null, code, now, q.fee_c];
    if (prev) {
      db.prepare(`UPDATE deliveries SET buyer_id=?, producer_id=?, from_muni=?, to_muni=?, address=?, distance_km=?, weight_g=?, needs_cold=?, notes=?,
        pickup_code=?, created_at=?, fee_c=?, status='abierta', carrier_id=NULL, cancel_reason=NULL, assigned_at=NULL, picked_at=NULL, delivered_at=NULL WHERE id=?`).run(...vals, prev.id);
    } else {
      db.prepare(`INSERT INTO deliveries (buyer_id, producer_id, from_muni, to_muni, address, distance_km, weight_g, needs_cold, notes, pickup_code, created_at, fee_c, order_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals, o.id);
    }
    db.prepare('UPDATE deliveries SET dest_lat = ?, dest_lng = ?, pos_lat = NULL, pos_lng = NULL, pos_acc = NULL, pos_at = NULL WHERE order_id = ?').run(dest?.lat ?? null, dest?.lng ?? null, o.id);
    const id = db.prepare('SELECT id FROM deliveries WHERE order_id = ?').get(o.id).id;
    const who = buyer.business_name || buyer.name;
    // Si el proveedor tiene un solo transportista activo, el pedido le llega directo; si tiene varios, el proveedor elige.
    const drivers = db.prepare(`SELECT * FROM users WHERE role = 'transportista' AND active = 1 AND employer_id = ?`).all(o.producer_id)
      .filter((c) => !c.capacity_kg || o.qty_g <= c.capacity_kg * 1000);
    if (drivers.length === 1) {
      const c = drivers[0];
      db.prepare(`UPDATE deliveries SET status='asignada', carrier_id=?, assigned_at=? WHERE id=?`).run(c.id, now, id);
      notify(db, c.id, `Nuevo pedido ${o.folio}: ${formatKg(o.qty_g)} para ${who}. Envío ${mxnText(q.fee_c)}.`, `#/entrega/${id}`, now);
      notify(db, o.producer_id, `${who} pidió entrega a domicilio del pedido ${o.folio}; se asignó a ${c.name}. Confírmalo para que pueda cargarlo.`, `#/pedido/${o.folio}`, now);
      notify(db, buyer.id, `${c.name} llevará tu pedido ${o.folio}`, `#/pedido/${o.folio}`, now);
    } else {
      notify(db, o.producer_id, `${who} pidió entrega a domicilio del pedido ${o.folio}. Asígnalo a tu transportista.`, `#/pedido/${o.folio}`, now);
    }
    return id;
  });
}

const mxnText = (c) => `$${(c / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;

export function getDeliveryRow(db, id) {
  const d = db.prepare(`${SELECT} WHERE d.id = ?`).get(id);
  if (!d) throw new HttpError(404, 'Entrega no encontrada');
  return d;
}

export function deliveryForOrder(db, orderId) {
  return db.prepare(`${SELECT} WHERE d.order_id = ?`).get(orderId) || null;
}

/** Entregas asignadas al transportista (sólo las de su productor). */
export function listForCarrier(db, carrier) {
  return db.prepare(`${SELECT} WHERE d.carrier_id = ? ORDER BY CASE WHEN d.status IN ('asignada','recogida') THEN 0 ELSE 1 END, o.pickup_at ASC, d.created_at DESC LIMIT 100`)
    .all(carrier.id).map((d) => serializeDelivery(d, carrier));
}

/** Entregas del productor (para su panel). */
export function listForProducer(db, producer) {
  return db.prepare(`${SELECT} WHERE d.producer_id = ? AND d.status IN ('abierta','asignada','recogida') ORDER BY o.pickup_at ASC LIMIT 100`)
    .all(producer.id).map((d) => serializeDelivery(d, producer));
}

function partyCheck(d, user, ...roles) {
  const role = user.role === 'admin' ? 'admin' : user.id === d.carrier_id ? 'transportista' : user.id === d.buyer_id ? 'comprador' : user.id === d.producer_id ? 'productor' : null;
  if (!role || !roles.includes(role)) throw new HttpError(403, 'No tienes permiso sobre esta entrega');
  return role;
}

const codeAttempts = new Map();
function checkCode(key, given, expected) {
  const n = codeAttempts.get(key) || 0;
  if (n >= 5) throw new HttpError(429, 'Demasiados intentos con código incorrecto.');
  if (String(given || '').trim() !== expected) {
    codeAttempts.set(key, n + 1);
    throw bad('El código no coincide', { code: 'Código incorrecto' });
  }
  codeAttempts.delete(key);
}

export function actOnDelivery(db, now, user, id, action, body = {}) {
  return tx(db, () => {
    const d = getDeliveryRow(db, id);
    const link = `#/entrega/${d.id}`;
    if (action === 'assign') {
      // El productor elige a uno de SUS transportistas (también puede cambiarlo antes de que cargue).
      partyCheck(d, user, 'productor', 'admin');
      if (!['abierta', 'asignada'].includes(d.status)) throw new HttpError(409, 'La entrega ya va en camino o terminó');
      if (!ACTIVE.includes(d.order_status)) throw new HttpError(409, 'El pedido ya no está activo');
      const c = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'transportista' AND active = 1`).get(Number(body.carrier_id));
      if (!c || c.employer_id !== d.producer_id) throw bad('Elige a uno de tus transportistas', { carrier_id: 'Transportista no válido' });
      if (c.capacity_kg && d.weight_g > c.capacity_kg * 1000) throw bad('El pedido supera la carga de ese vehículo', { carrier_id: 'Supera su capacidad' });
      const prevCarrier = d.carrier_id;
      db.prepare(`UPDATE deliveries SET status='asignada', carrier_id=?, assigned_at=? WHERE id=?`).run(c.id, now, id);
      if (prevCarrier && prevCarrier !== c.id) notify(db, prevCarrier, `Se reasignó la entrega del pedido ${d.folio}`, link, now);
      notify(db, c.id, `Nueva entrega: ${formatKg(d.weight_g)} de ${d.product} para ${d.buyer_business || d.buyer_name}`, link, now);
      notify(db, d.buyer_id, `${c.name} llevará tu pedido ${d.folio}`, `#/pedido/${d.folio}`, now);
      return 'asignada';
    }
    if (action === 'pickup') {
      partyCheck(d, user, 'transportista', 'admin');
      if (d.status !== 'asignada') throw new HttpError(409, 'Esta entrega no está esperando carga');
      if (!['confirmado', 'listo'].includes(d.order_status)) throw new HttpError(409, 'El productor aún no confirma el pedido');
      db.prepare(`UPDATE deliveries SET status='recogida', picked_at=? WHERE id=?`).run(now, id);
      notify(db, d.buyer_id, `Tu pedido ${d.folio} va en camino`, `#/pedido/${d.folio}`, now);
      notify(db, d.producer_id, `${d.carrier_name} salió con el pedido ${d.folio}`, `#/pedido/${d.folio}`, now);
      return 'recogida';
    }
    if (action === 'deliver') {
      partyCheck(d, user, 'transportista', 'admin');
      if (d.status !== 'recogida') throw new HttpError(409, 'Primero marca que ya cargaste el pedido');
      checkCode(`d${id}`, body.code, d.delivery_code);
      db.prepare(`UPDATE deliveries SET status='entregada', delivered_at=?, pos_lat=NULL, pos_lng=NULL, pos_acc=NULL WHERE id=?`).run(now, id);
      completeOrder(db, now, d.order_id, user.id, `Entregado por ${user.name}`);
      notify(db, d.buyer_id, `Pedido ${d.folio} entregado. ¡Gracias por rescatar alimento!`, `#/pedido/${d.folio}`, now);
      notify(db, d.producer_id, `${user.name} entregó el pedido ${d.folio}`, `#/pedido/${d.folio}`, now);
      return 'entregada';
    }
    if (action === 'cancel') {
      const role = partyCheck(d, user, 'comprador', 'productor', 'admin');
      if (!['abierta', 'asignada'].includes(d.status) && role !== 'admin') throw new HttpError(409, 'El pedido ya va en camino; no se puede cancelar la entrega');
      db.prepare(`UPDATE deliveries SET status='cancelada', cancel_reason=? WHERE id=?`).run(str(body.reason, 200) || (role === 'productor' ? 'El productor no puede entregar; se recoge en su punto' : 'Cancelado por el comercio'), id);
      if (d.carrier_id) notify(db, d.carrier_id, `Se canceló la entrega del pedido ${d.folio}`, link, now);
      notify(db, role === 'comprador' ? d.producer_id : d.buyer_id, `Se canceló la entrega a domicilio del pedido ${d.folio}${role === 'productor' ? '; puedes recogerlo en su punto' : ''}`, `#/pedido/${d.folio}`, now);
      return 'cancelada';
    }
    throw new HttpError(404, 'Acción no válida');
  });
}

/** Al cancelar o vencer un pedido, su entrega pendiente también se cancela. */
export function cancelForOrder(db, orderId, reason, now) {
  const d = db.prepare(`SELECT * FROM deliveries WHERE order_id = ? AND status IN ('abierta','asignada')`).get(orderId);
  if (!d) return;
  db.prepare(`UPDATE deliveries SET status='cancelada', cancel_reason=? WHERE id=?`).run(reason, d.id);
  if (d.carrier_id) notify(db, d.carrier_id, `Se canceló una entrega porque el pedido se canceló`, `#/entrega/${d.id}`, now);
}

export function carrierSummary(db, carrier) {
  return db.prepare(`SELECT
      COUNT(CASE WHEN status IN ('asignada','recogida') THEN 1 END) active,
      COUNT(CASE WHEN status='entregada' THEN 1 END) delivered,
      COALESCE(SUM(CASE WHEN status='entregada' THEN weight_g END),0) moved_g,
      COALESCE(SUM(CASE WHEN status='entregada' THEN distance_km END),0) km
    FROM deliveries WHERE carrier_id = ?`).get(carrier.id);
}

// ---------- Personal de transporte del productor ----------
export function listDrivers(db, producer) {
  return db.prepare(`SELECT u.id, u.name, u.phone, u.vehicle, u.capacity_kg, u.refrigerated, u.active,
      (SELECT COUNT(*) FROM deliveries d WHERE d.carrier_id = u.id AND d.status IN ('asignada','recogida')) active_trips,
      (SELECT COUNT(*) FROM deliveries d WHERE d.carrier_id = u.id AND d.status = 'entregada') delivered
    FROM users u WHERE u.role = 'transportista' AND u.employer_id = ? ORDER BY u.active DESC, u.name`).all(producer.id)
    .map((r) => ({ ...r, refrigerated: !!r.refrigerated, active: !!r.active }));
}

// ---------- Seguimiento en vivo ----------
// El transportista comparte su ubicación desde el navegador SÓLO mientras va en camino (estado "recogida").
// La ven únicamente el comercio y el productor de ese pedido. Al entregar se borra.
export const AVG_KMH = 35; // velocidad promedio SUPUESTA en carretera/ciudad para el tiempo estimado
const STALE_MS = 3 * 60e3;
const lastPost = new Map();

function validPoint(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  // Sólo México (margen amplio) para descartar lecturas absurdas
  if (a < 14 || a > 33 || b < -118.5 || b > -86) return null;
  return { lat: a, lng: b };
}

export function updatePosition(db, now, user, id, body) {
  const d = getDeliveryRow(db, id);
  if (user.id !== d.carrier_id) throw new HttpError(403, 'Sólo el transportista asignado comparte su ubicación');
  if (d.status !== 'recogida') throw new HttpError(409, 'La ubicación se comparte sólo mientras vas en camino');
  const p = validPoint(body.lat, body.lng);
  if (!p) throw bad('Ubicación no válida', { lat: 'Fuera de rango' });
  const prev = lastPost.get(id) || 0;
  if (now - prev < 4000) return trackInfo(db, now, d, user); // máximo una lectura cada 4 s
  lastPost.set(id, now);
  const acc = Number.isFinite(Number(body.acc)) ? Math.min(5000, Math.max(0, Number(body.acc))) : null;
  db.prepare('UPDATE deliveries SET pos_lat = ?, pos_lng = ?, pos_acc = ?, pos_at = ? WHERE id = ?').run(p.lat, p.lng, acc, now, id);
  return trackInfo(db, now, getDeliveryRow(db, id), user);
}

/** Dónde va el pedido y en cuánto llega (estimado). */
export function trackInfo(db, now, d, viewer) {
  const s = serializeDelivery(d, viewer);
  if (s.role === 'publico') throw new HttpError(403, 'No tienes acceso a esta entrega');
  const to = municipality(d.to_muni);
  const dest = d.dest_lat != null ? { lat: d.dest_lat, lng: d.dest_lng, exact: true } : { lat: to.lat, lng: to.lng, exact: false };
  const from = municipality(d.from_muni);
  const live = d.status === 'recogida' && d.pos_at != null;
  const out = {
    id: d.id, folio: d.folio, status: d.status, product: d.product, weight_g: d.weight_g,
    from: { lat: from.lat, lng: from.lng, name: from.name }, dest: { ...dest, name: to.name, address: d.address },
    carrier: s.carrier, buyer: s.buyer?.name, producer: s.producer?.name, picked_at: d.picked_at, delivered_at: d.delivered_at,
    position: live ? { lat: d.pos_lat, lng: d.pos_lng, acc: d.pos_acc, at: d.pos_at, stale: now - d.pos_at > STALE_MS } : null,
    avg_kmh: AVG_KMH, road_factor: ROAD_FACTOR,
  };
  if (live) {
    const km = Math.round(haversineKm({ lat: d.pos_lat, lng: d.pos_lng }, dest) * ROAD_FACTOR * 10) / 10;
    out.remaining_km = km;
    out.eta_min = Math.max(1, Math.round((km / AVG_KMH) * 60));
    out.eta_at = now + out.eta_min * 60e3;
  }
  return out;
}

// ---------- Código de equipo y flota ----------
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function teamCode(db, producer, { renew = false } = {}) {
  const cur = db.prepare('SELECT team_code FROM users WHERE id = ?').get(producer.id)?.team_code;
  if (cur && !renew) return cur;
  for (let i = 0; i < 20; i++) {
    const code = Array.from(crypto.randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join('');
    try {
      db.prepare('UPDATE users SET team_code = ? WHERE id = ?').run(code, producer.id);
      return code;
    } catch { /* choque improbable: se intenta otro */ }
  }
  throw new HttpError(500, 'No se pudo generar el código');
}

/** Entregas en camino del proveedor con la última ubicación de cada transportista. */
export function fleet(db, now, producer) {
  return db.prepare(`${SELECT} WHERE d.producer_id = ? AND d.status IN ('asignada','recogida') ORDER BY d.picked_at DESC`).all(producer.id)
    .map((d) => trackInfo(db, now, d, producer));
}
