// Entregas a domicilio con el transporte PROPIO del productor.
// El transportista es personal del productor (lo da de alta el propio productor); no hay fletes abiertos ni tarifas en la app.
//   abierta (el comercio la pidió) → asignada (el productor elige a su transportista) → recogida (el transportista cargó)
//   → entregada (el transportista captura el código del comprador; el pedido pasa a "recolectado").
import crypto from 'node:crypto';
import { tx } from '../db.js';
import { HttpError, bad } from '../http.js';
import { str } from '../validate.js';
import { haversineKm, formatKg } from '../../public/js/shared/calc.js';
import { municipality } from '../../public/js/shared/catalog.js';
import { completeOrder, ACTIVE } from './orders.js';

const notify = (db, userId, text, link, now) =>
  db.prepare('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)').run(userId, text, link, now);

const SELECT = `SELECT d.*, o.folio, o.status AS order_status, o.qty_g, o.pickup_at, o.delivery_code, l.product, l.pickup_point, l.pickup_window,
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
    distance_km: d.distance_km, pickup_at: d.pickup_at, pickup_window: d.pickup_window, notes: d.notes,
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

/** El comercio pide que el productor se lo lleve (sólo si la oferta dice que el productor entrega). */
export function requestDelivery(db, now, buyer, body) {
  const e = {};
  const address = str(body.address, 200);
  if (address.length < 6) e.address = 'Escribe la dirección de entrega';
  const toMuni = body.to_muni || buyer.municipality;
  if (!municipality(toMuni)) e.to_muni = 'Municipio no válido';
  if (Object.keys(e).length) throw bad('Revisa los datos de la entrega', e);

  return tx(db, () => {
    const o = db.prepare('SELECT o.*, l.municipality, l.producer_transport FROM orders o JOIN lots l ON l.id = o.lot_id WHERE o.folio = ?').get(String(body.folio));
    if (!o) throw new HttpError(404, 'Pedido no encontrado');
    if (o.buyer_id !== buyer.id) throw new HttpError(403, 'Sólo quien apartó puede pedir la entrega');
    if (!o.producer_transport) throw new HttpError(409, 'Este productor no ofrece entrega a domicilio; el pedido se recoge en su punto');
    if (!ACTIVE.includes(o.status)) throw new HttpError(409, 'El pedido ya no está activo');
    const prev = db.prepare('SELECT * FROM deliveries WHERE order_id = ?').get(o.id);
    if (prev && prev.status !== 'cancelada') throw new HttpError(409, 'Este pedido ya tiene una entrega solicitada');
    const dist = haversineKm(municipality(o.municipality), municipality(toMuni));
    const code = String(crypto.randomInt(100000, 1000000));
    const vals = [buyer.id, o.producer_id, o.municipality, toMuni, address, dist, o.qty_g, body.needs_cold ? 1 : 0, str(body.notes, 300) || null, code, now];
    if (prev) {
      db.prepare(`UPDATE deliveries SET buyer_id=?, producer_id=?, from_muni=?, to_muni=?, address=?, distance_km=?, weight_g=?, needs_cold=?, notes=?,
        pickup_code=?, created_at=?, status='abierta', carrier_id=NULL, cancel_reason=NULL, assigned_at=NULL, picked_at=NULL, delivered_at=NULL WHERE id=?`).run(...vals, prev.id);
    } else {
      db.prepare(`INSERT INTO deliveries (buyer_id, producer_id, from_muni, to_muni, address, distance_km, weight_g, needs_cold, notes, pickup_code, created_at, order_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals, o.id);
    }
    notify(db, o.producer_id, `${buyer.business_name || buyer.name} pidió entrega a domicilio del pedido ${o.folio}. Asígnalo a tu transportista.`, `#/pedido/${o.folio}`, now);
    return db.prepare('SELECT id FROM deliveries WHERE order_id = ?').get(o.id).id;
  });
}

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
      db.prepare(`UPDATE deliveries SET status='entregada', delivered_at=? WHERE id=?`).run(now, id);
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
