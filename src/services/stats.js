// Indicadores calculados directamente de la base de datos.
// "Rescatado" = SÓLO kilos con entrega confirmada por código (estado recolectado).

export function impactStats(db, now, { includeDemo = true } = {}) {
  const demo = includeDemo ? '' : 'AND is_demo = 0';
  const demoL = includeDemo ? '' : 'AND l.is_demo = 0';
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  const lots = one(`SELECT COUNT(*) n, COALESCE(SUM(total_g),0) published_g FROM lots WHERE 1=1 ${demo}`);
  const available = one(
    `SELECT COALESCE(SUM(available_g),0) g FROM lots WHERE status='activo' AND expires_at > ? ${demo}`, now,
  );
  const reserved = one(
    `SELECT COALESCE(SUM(qty_g),0) g, COUNT(*) n FROM orders WHERE status IN ('apartado','confirmado','listo') ${demo}`,
  );
  const done = one(
    `SELECT COALESCE(SUM(qty_g),0) g, COUNT(*) n, COALESCE(SUM(total_rescue_c),0) income_c,
            COALESCE(SUM(savings_c),0) savings_c FROM orders WHERE status='recolectado' ${demo}`,
  );
  const cancelled = one(`SELECT COUNT(*) n FROM orders WHERE status IN ('cancelado','vencido') ${demo}`);
  const expiredUnsold = one(
    `SELECT COALESCE(SUM(available_g),0) g FROM lots WHERE expires_at <= ? AND status != 'retirado' ${demo}`, now,
  );
  const producers = one(
    `SELECT COUNT(DISTINCT producer_id) n FROM lots WHERE created_at > ? ${demo}`, now - 30 * 864e5,
  );
  const buyers = one(`SELECT COUNT(DISTINCT buyer_id) n FROM orders WHERE status != 'cancelado' ${demo}`);
  const top = db
    .prepare(
      `SELECT l.product, SUM(o.qty_g) g, SUM(o.total_rescue_c) income_c FROM orders o JOIN lots l ON l.id = o.lot_id
       WHERE o.status='recolectado' ${demoL.replace('l.', 'o.')} GROUP BY l.product ORDER BY g DESC LIMIT 6`,
    )
    .all();
  const byMunicipality = db
    .prepare(
      `SELECT l.municipality, SUM(o.qty_g) g FROM orders o JOIN lots l ON l.id = o.lot_id
       WHERE o.status='recolectado' ${demoL.replace('l.', 'o.')} GROUP BY l.municipality ORDER BY g DESC`,
    )
    .all();
  const demoCount = one(`SELECT (SELECT COUNT(*) FROM lots WHERE is_demo=1) + (SELECT COUNT(*) FROM orders WHERE is_demo=1) n`).n;

  return {
    generated_at: now,
    include_demo: includeDemo,
    demo_records: demoCount,
    lots_published: lots.n,
    published_g: lots.published_g,
    available_g: available.g,
    reserved_g: reserved.g,
    reserved_orders: reserved.n,
    collected_g: done.g,
    completed_orders: done.n,
    producer_income_c: done.income_c,
    buyer_savings_c: done.savings_c,
    cancelled_or_expired_orders: cancelled.n,
    expired_unsold_g: expiredUnsold.g,
    active_producers: producers.n,
    participating_businesses: buyers.n,
    top_products: top,
    by_municipality: byMunicipality,
  };
}

export function producerSummary(db, user) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status='recolectado' THEN total_rescue_c END),0) income_c,
              COALESCE(SUM(CASE WHEN status='recolectado' THEN qty_g END),0) delivered_g,
              COUNT(CASE WHEN status IN ('apartado','confirmado','listo') THEN 1 END) open_orders,
              COUNT(CASE WHEN status='apartado' THEN 1 END) pending_confirm
       FROM orders WHERE producer_id = ?`,
    )
    .get(user.id);
}

export function buyerSummary(db, user) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status='recolectado' THEN savings_c END),0) savings_c,
              COALESCE(SUM(CASE WHEN status='recolectado' THEN total_rescue_c END),0) spent_c,
              COALESCE(SUM(CASE WHEN status='recolectado' THEN qty_g END),0) collected_g,
              COUNT(CASE WHEN status IN ('apartado','confirmado','listo') THEN 1 END) open_orders
       FROM orders WHERE buyer_id = ?`,
    )
    .get(user.id);
}
