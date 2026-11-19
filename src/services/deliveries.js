// Fletes: un comercio pide traslado de su pedido y un transportista independiente lo toma.
// Raíz Directa NO presta el servicio de transporte: conecta y registra la entrega con códigos.
//   abierta → asignada (transportista acepta) → recogida (productor captura el código del transportista)
//   → entregada (transportista captura el código del comprador; el pedido pasa a "recolectado").
import crypto from 'node:crypto';
import { tx } from '../db.js';
import { HttpError, bad } from '../http.js';
import { num, str } from '../validate.js';
import { haversineKm, pesosToCents, formatKg } from '../../public/js/shared/calc.js';
import { municipality } from '../../public/js/shared/catalog.js';
import { completeOrder, ACTIVE } from './orders.js';

const MAX_ACTIVE_TRIPS = 5;
const notify = (db, userId, text, link, now) =>
  db.prepare('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)').run(userId, text, link, now);

const SELECT = `SELECT d.*, o.folio, o.status AS order_status, o.qty_g, o.pickup_at, o.delivery_code, l.product, l.pickup_point, l.pickup_window,
  p.name AS producer_name, p.business_name AS producer_business, p.phone AS producer_phone,
  b.name AS buyer_name, b.business_name AS buyer_business, b.phone AS buyer_phone,
  c.name AS carrier_name, c.phone AS carrier_phone, c.vehicle AS carrier_vehicle
  FROM deliveries d JOIN orders o ON o.id = d.order_id JOIN lots l ON l.id = o.lot_id
  JOIN users p ON p.id = d.producer_id JOIN users b ON b.id = d.buyer_id LEFT JOIN users c ON c.id = d.carrier_id`;

export function serializeDelivery(d, viewer, { from } = {}) {
  const role = viewer.role === 'admin' ? 'admin' : viewer.id === d.carrier_id ? 'transportista' : viewer.id === d.buyer_id ? 'comprador' : viewer.id === d.producer_id ? 'productor' : 'publico';
  const out = {
    id: d.id, folio: d.folio, status: d.status, product: d.product, weight_g: d.weight_g, fee_c: d.fee_c,
    needs_cold: !!d.needs_cold, from_muni: d.from_muni, to_muni: d.to_muni,
    from_name: municipality(d.from_muni)?.name, to_name: municipality(d.to_muni)?.name,
    distance_km: d.distance_km, pickup_at: d.pickup_at, pickup_window: d.pickup_window, notes: d.notes,
    created_at: d.created_at, assigned_at: d.assigned_at, picked_at: d.picked_at, delivered_at: d.delivered_at,
    cancel_reason: d.cancel_reason, is_demo: !!d.is_demo, role,
  };
  if (from) out.distance_to_pickup_km = haversineKm(from, municipality(d.from_muni));
  const party = role !== 'publico';
  // Los datos de contacto y direcciones sólo se revelan a quienes participan en el flete.
  if (party && (role !== 'transportista' || d.status !== 'abierta')) {
    out.producer = { name: d.producer_business || d.producer_name, phone: d.producer_phone, pickup_point: d.pickup_point };
    out.buyer = { name: d.buyer_business || d.buyer_name, contact: d.buyer_name, phone: d.buyer_phone, address: d.address };
    out.carrier = d.carrier_id ? { name: d.carrier_name, phone: d.carrier_phone, vehicle: d.carrier_vehicle } : null;
  }
  if (role === 'transportista' || role === 'admin') out.pickup_code = d.carrier_id ? d.pickup_code : undefined; // lo muestra al productor
  return out;
}

