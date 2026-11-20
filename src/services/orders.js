import { currentPrice } from './lots.js';
import crypto from 'node:crypto';
import { tx } from '../db.js';
import { HttpError, bad } from '../http.js';
import { num } from '../validate.js';
import { kgToGrams, orderTotals, formatKg } from '../../public/js/shared/calc.js';
import { lotState } from './lots.js';

export const GRACE_MS = 3 * 3600e3; // tolerancia después de la hora acordada antes de marcar "vencido"
export const ACTIVE = ['apartado', 'confirmado', 'listo'];
const MAX_OPEN_ORDERS = 15; // freno sencillo contra apartados masivos sin recoger

// Transiciones válidas: [estado actual] -> acción -> { a, quién }
const TRANSITIONS = {
  confirmar: { from: ['apartado'], to: 'confirmado', who: ['productor'] },
  listo: { from: ['apartado', 'confirmado'], to: 'listo', who: ['productor'] },
  entregar: { from: ['confirmado', 'listo'], to: 'recolectado', who: ['productor'] },
  cancelar: { from: ACTIVE, to: 'cancelado', who: ['productor', 'comprador', 'admin'] },
};

const notify = (db, userId, text, link, now) =>
  db.prepare('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)').run(userId, text, link, now);

const event = (db, orderId, from, to, actor, note, now) =>
  db
    .prepare('INSERT INTO order_events (order_id, from_status, to_status, actor_id, note, created_at) VALUES (?,?,?,?,?,?)')
    .run(orderId, from, to, actor, note, now);

/**
 * Aparta producto de forma atómica.
 * El UPDATE condicional (available_g >= qty AND no vencido AND activo) dentro de
 * BEGIN IMMEDIATE garantiza que dos compradores no puedan apartar el mismo kilo:
 * sólo uno de ellos modifica la fila; el otro recibe 409.
 */
export function reserve(db, now, buyer, lotId, body, { isDemo = 0 } = {}) {
  const kg = num(body.kg);
  if (!Number.isFinite(kg) || kg <= 0) throw bad('Cantidad no válida', { kg: 'Indica cuántos kg' });
  const qty = kgToGrams(kg);

  return tx(db, () => {
    const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(lotId);
    if (!lot) throw new HttpError(404, 'Oferta no encontrada');
    if (lot.producer_id === buyer.id) throw new HttpError(403, 'No puedes apartar tu propia oferta');
    const state = lotState(lot, now);
    if (state === 'vencido') throw new HttpError(409, 'Esta oferta ya venció y no puede apartarse');
    if (state === 'agotado') throw new HttpError(409, 'Esta oferta ya se agotó');
    if (state !== 'disponible' && state !== 'por_vencer') throw new HttpError(409, 'Esta oferta no está disponible');

    if (!lot.allow_partial && qty !== lot.available_g)
      throw bad('Este productor sólo vende el lote completo', { kg: `Debes apartar ${formatKg(lot.available_g)}` });
    if (qty > lot.available_g)
      throw new HttpError(409, `Sólo quedan ${formatKg(lot.available_g)} disponibles`, { kg: 'Supera lo disponible' });
    // Se permite apartar menos del mínimo sólo si es exactamente el remanente.
    if (qty < lot.min_g && qty !== lot.available_g)
      throw bad(`La compra mínima es ${formatKg(lot.min_g)}`, { kg: `Mínimo ${formatKg(lot.min_g)}` });

    const open = db
      .prepare(`SELECT COUNT(*) n FROM orders WHERE buyer_id = ? AND status = 'apartado'`)
      .get(buyer.id).n;
    if (open >= MAX_OPEN_ORDERS) throw new HttpError(429, 'Tienes demasiados apartados sin confirmar');

    let pickupAt = Number(body.pickup_at) || now + 2 * 3600e3;
    if (pickupAt < now - 60e3) throw bad('La hora de recolección ya pasó', { pickup_at: 'Elige una hora futura' });
    if (pickupAt > lot.expires_at) pickupAt = lot.expires_at; // no después de la ventana comercial

    const upd = db
      .prepare(
        `UPDATE lots SET available_g = available_g - ?
         WHERE id = ? AND status = 'activo' AND available_g >= ? AND expires_at > ?`,
      )
      .run(qty, lotId, qty, now);
    if (upd.changes !== 1) throw new HttpError(409, 'Otra persona apartó este producto antes. Revisa lo disponible.');

    const unit = currentPrice(lot, now).cents; // precio vigente en el momento de apartar
    const t = orderTotals(qty, lot.ref_price_c, unit);
    const code = String(crypto.randomInt(100000, 1000000));
    const r = db
      .prepare(
        `INSERT INTO orders (lot_id, buyer_id, producer_id, qty_g, unit_ref_c, unit_rescue_c, total_ref_c,
          total_rescue_c, savings_c, status, pickup_at, hold_until, delivery_code, is_demo, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'apartado',?,?,?,?,?,?)`,
      )
      .run(
        lotId, buyer.id, lot.producer_id, qty, lot.ref_price_c, unit, t.refTotal, t.rescueTotal,
        t.savings, pickupAt, pickupAt + GRACE_MS, code, isDemo, now, now,
      );
    const id = Number(r.lastInsertRowid);
    const folio = `RD-${String(id).padStart(4, '0')}`;
    db.prepare('UPDATE orders SET folio = ? WHERE id = ?').run(folio, id);
    db.prepare('INSERT INTO inventory_movements (lot_id, order_id, delta_g, reason, created_at) VALUES (?,?,?,?,?)').run(
      lotId, id, -qty, 'apartado', now,
    );
    event(db, id, null, 'apartado', buyer.id, null, now);
    notify(db, lot.producer_id, `Nuevo apartado ${folio}: ${formatKg(qty)} de ${lot.product}`, `#/productor/pedidos`, now);
    return folio;
  });
}

function releaseInventory(db, order, reason, now) {
  db.prepare('UPDATE lots SET available_g = MIN(total_g, available_g + ?) WHERE id = ?').run(order.qty_g, order.lot_id);
  db.prepare('INSERT INTO inventory_movements (lot_id, order_id, delta_g, reason, created_at) VALUES (?,?,?,?,?)').run(
    order.lot_id, order.id, order.qty_g, reason, now,
  );
}

/** Marca un pedido como recolectado/entregado (usado por el transportista al entregar). */
export function completeOrder(db, now, orderId, actorId, note) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!['confirmado', 'listo'].includes(o.status)) throw new HttpError(409, 'El pedido no está listo para entregarse');
  db.prepare("UPDATE orders SET status = 'recolectado', delivered_at = ?, updated_at = ? WHERE id = ?").run(now, now, orderId);
  event(db, orderId, o.status, 'recolectado', actorId, note, now);
}

const codeAttempts = new Map();

export function transition(db, now, user, folio, action, body = {}) {
  const t = TRANSITIONS[action];
  if (!t) throw new HttpError(404, 'Acción no válida');
  return tx(db, () => {
    const o = db.prepare('SELECT * FROM orders WHERE folio = ?').get(folio);
    if (!o) throw new HttpError(404, 'Pedido no encontrado');
    const isProducer = o.producer_id === user.id;
    const isBuyer = o.buyer_id === user.id;
    const isAdmin = user.role === 'admin';
    const actorRole = isAdmin ? 'admin' : isProducer ? 'productor' : isBuyer ? 'comprador' : null;
    if (!actorRole || !t.who.includes(actorRole)) throw new HttpError(403, 'No tienes permiso sobre este pedido');
    if (!t.from.includes(o.status))
      throw new HttpError(409, `El pedido está "${o.status}" y no admite esta acción`);

    let note = null;
    if (action === 'entregar') {
      const fl = db.prepare(`SELECT status FROM deliveries WHERE order_id = ? AND status IN ('asignada','recogida')`).get(o.id);
      if (fl) throw new HttpError(409, 'Este pedido lo lleva tu transportista; él captura el código del comprador al entregar.');
      const tries = codeAttempts.get(o.id) || 0;
      if (tries >= 5) throw new HttpError(429, 'Demasiados intentos con código incorrecto. Contacta a soporte.');
      if (String(body.code || '').trim() !== o.delivery_code) {
        codeAttempts.set(o.id, tries + 1);
        throw bad('El código no coincide. Pídele al comprador el código de 6 dígitos de su pedido.', { code: 'Código incorrecto' });
      }
      codeAttempts.delete(o.id);
      db.prepare('UPDATE orders SET delivered_at = ? WHERE id = ?').run(now, o.id);
    }
    if (action === 'cancelar') {
      const reason = String(body.reason || '').trim().slice(0, 200);
      if (!reason) throw bad('Indica el motivo de la cancelación', { reason: 'Motivo requerido' });
      note = reason;
      db.prepare('UPDATE orders SET cancel_reason = ?, cancelled_by = ? WHERE id = ?').run(reason, user.id, o.id);
      if (reason === 'no_corresponde') {
        // Producto distinto a lo publicado: no regresa al inventario y se abre un reporte automático.
        db.prepare('INSERT INTO reports (lot_id, order_id, reporter_id, reason, details, created_at) VALUES (?,?,?,?,?,?)').run(
          o.lot_id, o.id, user.id, 'no_corresponde', body.details || 'Cancelado al recoger: no corresponde a lo publicado', now,
        );
        db.prepare("UPDATE lots SET status = 'pausado' WHERE id = ? AND status = 'activo'").run(o.lot_id);
      } else {
        releaseInventory(db, o, 'cancelacion', now);
      }
    }
    if (action === 'cancelar') {
      const fl = db.prepare(`SELECT status FROM deliveries WHERE order_id = ? AND status = 'recogida'`).get(o.id);
      if (fl && actorRole !== 'admin') throw new HttpError(409, 'El pedido ya va en camino; no se puede cancelar.');
      db.prepare(`UPDATE deliveries SET status='cancelada', cancel_reason='Pedido cancelado' WHERE order_id = ? AND status IN ('abierta','asignada')`).run(o.id);
    }
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(t.to, now, o.id);
    event(db, o.id, o.status, t.to, user.id, note, now);
    const other = isBuyer ? o.producer_id : o.buyer_id;
    const msg = {
      confirmar: `El productor confirmó tu pedido ${o.folio}`,
      listo: `Tu pedido ${o.folio} está listo para recolección`,
      entregar: `Entrega registrada del pedido ${o.folio}. ¡Gracias por rescatar alimento!`,
      cancelar: isBuyer ? `El comercio canceló el pedido ${o.folio}. Motivo: ${note}` : o.status === 'apartado' ? `El productor rechazó tu pedido ${o.folio}. Motivo: ${note}` : `El productor canceló tu pedido ${o.folio}. Motivo: ${note}`,
    }[action];
    notify(db, other, msg, `#/pedido/${o.folio}`, now);
    return t.to;
  });
}