export function requestDelivery(db, now, buyer, body) {
  const e = {};
  const address = str(body.address, 200);
  if (address.length < 6) e.address = 'Escribe la dirección de entrega';
  const fee = num(body.fee);
  if (!Number.isFinite(fee) || fee < 20) e.fee = 'Ofrece al menos $20';
  else if (fee > 20000) e.fee = 'Monto fuera de rango';
  const toMuni = body.to_muni || buyer.municipality;
  if (!municipality(toMuni)) e.to_muni = 'Municipio no válido';
  if (Object.keys(e).length) throw bad('Revisa los datos del flete', e);

  return tx(db, () => {
    const o = db.prepare('SELECT o.*, l.municipality FROM orders o JOIN lots l ON l.id = o.lot_id WHERE o.folio = ?').get(String(body.folio));
    if (!o) throw new HttpError(404, 'Pedido no encontrado');
    if (o.buyer_id !== buyer.id) throw new HttpError(403, 'Sólo quien apartó puede pedir flete');
    if (!ACTIVE.includes(o.status)) throw new HttpError(409, 'El pedido ya no está activo');
    const prev = db.prepare('SELECT * FROM deliveries WHERE order_id = ?').get(o.id);
    if (prev && prev.status !== 'cancelada') throw new HttpError(409, 'Este pedido ya tiene un flete solicitado');
    const dist = haversineKm(municipality(o.municipality), municipality(toMuni));
    const code = String(crypto.randomInt(100000, 1000000));
    const vals = [buyer.id, o.producer_id, o.municipality, toMuni, address, dist, o.qty_g, pesosToCents(fee), body.needs_cold ? 1 : 0, str(body.notes, 300) || null, code, now];
    if (prev) {
      db.prepare(`UPDATE deliveries SET buyer_id=?, producer_id=?, from_muni=?, to_muni=?, address=?, distance_km=?, weight_g=?, fee_c=?, needs_cold=?, notes=?,
        pickup_code=?, created_at=?, status='abierta', carrier_id=NULL, cancel_reason=NULL, assigned_at=NULL, picked_at=NULL, delivered_at=NULL WHERE id=?`).run(...vals, prev.id);
    } else {
      db.prepare(`INSERT INTO deliveries (buyer_id, producer_id, from_muni, to_muni, address, distance_km, weight_g, fee_c, needs_cold, notes, pickup_code, created_at, order_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals, o.id);
    }
    // Avisar a transportistas disponibles que cubren esa zona
    const carriers = db.prepare(`SELECT id, municipality, radius_km FROM users WHERE role='transportista' AND active=1 AND available=1`).all();
    for (const c of carriers) {
      if (haversineKm(municipality(c.municipality), municipality(o.municipality)) <= c.radius_km)
        notify(db, c.id, `Nuevo flete: ${formatKg(o.qty_g)} de ${municipality(o.municipality).name} a ${municipality(toMuni).name}`, '#/transportista', now);
    }
    notify(db, o.producer_id, `El comercio pidió un transportista para el pedido ${o.folio}`, `#/pedido/${o.folio}`, now);
    return db.prepare('SELECT id FROM deliveries WHERE order_id = ?').get(o.id).id;
  });
}

export function getDeliveryRow(db, id) {
  const d = db.prepare(`${SELECT} WHERE d.id = ?`).get(id);
  if (!d) throw new HttpError(404, 'Flete no encontrado');
  return d;
}

export function deliveryForOrder(db, orderId) {
  return db.prepare(`${SELECT} WHERE d.order_id = ?`).get(orderId) || null;
}

export function listForCarrier(db, carrier, scope, { all = false } = {}) {
  const from = municipality(carrier.municipality);
  if (scope === 'mine') {
    return db.prepare(`${SELECT} WHERE d.carrier_id = ? ORDER BY CASE WHEN d.status IN ('asignada','recogida') THEN 0 ELSE 1 END, d.created_at DESC LIMIT 100`)
      .all(carrier.id).map((d) => serializeDelivery(d, carrier, { from }));
  }
  return db.prepare(`${SELECT} WHERE d.status = 'abierta' AND o.status IN ('apartado','confirmado','listo') ORDER BY o.pickup_at ASC LIMIT 100`)
    .all()
    .map((d) => {
      const s = serializeDelivery(d, carrier, { from });
      s.fits = (!carrier.capacity_kg || d.weight_g <= carrier.capacity_kg * 1000) && (!d.needs_cold || !!carrier.refrigerated);
      s.in_range = s.distance_to_pickup_km <= carrier.radius_km;
      return s;
    })
    .filter((s) => all || (s.in_range && s.fits));
}

function partyCheck(d, user, ...roles) {
  const role = user.role === 'admin' ? 'admin' : user.id === d.carrier_id ? 'transportista' : user.id === d.buyer_id ? 'comprador' : user.id === d.producer_id ? 'productor' : null;
  if (!role || !roles.includes(role)) throw new HttpError(403, 'No tienes permiso sobre este flete');
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
    const link = `#/flete/${d.id}`;
    if (action === 'accept') {
      if (user.role !== 'transportista') throw new HttpError(403, 'Sólo transportistas pueden tomar fletes');
      if (!user.available) throw new HttpError(409, 'Activa tu disponibilidad para tomar viajes');
      if (user.capacity_kg && d.weight_g > user.capacity_kg * 1000) throw new HttpError(409, 'Supera la capacidad de tu vehículo');
      if (d.needs_cold && !user.refrigerated) throw new HttpError(409, 'Este flete requiere refrigeración');
      const active = db.prepare(`SELECT COUNT(*) n FROM deliveries WHERE carrier_id = ? AND status IN ('asignada','recogida')`).get(user.id).n;
      if (active >= MAX_ACTIVE_TRIPS) throw new HttpError(429, 'Tienes demasiados viajes activos');
      if (!ACTIVE.includes(d.order_status)) throw new HttpError(409, 'El pedido ya no está activo');
      // Toma atómica: sólo un transportista puede quedarse con el flete.
      const r = db.prepare(`UPDATE deliveries SET status='asignada', carrier_id=?, assigned_at=? WHERE id=? AND status='abierta'`).run(user.id, now, id);
      if (r.changes !== 1) throw new HttpError(409, 'Otro transportista tomó este flete antes');
      notify(db, d.buyer_id, `${user.name} llevará tu pedido ${d.folio}`, `#/pedido/${d.folio}`, now);
      notify(db, d.producer_id, `${user.name} pasará por el pedido ${d.folio}. Pídele su código al entregarle.`, `#/pedido/${d.folio}`, now);
      return 'asignada';
    }
    if (action === 'handoff') {
      partyCheck(d, user, 'productor', 'admin');
      if (d.status !== 'asignada') throw new HttpError(409, 'El flete no está esperando recolección');
      if (!['confirmado', 'listo'].includes(d.order_status)) throw new HttpError(409, 'Confirma el pedido antes de entregarlo al transportista');
      checkCode(`h${id}`, body.code, d.pickup_code);
      db.prepare(`UPDATE deliveries SET status='recogida', picked_at=? WHERE id=?`).run(now, id);
      notify(db, d.buyer_id, `Tu pedido ${d.folio} va en camino 🚚`, `#/pedido/${d.folio}`, now);
      notify(db, d.carrier_id, `Recolección registrada del pedido ${d.folio}`, link, now);
      return 'recogida';
    }
    if (action === 'deliver') {
      partyCheck(d, user, 'transportista', 'admin');
      if (d.status !== 'recogida') throw new HttpError(409, 'Primero el productor debe registrar que te entregó el producto');
      checkCode(`d${id}`, body.code, d.delivery_code);
      db.prepare(`UPDATE deliveries SET status='entregada', delivered_at=? WHERE id=?`).run(now, id);
      completeOrder(db, now, d.order_id, user.id, `Entregado por transportista ${user.name}`);
      notify(db, d.buyer_id, `Pedido ${d.folio} entregado. ¡Gracias por rescatar alimento!`, `#/pedido/${d.folio}`, now);
      notify(db, d.producer_id, `El transportista entregó el pedido ${d.folio}`, `#/pedido/${d.folio}`, now);
      return 'entregada';
    }
    if (action === 'release') {
      partyCheck(d, user, 'transportista');
      if (d.status !== 'asignada') throw new HttpError(409, 'Ya no puedes soltar este flete');
      db.prepare(`UPDATE deliveries SET status='abierta', carrier_id=NULL, assigned_at=NULL WHERE id=?`).run(id);
      notify(db, d.buyer_id, `El transportista soltó el flete del pedido ${d.folio}; vuelve a estar disponible`, `#/pedido/${d.folio}`, now);
      return 'abierta';
    }
    if (action === 'cancel') {
      const role = partyCheck(d, user, 'comprador', 'admin');
      if (!['abierta', 'asignada'].includes(d.status) && role !== 'admin') throw new HttpError(409, 'El producto ya va en camino; no se puede cancelar el flete');
      db.prepare(`UPDATE deliveries SET status='cancelada', cancel_reason=? WHERE id=?`).run(str(body.reason, 200) || 'Cancelado por el comercio', id);
      if (d.carrier_id) notify(db, d.carrier_id, `Se canceló el flete del pedido ${d.folio}`, link, now);
      return 'cancelada';
    }
    throw new HttpError(404, 'Acción no válida');
  });
}

/** Al cancelar o vencer un pedido, su flete pendiente también se cancela. */
export function cancelForOrder(db, orderId, reason, now) {
  const d = db.prepare(`SELECT * FROM deliveries WHERE order_id = ? AND status IN ('abierta','asignada')`).get(orderId);
  if (!d) return;
  db.prepare(`UPDATE deliveries SET status='cancelada', cancel_reason=? WHERE id=?`).run(reason, d.id);
  if (d.carrier_id) notify(db, d.carrier_id, `Se canceló un flete porque el pedido se canceló`, `#/flete/${d.id}`, now);
}

export function carrierSummary(db, carrier) {
  return db.prepare(`SELECT
      COUNT(CASE WHEN status IN ('asignada','recogida') THEN 1 END) active,
      COUNT(CASE WHEN status='entregada' THEN 1 END) delivered,
      COALESCE(SUM(CASE WHEN status='entregada' THEN fee_c END),0) earnings_c,
      COALESCE(SUM(CASE WHEN status='entregada' THEN weight_g END),0) moved_g,
      COALESCE(SUM(CASE WHEN status='entregada' THEN distance_km END),0) km
    FROM deliveries WHERE carrier_id = ?`).get(carrier.id);
}