/** Marca como vencidos los pedidos no recogidos después de la tolerancia y libera el inventario. */
export function sweepExpired(db, now) {
  const stale = db
    .prepare(`SELECT * FROM orders o WHERE status IN ('apartado','confirmado','listo') AND hold_until < ?
      AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id AND d.status IN ('asignada','recogida'))`)
    .all(now);
  if (!stale.length) return 0;
  tx(db, () => {
    for (const o of stale) {
      db.prepare("UPDATE orders SET status = 'vencido', updated_at = ? WHERE id = ?").run(now, o.id);
      db.prepare(`UPDATE deliveries SET status='cancelada', cancel_reason='Pedido vencido' WHERE order_id = ? AND status = 'abierta'`).run(o.id);
      releaseInventory(db, o, 'apartado_vencido', now);
      event(db, o.id, o.status, 'vencido', null, 'No se recogió dentro de la tolerancia', now);
      notify(db, o.buyer_id, `Tu pedido ${o.folio} venció porque no se recogió a tiempo`, `#/pedido/${o.folio}`, now);
      notify(db, o.producer_id, `El pedido ${o.folio} venció sin recolección; el producto se liberó`, `#/productor/pedidos`, now);
    }
  });
  return stale.length;
}

const ORDER_SELECT = `SELECT o.*, l.product, l.quality, l.municipality, l.pickup_point, l.pickup_window, l.photo,
  l.expires_at AS lot_expires_at, l.producer_transport,
  (SELECT d.id FROM deliveries d WHERE d.order_id = o.id AND d.status != 'cancelada') AS delivery_id,
  (SELECT d.status FROM deliveries d WHERE d.order_id = o.id AND d.status != 'cancelada') AS delivery_status,
  p.name AS producer_name, p.business_name AS producer_business, p.phone AS producer_phone,
  b.name AS buyer_name, b.business_name AS buyer_business, b.phone AS buyer_phone, b.municipality AS buyer_municipality
  FROM orders o JOIN lots l ON l.id = o.lot_id JOIN users p ON p.id = o.producer_id JOIN users b ON b.id = o.buyer_id`;

export function serializeOrder(o, viewer) {
  const isBuyer = viewer.id === o.buyer_id;
  const out = {
    folio: o.folio, status: o.status, product: o.product, quality: o.quality, qty_g: o.qty_g,
    unit_ref_c: o.unit_ref_c, unit_rescue_c: o.unit_rescue_c, total_ref_c: o.total_ref_c,
    total_rescue_c: o.total_rescue_c, savings_c: o.savings_c, pickup_at: o.pickup_at, hold_until: o.hold_until,
    created_at: o.created_at, updated_at: o.updated_at, delivered_at: o.delivered_at, cancel_reason: o.cancel_reason,
    lot_id: o.lot_id, municipality: o.municipality, pickup_point: o.pickup_point, pickup_window: o.pickup_window,
    photo: o.photo, producer_transport: !!o.producer_transport, is_demo: !!o.is_demo,
    delivery_id: o.delivery_id ?? null, delivery_status: o.delivery_status ?? null,
    producer: { name: o.producer_business || o.producer_name, phone: o.producer_phone },
    buyer: { name: o.buyer_business || o.buyer_name, contact: o.buyer_name, phone: o.buyer_phone, municipality: o.buyer_municipality },
    role: isBuyer ? 'comprador' : viewer.id === o.producer_id ? 'productor' : 'admin',
  };
  // El código de entrega sólo lo ve quien recoge; el productor debe pedirlo al entregar.
  if (isBuyer) out.delivery_code = o.delivery_code;
  return out;
}

export function getOrder(db, user, folio) {
  const o = db.prepare(`${ORDER_SELECT} WHERE o.folio = ?`).get(folio);
  if (!o) throw new HttpError(404, 'Pedido no encontrado');
  if (user.role !== 'admin' && o.buyer_id !== user.id && o.producer_id !== user.id)
    throw new HttpError(403, 'No tienes acceso a este pedido');
  const out = serializeOrder(o, user);
  out.events = db
    .prepare('SELECT from_status, to_status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id')
    .all(o.id);
  const d = db.prepare(`SELECT d.*, c.name AS carrier_name, c.phone AS carrier_phone, c.vehicle AS carrier_vehicle FROM deliveries d
    LEFT JOIN users c ON c.id = d.carrier_id WHERE d.order_id = ?`).get(o.id);
  if (d) {
    out.delivery = {
      id: d.id, status: d.status, fee_c: d.fee_c, address: d.address, to_muni: d.to_muni, distance_km: d.distance_km,
      needs_cold: !!d.needs_cold, cancel_reason: d.cancel_reason,
      carrier: d.carrier_id ? { id: d.carrier_id, name: d.carrier_name, phone: d.carrier_phone, vehicle: d.carrier_vehicle } : null,
    };
  }
  return out;
}

export function listOrders(db, user, side) {
  const col = side === 'productor' ? 'o.producer_id' : 'o.buyer_id';
  return db
    .prepare(`${ORDER_SELECT} WHERE ${col} = ? ORDER BY CASE WHEN o.status IN ('apartado','confirmado','listo') THEN 0 ELSE 1 END, o.pickup_at ASC LIMIT 200`)
    .all(user.id)
    .map((o) => serializeOrder(o, user));
}
